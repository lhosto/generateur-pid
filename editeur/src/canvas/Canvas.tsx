// Canevas PID : écran Unified 1920×1080, zoom/déplacement, sélection, gestes « + », liens.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Catalogue } from '../model/catalogue';
import { boxAt, CHUTE_SIZE, eqBox, hg0Of, isHorizontal, snap, SCREEN, type Box } from '../model/geometry';
import { guideSnap } from '../model/align';
import {
  addChannel, addChute, addEq, addOutput, addOutputWithNext, connect, findEq, moveItems, sameOutput,
} from '../model/ops';
import type { Dir, Eq, OutputRef, Pivot } from '../model/pivot';
import { handlePositions, outputColor, routeAll, type Pt } from '../model/route';
import {
  canAddChannel, canAddOutput, hgDef, isNoAction, nextOutputNum, outputLabel, pad2, reverseBlocked,
  zoneOf,
} from '../model/rules';
import { Icon } from '../ui/ui';
import { EqNode } from './EqNode';
import { ChuteShape } from './symbols';

export interface Selection {
  eqs: string[];
  chutes: string[];
  link: string | null;
  stub: OutputRef | null;
}
export const EMPTY_SEL: Selection = { eqs: [], chutes: [], link: null, stub: null };

export interface View {
  zoom: number;
  px: number;
  py: number;
}

interface Props {
  cat: Catalogue;
  pivot: Pivot;
  commit: (next: Pivot, from?: Pivot) => void;
  preview: (next: Pivot) => void;
  sel: Selection;
  setSel: (s: Selection) => void;
  view: View;
  setView: (f: (v: View) => View) => void;
  faults: Map<string, string>;
  incomplete: Map<string, string[]>;
  currentNature: string;
  grid: boolean;
  onOpenEq: (id: string) => void;
  onSize: (w: number, h: number) => void;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; v: View }
  | { kind: 'band'; a: Pt; b: Pt; additive: boolean; base: Selection }
  | { kind: 'move'; start: Pivot; a: Pt; eqs: string[]; chutes: string[]; primary: Pt; moved: boolean; clicked: string | null }
  | { kind: 'wire'; mode: 'new' | 'stub'; src: { eq: string; ch: number; dir: Dir }; ref?: OutputRef; a: Pt; cur: Pt; moved: boolean; target: string | null; origin: Pt };

interface Picker {
  x: number;
  y: number;
  eq: Eq;
  apply: (ch: number) => void;
}

interface Tip {
  source: 'eq' | 'pointer';
  x: number;
  y: number;
  lines: { text: string; tone?: 'warn' | 'fault' | 'dim' }[];
}

const FIT_PAD = 28;

export function fitView(w: number, h: number): View {
  const zoom = Math.max(0.2, Math.min((w - FIT_PAD * 2) / SCREEN.w, (h - FIT_PAD * 2 - 16) / SCREEN.h));
  return { zoom, px: Math.round((w - SCREEN.w * zoom) / 2), py: Math.round((h - SCREEN.h * zoom) / 2 + 8) };
}

