// Géométrie des formes du PID. La forme suit le HG0 de l'équipement et ne porte aucune information
// pour la génération : elle sert à dessiner et à placer les liens.
import type { Eq, Flow } from './pivot';
import { BASE_SIZE, symbolOf, type Base } from './symbols';

export const SCREEN = { w: 1920, h: 1080 };
export const GRID = 10;
/** Épaisseur ajoutée par canal supplémentaire, perpendiculairement au flux. */
export const CHANNEL_STEP = 10;
export const CHUTE_SIZE = { w: 22, h: 104 };

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export const isHorizontal = (f: Flow) => f === 'E' || f === 'W';

export const hg0Of = (eq: Pick<Eq, 'hg'>) => eq.hg[0]?.type ?? '';
export const baseOf = (eq: Pick<Eq, 'hg'>): Base => symbolOf(hg0Of(eq)).base;

export function sizeOf(base: Base, channels: number, flow: Flow): { w: number; h: number } {
  const [w, h] = BASE_SIZE[base];
  const extra = Math.max(0, channels - 1) * CHANNEL_STEP;
  return isHorizontal(flow) ? { w, h: h + extra } : { w: w + extra, h };
}

export function boxAt(cx: number, cy: number, w: number, h: number): Box {
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, cx, cy, w, h };
}

export function eqBox(eq: Eq): Box {
  const { w, h } = sizeOf(baseOf(eq), eq.channels.length, eq.flow);
  return boxAt(eq.x, eq.y, w, h);
}

export function flowVec(f: Flow): [number, number] {
  return f === 'E' ? [1, 0] : f === 'W' ? [-1, 0] : f === 'S' ? [0, 1] : [0, -1];
}

export function opposite(f: Flow): Flow {
  return f === 'E' ? 'W' : f === 'W' ? 'E' : f === 'S' ? 'N' : 'S';
}

export function overlaps(a: Box, b: Box, margin = 0): boolean {
  return a.x0 - margin < b.x1 && a.x1 + margin > b.x0 && a.y0 - margin < b.y1 && a.y1 + margin > b.y0;
}

export const snap = (v: number) => Math.round(v / GRID) * GRID;
