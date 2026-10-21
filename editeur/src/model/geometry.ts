// Géométrie des formes du PID. La forme suit le HG0 de l'équipement et ne porte aucune information
// pour la génération : elle sert à dessiner et à placer les liens.
import type { Eq, Flow } from './pivot';
import { BASE_SIZE, symbolOf, type Base } from './symbols';

export const SCREEN = { w: 1920, h: 1080 };
export const GRID = 10;
/**
 * Écart entre les axes de deux canaux voisins. Multiple de la grille : les axes tombent sur la grille,
 * ce qui permet des liens parfaitement droits d'un canal à l'autre.
 */
export const CH_PITCH = 20;
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

/** Formes allongées : elles s'orientent dans le sens du flux (un tapis qui descend est vertical). */
const ORIENTED = new Set<Base>(['pill', 'card', 'screen', 'grid', 'para']);

export function sizeOf(base: Base, channels: number, flow: Flow): { w: number; h: number } {
  const [w, h] = BASE_SIZE[base];
  const extra = Math.max(0, channels - 1) * CH_PITCH;
  if (ORIENTED.has(base)) {
    // Longueur le long du flux, épaisseur = canaux ; la longueur suit aussi les canaux pour que la forme
    // reste nettement allongée dans le sens du flux. À la verticale, un peu plus épais pour le repère.
    const len = w + extra;
    return isHorizontal(flow) ? { w: len, h: h + extra } : { w: h + 8 + extra, h: len };
  }
  return isHorizontal(flow) ? { w, h: h + extra } : { w: w + extra, h };
}

export function boxAt(cx: number, cy: number, w: number, h: number): Box {
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, cx, cy, w, h };
}

export function eqBox(eq: Eq): Box {
  const { w, h } = sizeOf(baseOf(eq), eq.channels.length, eq.flow);
  return boxAt(eq.x, eq.y, w, h);
}

/** Décalage de l'axe du canal ch par rapport au centre de l'EQ, perpendiculairement au flux. */
export function channelOffset(n: number, ch: number): number {
  return (ch - 1 - (n - 1) / 2) * CH_PITCH;
}

/**
 * Décalage, le long d'un côté, du point d'accroche d'un canal : sur les côtés perpendiculaires au flux
 * (entrée / sortie matière), chaque canal a son axe ; sur les autres côtés, le milieu.
 */
export function sideOffset(eq: Pick<Eq, 'flow' | 'channels'>, side: Flow, ch: number): number {
  const n = eq.channels.length;
  return n > 1 && isHorizontal(side) === isHorizontal(eq.flow) ? channelOffset(n, ch) : 0;
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
