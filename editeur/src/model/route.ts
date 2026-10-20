// Routage orthogonal des liens : le côté de départ fait face à la cible, les départs d'un même côté
// sont répartis, et un canal d'arrivée garde sa place sur un EQ multicanal.
import { baseOf, eqBox, flowVec, isHorizontal, opposite, type Box } from './geometry';
import type { Dir, Eq, Flow, Link, OutputRef, Pivot } from './pivot';
import { outputLabel } from './rules';

export type Pt = [number, number];

export interface RoutedLink {
  id: string;
  link: Link;
  points: Pt[];
  num: number;
  dashed: boolean;
  label: string;
}

export interface Stub {
  key: string;
  ref: OutputRef;
  points: [Pt, Pt];
  num: number;
  dashed: boolean;
  label: string;
}

interface Slot {
  key: string;
  ch: number;
  order: number;
  set: (p: Pt) => void;
}

const POINTY = new Set(['diamond', 'circle']);

export const outputColor = (num: number) => `var(--out-${Math.min(Math.max(num, 1), 6)})`;

function sideFacing(a: Box, b: Box): Flow {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const gapX = Math.abs(dx) - (a.w + b.w) / 2;
  const gapY = Math.abs(dy) - (a.h + b.h) / 2;
  if (gapX >= gapY) return dx >= 0 ? 'E' : 'W';
  return dy >= 0 ? 'S' : 'N';
}

function anchor(b: Box, side: Flow, off: number): Pt {
  if (side === 'E') return [b.x1, b.cy + off];
  if (side === 'W') return [b.x0, b.cy + off];
  if (side === 'S') return [b.cx + off, b.y1];
  return [b.cx + off, b.y0];
}

/** Répartit les points d'un côté ; sur un EQ multicanal, chaque canal garde sa bande. */
function placeSlots(eq: Eq, box: Box, side: Flow, slots: Slot[]) {
  const along = isHorizontal(side) ? box.h : box.w;
  const n = eq.channels.length;
  const pointy = POINTY.has(baseOf(eq));
  const byChannel = n > 1 && isHorizontal(side) === isHorizontal(eq.flow);
  const groups = byChannel ? [1, 2, 3].slice(0, n).map((c) => slots.filter((s) => s.ch === c)) : [slots];
  const band = byChannel ? along / n : along;
  groups.forEach((g, gi) => {
    g.sort((a, b) => a.order - b.order);
    const center = byChannel ? (gi - (n - 1) / 2) * band : 0;
    const spacing = Math.min(pointy ? 4 : 7, (band - 6) / Math.max(1, g.length));
    g.forEach((s, i) => s.set(anchor(box, side, center + (i - (g.length - 1) / 2) * spacing)));
  });
}

function hits(a: Pt, b: Pt, o: Box, pad = 5): boolean {
  const x0 = Math.min(a[0], b[0]);
  const x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const y1 = Math.max(a[1], b[1]);
  return x1 > o.x0 - pad && x0 < o.x1 + pad && y1 > o.y0 - pad && y0 < o.y1 + pad;
}

const clean = (pts: Pt[], obstacles: Box[]) => pts.every((p, i) => i === 0 || !obstacles.some((o) => hits(pts[i - 1], p, o)));

/** Décalages essayés autour du milieu, du plus proche au plus lointain. */
function offsets(limit: number, step = 10): number[] {
  const out = [0];
  for (let d = step; d <= limit; d += step) out.push(d, -d);
  return out;
}

/**
 * Tracé en Z (2 coudes) : le segment du milieu glisse pour éviter les autres EQ ; si la ligne
 * droite est bouchée, contournement par un décrochement.
 */
