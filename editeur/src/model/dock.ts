// Machines accolées à un convoyeur (overband, poulie magnétique) : elles se posent physiquement sur le
// tapis. Le lien convoyeur → machine existe dans le pivot (c'est lui qui sera généré) mais ne se dessine
// pas en trait : les deux formes se touchent, un joint plein marque le contact (cliquable).
import { eqBox, isHorizontal, type Box } from './geometry';
import { addChannel, addOutput, connect, findEq, setPositions } from './ops';
import type { Eq, Pivot } from './pivot';
import { symbolOf } from './symbols';

/** HG principaux qui s'accolent à un convoyeur (règle donnée pour overbands et poulies). */
const DOCKABLE = new Set(['OVPM', 'OVCA', 'MAGP']);
export const isDockable = (hg0: string) => DOCKABLE.has(hg0);

/** Distance de dépôt en dessous de laquelle une machine accolable se colle au convoyeur voisin. */
const DOCK_REACH = 24;

const hg0 = (e: Eq) => e.hg[0]?.type ?? '';
const isConveyor = (e: Eq) => symbolOf(hg0(e)).group === 'Convoyage';

/** Écart entre deux boîtes (négatif si elles se chevauchent) et recouvrement sur l'autre axe. */
function gap(a: Box, b: Box): { gx: number; gy: number } {
  return { gx: Math.max(b.x0 - a.x1, a.x0 - b.x1), gy: Math.max(b.y0 - a.y1, a.y0 - b.y1) };
}

/** Deux boîtes en contact : bord à bord (écart de 0 à 2 px) sur un axe, et face à face sur l'autre. */
export function touching(a: Box, b: Box): boolean {
  const { gx, gy } = gap(a, b);
  return (gx >= -1 && gx <= 2 && gy < -4) || (gy >= -1 && gy <= 2 && gx < -4);
}

/** Point de contact (milieu de la zone commune), où se dessine le joint ; et l'orientation du joint. */
export function contact(a: Box, b: Box): { x: number; y: number; vertical: boolean } {
  const { gx, gy } = gap(a, b);
  if (gy >= gx) {
    // L'un au-dessus de l'autre : joint horizontal sur la ligne de contact.
    const x = (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2;
    const y = a.y1 <= b.y0 + 2 ? (a.y1 + b.y0) / 2 : (b.y1 + a.y0) / 2;
    return { x, y, vertical: false };
  }
  const y = (Math.max(a.y0, b.y0) + Math.min(a.y1, b.y1)) / 2;
  const x = a.x1 <= b.x0 + 2 ? (a.x1 + b.x0) / 2 : (b.x1 + a.x0) / 2;
  return { x, y, vertical: true };
}

/** Liens accolés : convoyeur → machine accolable, formes en contact. Rend les id de liens. */
export function dockedLinks(p: Pivot): Set<string> {
  const out = new Set<string>();
  const eqs = new Map(p.equipments.map((e) => [e.id, e]));
  for (const l of p.links) {
    const src = eqs.get(l.from.eq);
    const dst = eqs.get(l.to.eq);
    if (!src || !dst || !isDockable(hg0(dst)) || isDockable(hg0(src))) continue;
    if (touching(eqBox(src), eqBox(dst))) out.add(l.id);
  }
  return out;
}

/** Machines accolées à un convoyeur (elles le suivent quand on le déplace). */
export function dockedOn(p: Pivot, convId: string): string[] {
  const ids = dockedLinks(p);
  return p.links.filter((l) => ids.has(l.id) && l.from.eq === convId).map((l) => l.to.eq);
}

/**
 * Dépôt d'une machine accolable près d'un convoyeur (moins de DOCK_REACH) : elle se colle à son flanc,
 * du côté où on l'a lâchée (dessus / dessous d'un tapis horizontal, à gauche / à droite d'un tapis
 * vertical), centrée sur lui. La machine couvre toute la largeur du tapis : elle prend autant de canaux
 * que lui, et chaque canal du tapis est relié au même canal de la machine (1 → 1, 2 → 2) ; pour n'en
 * couvrir qu'un, on supprime les liens en trop. Liens créés sur de nouvelles sorties : la sortie
 * principale du tapis reste libre pour la suite de la ligne.
 */
export function dockOnDrop(p: Pivot, machId: string): Pivot {
  const mach = findEq(p, machId);
  if (!mach || !isDockable(hg0(mach))) return p;
  const mb = eqBox(mach);
  let best: Eq | null = null;
  let bestD = Infinity;
  for (const e of p.equipments) {
    if (e.id === machId || !isConveyor(e)) continue;
    const { gx, gy } = gap(eqBox(e), mb);
    if (Math.max(gx, gy) > DOCK_REACH) continue;
    const d = Math.hypot(e.x - mach.x, e.y - mach.y);
    if (d < bestD) (bestD = d), (best = e);
  }
  if (!best) return p;
  const conv = best;
  let next = p;
  // Autant de canaux que le tapis.
  for (let k = findEq(next, machId)!.channels.length; k < conv.channels.length; k++) next = addChannel(next, machId);
  const mb2 = eqBox(findEq(next, machId)!);
  const cb = eqBox(conv);
  const pos = isHorizontal(conv.flow)
    ? { x: cb.cx, y: mach.y < cb.cy ? cb.y0 - mb2.h / 2 : cb.y1 + mb2.h / 2 }
    : { x: mach.x > cb.cx ? cb.x1 + mb2.w / 2 : cb.x0 - mb2.w / 2, y: cb.cy };
  next = setPositions(next, { [machId]: pos });
  for (let k = 1; k <= conv.channels.length; k++) {
    if (next.links.some((l) => l.from.eq === conv.id && l.from.ch === k && l.to.eq === machId)) continue;
    const o = addOutput(next, conv.id, k, 'avant');
    if (o.ref) next = connect(o.p, o.ref, { eq: machId, ch: k });
  }
  return next;
}