export function Canvas(props: Props) {
  const { cat, pivot, sel, view } = props;
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const [, force] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const hoverTimer = useRef<number>();
  const [guides, setGuides] = useState<{ gx?: number; gy?: number }>({});
  const [picker, setPicker] = useState<Picker | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [hoverLink, setHoverLink] = useState<string | null>(null);

  const live = useRef(props);
  live.current = props;

  const boxes = useMemo(() => new Map(pivot.equipments.map((e) => [e.id, eqBox(e)])), [pivot.equipments]);
  const routed = useMemo(() => routeAll(pivot), [pivot]);
  const selEqs = useMemo(() => new Set(sel.eqs), [sel.eqs]);

  // Taille du conteneur (pour « ajuster »).
  useEffect(() => {
    const el = host.current!;
    const ro = new ResizeObserver(() => live.current.onSize(el.clientWidth, el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Espace maintenu = main pour déplacer la vue.
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(t.tagName);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isField(e.target)) {
        space.current = true;
        if (host.current) host.current.style.cursor = 'grab';
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        space.current = false;
        if (host.current) host.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Molette = zoom autour du pointeur (écouteur non passif pour bloquer le défilement).
  useEffect(() => {
    const el = host.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      live.current.setView((v) => {
        const zoom = Math.min(4, Math.max(0.2, v.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        const k = zoom / v.zoom;
        return { zoom, px: mx - (mx - v.px) * k, py: my - (my - v.py) * k };
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const toWorld = useCallback((cx: number, cy: number): Pt => {
    const r = host.current!.getBoundingClientRect();
    const v = live.current.view;
    return [(cx - r.left - v.px) / v.zoom, (cy - r.top - v.py) / v.zoom];
  }, []);

  const toHost = (p: Pt): Pt => [p[0] * view.zoom + view.px, p[1] * view.zoom + view.py];

  const hitEq = (p: Pt, exclude?: string): string | null => {
    let found: string | null = null;
    for (const [id, b] of boxes) {
      if (id === exclude) continue;
      if (p[0] >= b.x0 - 6 && p[0] <= b.x1 + 6 && p[1] >= b.y0 - 6 && p[1] <= b.y1 + 6) found = id;
    }
    return found;
  };

  const capture = (e: React.PointerEvent) => svg.current?.setPointerCapture(e.pointerId);

  const setHoverDelayed = useCallback((id: string | null) => {
    window.clearTimeout(hoverTimer.current);
    if (id) setHover(id);
    else hoverTimer.current = window.setTimeout(() => setHover(null), 260);
  }, []);

  const keepHover = () => window.clearTimeout(hoverTimer.current);

  // ---------- démarrage des gestes ----------

  const startPan = (e: React.PointerEvent) => {
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v: live.current.view };
    capture(e);
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    setPicker(null);
    if (e.button === 1 || space.current) return startPan(e);
    if (e.button !== 0) return;
    const p = toWorld(e.clientX, e.clientY);
    const base = e.shiftKey ? live.current.sel : { ...EMPTY_SEL };
    if (!e.shiftKey) props.setSel(base);
    drag.current = { kind: 'band', a: p, b: p, additive: e.shiftKey, base };
    capture(e);
    force((n) => n + 1);
  };

  const startMove = (e: React.PointerEvent, kind: 'eq' | 'chute', id: string) => {
    const s = live.current.sel;
    const list = kind === 'eq' ? s.eqs : s.chutes;
    let next: Selection;
    if (e.shiftKey) {
      next = list.includes(id)
        ? { ...s, [kind === 'eq' ? 'eqs' : 'chutes']: list.filter((x) => x !== id) }
        : { ...s, link: null, stub: null, [kind === 'eq' ? 'eqs' : 'chutes']: [...list, id] };
    } else if (list.includes(id)) {
      next = { ...s, link: null, stub: null };
    } else {
      next = { ...EMPTY_SEL, [kind === 'eq' ? 'eqs' : 'chutes']: [id] };
    }
    props.setSel(next);
    const pv = live.current.pivot;
    const item = kind === 'eq' ? findEq(pv, id) : pv.chutes.find((c) => c.id === id);
    if (!item) return;
    drag.current = {
      kind: 'move',
      start: pv,
      a: toWorld(e.clientX, e.clientY),
      eqs: next.eqs,
      chutes: next.chutes,
      primary: [item.x, item.y],
      moved: false,
      clicked: !e.shiftKey && list.includes(id) ? id : null,
    };
    capture(e);
  };

  const onEqDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    setPicker(null);
    if (e.button === 1 || space.current) return startPan(e);
    if (e.button !== 0) return;
    startMove(e, 'eq', id);
  }, []);


  const startWire = (e: React.PointerEvent, src: { eq: string; ch: number; dir: Dir }, origin: Pt, ref?: OutputRef) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setPicker(null);
    const p = toWorld(e.clientX, e.clientY);
    drag.current = { kind: 'wire', mode: ref ? 'stub' : 'new', src, ref, a: p, cur: p, moved: false, target: null, origin };
    capture(e);
  };

  // ---------- suivi ----------

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      props.setView(() => ({ ...d.v, px: d.v.px + e.clientX - d.sx, py: d.v.py + e.clientY - d.sy }));
      return;
    }
    const p = toWorld(e.clientX, e.clientY);
    if (d.kind === 'band') {
      d.b = p;
      force((n) => n + 1);
      return;
    }
    if (d.kind === 'move') {
      const dx = p[0] - d.a[0];
      const dy = p[1] - d.a[1];
      if (!d.moved && Math.hypot(dx, dy) * view.zoom < 3) return;
      d.moved = true;
      let nx = snap(d.primary[0] + dx);
      let ny = snap(d.primary[1] + dy);
      const others: Box[] = [];
      for (const [id, b] of boxes) if (!d.eqs.includes(id)) others.push(b);
      const g = guideSnap({ cx: nx, cy: ny }, others, 6 / view.zoom);
      nx += g.dx;
      ny += g.dy;
      setGuides({ gx: g.gx, gy: g.gy });
      props.preview(moveItems(d.start, d.eqs, d.chutes, nx - d.primary[0], ny - d.primary[1]));
      return;
    }
    if (d.kind === 'wire') {
      d.cur = p;
      if (!d.moved && Math.hypot(p[0] - d.a[0], p[1] - d.a[1]) * view.zoom > 4) d.moved = true;
      d.target = d.moved ? hitEq(p, d.src.eq) : null;
      force((n) => n + 1);
    }
  };

  const chooseChannel = (target: Eq, at: Pt, apply: (ch: number) => void) => {
    if (target.channels.length <= 1) return apply(1);
    const h = toHost(at);
    setPicker({ x: h[0], y: h[1], eq: target, apply: (ch) => (setPicker(null), apply(ch)) });
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setGuides({});
    if (!d) return;
    const { cat: c, commit, currentNature } = live.current;
    const pv = live.current.pivot;
    if (d.kind === 'band') {
      const x0 = Math.min(d.a[0], d.b[0]);
      const x1 = Math.max(d.a[0], d.b[0]);
      const y0 = Math.min(d.a[1], d.b[1]);
      const y1 = Math.max(d.a[1], d.b[1]);
      if (x1 - x0 > 2 || y1 - y0 > 2) {
        const inside = (b: Box) => b.x1 > x0 && b.x0 < x1 && b.y1 > y0 && b.y0 < y1;
        const eqs = pv.equipments.filter((q) => inside(boxes.get(q.id)!)).map((q) => q.id);
        const chutes = pv.chutes.filter((q) => inside(boxAt(q.x, q.y, CHUTE_SIZE.w, CHUTE_SIZE.h))).map((q) => q.id);
        props.setSel({
          ...EMPTY_SEL,
          eqs: [...new Set([...(d.additive ? d.base.eqs : []), ...eqs])],
          chutes: [...new Set([...(d.additive ? d.base.chutes : []), ...chutes])],
        });
      }
      force((n) => n + 1);
      return;
    }
    if (d.kind === 'move') {
      if (d.moved) commit(pv, d.start);
      else if (d.clicked) props.setSel({ ...EMPTY_SEL, eqs: findEq(pv, d.clicked) ? [d.clicked] : [], chutes: findEq(pv, d.clicked) ? [] : [d.clicked] });
      return;
    }
    if (d.kind === 'wire') {
      const src = findEq(pv, d.src.eq);
      if (!src) return;
      const at = toWorld(e.clientX, e.clientY);
      if (d.mode === 'new' && !d.moved) {
        const r = addOutputWithNext(c, pv, src.id, d.src.ch, d.src.dir, currentNature);
        if (r.id) {
          commit(r.p);
          props.setSel({ ...EMPTY_SEL, eqs: [r.id] });
        }
        force((n) => n + 1);
        return;
      }
      if (!d.moved) return force((n) => n + 1);
      const target = d.target ? findEq(pv, d.target) : null;
      const outputRef = (p0: Pivot): { p: Pivot; ref: OutputRef | null } => (d.ref ? { p: p0, ref: d.ref } : addOutput(p0, src.id, d.src.ch, d.src.dir));
      if (target) {
        chooseChannel(target, at, (ch) => {
          const base = live.current.pivot;
          const o = outputRef(base);
          if (o.ref) commit(connect(o.p, o.ref, { eq: target.id, ch }));
        });
      } else if (d.mode === 'new') {
        const r = addOutputWithNext(c, pv, src.id, d.src.ch, d.src.dir, currentNature, { x: at[0], y: at[1] });
        if (r.id) {
          commit(r.p);
          props.setSel({ ...EMPTY_SEL, eqs: [r.id] });
        }
      } else if (d.ref) {
        const made = addEq(c, pv, currentNature, at[0], at[1], { flow: src.flow });
        commit(connect(made.p, d.ref, { eq: made.id, ch: 1 }));
        props.setSel({ ...EMPTY_SEL, eqs: [made.id] });
      }
      force((n) => n + 1);
    }
  };

  // ---------- dépôt depuis la bibliothèque ----------

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const hg0 = e.dataTransfer.getData('text/x-hg0');
    const isChute = e.dataTransfer.getData('text/x-chute');
    const p = toWorld(e.clientX, e.clientY);
    const pv = live.current.pivot;
    if (hg0) {
      const last = pv.equipments[pv.equipments.length - 1];
      const r = addEq(cat, pv, hg0, p[0], p[1], { zone: last ? zoneOf(last.repere) : undefined });
      props.commit(r.p);
      props.setSel({ ...EMPTY_SEL, eqs: [r.id] });
    } else if (isChute) {
      const r = addChute(pv, p[0], p[1]);
      props.commit(r.p);
      props.setSel({ ...EMPTY_SEL, chutes: [r.id] });
    }
  };

  // ---------- infobulles ----------

  const eqTip = (id: string) => {
    const eq = findEq(pivot, id);
    const b = boxes.get(id);
    if (!eq || !b) return;
    const d = hgDef(cat, hg0Of(eq));
    const stack = eq.hg.map((h) => h.type).join(' · ');
    const lines: Tip['lines'] = [
      { text: `${eq.repere || '?'} — ${eq.descriptif || d.label}${eq.channels.length > 1 ? ` · ${eq.channels.length} canaux` : ''}` },
      { text: stack, tone: 'dim' },
    ];
    const f = props.faults.get(id);
    if (f) lines.push({ text: f, tone: 'fault' });
    for (const r of props.incomplete.get(id) ?? []) lines.push({ text: r, tone: 'warn' });
    lines.push({ text: 'Double-clic : ouvrir la fiche', tone: 'dim' });
    const h = toHost([b.x0, b.y0]);
    setTip({ source: 'eq', x: h[0], y: h[1] - 10, lines });
  };

  useEffect(() => {
    if (hover && !drag.current) eqTip(hover);
    else setTip((t) => (t?.source === 'eq' ? null : t));
  }, [hover, pivot, view]);

  const pointerTip = (e: React.PointerEvent, text: string, hint?: string) => {
    const r = host.current!.getBoundingClientRect();
    const lines: Tip['lines'] = [{ text }];
    if (hint) lines.push({ text: hint, tone: 'dim' });
    setTip({ source: 'pointer', x: e.clientX - r.left + 14, y: e.clientY - r.top + 12, lines });
  };

  // ---------- rendu ----------

  const d = drag.current;
  const handleEq = !d && (hover ?? (sel.eqs.length === 1 ? sel.eqs[0] : null));
  const handleTarget = handleEq ? findEq(pivot, handleEq) : undefined;
  const band = d?.kind === 'band' ? d : null;
  const wire = d?.kind === 'wire' && d.moved ? d : null;
  const wireNum = wire ? (wire.ref ? wire.ref.num : nextOutputNum(findEq(pivot, wire.src.eq)!, wire.src.ch, wire.src.dir) ?? 1) : 1;

  return (
    <div
      ref={host}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'var(--pid-out)', touchAction: 'none' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <svg
        ref={svg}
        width="100%"
        height="100%"
        style={{ display: 'block', userSelect: 'none' }}
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={(e) => {
          const id = hitEq(toWorld(e.clientX, e.clientY));
          if (id) props.onOpenEq(id);
        }}
        role="img"
        aria-label="Synoptique PID"
      >
        <defs>
          <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.9" fill="#ffffff" fillOpacity="0.09" />
          </pattern>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <marker key={n} id={`arw-${n}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
              <path d="M0 0.5 L8 4 L0 7.5 Z" fill={outputColor(n)} />
            </marker>
          ))}
          <marker id="arw-sel" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M0 0.5 L8 4 L0 7.5 Z" fill="var(--pid-select)" />
          </marker>
        </defs>
        <g transform={`translate(${view.px} ${view.py}) scale(${view.zoom})`}>
          <text x={SCREEN.w} y={-10} textAnchor="end" style={{ font: '400 12px var(--font-sans)', fill: 'var(--text-muted)' }}>
            Écran Unified 1920 × 1080 — {pivot.site.name}
          </text>
          <rect width={SCREEN.w} height={SCREEN.h} fill="var(--pid-bg)" />
          {props.grid && <rect width={SCREEN.w} height={SCREEN.h} fill="url(#dots)" pointerEvents="none" />}

          {pivot.chutes.map((c) => (
            <g key={c.id} onPointerDown={(e) => { e.stopPropagation(); if (e.button === 1 || space.current) return startPan(e); if (e.button === 0) startMove(e, 'chute', c.id); }} style={{ cursor: 'move' }}>
              <ChuteShape x={c.x} y={c.y} label={c.label} selected={sel.chutes.includes(c.id)} />
            </g>
          ))}

          <g fill="none" strokeLinejoin="round" strokeLinecap="round">
            {routed.links.map((l) => {
              const on = sel.link === l.id;
              const hot = hoverLink === l.id;
              const pts = l.points.map((q) => q.join(',')).join(' ');
              return (
                <g
                  key={l.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (e.button === 1 || space.current) return startPan(e);
                    props.setSel({ ...EMPTY_SEL, link: l.id });
                  }}
                  onPointerEnter={(e) => { setHoverLink(l.id); pointerTip(e, l.label); }}
                  onPointerMove={(e) => hoverLink === l.id && pointerTip(e, l.label)}
                  onPointerLeave={() => { setHoverLink(null); setTip(null); }}
                  style={{ cursor: 'pointer' }}
                >
                  <polyline points={pts} stroke="transparent" strokeWidth={10} />
                  <polyline
                    points={pts}
                    stroke={on ? 'var(--pid-select)' : outputColor(l.num)}
                    strokeWidth={on || hot ? 2.6 : l.dashed ? 1.6 : 2}
                    strokeDasharray={l.dashed ? '5 5' : undefined}
                    markerEnd={`url(#${on ? 'arw-sel' : 'arw-' + Math.min(l.num, 6)})`}
                  />
                </g>
              );
            })}
            {routed.stubs.map((s) => {
              const on = !!sel.stub && sameOutput(sel.stub, s.ref);
              const [a, b] = s.points;
              return (
                <g
                  key={s.key}
                  onPointerDown={(e) => {
                    props.setSel({ ...EMPTY_SEL, stub: s.ref });
                    startWire(e, { eq: s.ref.eq, ch: s.ref.ch, dir: s.ref.dir }, b, s.ref);
                  }}
                  onPointerEnter={(e) => pointerTip(e, s.label, 'Sortie libre : glisser vers un EQ')}
                  onPointerLeave={() => setTip(null)}
                  style={{ cursor: 'crosshair' }}
                >
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={10} />
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={on ? 'var(--pid-select)' : outputColor(s.num)} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined} />
                  <circle cx={b[0]} cy={b[1]} r={3.5} fill="var(--pid-bg)" stroke={on ? 'var(--pid-select)' : outputColor(s.num)} strokeWidth={1.5} />
                </g>
              );
            })}
          </g>

          {pivot.equipments.map((eq) => (
            <EqNode
              key={eq.id}
              eq={eq}
              selected={selEqs.has(eq.id)}
              incomplete={props.incomplete.has(eq.id)}
              fault={props.faults.has(eq.id)}
              onDown={onEqDown}
              onHover={setHoverDelayed}
            />
          ))}

          {wire && (
            <g pointerEvents="none">
              {wire.target && boxes.get(wire.target) && (() => {
                const b = boxes.get(wire.target)!;
                return <rect x={b.x0 - 6} y={b.y0 - 6} width={b.w + 12} height={b.h + 12} rx={7} fill="none" stroke="var(--pid-select)" strokeWidth={2} />;
              })()}
              <line x1={wire.origin[0]} y1={wire.origin[1]} x2={wire.cur[0]} y2={wire.cur[1]} stroke={outputColor(wireNum)} strokeWidth={2} strokeDasharray="6 4" markerEnd={`url(#arw-${Math.min(wireNum, 6)})`} />
            </g>
          )}

          {handleTarget && (
            <Handles
              cat={cat}
              eq={handleTarget}
              box={boxes.get(handleTarget.id)!}
              onEnter={keepHover}
              onLeave={() => setHoverDelayed(null)}
              onTip={pointerTip}
              onTipEnd={() => setTip(null)}
              onWire={startWire}
              onAddChannel={() => props.commit(addChannel(pivot, handleTarget.id))}
            />
          )}

          {guides.gx !== undefined && <line x1={guides.gx} y1={0} x2={guides.gx} y2={SCREEN.h} stroke="var(--pid-select)" strokeWidth={1 / view.zoom} strokeDasharray="4 4" pointerEvents="none" />}
          {guides.gy !== undefined && <line x1={0} y1={guides.gy} x2={SCREEN.w} y2={guides.gy} stroke="var(--pid-select)" strokeWidth={1 / view.zoom} strokeDasharray="4 4" pointerEvents="none" />}
          {band && (
            <rect
              x={Math.min(band.a[0], band.b[0])}
              y={Math.min(band.a[1], band.b[1])}
              width={Math.abs(band.b[0] - band.a[0])}
              height={Math.abs(band.b[1] - band.a[1])}
              fill="rgba(6,208,110,0.08)"
              stroke="var(--pid-select)"
              strokeWidth={1 / view.zoom}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      {tip && (
        <div style={{ position: 'absolute', left: tip.x, top: tip.y, transform: tip.source === 'eq' ? 'translateY(-100%)' : undefined, maxWidth: 380, padding: '8px 12px', background: 'var(--pid-band)', border: '1px solid #6f7a74', borderRadius: 4, pointerEvents: 'none', zIndex: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {tip.lines.map((l, i) => (
            <span
              key={i}
              style={{
                font: i === 0 ? '600 12px var(--font-tag)' : '400 12px var(--font-sans)',
                color: l.tone === 'warn' ? 'var(--pid-warn)' : l.tone === 'fault' ? 'var(--pid-fault-stroke)' : l.tone === 'dim' ? 'var(--text-muted)' : 'var(--pid-text)',
                whiteSpace: 'nowrap',
              }}
            >
              {l.text}
            </span>
          ))}
        </div>
      )}

      {picker && (
        <div style={{ position: 'absolute', left: picker.x + 8, top: picker.y + 8, background: 'var(--surface-page)', border: '1px solid var(--border-input)', zIndex: 5, minWidth: 180 }}>
          <div style={{ padding: '6px 10px', background: 'var(--surface-panel-header)', font: '700 12px var(--font-sans)', textTransform: 'uppercase' }}>Canal d'arrivée — {picker.eq.repere}</div>
          {picker.eq.channels.map((_, i) => (
            <button key={i} type="button" className="abi-row" onClick={() => picker.apply(i + 1)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', font: '400 13px var(--font-sans)' }}>
              <span className="mono">CH{pad2(i + 1)}</span>
            </button>
          ))}
          <button type="button" className="abi-row" onClick={() => setPicker(null)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'none', border: 'none', borderTop: '1px solid var(--border-divider)', cursor: 'pointer', color: 'var(--text-muted)', font: '400 13px var(--font-sans)' }}>
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}

/** Poignées « + » : sorties avant / arrière par canal, et ajout de canal. */
function Handles(props: {
  cat: Catalogue;
  eq: Eq;
  box: Box;
  onEnter: () => void;
  onLeave: () => void;
  onTip: (e: React.PointerEvent, text: string, hint?: string) => void;
  onTipEnd: () => void;
  onWire: (e: React.PointerEvent, src: { eq: string; ch: number; dir: Dir }, origin: Pt) => void;
  onAddChannel: () => void;
}) {
  const { eq, box } = props;
  if (isNoAction(props.cat, eq)) return null;
  const blocked = reverseBlocked(eq);
  const chip = (dir: Dir, ch: number, at: Pt) => {
    const ok = canAddOutput(eq, ch, dir);
    const num = nextOutputNum(eq, ch, dir);
    if (num === null) return null;
    const text = ok ? outputLabel(eq, ch, dir, num) : (blocked ?? 'Indisponible');
    const hint = ok ? 'Clic : EQ suivant raccordé · glisser : relier à un EQ' : undefined;
    return (
      <g
        key={dir + ch}
        onPointerEnter={(e) => { props.onEnter(); props.onTip(e, text, hint); }}
        onPointerLeave={() => { props.onLeave(); props.onTipEnd(); }}
        onPointerDown={(e) => {
          if (!ok) return e.stopPropagation();
          props.onTipEnd();
          props.onWire(e, { eq: eq.id, ch, dir }, at);
        }}
        style={{ cursor: ok ? 'pointer' : 'not-allowed' }}
      >
        <circle cx={at[0]} cy={at[1]} r={11} fill="transparent" />
        <circle cx={at[0]} cy={at[1]} r={7.5} fill="var(--pid-band)" stroke={ok ? 'var(--abi-green)' : '#6f7a74'} strokeWidth={1.5} strokeDasharray={dir === 'arriere' ? '2.5 2' : undefined} />
        <path d={`M${at[0] - 3.5} ${at[1]} h7 M${at[0]} ${at[1] - 3.5} v7`} stroke={ok ? '#fff' : '#6f7a74'} strokeWidth={1.5} strokeLinecap="round" />
        {eq.channels.length > 1 && (
          <text x={at[0]} y={at[1] - 11} textAnchor="middle" style={{ font: '600 8px var(--font-tag)', fill: 'var(--pid-caption)', pointerEvents: 'none' }}>
            {ch}
          </text>
        )}
      </g>
    );
  };
  const addCh = canAddChannel(eq);
  const cAt: Pt = isHorizontal(eq.flow) ? [box.cx, box.y1] : [box.x1, box.cy];
  return (
    <g>
      {handlePositions(eq, box, 'avant').map((h) => chip('avant', h.ch, h.at))}
      {handlePositions(eq, box, 'arriere').map((h) => chip('arriere', h.ch, h.at))}
      {addCh && (
        <g
          onPointerEnter={(e) => { props.onEnter(); props.onTip(e, `Ajouter un canal (CH${pad2(eq.channels.length + 1)})`); }}
          onPointerLeave={() => { props.onLeave(); props.onTipEnd(); }}
          onPointerDown={(e) => { e.stopPropagation(); props.onTipEnd(); props.onAddChannel(); }}
          style={{ cursor: 'pointer' }}
        >
          <rect x={cAt[0] - 6} y={cAt[1] - 6} width={12} height={12} rx={2} fill="var(--pid-band)" stroke="var(--abi-green)" strokeWidth={1.2} />
          <path d={`M${cAt[0] - 3} ${cAt[1]} h6 M${cAt[0]} ${cAt[1] - 3} v6`} stroke="#fff" strokeWidth={1.3} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

export const ZoomBar = ({ view, onZoom, onFit, grid, onGrid }: {
  view: View; onZoom: (k: number) => void; onFit: () => void; grid: boolean; onGrid: () => void;
}) => (
  <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 4, alignItems: 'center', background: 'var(--surface-page)', border: '1px solid var(--border-nav)', padding: 4, zIndex: 3 }}>
    <ToolBtn icon="zoom-out" title="Zoom arrière" onClick={() => onZoom(1 / 1.2)} />
    <span style={{ width: 44, textAlign: 'center', font: '400 12px var(--font-sans)', color: 'var(--text-secondary)' }}>{Math.round(view.zoom * 100)} %</span>
    <ToolBtn icon="zoom-in" title="Zoom avant" onClick={() => onZoom(1.2)} />
    <ToolBtn icon="maximize-2" title="Ajuster à l'écran" onClick={onFit} />
    <span style={{ width: 1, height: 22, background: 'var(--border-nav)', margin: '0 2px' }} />
    <ToolBtn icon="grid" title="Grille" on={grid} onClick={onGrid} />
  </div>
);

function ToolBtn({ icon, title, on, onClick }: { icon: string; title: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className="abi-btn" style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--abi-green)' : 'var(--surface-nav)', color: on ? '#fff' : '#ddd', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
      <Icon name={icon} size={17} />
    </button>
  );
}
