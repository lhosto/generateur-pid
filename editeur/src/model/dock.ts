// Machines accolées à un convoyeur (overband, poulie magnétique) : elles se posent physiquement sur le
// tapis. Le lien convoyeur → machine existe dans le pivot (c'est lui qui sera généré) mais ne se dessine
// pas en trait : les deux formes se touchent, un joint plein marque le contact (cliquable).
import { eqBox, isHorizontal, type Box } from './geometry';
import { addOutput, connect, findEq, setPositions, updateEq } from './ops';
import type { Eq, OutputRef, Pivot } from './pivot';
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

/** Liens accolés : convoyeur → machine accolée à ce convoyeur (dockedTo). Rend les id de liens. */
export function dockedLinks(p: Pivot): Set<string> {
  const eqs = new Map(p.equipments.map((e) => [e.id, e]));
  return new Set(p.links.filter((l) => eqs.get(l.to.eq)?.dockedTo === l.from.eq).map((l) => l.id));
}

/** Machines accolées à un convoyeur (elles le suivent quand on le déplace). */
export function dockedOn(p: Pivot, convId: string): string[] {
  return p.equipments.filter((e) => e.dockedTo === convId).map((e) => e.id);
}

/**
 * Lien accolé du canal k du tapis vers le canal 1 de la machine. Jamais sur la sortie 1 du canal
 * (réservée à la suite de la ligne) : si elle manque, on la déclare d'abord, en attente.
 */
function linkDocked(p: Pivot, convId: string, k: number, machId: string): Pivot {
  let o = addOutput(p, convId, k, 'avant');
  if (o.ref && o.ref.num === 1) o = addOutput(o.p, convId, k, 'avant');
  return o.ref ? markDocked(connect(o.p, o.ref, { eq: machId, ch: 1 }), o.ref, true) : p;
}

/** Marque (ou démarque) une sortie du tapis comme accolée. */
function markDocked(p: Pivot, ref: OutputRef, docked: boolean): Pivot {
  return {
    ...p,
    equipments: p.equipments.map((e) =>
      e.id !== ref.eq
        ? e
        : {
            ...e,
            channels: e.channels.map((c, i) =>
              i !== ref.ch - 1 ? c : { outputs: c.outputs.map((o) => (o.dir === ref.dir && o.num === ref.num ? { ...o, docked: docked || undefined } : o)) },
            ),
          },
    ),
  };
}

/** Position collée au flanc du convoyeur, du côté où se trouve la machine, centrée sur lui. */
function sidePosition(conv: Eq, mach: Eq): { x: number; y: number } {
  const cb = eqBox(conv);
  const mb = eqBox(mach);
  return isHorizontal(conv.flow)
    ? { x: cb.cx, y: mach.y < cb.cy ? cb.y0 - mb.h / 2 : cb.y1 + mb.h / 2 }
    : { x: mach.x > cb.cx ? cb.x1 + mb.w / 2 : cb.x0 - mb.w / 2, y: cb.cy };
}

/**
 * Recolle les machines accolées au flanc de leur convoyeur (après un changement de taille : canal
 * ajouté, sorties…). Convoyeur disparu : la machine n'est plus accolée. Rend le même pivot si rien ne change.
 */
export function settleDocked(p: Pivot): Pivot {
  const eqs = new Map(p.equipments.map((e) => [e.id, e]));
  let changed = false;
  const equipments = p.equipments.map((m) => {
    if (!m.dockedTo) return m;
    const conv = eqs.get(m.dockedTo);
    if (!conv) {
      changed = true;
      return { ...m, dockedTo: undefined };
    }
    const at = sidePosition(conv, m);
    if (Math.abs(at.x - m.x) < 0.5 && Math.abs(at.y - m.y) < 0.5) return m;
    changed = true;
    return { ...m, ...at };
  });
  let next = changed ? { ...p, equipments } : p;
  // Toujours au moins un lien depuis son tapis (canal supprimé, lien effacé…) : de nouveau sur le canal 1.
  for (const m of next.equipments) {
    if (!m.dockedTo || !eqs.has(m.dockedTo)) continue;
    if (next.links.some((l) => l.from.eq === m.dockedTo && l.to.eq === m.id)) continue;
    next = linkDocked(next, m.dockedTo, 1, m.id);
  }
  return next;
}

/**
 * Dépôt d'une machine accolable près d'un convoyeur (moins de DOCK_REACH) : elle se colle à son flanc,
 * du côté où on l'a lâchée (dessus / dessous d'un tapis horizontal, à gauche / à droite d'un tapis
 * vertical), centrée sur lui. La machine n'a qu'un canal et couvre toute la largeur du tapis : chaque
 * canal du tapis est relié à son canal 1 (un joint par canal du tapis) ; pour n'en couvrir qu'un, on
 * supprime les liens en trop. Liens créés sur de nouvelles sorties : la sortie
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
  // Lâchée loin de tout convoyeur : elle n'est plus accolée (le lien, s'il existe, redevient un trait).
  if (!best) {
    if (!mach.dockedTo) return p;
    // Ses liens redeviennent des traits : les sorties du tapis retrouvent leur place.
    let q = updateEq(p, machId, { dockedTo: undefined });
    for (const l of q.links) if (l.from.eq === mach.dockedTo && l.to.eq === machId) q = markDocked(q, l.from, false);
    return q;
  }
  const conv = best;
  let next = p;
  next = updateEq(next, machId, { dockedTo: conv.id });
  next = setPositions(next, { [machId]: sidePosition(conv, findEq(next, machId)!) });
  for (let k = 1; k <= conv.channels.length; k++) {
    if (next.links.some((l) => l.from.eq === conv.id && l.from.ch === k && l.to.eq === machId)) continue;
    // La machine n'a qu'un canal : chaque canal du tapis arrive sur son canal 1.
    next = linkDocked(next, conv.id, k, machId);
  }
  return next;
}

