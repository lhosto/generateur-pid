// Machines accolées à un convoyeur (planche « Accolés au tapis v4 » du canevas Design, 21/10/2026).
// Le lien convoyeur → machine existe dans le pivot (c'est lui qui sera généré) mais ne se dessine pas
// en trait : un joint marque chaque canal traité, avec le numéro de la sortie écrit dedans.
// - Valoriste (PICK) : collé au flanc, ne traite que le canal de son côté.
// - Overband, électroaimant, poulie, trieur optique, robot : superposés au tapis sur les canaux traités.
//   Électroaimant, overband, poulie et trieur optique sont toujours au bout du tapis (tête) ; les
//   robots et les valoristes se placent un peu avant.
// - Le tapis s'allonge pour loger ses machines, serrées vers le bout ; sur un même canal elles sont
//   rangées dans l'ordre des numéros, dans le sens du flux ; deux machines sans canal commun (ou deux
//   valoristes de part et d'autre) s'alignent face à face.
import { chEdges, eqBox, flowVec, FONT, isHorizontal, leftSign, textWidth, thickness, type Box } from './geometry';
import { addOutput, connect, findEq, removeOutput, setLinkTarget, updateEq } from './ops';
import type { Eq, Flow, Link, OutputRef, Pivot } from './pivot';
import { symbolOf } from './symbols';

/** Valoriste : au flanc du tapis. */
const FLANK = new Set(['PICK']);
/** Machines de tête : toujours au bout du tapis. */
const HEAD = new Set(['OVPM', 'OVCA', 'MAGP', 'OPSO']);
/** HG principaux qui s'accolent à un convoyeur. */
const DOCKABLE = new Set([...FLANK, ...HEAD, 'ROBO']);
export const isDockable = (hg0: string) => DOCKABLE.has(hg0);
export type DockKind = 'flank' | 'head' | 'over';
export const dockKind = (hg0: string): DockKind => (FLANK.has(hg0) ? 'flank' : HEAD.has(hg0) ? 'head' : 'over');

/** Distance de dépôt en dessous de laquelle une machine accolable se colle au convoyeur voisin. */
const DOCK_REACH = 24;
/** Cartouche d'une machine accolée : longueur le long du flux (la même pour toutes). */
export const CART = 36;
/** Épaisseur du cartouche d'un valoriste (hors du tapis). */
const FLANK_T = 28;
/** Écart entre deux machines ; bout du tapis sans machine de tête. */
const GAP = 8;
const TAIL = 14;

const hg0 = (e: Eq) => e.hg[0]?.type ?? '';
/** Largeur d'un joint (numéro « 1.2 », « 2+→2 »…). */
export const jointW = textWidth('1.2→2', FONT.joint) + 3;
/** Hauteur d'un joint. */
export const jointH = FONT.joint + 3;
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

