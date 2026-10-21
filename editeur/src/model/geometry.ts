// Géométrie des formes du PID. La forme suit le HG0 de l'équipement et ne porte aucune information
// pour la génération : elle sert à dessiner et à placer les liens.
import type { Eq, Flow } from './pivot';
import { BASE_SIZE, isSeparation, symbolOf, type Base } from './symbols';

/**
 * Échelle du PID : 1 unité du dessin = PX_PER_UNIT pixel de l'écran Unified. Les objets (formes,
 * traits, repères) sont dessinés en unités ; à 0,6 ils ont la densité des PID réels (≈ 200 EQ dans
 * l'écran). À la génération Unified, multiplier les coordonnées du pivot par PX_PER_UNIT.
 */
export const PX_PER_UNIT = 0.6;
/** Écran Unified 1920 × 1080, en unités du dessin. */
export const SCREEN = { w: Math.round(1920 / PX_PER_UNIT), h: Math.round(1080 / PX_PER_UNIT) };
export const GRID = 10;
/**
 * Taille des textes du PID (repères, étiquettes de sortie, numéros des joints) : × 2,45 par rapport
 * aux formes. Calée sur le synoptique Unified réel du site (capture à 80 %) : repère ≈ 12,5 px à
 * l'écran (8,5 × 2,45 × PX_PER_UNIT 0,6).
 */
export const TEXT_SCALE = 2.45;
/** Corps des textes du PID, en unités du dessin (joint : numéro écrit dans le joint d'une machine accolée). */
export const FONT = { tag: 8.5 * TEXT_SCALE, tagOutside: 8 * TEXT_SCALE, out: 7.5 * TEXT_SCALE, sign: 9, stub: 8 * TEXT_SCALE, chute: 9.5 * TEXT_SCALE, joint: 6 * TEXT_SCALE };
/** Largeur approximative d'un texte du PID (chasse fixe), au corps donné. */
export const textWidth = (text: string, size: number = FONT.tag) => text.length * 0.62 * size + 2;
/**
 * Écart entre les axes de deux canaux voisins. Multiple de la grille : les axes tombent sur la grille,
 * ce qui permet des liens parfaitement droits d'un canal à l'autre.
 */
export const CH_PITCH = 20;
/** Écart des canaux d'un convoyeur : plus larges, le repère y tient. */
export const CONV_PITCH = 28;
/** Écart des canaux d'un équipement (convoyeur : CONV_PITCH). */
export const pitchOf = (eq: Pick<Eq, 'hg'>) => (baseOf(eq) === 'pill' ? CONV_PITCH : CH_PITCH);
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

/** Longueur minimale d'un convoyeur : un repère de 6 caractères tient dedans (arrondie à la grille). */
const PILL_MIN_LEN = Math.ceil((textWidth('000000') + 12) / GRID) * GRID;

/** Formes allongées : elles s'orientent dans le sens du flux (un tapis qui descend est vertical). */
const ORIENTED = new Set<Base>(['pill', 'flare', 'card', 'screen', 'grid', 'para']);

export function sizeOf(base: Base, channels: number, flow: Flow, pitch = CH_PITCH): { w: number; h: number } {
  const [w, h] = BASE_SIZE[base];
  const extra = Math.max(0, channels - 1) * pitch;
  if (ORIENTED.has(base)) {
    // Longueur le long du flux, fixe ; épaisseur = canaux (plus de canaux = plus haut, pas plus long).
    // À la verticale, un peu plus épais pour le repère. Convoyeur : au moins 6 caractères de repère.
    const len = base === 'pill' ? Math.max(w, PILL_MIN_LEN) : w;
    // Convoyeur (pill), séparation (flare) : même épaisseur à la verticale (le repère, horizontal, peut déborder).
    return isHorizontal(flow) ? { w: len, h: h + extra } : { w: h + (base === 'pill' || base === 'flare' ? 0 : 8) + extra, h: len };
  }
  return isHorizontal(flow) ? { w, h: h + extra } : { w: w + extra, h };
}

export function boxAt(cx: number, cy: number, w: number, h: number): Box {
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, cx, cy, w, h };
}

export function eqBox(eq: Eq): Box {
  // Machine accolée : son cartouche, calculé au rangement sur le tapis.
  if (eq.dockSize) return boxAt(eq.x, eq.y, eq.dockSize.w, eq.dockSize.h);
  // Épaisseur (perpendiculaire au flux) : celle des canaux et de leurs départs ; longueur fixe, sauf un
  // tapis allongé pour loger ses machines accolées.
  const { w, h } = sizeOf(baseOf(eq), 1, eq.flow);
  const t = thickness(eq);
  return isHorizontal(eq.flow) ? boxAt(eq.x, eq.y, eq.len ?? w, t) : boxAt(eq.x, eq.y, t, eq.len ?? h);
}

/**
 * Écart voulu entre deux départs voisins : la place d'une étiquette. Flux horizontal : étiquettes
 * empilées (hauteur 10 + marge) → 12 px ; flux vertical : étiquettes côte à côte (« 2++ ») → 20 px.
 */
export const portUnit = (eq: Pick<Eq, 'flow' | 'channels' | 'hg'>) =>
  // Sorties sans étiquette (un seul canal, hors séparation) : simplement serrées.
  eq.channels.length === 1 && !isSeparation(eq.hg[0]?.type ?? '') ? 5 : isHorizontal(eq.flow) ? 12 : 20;

type ChEq = Pick<Eq, 'channels' | 'flow' | 'hg'>;

