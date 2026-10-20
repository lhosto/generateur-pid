// Alignement et espacement (V1) : calculs sur les boîtes englobantes, rendus en positions.
import { snap, type Box } from './geometry';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type Axis = 'h' | 'v';

export interface Item {
  id: string;
  box: Box;
}

type Pos = Record<string, { x: number; y: number }>;

export function align(items: Item[], mode: AlignMode): Pos {
  if (items.length < 2) return {};
  const b = items.map((i) => i.box);
  const minX = Math.min(...b.map((x) => x.x0));
  const maxX = Math.max(...b.map((x) => x.x1));
  const minY = Math.min(...b.map((x) => x.y0));
  const maxY = Math.max(...b.map((x) => x.y1));
  const avg = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length;
  const cx = snap(avg(b.map((x) => x.cx)));
  const cy = snap(avg(b.map((x) => x.cy)));
  const out: Pos = {};
  for (const { id, box } of items) {
    let x = box.cx;
    let y = box.cy;
    if (mode === 'left') x = minX + box.w / 2;
    if (mode === 'right') x = maxX - box.w / 2;
    if (mode === 'hcenter') x = cx;
    if (mode === 'top') y = minY + box.h / 2;
    if (mode === 'bottom') y = maxY - box.h / 2;
    if (mode === 'vcenter') y = cy;
    out[id] = { x, y };
  }
  return out;
}

/** Répartir : écarts égaux entre boîtes, premier et dernier fixes. */
export function distribute(items: Item[], axis: Axis): Pos {
  if (items.length < 3) return {};
  const key = axis === 'h' ? 'cx' : 'cy';
  const size = axis === 'h' ? 'w' : 'h';
  const sorted = [...items].sort((a, b) => a.box[key] - b.box[key]);
  const first = sorted[0].box;
  const last = sorted[sorted.length - 1].box;
  const start = axis === 'h' ? first.x0 : first.y0;
  const end = axis === 'h' ? last.x1 : last.y1;
  const total = sorted.reduce((s, i) => s + i.box[size], 0);
  const gap = (end - start - total) / (sorted.length - 1);
  const out: Pos = {};
  let cursor = start;
  for (const { id, box } of sorted) {
    const c = cursor + box[size] / 2;
    out[id] = axis === 'h' ? { x: Math.round(c), y: box.cy } : { x: box.cx, y: Math.round(c) };
    cursor += box[size] + gap;
  }
  return out;
}

/** Guides magnétiques : aligne le centre déplacé sur le centre d'un autre objet proche. */
export function guideSnap(moving: { cx: number; cy: number }, others: Box[], tol = 6): { dx: number; dy: number; gx?: number; gy?: number } {
  let best = { dx: 0, dy: 0 } as { dx: number; dy: number; gx?: number; gy?: number };
  let bx = tol + 1;
  let by = tol + 1;
  for (const o of others) {
    const ex = o.cx - moving.cx;
    const ey = o.cy - moving.cy;
    if (Math.abs(ex) < bx) {
      bx = Math.abs(ex);
      best = { ...best, dx: ex, gx: o.cx };
    }
    if (Math.abs(ey) < by) {
      by = Math.abs(ey);
      best = { ...best, dy: ey, gy: o.cy };
    }
  }
  return best;
}