function orthogonal(s: Pt, sSide: Flow, t: Pt, obstacles: Box[]): Pt[] {
  const h = isHorizontal(sSide);
  const along = (p: Pt) => (h ? p[0] : p[1]);
  const across = (p: Pt) => (h ? p[1] : p[0]);
  const pt = (a: number, c: number): Pt => (h ? [a, c] : [c, a]);
  const dir = Math.sign(along(t) - along(s)) || 1;
  if (Math.abs(across(s) - across(t)) < 1) {
    const straight: Pt[] = [s, pt(along(t), across(s))];
    if (clean(straight, obstacles)) return straight;
    const a1 = along(s) + dir * 12;
    const a2 = along(t) - dir * 12;
    for (const off of offsets(120).slice(1)) {
      const c = across(s) + off;
      const p: Pt[] = [s, pt(a1, across(s)), pt(a1, c), pt(a2, c), pt(a2, across(t)), t];
      if (clean(p, obstacles)) return p;
    }
    return straight;
  }
  const mid = Math.round((along(s) + along(t)) / 2);
  const room = Math.max(0, Math.abs(along(t) - along(s)) / 2 - 8);
  for (const off of offsets(room)) {
    const m = mid + off;
    const p: Pt[] = [s, pt(m, across(s)), pt(m, across(t)), t];
    if (clean(p, obstacles)) return p;
  }
  return [s, pt(mid, across(s)), pt(mid, across(t)), t];
}

/** Boucle sur soi-même : sort côté flux, contourne par le dessus, revient côté opposé. */
function selfLoop(b: Box, s: Pt, t: Pt, side: Flow): Pt[] {
  const [vx, vy] = flowVec(side);
  const out = 18;
  if (vx !== 0) {
    const top = b.y0 - 22;
    return [s, [s[0] + vx * out, s[1]], [s[0] + vx * out, top], [t[0] - vx * out, top], [t[0] - vx * out, t[1]], t];
  }
  const left = b.x0 - 22;
  return [s, [s[0], s[1] + vy * out], [left, s[1] + vy * out], [left, t[1] - vy * out], [t[0], t[1] - vy * out], t];
}

interface Plan {
  sSide: Flow;
  tSide: Flow;
  kind: 'z' | 'l';
}

function lRoute(s: Pt, sSide: Flow, t: Pt): Pt[] {
  return isHorizontal(sSide) ? [s, [t[0], s[1]], t] : [s, [s[0], t[1]], t];
}

/**
 * Choix des côtés : tracé en Z face à face si la voie est libre, sinon en L (départ d'un côté,
 * arrivée par le dessus/dessous ou par le côté), sinon Z sur l'autre axe.
 */
function choosePlan(a: Box, b: Box, obstacles: Box[]): Plan {
  const primary = sideFacing(a, b);
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const hs: Flow = dx >= 0 ? 'E' : 'W';
  const vs: Flow = dy >= 0 ? 'S' : 'N';
  const z = (sSide: Flow): Plan | null => {
    const tSide = opposite(sSide);
    const pts = orthogonal(anchor(a, sSide, 0), sSide, anchor(b, tSide, 0), obstacles);
    return clean(pts, obstacles) ? { sSide, tSide, kind: 'z' } : null;
  };
  const l = (sSide: Flow, tSide: Flow): Plan | null => {
    const s = anchor(a, sSide, 0);
    const t = anchor(b, tSide, 0);
    const pts = lRoute(s, sSide, t);
    const c = pts[1];
    const [vx, vy] = flowVec(sSide);
    const [wx, wy] = flowVec(opposite(tSide));
    if ((c[0] - s[0]) * vx + (c[1] - s[1]) * vy < 10 || (t[0] - c[0]) * wx + (t[1] - c[1]) * wy < 10) return null;
    return clean(pts, obstacles) ? { sSide, tSide, kind: 'l' } : null;
  };
  const lh = () => l(hs, dy >= 0 ? 'N' : 'S');
  const lv = () => l(vs, dx >= 0 ? 'W' : 'E');
  const other = isHorizontal(primary) ? vs : hs;
  return z(primary) ?? (isHorizontal(primary) ? lh() ?? lv() : lv() ?? lh()) ?? z(other) ?? { sSide: primary, tSide: opposite(primary), kind: 'z' };
}