/** Place demandée par un canal : celle de ses départs (sens qui en a le plus), CH_PITCH au moins. */
function need(eq: ChEq, c: Eq['channels'][number]): number {
  const m = Math.max(1, ...(['avant', 'arriere'] as const).map((d) => c.outputs.filter((o) => o.dir === d && !o.docked).length));
  return Math.max(pitchOf(eq), Math.ceil((m * portUnit(eq)) / GRID) * GRID);
}

/**
 * Axes des canaux (décalages depuis le centre, canal 1 d'abord). Deux axes voisins sont écartés de la
 * moyenne de la place de leurs deux canaux : un canal à 3 sorties écarte ses voisins, un canal à une
 * sortie garde CH_PITCH (cas courant : axes tous les 20 px, sur la grille).
 */
export function chAxes(eq: ChEq): number[] {
  const n = eq.channels.length;
  if (n < 2) return [0];
  const needs = eq.channels.map((c) => need(eq, c));
  const pos = [0];
  for (let k = 1; k < n; k++) pos.push(pos[k - 1] + (needs[k - 1] + needs[k]) / 2);
  const mid = pos[n - 1] / 2;
  return pos.map((p) => leftSign(eq.flow) * (p - mid));
}

/**
 * Canal 1 toujours à gauche dans le sens du flux : en haut (flux vers la droite), à droite (vers le
 * bas), en bas (vers la gauche), à gauche (vers le haut). 1 : le canal 1 est du côté des coordonnées
 * basses (haut ou gauche de l'écran) ; -1 : du côté opposé.
 */
export const leftSign = (f: Flow): 1 | -1 => (f === 'S' || f === 'W' ? -1 : 1);

export const chAxis = (eq: ChEq, ch: number): number => chAxes(eq)[ch - 1] ?? 0;

/** Limites entre canaux voisins (décalages depuis le centre) : séparations dessinées et choix du canal. */
export function chCuts(eq: ChEq): number[] {
  const a = chAxes(eq);
  const needs = eq.channels.map((c) => need(eq, c));
  // Limite entre le canal k et le canal k+1, dans l'ordre des canaux.
  return a.slice(0, -1).map((p, k) => p + leftSign(eq.flow) * (needs[k] / 2));
}

/** Épaisseur de la forme : forme de base (+ CH_PITCH par canal en plus), élargie si les départs l'exigent. */
export function thickness(eq: ChEq): number {
  const n = eq.channels.length;
  const one = sizeOf(baseOf(eq), 1, eq.flow);
  const base = (isHorizontal(eq.flow) ? one.h : one.w) + Math.max(0, n - 1) * pitchOf(eq);
  if (n < 2) {
    // Convoyeur : au moins l'épaisseur de 3 sorties, pour que le repère tienne dedans.
    const least = baseOf(eq) === 'pill' ? 3 : 1;
    const m = Math.max(least, ...(['avant', 'arriere'] as const).map((d) => eq.channels[0]?.outputs.filter((o) => o.dir === d && !o.docked).length ?? 0));
    return Math.max(base, Math.ceil(((m - 1) * portUnit(eq) + 8) / GRID) * GRID);
  }
  const a = chAxes(eq);
  const needs = eq.channels.map((c) => need(eq, c));
  return Math.max(base, 2 * Math.max(Math.abs(a[0]) + needs[0] / 2, Math.abs(a[n - 1]) + needs[n - 1] / 2));
}

/** Place disponible pour les départs du canal ch, centrée sur son axe. */
export function chRoom(eq: ChEq, ch: number): number {
  const n = eq.channels.length;
  const t = thickness(eq);
  if (n < 2) return t;
  const a = chAxis(eq, ch);
  const [lo, hi] = chEdges(eq, ch, t);
  return 2 * Math.min(a - lo, hi - a);
}

/** Bords (bas, haut) de la bande du canal ch, en décalage depuis le centre. */
export function chEdges(eq: ChEq, ch: number, t = thickness(eq)): [number, number] {
  const n = eq.channels.length;
  if (n < 2) return [-t / 2, t / 2];
  const cuts = chCuts(eq);
  const s = leftSign(eq.flow);
  const before = ch === 1 ? (s * -t) / 2 : cuts[ch - 2];
  const after = ch === n ? (s * t) / 2 : cuts[ch - 1];
  return [Math.min(before, after), Math.max(before, after)];
}

/** Décalage de l'axe du canal ch, à écart régulier (formes de la bibliothèque, sans sorties). */
export function channelOffset(n: number, ch: number, pitch = CH_PITCH): number {
  return (ch - 1 - (n - 1) / 2) * pitch;
}

/**
 * Décalage, le long d'un côté, du point d'accroche d'un canal : sur les côtés perpendiculaires au flux
 * (entrée / sortie matière), chaque canal a son axe ; sur les autres côtés, le milieu.
 */
export function sideOffset(eq: Pick<Eq, 'flow' | 'channels' | 'hg'>, side: Flow, ch: number): number {
  const n = eq.channels.length;
  // Trémie de dosage : les côtés gauche / droit partent du corps de la trémie, sous le tas.
  const heap = baseOf(eq) === 'heap' && isHorizontal(side) ? HEAP_TOP / 2 : 0;
  return heap + (n > 1 && isHorizontal(side) === isHorizontal(eq.flow) ? chAxis(eq, ch) : 0);
}

/** Hauteur du tas au-dessus de la trémie de dosage (forme « heap »). */
export const HEAP_TOP = 14;

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