/** Point de contact (milieu de la zone commune), où se dessine le joint d'un valoriste ; orientation du joint. */
export function contact(a: Box, b: Box): { x: number; y: number; vertical: boolean } {
  const { gx, gy } = gap(a, b);
  if (gy >= gx) {
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

/** Bord amont du cartouche (entrée de la matière), sur l'axe du flux du convoyeur. */
export function upstreamEdge(b: Box, flow: Flow): number {
  return flow === 'E' ? b.x0 : flow === 'W' ? b.x1 : flow === 'S' ? b.y0 : b.y1;
}

/**
 * Côtés du tapis, perpendiculaires au flux : « neg » = coordonnées basses (haut ou gauche de l'écran),
 * « pos » = l'opposé. Canal extérieur de chaque côté (le canal 1 est à gauche du flux).
 */
function outerChannels(conv: Eq): { neg: number; pos: number } {
  const n = conv.channels.length;
  if (n < 2) return { neg: 1, pos: 1 };
  const [lo] = chEdges(conv, 1);
  return lo <= -thickness(conv) / 2 + 0.5 ? { neg: 1, pos: n } : { neg: n, pos: 1 };
}

/** Côté du tapis où se trouve la machine (valoriste), d'après sa position. */
function sideOf(conv: Eq, mach: Eq): 'neg' | 'pos' {
  // Côté mémorisé par rapport au flux (gauche = canal 1) : il suit le tapis quand on le tourne.
  if (mach.dockSide) return (mach.dockSide === 'left') === leftSign(conv.flow) > 0 ? 'neg' : 'pos';
  return screenSide(conv, mach);
}

/** Côté du tapis où la machine est posée à l'écran. */
const screenSide = (conv: Eq, mach: Eq): 'neg' | 'pos' =>
  isHorizontal(conv.flow) ? (mach.y < conv.y ? 'neg' : 'pos') : mach.x < conv.x ? 'neg' : 'pos';

/** Côté écran → côté par rapport au flux. */
const flowSide = (conv: Eq, side: 'neg' | 'pos'): 'left' | 'right' => ((side === 'neg') === leftSign(conv.flow) > 0 ? 'left' : 'right');

/**
 * Lien accolé du canal k du tapis vers le canal machCh de la machine. Jamais sur la sortie 1 du canal
 * (réservée à la suite de la ligne) : si elle manque, on la déclare d'abord, en attente.
 */
function linkDocked(p: Pivot, convId: string, k: number, machId: string, machCh = 1): Pivot {
  let o = addOutput(p, convId, k, 'avant');
  if (o.ref && o.ref.num === 1) o = addOutput(o.p, convId, k, 'avant');
  return o.ref ? markDocked(connect(o.p, o.ref, { eq: machId, ch: machCh }), o.ref, true) : p;
}

/**
 * Canal d'arrivée par défaut du canal k du tapis : machine à un canal, tout dans son canal 1 ; machine
 * qui a au moins autant de canaux que le tapis, canal k dans k ; sinon dans son dernier canal.
 */
const defaultMachCh = (mach: Eq, k: number) => (mach.channels.length < 2 ? 1 : Math.min(k, mach.channels.length));

/**
 * Geste « tirer un trait d'une sortie du tapis vers un canal de la machine posée dessus » : le canal k
 * du tapis est raccordé au canal machCh de la machine (le joint existant change d'arrivée, sinon il est
 * créé). La sortie principale du tapis n'est jamais prise : elle reste pour la suite de la ligne.
 */
export function dockLinkTo(p: Pivot, convId: string, k: number, machId: string, machCh: number): Pivot {
  const existing = p.links.find((l) => l.from.eq === convId && l.from.ch === k && l.from.dir === 'avant' && l.to.eq === machId);
  if (existing) return existing.to.ch === machCh ? p : setLinkTarget(p, existing.id, { eq: machId, ch: machCh });
  return settleDocked(linkDocked(p, convId, k, machId, machCh));
}

/** Côté d'un bord de la machine superposée : « neg » = haut / gauche de l'écran, « pos » = l'opposé. */
export type Edge = 'neg' | 'pos';

/**
 * Largeur d'une machine superposée, bord par bord : canal du tapis qu'on retire (si elle en traite plus
 * d'un) et canal voisin qu'on ajoute (s'il existe), de chaque côté. Rien pour un valoriste.
 */
export function coverage(p: Pivot, machId: string): Record<Edge, { shrink?: number; grow?: number }> | null {
  const mach = findEq(p, machId);
  const conv = mach?.dockedTo ? findEq(p, mach.dockedTo) : undefined;
  if (!mach || !conv || dockKind(hg0(mach)) === 'flank') return null;
  // Canaux du tapis rangés du côté « neg » vers le côté « pos ».
  const order = conv.channels.map((_, i) => i + 1).sort((a, b) => chEdges(conv, a)[0] - chEdges(conv, b)[0]);
  const chs = new Set(machLinks(p, conv.id, mach.id).map((l) => l.from.ch));
  const idx = order.map((k, i) => (chs.has(k) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return null;
  const lo = Math.min(...idx), hi = Math.max(...idx);
  const many = chs.size > 1;
  return {
    neg: { shrink: many ? order[lo] : undefined, grow: lo > 0 ? order[lo - 1] : undefined },
    pos: { shrink: many ? order[hi] : undefined, grow: hi < order.length - 1 ? order[hi + 1] : undefined },
  };
}

/** Retire un canal traité (ses joints vers la machine) ; sa sortie accolée disparaît au rangement. */
export function uncover(p: Pivot, machId: string, k: number): Pivot {
  const mach = findEq(p, machId);
  if (!mach?.dockedTo) return p;
  return settleDocked({ ...p, links: p.links.filter((l) => !(l.from.eq === mach.dockedTo && l.from.ch === k && l.to.eq === machId)) });
}

/** Ajoute un canal traité, arrivée par défaut (machine à 1 canal : son canal 1 ; sinon le même numéro). */
export function cover(p: Pivot, machId: string, k: number): Pivot {
  const mach = findEq(p, machId);
  if (!mach?.dockedTo) return p;
  return dockLinkTo(p, mach.dockedTo, k, machId, defaultMachCh(mach, k));
}

/**
 * Canal d'une machine accolée sous un point : ses canaux se partagent son épaisseur, dans le même ordre
 * que ceux du tapis (canal 1 à gauche du flux du tapis).
 */
export function dockedChannelAt(mach: Eq, b: Box, beltFlow: Flow, x: number, y: number): number {
  const n = mach.channels.length;
  if (n < 2) return 1;
  const hor = isHorizontal(beltFlow);
  const t = hor ? (y - b.y0) / b.h : (x - b.x0) / b.w;
  const i = Math.max(0, Math.min(n - 1, Math.floor(t * n)));
  return leftSign(beltFlow) > 0 ? i + 1 : n - i;
}

/** Bande du canal ch d'une machine accolée (surlignage pendant le geste, séparations dessinées). */
export function dockedBand(mach: Eq, b: Box, beltFlow: Flow, ch: number): Box {
  const n = mach.channels.length;
  const i = leftSign(beltFlow) > 0 ? ch - 1 : n - ch;
  if (isHorizontal(beltFlow)) {
    const y0 = b.y0 + (b.h * i) / n;
    return { ...b, y0, y1: y0 + b.h / n, cy: y0 + b.h / (2 * n), h: b.h / n };
  }
  const x0 = b.x0 + (b.w * i) / n;
  return { ...b, x0, x1: x0 + b.w / n, cx: x0 + b.w / (2 * n), w: b.w / n };
}

/** Déplace un lien accolé de la sortie 1 vers un numéro libre et redéclare la sortie 1 en attente. */
function moveOffOne(p: Pivot, linkId: string): Pivot {
  const l = p.links.find((x) => x.id === linkId)!;
  const conv = findEq(p, l.from.eq)!;
  const outs = conv.channels[l.from.ch - 1].outputs;
  const num = Math.max(...outs.filter((o) => o.dir === l.from.dir).map((o) => o.num)) + 1;
  return {
    ...p,
    equipments: p.equipments.map((e) =>
      e.id !== conv.id
        ? e
        : {
            ...e,
            channels: e.channels.map((c, i) =>
              i !== l.from.ch - 1
                ? c
                : { outputs: [...c.outputs.map((o) => (o.dir === l.from.dir && o.num === 1 ? { ...o, num } : o)), { dir: l.from.dir, num: 1 }] },
            ),
          },
    ),
    links: p.links.map((x) => (x.id === linkId ? { ...x, from: { ...x.from, num } } : x)),
  };
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

/** Liens accolés d'une machine (depuis son tapis). */
const machLinks = (p: Pivot, conv: string, mach: string) => p.links.filter((l) => l.from.eq === conv && l.to.eq === mach && l.from.dir === 'avant');

/**
 * Ordre des machines d'un tapis dans le sens du flux : les machines de tête en dernier ; sinon d'après
 * leurs numéros sur un canal qu'elles partagent (le numéro dit la place), à défaut leur plus petit numéro.
 */
function flowOrder(p: Pivot, convId: string): (a: Eq, b: Eq) => number {
  const nums = (m: Eq) => new Map(machLinks(p, convId, m.id).map((l) => [l.from.ch, l.from.num]));
  return (a, b) => {
    const ka = dockKind(hg0(a)) === 'head' ? 1 : 0;
    const kb = dockKind(hg0(b)) === 'head' ? 1 : 0;
    if (ka !== kb) return ka - kb;
    const na = nums(a);
    const nb = nums(b);
    for (const [k, n] of na) if (nb.has(k)) return n - nb.get(k)!;
    return Math.min(...na.values()) - Math.min(...nb.values());
  };
}

/**
 * Numéros qu'un lien accolé peut prendre sur son canal : ceux des autres machines posées sur le tapis
 * (valoriste, robot), jamais la sortie 1 (négative, suite de la ligne) ni celle d'une machine de tête.
 */
export function dockedNumsFree(p: Pivot, linkId: string): Set<number> {
  const l = p.links.find((x) => x.id === linkId);
  const out = new Set<number>();
  if (!l || !dockedLinks(p).has(l.id)) return out;
  const eqs = new Map(p.equipments.map((e) => [e.id, e]));
  for (const o of p.links) {
    if (o.from.eq !== l.from.eq || o.from.ch !== l.from.ch || o.from.dir !== l.from.dir || !dockedLinks(p).has(o.id)) continue;
    const m = eqs.get(o.to.eq);
    if (o.from.num === 1 || !m || dockKind(hg0(m)) === 'head') continue;
    out.add(o.from.num);
  }
  return out;
}

/**
 * Change la place d'une machine posée sur le tapis : son lien prend le numéro voulu et le lien qui le
 * tenait prend le sien (échange). Le rangement replace les machines dans le nouvel ordre.
 */
export function swapDocked(p: Pivot, linkId: string, num: number): Pivot {
  const l = p.links.find((x) => x.id === linkId);
  if (!l || !dockedNumsFree(p, linkId).has(num) || l.from.num === num) return p;
  const other = p.links.find((o) => o.from.eq === l.from.eq && o.from.ch === l.from.ch && o.from.dir === l.from.dir && o.from.num === num);
  const links = p.links.map((x): Link =>
    x.id === l.id ? { ...x, from: { ...x.from, num } } : other && x.id === other.id ? { ...x, from: { ...x.from, num: l.from.num } } : x,
  );
  return settleDocked({ ...p, links });
}

/**
 * Numéros dans le sens du flux : sur chaque canal, les machines (corps puis tête) prennent les numéros
 * de leurs sorties accolées dans l'ordre croissant. Seuls les liens accolés sont permutés.
 */
function renumber(p: Pivot, conv: Eq, order: Eq[]): Pivot {
  const remap = new Map<string, number>();
  conv.channels.forEach((_, ci) => {
    const k = ci + 1;
    const ls = order.flatMap((m) => machLinks(p, conv.id, m.id).filter((l) => l.from.ch === k));
    const nums = ls.map((l) => l.from.num).sort((a, b) => a - b);
    ls.forEach((l, i) => {
      if (l.from.num !== nums[i]) remap.set(l.id, nums[i]);
    });
  });
  if (!remap.size) return p;
  return { ...p, links: p.links.map((l): Link => (remap.has(l.id) ? { ...l, from: { ...l.from, num: remap.get(l.id)! } } : l)) };
}

interface Placed {
  m: Eq;
  kind: DockKind;
  chs: number[];
  /** Début (repère compris) le long du tapis, depuis l'entrée. */
  left: number;
  lab: number;
}

/**
 * Range les machines d'un tapis : longueur du tapis, position, taille et sens de sortie de chaque
 * machine. Le tapis garde son entrée en place et s'allonge vers l'aval.
 */
function layoutBelt(p: Pivot, conv: Eq): { conv: Eq; machines: Eq[] } {
  const machs = p.equipments.filter((e) => e.dockedTo === conv.id);
  const n = conv.channels.length;
  const outer = outerChannels(conv);
  // Rang depuis le côté « neg » : 0 = canal extérieur côté neg.
  const rank = (k: number) => (outer.neg === 1 ? k - 1 : n - k);
  const items = machs.map((m) => {
    const kind = dockKind(hg0(m));
    const chs = [...new Set(machLinks(p, conv.id, m.id).map((l) => l.from.ch))].sort((a, b) => a - b);
    const minNum = Math.min(...machLinks(p, conv.id, m.id).map((l) => l.from.num));
    return { m, kind, chs: chs.length ? chs : [1], minNum };
  });
  // Ordre dans le sens du flux : corps (robots, valoristes) puis tête, chacun par numéro.
  const cmp = flowOrder(p, conv.id);
  items.sort((a, b) => cmp(a.m, b.m));

  // Ressources occupées le long du tapis : un flanc (+ son canal) pour un valoriste ; pour une machine
  // superposée, ses canaux et ceux que sa sortie traverse jusqu'au flanc. Sans ressource commune, deux
  // machines s'alignent face à face.
  const exitNeg = (chs: number[]) => {
    const r = chs.map(rank);
    return Math.min(...r) === 0 || Math.max(...r) !== n - 1;
  };
  const res = (it: (typeof items)[number]): string[] => {
    if (it.kind === 'flank') return [sideOf(conv, it.m)];
    const r = it.chs.map(rank);
    const lo = Math.min(...r), hi = Math.max(...r);
    const own = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const crossed = exitNeg(it.chs) ? Array.from({ length: lo }, (_, i) => i) : Array.from({ length: n - 1 - hi }, (_, i) => hi + 1 + i);
    const sides = [...(lo === 0 ? ['neg'] : []), ...(hi === n - 1 ? ['pos'] : []), exitNeg(it.chs) ? 'neg' : 'pos'];
    const byRank = (rr: number) => `c${outer.neg === 1 ? rr + 1 : n - rr}`;
    return [...new Set([...own.map(byRank), ...crossed.map(byRank), ...sides])];
  };
  // Place devant la machine : valoriste, son repère (côté amont) ; machine superposée, ses joints (son
  // repère est écrit à l'opposé de sa sortie, pas devant elle).
  // Tapis vertical : repères et joints (écrits à l'horizontale) ne prennent que leur hauteur le long du flux.
  const hor = isHorizontal(conv.flow);
  const labRoom = (m: Eq, kind: DockKind) =>
    kind === 'flank' ? (hor ? textWidth(m.repere || '?') : FONT.tag) + 4 : (hor ? jointW : n > 1 ? 2 * jointH + 1 : jointH) + 4;
  const headRoom = hor ? textWidth(conv.repere || '?') + 12 : FONT.tag + 10;

  // Posées depuis le bout du tapis vers l'amont, dans l'ordre inverse des numéros : d'abord les machines
  // de tête (leur bord aval = bout du tapis), puis les autres juste avant elles (ou avant le bout).
  // Deux machines sans ressource commune s'alignent face à face.
  const pack = (list: typeof items, limit: number, room: (lab: number) => number): Placed[] => {
    const from: Record<string, number> = {};
    const out: Placed[] = [];
    for (const it of [...list].reverse()) {
      const lab = labRoom(it.m, it.kind);
      const rs = res(it);
      const right = Math.min(limit, ...rs.map((r) => (from[r] ?? Infinity) - GAP));
      const left = right - room(lab);
      for (const r of rs) from[r] = left;
      out.unshift({ m: it.m, kind: it.kind, chs: it.chs, left, lab });
    }
    return out;
  };
  const heads = pack(items.filter((i) => i.kind === 'head'), 0, (lab) => lab + CART);
  const headStart = heads.length ? Math.min(...heads.map((h) => h.left)) - GAP : -TAIL;
  // Les sorties des machines partent vers le flanc du tapis : aucune place à réserver côté aval.
  const placed = pack(items.filter((i) => i.kind !== 'head'), headStart, (lab) => lab + CART);
  // Le tapis commence à son repère : tout est décalé pour que la machine la plus en amont le suive.
  // Le repère d'un valoriste est hors du tapis : il peut passer au-dessus / au-dessous du repère du tapis.
  const first = Math.min(headStart, ...placed.map((m) => (m.kind === 'flank' ? m.left + m.lab : m.left)));
  const shift = headRoom - first;
  for (const m of [...heads, ...placed]) m.left += shift;
  const base = isHorizontal(conv.flow) ? eqBoxNoLen(conv).w : eqBoxNoLen(conv).h;
  const len = Math.max(base, shift);

  // Le tapis garde son entrée : le centre se déplace de la moitié de l'allongement, vers l'aval.
  const old = eqBox(conv);
  const oldLen = isHorizontal(conv.flow) ? old.w : old.h;
  const [vx, vy] = flowVec(conv.flow);
  const entry = { x: conv.x - (vx * oldLen) / 2, y: conv.y - (vy * oldLen) / 2 };
  const newConv: Eq = { ...conv, x: entry.x + (vx * len) / 2, y: entry.y + (vy * len) / 2, len: len === base ? undefined : len };
  const t = thickness(conv);
  const across = (o: number) => (isHorizontal(conv.flow) ? { dx: 0, dy: o } : { dx: o, dy: 0 });

  const machines = [...placed, ...heads].map(({ m, kind, chs, left, lab }) => {
    const u = left + lab + CART / 2;
    const along = { x: entry.x + vx * u, y: entry.y + vy * u };
    let off: number;
    let thick: number;
    let out: Flow;
    if (kind === 'flank') {
      const side = sideOf(conv, m);
      off = (side === 'neg' ? -1 : 1) * (t / 2 + FLANK_T / 2);
      thick = FLANK_T;
      out = isHorizontal(conv.flow) ? (side === 'neg' ? 'N' : 'S') : side === 'neg' ? 'W' : 'E';
    } else {
      // Superposée sur les canaux traités ; une machine de tête affleure le flanc du tapis.
      const edges = chs.map((k) => chEdges(newConv, k, t));
      let lo = Math.min(...edges.map((e) => e[0]));
      let hi = Math.max(...edges.map((e) => e[1]));
      lo += kind === 'head' && lo <= -t / 2 + 0.5 ? 0 : 2;
      hi -= kind === 'head' && hi >= t / 2 - 0.5 ? 0 : 2;
      off = (lo + hi) / 2;
      thick = hi - lo;
      const neg = exitNeg(chs);
      out = isHorizontal(conv.flow) ? (neg ? 'N' : 'S') : neg ? 'W' : 'E';
    }
    const { dx, dy } = across(off);
    const dockSize = isHorizontal(conv.flow) ? { w: CART, h: thick } : { w: thick, h: CART };
    return { ...m, x: along.x + dx, y: along.y + dy, flow: out, dockSize };
  });
  return { conv: newConv, machines };
}

/** Boîte du convoyeur sans allongement (longueur de base). */
const eqBoxNoLen = (e: Eq) => eqBox({ ...e, len: undefined, dockSize: undefined });

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
const sameEq = (a: Eq, b: Eq) =>
  near(a.x, b.x) && near(a.y, b.y) && a.flow === b.flow && a.len === b.len &&
  (a.dockSize?.w ?? -1) === (b.dockSize?.w ?? -1) && (a.dockSize?.h ?? -1) === (b.dockSize?.h ?? -1);

/**
 * Remet en ordre les machines accolées après toute modification : liens (jamais sur la sortie 1, au
 * moins un lien), numéros dans le sens du flux, longueur des tapis, place et taille des machines.
 * Convoyeur disparu : la machine n'est plus accolée. Rend le même pivot si rien ne change.
 */
export function settleDocked(p: Pivot): Pivot {
  const ids = new Set(p.equipments.map((e) => e.id));
  let next = p;
  // Convoyeur disparu : plus accolée, le cartouche redevient la forme de la famille.
  if (next.equipments.some((m) => m.dockedTo && !ids.has(m.dockedTo)) || next.equipments.some((m) => !m.dockedTo && m.dockSize)) {
    next = { ...next, equipments: next.equipments.map((m) => ((m.dockedTo && !ids.has(m.dockedTo)) || (!m.dockedTo && m.dockSize) ? { ...m, dockedTo: undefined, dockSize: undefined } : m)) };
  }
  // Valoriste posé avant que son côté soit mémorisé : on le retrouve d'après le canal relié (canal 1 =
  // gauche du flux, dernier canal = droite), sinon d'après sa place à l'écran. Ainsi tourner le tapis
  // garde ses liens.
  if (next.equipments.some((m) => m.dockedTo && !m.dockSide && dockKind(hg0(m)) === 'flank')) {
    const snap = next;
    next = {
      ...next,
      equipments: next.equipments.map((m) => {
        if (!m.dockedTo || m.dockSide || dockKind(hg0(m)) !== 'flank') return m;
        const conv = findEq(snap, m.dockedTo);
        if (!conv) return m;
        const n = conv.channels.length;
        const k = machLinks(snap, conv.id, m.id)[0]?.from.ch;
        const side = n > 1 && k === 1 ? 'left' : n > 1 && k === n ? 'right' : flowSide(conv, screenSide(conv, m));
        return { ...m, dockSide: side };
      }),
    };
  }
  // Valoriste : toujours relié au canal de son côté (canal ajouté ou retiré au tapis : il suit son flanc).
  for (const m of next.equipments) {
    if (!m.dockedTo || dockKind(hg0(m)) !== 'flank') continue;
    const conv = findEq(next, m.dockedTo);
    if (!conv) continue;
    const o = outerChannels(conv);
    const want = sideOf(conv, m) === 'neg' ? o.neg : o.pos;
    const ls = machLinks(next, conv.id, m.id);
    if (ls.length && ls.every((l) => l.from.ch === want)) continue;
    next = { ...next, links: next.links.filter((l) => !(l.from.eq === conv.id && l.to.eq === m.id && l.from.ch !== want)) };
    if (!next.links.some((l) => l.from.eq === conv.id && l.to.eq === m.id)) next = linkDocked(next, conv.id, want, m.id);
  }
  // Machine supprimée ou lien effacé : sa sortie accolée sur le tapis disparaît avec lui (les suivantes
  // remontent), sinon elle resterait en attente au bout du tapis.
  for (;;) {
    const orphan = next.equipments.flatMap((e) =>
      e.channels.flatMap((c, ci) =>
        c.outputs
          .filter((o) => o.docked && !next.links.some((l) => l.from.eq === e.id && l.from.ch === ci + 1 && l.from.dir === o.dir && l.from.num === o.num))
          .map((o): OutputRef => ({ eq: e.id, ch: ci + 1, dir: o.dir, num: o.num })),
      ),
    )[0];
    if (!orphan) break;
    next = removeOutput(next, orphan);
  }
  // Lien accolé tombé en sortie 1 (la sortie 1 a été supprimée, les suivantes ont remonté) : il reprend
  // un numéro libre et la sortie 1 est de nouveau déclarée, en attente, pour la suite de la ligne.
  for (const l of next.links) {
    if (l.from.num !== 1 || !dockedLinks(next).has(l.id)) continue;
    next = moveOffOne(next, l.id);
  }
  // Toujours au moins un lien depuis son tapis : valoriste sur le canal de son côté, sinon canal 1.
  for (const m of next.equipments) {
    if (!m.dockedTo) continue;
    if (next.links.some((l) => l.from.eq === m.dockedTo && l.to.eq === m.id)) continue;
    const conv = findEq(next, m.dockedTo)!;
    const o = outerChannels(conv);
    next = linkDocked(next, conv.id, dockKind(hg0(m)) === 'flank' ? (sideOf(conv, m) === 'neg' ? o.neg : o.pos) : 1, m.id);
  }
  // Tapis : numéros dans le sens du flux, puis rangement.
  const changed = new Map<string, Eq>();
  for (const conv of next.equipments) {
    const machs = next.equipments.filter((e) => e.dockedTo === conv.id);
    if (!machs.length) {
      if (conv.len !== undefined) {
        // Plus de machine : le tapis reprend sa longueur, entrée en place.
        const old = eqBox(conv);
        const base = eqBoxNoLen(conv);
        const [vx, vy] = flowVec(conv.flow);
        const d = ((isHorizontal(conv.flow) ? old.w - base.w : old.h - base.h) / 2);
        changed.set(conv.id, { ...conv, len: undefined, x: conv.x - vx * d, y: conv.y - vy * d });
      }
      continue;
    }
    const order = [...machs].sort(flowOrder(next, conv.id));
    next = renumber(next, conv, order);
    const r = layoutBelt(next, conv);
    if (!sameEq(r.conv, conv)) changed.set(conv.id, r.conv);
    for (const m of r.machines) {
      const cur = next.equipments.find((e) => e.id === m.id)!;
      if (!sameEq(m, cur)) changed.set(m.id, m);
    }
  }
  if (changed.size) next = { ...next, equipments: next.equipments.map((e) => changed.get(e.id) ?? e) };
  return next;
}

/**
 * Dépôt d'une machine accolable près d'un convoyeur (moins de DOCK_REACH) ou dessus : elle s'accole.
 * Valoriste : relié au seul canal de son côté. Autres machines : chaque canal du tapis est relié à leur
 * canal 1 (on supprime les liens en trop pour n'en traiter qu'une partie). Liens créés sur de nouvelles
 * sorties : la sortie principale du tapis reste libre pour la suite de la ligne. Le rangement (place,
 * taille, numéros, longueur du tapis) est fait par settleDocked.
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
  // Lâchée loin de tout convoyeur : elle n'est plus accolée (ses liens redeviennent des traits).
  if (!best) {
    if (!mach.dockedTo) return p;
    let q = updateEq(p, machId, { dockedTo: undefined, dockSize: undefined, dockSide: undefined });
    for (const l of q.links) if (l.from.eq === mach.dockedTo && l.to.eq === machId) q = markDocked(q, l.from, false);
    return q;
  }
  const conv = best;
  const kind = dockKind(hg0(mach));
  // Valoriste : le côté où on le lâche est mémorisé par rapport au flux (il suit le tapis tourné).
  const side = screenSide(conv, mach);
  let next = updateEq(p, machId, kind === 'flank' ? { dockedTo: conv.id, dockSide: flowSide(conv, side) } : { dockedTo: conv.id });
  const o = outerChannels(conv);
  const want = kind === 'flank' ? [side === 'neg' ? o.neg : o.pos] : conv.channels.map((_, i) => i + 1);
  for (const k of want) {
    if (next.links.some((l) => l.from.eq === conv.id && l.from.ch === k && l.to.eq === machId)) continue;
    next = linkDocked(next, conv.id, k, machId, defaultMachCh(findEq(next, machId)!, k));
  }
  return settleDocked(next);
}