export function routeAll(p: Pivot): { links: RoutedLink[]; stubs: Stub[] } {
  const eqs = new Map(p.equipments.map((e) => [e.id, e]));
  const boxes = new Map(p.equipments.map((e) => [e.id, eqBox(e)]));
  const sides = new Map<string, Slot[]>();
  const push = (eqId: string, side: Flow, slot: Slot) => {
    const k = eqId + ':' + side;
    if (!sides.has(k)) sides.set(k, []);
    sides.get(k)!.push(slot);
  };

  const all = [...boxes.entries()];
  const obstaclesFor = (a: string, b: string) => all.filter(([id]) => id !== a && id !== b).map(([, bx]) => bx);

  const pending: { l: Link; sSide: Flow; tSide: Flow; kind: 'z' | 'l'; s?: Pt; t?: Pt; self: boolean }[] = [];
  for (const l of p.links) {
    const a = boxes.get(l.from.eq);
    const b = boxes.get(l.to.eq);
    if (!a || !b) continue;
    const self = l.from.eq === l.to.eq;
    const src = eqs.get(l.from.eq)!;
    const plan: Plan = self
      ? { sSide: l.from.dir === 'avant' ? src.flow : opposite(src.flow), tSide: l.from.dir === 'avant' ? opposite(src.flow) : src.flow, kind: 'z' }
      : choosePlan(a, b, obstaclesFor(l.from.eq, l.to.eq));
    const r: (typeof pending)[number] = { l, ...plan, self };
    pending.push(r);
    const perpS = (bx: Box) => (isHorizontal(plan.sSide) ? bx.cy : bx.cx);
    const perpT = (bx: Box) => (isHorizontal(plan.tSide) ? bx.cy : bx.cx);
    push(l.from.eq, plan.sSide, { key: l.id + 's', ch: l.from.ch, order: perpS(b) + l.from.num * 0.01, set: (pt) => (r.s = pt) });
    push(l.to.eq, plan.tSide, { key: l.id + 't', ch: l.to.ch, order: perpT(a), set: (pt) => (r.t = pt) });
  }

  const linked = new Set(p.links.map((l) => `${l.from.eq}|${l.from.ch}|${l.from.dir}|${l.from.num}`));
  const stubs: Stub[] = [];
  for (const e of p.equipments) {
    e.channels.forEach((c, ci) => {
      for (const o of c.outputs) {
        const ref: OutputRef = { eq: e.id, ch: ci + 1, dir: o.dir, num: o.num };
        if (linked.has(`${e.id}|${ref.ch}|${o.dir}|${o.num}`)) continue;
        const side = o.dir === 'avant' ? e.flow : opposite(e.flow);
        const st: Stub = { key: `${e.id}-${ref.ch}-${o.dir}-${o.num}`, ref, points: [[0, 0], [0, 0]], num: o.num, dashed: o.dir === 'arriere', label: outputLabel(e, ref.ch, o.dir as Dir, o.num) };
        stubs.push(st);
        const [vx, vy] = flowVec(side);
        push(e.id, side, {
          key: st.key,
          ch: ref.ch,
          order: 1e6 + o.num,
          set: (pt) => (st.points = [pt, [pt[0] + vx * 16, pt[1] + vy * 16]]),
        });
      }
    });
  }

  for (const [k, slots] of sides) {
    const [eqId, side] = k.split(':') as [string, Flow];
    placeSlots(eqs.get(eqId)!, boxes.get(eqId)!, side, slots);
  }

  const links: RoutedLink[] = pending
    .filter((r) => r.s && r.t)
    .map((r) => ({
      id: r.l.id,
      link: r.l,
      points: r.self
        ? selfLoop(boxes.get(r.l.from.eq)!, r.s!, r.t!, r.sSide)
        : r.kind === 'l'
          ? lRoute(r.s!, r.sSide, r.t!)
          : orthogonal(r.s!, r.sSide, r.t!, obstaclesFor(r.l.from.eq, r.l.to.eq)),
      num: r.l.from.num,
      dashed: r.l.from.dir === 'arriere',
      label: `${outputLabel(eqs.get(r.l.from.eq)!, r.l.from.ch, r.l.from.dir, r.l.from.num)}  →  ${eqs.get(r.l.to.eq)!.repere || '?'} · CH${String(r.l.to.ch).padStart(2, '0')}`,
    }));
  return { links, stubs };
}

/** Position des poignées « + » : une par canal et par sens, à l'extérieur du contour. */
export function handlePositions(eq: Eq, box: Box, dir: Dir): { ch: number; at: Pt }[] {
  const side = dir === 'avant' ? eq.flow : opposite(eq.flow);
  const [vx, vy] = flowVec(side);
  const n = eq.channels.length;
  const along = isHorizontal(side) ? box.h : box.w;
  const spread = n > 1 ? Math.max(along / n, 18) : 0;
  return eq.channels.map((_, i) => {
    const off = n > 1 ? (i - (n - 1) / 2) * spread : 0;
    const [ax, ay] = anchor(box, side, off);
    return { ch: i + 1, at: [ax + vx * 26, ay + vy * 26] as Pt };
  });
}
