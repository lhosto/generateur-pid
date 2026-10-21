// Routage orthogonal des liens. Chaque canal a un axe fixe (geometry.sideOffset) : tous les liens d'un
// canal partent et arrivent exactement sur cet axe, si bien que deux canaux alignés donnent un trait droit.
// Le côté de départ fait face à la cible ; si la voie est bouchée, tracé en L puis Z sur l'autre axe.
import { baseOf, eqBox, flowVec, isHorizontal, opposite, sideOffset, type Box } from './geometry';
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

const POINTY = new Set(['diamond', 'circle']);

export const outputColor = (num: number) => `var(--out-${Math.min(Math.max(num, 1), 6)})`;

export function sideFacing(a: Box, b: Box): Flow {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const gapX = Math.abs(dx) - (a.w + b.w) / 2;
  const gapY = Math.abs(dy) - (a.h + b.h) / 2;
  if (gapX >= gapY) return dx >= 0 ? 'E' : 'W';
  return dy >= 0 ? 'S' : 'N';
}

export function anchor(b: Box, side: Flow, off: number): Pt {
  if (side === 'E') return [b.x1, b.cy + off];
  if (side === 'W') return [b.x0, b.cy + off];
  if (side === 'S') return [b.cx + off, b.y1];
  return [b.cx + off, b.y0];
}

/** Point d'accroche d'un canal sur un côté : son axe sur les côtés d'entrée/sortie, le milieu ailleurs. */
export function channelAnchor(eq: Eq, box: Box, side: Flow, ch: number): Pt {
  return anchor(box, side, sideOffset(eq, side, ch));
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
 * Tracé face à face : droit si les axes sont alignés, sinon en Z (2 coudes) dont le segment du milieu
 * glisse pour éviter les autres EQ ; si la ligne droite est bouchée, contournement par un décrochement.
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
  const mid = Math.round((along(s) + along(t)) / 20) * 10;
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

function lRoute(s: Pt, sSide: Flow, t: Pt): Pt[] {
  return isHorizontal(sSide) ? [s, [t[0], s[1]], t] : [s, [s[0], t[1]], t];
}

interface End {
  eq: Eq;
  box: Box;
  ch: number;
}

/**
 * Tracé d'un lien : face à face (droit ou Z) si la voie est libre, sinon en L (départ d'un côté,
 * arrivée par le dessus/dessous ou par le côté), sinon face à face sur l'autre axe.
 */
function routeLink(a: End, b: End, obstacles: Box[]): Pt[] {
  const primary = sideFacing(a.box, b.box);
  const dx = b.box.cx - a.box.cx;
  const dy = b.box.cy - a.box.cy;
  const z = (sSide: Flow): Pt[] | null => {
    const pts = orthogonal(channelAnchor(a.eq, a.box, sSide, a.ch), sSide, channelAnchor(b.eq, b.box, opposite(sSide), b.ch), obstacles);
    return clean(pts, obstacles) ? pts : null;
  };
  const l = (sSide: Flow, tSide: Flow): Pt[] | null => {
    const s = channelAnchor(a.eq, a.box, sSide, a.ch);
    const t = channelAnchor(b.eq, b.box, tSide, b.ch);
    const pts = lRoute(s, sSide, t);
    const c = pts[1];
    const [vx, vy] = flowVec(sSide);
    const [wx, wy] = flowVec(opposite(tSide));
    if ((c[0] - s[0]) * vx + (c[1] - s[1]) * vy < 10 || (t[0] - c[0]) * wx + (t[1] - c[1]) * wy < 10) return null;
    return clean(pts, obstacles) ? pts : null;
  };
  const hs: Flow = dx >= 0 ? 'E' : 'W';
  const vs: Flow = dy >= 0 ? 'S' : 'N';
  const lh = () => l(hs, dy >= 0 ? 'N' : 'S');
  const lv = () => l(vs, dx >= 0 ? 'W' : 'E');
  const other = isHorizontal(primary) ? vs : hs;
  return (
    z(primary) ??
    (isHorizontal(primary) ? lh() ?? lv() : lv() ?? lh()) ??
    z(other) ??
    orthogonal(channelAnchor(a.eq, a.box, primary, a.ch), primary, channelAnchor(b.eq, b.box, opposite(primary), b.ch), obstacles)
  );
}

export function routeAll(p: Pivot): { links: RoutedLink[]; stubs: Stub[] } {
  const eqs = new Map(p.equipments.map((e) => [e.id, e]));
  const boxes = new Map(p.equipments.map((e) => [e.id, eqBox(e)]));
  const all = [...boxes.entries()];
  const obstaclesFor = (a: string, b: string) => all.filter(([id]) => id !== a && id !== b).map(([, bx]) => bx);

  const links: RoutedLink[] = [];
  for (const l of p.links) {
    const src = eqs.get(l.from.eq);
    const dst = eqs.get(l.to.eq);
    if (!src || !dst) continue;
    const a: End = { eq: src, box: boxes.get(src.id)!, ch: l.from.ch };
    const b: End = { eq: dst, box: boxes.get(dst.id)!, ch: l.to.ch };
    let points: Pt[];
    if (src.id === dst.id) {
      const sSide = l.from.dir === 'avant' ? src.flow : opposite(src.flow);
      points = selfLoop(a.box, channelAnchor(src, a.box, sSide, a.ch), channelAnchor(src, a.box, opposite(sSide), b.ch), sSide);
    } else {
      points = routeLink(a, b, obstaclesFor(src.id, dst.id));
    }
    links.push({
      id: l.id,
      link: l,
      points,
      num: l.from.num,
      dashed: l.from.dir === 'arriere',
      label: `${outputLabel(src, l.from.ch, l.from.dir, l.from.num)}  →  ${dst.repere || '?'} · CH${String(l.to.ch).padStart(2, '0')}`,
    });
  }

  // Sorties libres : petit trait sur l'axe du canal, côté flux (avant) ou côté opposé (arrière),
  // légèrement écartées entre elles pour rester saisissables.
  const linked = new Set(p.links.map((l) => `${l.from.eq}|${l.from.ch}|${l.from.dir}|${l.from.num}`));
  const stubs: Stub[] = [];
  for (const e of p.equipments) {
    const box = boxes.get(e.id)!;
    const pointy = POINTY.has(baseOf(e));
    e.channels.forEach((c, ci) => {
      const ch = ci + 1;
      for (const dir of ['avant', 'arriere'] as Dir[]) {
        const free = c.outputs.filter((o) => o.dir === dir && !linked.has(`${e.id}|${ch}|${dir}|${o.num}`)).sort((x, y) => x.num - y.num);
        const side = dir === 'avant' ? e.flow : opposite(e.flow);
        const [vx, vy] = flowVec(side);
        const spacing = pointy ? 4 : 6;
        free.forEach((o, i) => {
          const [ax, ay] = anchor(box, side, sideOffset(e, side, ch) + (i - (free.length - 1) / 2) * spacing);
          stubs.push({
            key: `${e.id}-${ch}-${dir}-${o.num}`,
            ref: { eq: e.id, ch, dir, num: o.num },
            points: [[ax, ay], [ax + vx * 16, ay + vy * 16]],
            num: o.num,
            dashed: dir === 'arriere',
            label: outputLabel(e, ch, dir, o.num),
          });
        });
      }
    });
  }
  return { links, stubs };
}

/** Position des poignées « + » : une par canal et par sens, sur l'axe du canal, hors du contour. */
export function handlePositions(eq: Eq, box: Box, dir: Dir): { ch: number; at: Pt }[] {
  const side = dir === 'avant' ? eq.flow : opposite(eq.flow);
  const [vx, vy] = flowVec(side);
  return eq.channels.map((_, i) => {
    const [ax, ay] = channelAnchor(eq, box, side, i + 1);
    return { ch: i + 1, at: [ax + vx * 26, ay + vy * 26] as Pt };
  });
}
