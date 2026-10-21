// Routage orthogonal des liens. Chaque canal a un axe fixe (geometry.sideOffset) : tous les liens d'un
// canal partent et arrivent exactement sur cet axe, si bien que deux canaux alignés donnent un trait droit.
// Le côté de départ fait face à la cible ; si la voie est bouchée, tracé en L puis Z sur l'autre axe.
import { channelOffset, eqBox, flowVec, isHorizontal, opposite, sideOffset, type Box } from './geometry';
import type { Dir, Eq, Flow, Link, OutputRef, Pivot } from './pivot';
import { outputLabel } from './rules';
import { symbolOf } from './symbols';

export type Pt = [number, number];

export interface RoutedLink {
  id: string;
  link: Link;
  points: Pt[];
  /**
   * Fin du trait à l'intérieur de l'équipement d'arrivée : quand la flèche entre par un côté qui n'est
   * pas celui des canaux (dessus / dessous d'un flux horizontal), elle traverse la forme jusqu'à l'axe
   * du canal visé. Dessinée par-dessus les équipements.
   */
  inner?: [Pt, Pt];
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


/**
 * Couleur d'un trait. Couleurs par sortie retirées pour le moment (demande d'Alex du 21/10) : trait neutre ;
 * la sortie se lit sur l'étiquette « canal.sortie » et la marche arrière sur le pointillé.
 */
export const outputColor = (_num: number) => 'var(--pid-stroke-light)';

/** Étiquette courte d'une sortie : « 1.2 » = canal 1, sortie 2 ; « AR » en marche arrière. */
export const outputTag = (ch: number, num: number, dir: Dir) => `${ch}.${num}${dir === 'arriere' ? ' AR' : ''}`;

/**
 * Étiquette courte d'une sortie sur le PID, selon ce qui suffit à la distinguer (par sens) :
 * un seul canal et une seule sortie → rien (« AR » seul en marche arrière) ; une sortie au plus par
 * canal → numéro de canal ; plusieurs sorties sur un canal → « canal.sortie » (1.1, 1.2).
 */
export function shortTag(eq: Eq | undefined, ch: number, num: number, dir: Dir): string {
  const ar = dir === 'arriere' ? 'AR' : '';
  if (!eq) return outputTag(ch, num, dir);
  const counts = eq.channels.map((c) => c.outputs.filter((o) => o.dir === dir).length);
  const multi = eq.channels.length > 1;
  const many = counts.some((n) => n > 1);
  const core = many ? `${ch}.${num}` : multi ? `${ch}` : '';
  return [core, ar].filter(Boolean).join(' ');
}

export interface TagPos {
  x: number;
  y: number;
  anchor: 'start' | 'middle';
}

/** Largeur approximative d'une étiquette (chasse fixe 8,5 px). */
const tagWidth = (text: string) => text.length * 5.3 + 2;

function tagBox(t: TagPos, text: string): Box {
  const w = tagWidth(text);
  const x0 = t.anchor === 'middle' ? t.x - w / 2 : t.x;
  return { x0, y0: t.y - 5, x1: x0 + w, y1: t.y + 5, cx: x0 + w / 2, cy: t.y, w, h: 10 };
}

/** Positions candidates le long du trait : après le premier coude, puis depuis le départ, tous les 10 px. */
function tagCandidates(points: Pt[]): TagPos[] {
  const out: TagPos[] = [];
  const along = (a: Pt, b: Pt, from: number) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const vx = (b[0] - a[0]) / (len || 1);
    const vy = (b[1] - a[1]) / (len || 1);
    const vertical = Math.abs(vx) < 0.5;
    for (let d = from; d <= len - 10; d += 10) {
      const x = a[0] + vx * d;
      const y = a[1] + vy * d;
      out.push(vertical ? { x: x + 4, y, anchor: 'start' } : { x, y: y - 5, anchor: 'middle' });
    }
  };
  // D'abord collée au départ (on voit de quelle sortie il s'agit), puis après le premier coude.
  along(points[0], points[1], 9);
  if (points.length > 2) along(points[1], points[2], 9);
  for (let i = 2; i < points.length - 1; i++) along(points[i], points[i + 1], 10);
  return out;
}

/**
 * Place les étiquettes « canal.sortie » de tous les liens sans chevauchement : chacune prend la
 * première position libre le long de son trait (ni sur une autre étiquette, ni sur un équipement
 * ou son repère). À défaut, la position préférée.
 */
export function placeTags(p: Pivot, links: RoutedLink[], text: (l: RoutedLink) => string): Map<string, TagPos> {
  const obstacles = p.equipments.map((e) => {
    const b = eqBox(e);
    const spec = symbolOf(e.hg[0]?.type ?? '');
    // Repère écrit sous la forme (losange / rond à pictogramme) : zone à éviter aussi.
    return spec.picto && (spec.base === 'diamond' || spec.base === 'circle') ? { ...b, y1: b.y1 + 16 } : b;
  });
  const placed: Box[] = [];
  const out = new Map<string, TagPos>();
  const free = (bx: Box) => !placed.some((o) => overlapsBox(o, bx, 1)) && !obstacles.some((o) => overlapsBox(o, bx, 2));
  for (const l of links) {
    const t = text(l);
    if (!t) continue;
    const cands = tagCandidates(l.points);
    const pick = cands.find((c) => free(tagBox(c, t))) ?? cands[0] ?? tagAnchor(l.points);
    out.set(l.id, pick);
    placed.push(tagBox(pick, t));
  }
  return out;
}

const overlapsBox = (a: Box, b: Box, m: number) => a.x0 - m < b.x1 && a.x1 + m > b.x0 && a.y0 - m < b.y1 && a.y1 + m > b.y0;

/**
 * Où écrire l'étiquette d'un lien : juste après son premier coude, là où il quitte le tronc commun des
 * autres sorties du même canal (sinon un peu après le départ). Rend le point et le côté du texte.
 */
export function tagAnchor(points: Pt[]): { x: number; y: number; anchor: 'start' | 'middle' } {
  const [s, b] = points;
  if (points.length > 2) {
    const c = points[2];
    const vertical = Math.abs(c[0] - b[0]) < 1;
    // Sur un segment vertical : à droite du coude, un peu plus bas/haut ; sur un horizontal : au-dessus.
    if (vertical) return { x: b[0] + 4, y: b[1] + Math.sign(c[1] - b[1]) * 9, anchor: 'start' };
    return { x: b[0] + Math.sign(c[0] - b[0]) * 12, y: b[1] - 4, anchor: 'middle' };
  }
  const dx = Math.sign(b[0] - s[0]);
  const dy = Math.sign(b[1] - s[1]);
  return dx !== 0 ? { x: s[0] + dx * 12, y: s[1] - 4, anchor: 'middle' } : { x: s[0] + 4, y: s[1] + dy * 12, anchor: 'start' };
}

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


/** Décalages essayés autour du milieu, du plus proche au plus lointain. */
function offsets(limit: number, step = 10): number[] {
  const out = [0];
  for (let d = step; d <= limit; d += step) out.push(d, -d);
  return out;
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


interface End {
  eq: Eq;
  box: Box;
  ch: number;
  /** Décalage du point de départ propre à cette sortie (0 pour la sortie 1, sur l'axe du canal). */
  port?: number;
}

/** Point d'accroche d'une extrémité : axe du canal, plus le décalage propre à la sortie. */
const endAnchor = (e: End, side: Flow) => anchor(e.box, side, sideOffset(e.eq, side, e.ch) + (e.port ?? 0));

/**
 * Tracé d'un lien : face à face (droit ou Z) si la voie est libre, sinon en L (départ d'un côté,
 * arrivée par le dessus/dessous ou par le côté), sinon face à face sur l'autre axe.
 */
/**
 * Retire les points en double et les points alignés (coudes inutiles). Un demi-tour (aller puis retour
 * sur la même ligne) n'est pas fusionné : sinon le trait traverserait l'équipement d'arrivée.
 */
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q[0] - p[0]) < 0.5 && Math.abs(q[1] - p[1]) < 0.5) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const col = (Math.abs(a[0] - b[0]) < 0.5 && Math.abs(b[0] - c[0]) < 0.5) || (Math.abs(a[1] - b[1]) < 0.5 && Math.abs(b[1] - c[1]) < 0.5);
      const ahead = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) >= 0;
      if (!col || !ahead) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/**
 * Relie s (sur le côté sSide) à t (sur le côté tSide) en angles droits : petite sortie de chaque
 * côté, puis un L ou un Z dont le segment du milieu glisse pour éviter les équipements.
 * Rend null si aucun tracé libre n'est trouvé.
 */
function connectSides(s: Pt, sSide: Flow, t: Pt, tSide: Flow, ends: Box[], others: Box[], bias: number, clear?: (pts: Pt[]) => boolean): Pt[] | null {
  const [sx, sy] = flowVec(sSide);
  const [tx, ty] = flowVec(tSide);
  const p1: Pt = [s[0] + sx * 12, s[1] + sy * 12];
  // Approche d'arrivée un peu plus longue : la pointe reste visible même si un autre trait passe près.
  const p2: Pt = [t[0] + tx * 20, t[1] + ty * 20];
  const all = [...others, ...ends];
  const ok = (pts: Pt[]) => {
    const full = simplify(pts);
    // Le premier et le dernier segment touchent leur équipement : vérifiés contre les autres seulement.
    for (let i = 1; i < full.length; i++) {
      const obs = i === 1 || i === full.length - 1 ? others : all;
      if (obs.some((o) => hits(full[i - 1], full[i], o, 4))) return null;
    }
    return clear && !clear(full) ? null : full;
  };
  const tries: Pt[][] = [
    [s, p1, [p2[0], p1[1]], p2, t],
    [s, p1, [p1[0], p2[1]], p2, t],
  ];
  const mx = Math.round((p1[0] + p2[0]) / 20) * 10 + Math.round(bias);
  const my = Math.round((p1[1] + p2[1]) / 20) * 10 + Math.round(bias);
  for (const off of offsets(240)) {
    tries.push([s, p1, [mx + off, p1[1]], [mx + off, p2[1]], p2, t]);
    tries.push([s, p1, [p1[0], my + off], [p2[0], my + off], p2, t]);
  }
  for (const pts of tries) {
    const r = ok(pts);
    if (r) return r;
  }
  return null;
}

/**
 * Tracé d'un lien entre deux côtés imposés : départ par le sens du flux (aval en marche avant, amont
 * en marche arrière), arrivée par l'arrière de la cible ou par son milieu (voir arrivalSide).
 */
/** Trait déjà tracé : ses segments et le point d'arrivée (des traits vers le même point peuvent se rejoindre). */
interface Placed {
  pts: Pt[];
  end: Pt;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

/**
 * Deux segments orthogonaux se croisent (intersection strictement intérieure aux deux), ou se
 * superposent sur la même ligne. La superposition est permise si les deux traits vont au même point
 * d'arrivée (ils se rejoignent avant la flèche) ; le croisement, jamais.
 */
function conflicts(a0: Pt, a1: Pt, b0: Pt, b1: Pt, sameEnd: boolean): boolean {
  const aH = near(a0[1], a1[1]);
  const bH = near(b0[1], b1[1]);
  const [ax0, ax1] = [Math.min(a0[0], a1[0]), Math.max(a0[0], a1[0])];
  const [ay0, ay1] = [Math.min(a0[1], a1[1]), Math.max(a0[1], a1[1])];
  const [bx0, bx1] = [Math.min(b0[0], b1[0]), Math.max(b0[0], b1[0])];
  const [by0, by1] = [Math.min(b0[1], b1[1]), Math.max(b0[1], b1[1])];
  if (aH !== bH) {
    const [h, v] = aH ? [[ax0, ax1, a0[1]], [b0[0], by0, by1]] : [[bx0, bx1, b0[1]], [a0[0], ay0, ay1]];
    return v[0] > h[0] + 0.5 && v[0] < h[1] - 0.5 && h[2] > v[1] + 0.5 && h[2] < v[2] - 0.5;
  }
  if (sameEnd) return false;
  if (aH) return near(a0[1], b0[1]) && Math.min(ax1, bx1) - Math.max(ax0, bx0) > 1;
  return near(a0[0], b0[0]) && Math.min(ay1, by1) - Math.max(ay0, by0) > 1;
}

/** Le tracé ne croise (ni ne longe) aucun trait déjà posé. */
function crossesNone(pts: Pt[], end: Pt, placed: Placed[]): boolean {
  for (const q of placed) {
    const same = near(q.end[0], end[0]) && near(q.end[1], end[1]);
    for (let i = 1; i < pts.length; i++)
      for (let j = 1; j < q.pts.length; j++) if (conflicts(pts[i - 1], pts[i], q.pts[j - 1], q.pts[j], same)) return false;
  }
  return true;
}

function routeLink(a: End, b: End, obstacles: Box[], sSide: Flow, tSide: Flow, placed: Placed[] = []): Pt[] {
  const s0 = endAnchor(a, sSide);
  const t = channelAnchor(b.eq, b.box, tSide, b.ch);
  // Côtés imposés par le sens du flux. D'abord sans croiser aucun trait déjà tracé ; sinon on accepte
  // un croisement ; en dernier recours, de passer sur un équipement.
  return (
    connectSides(s0, sSide, t, tSide, [a.box, b.box], obstacles, a.port ?? 0, (pts) => crossesNone(pts, t, placed)) ??
    connectSides(s0, sSide, t, tSide, [a.box, b.box], obstacles, a.port ?? 0) ??
    connectSides(s0, sSide, t, tSide, [], [], a.port ?? 0) ??
    simplify([s0, t])
  );
}

/** Côté de départ d'une sortie : côté aval du flux en marche avant, côté amont en marche arrière. */
export const departureSide = (src: Eq, dir: Dir): Flow => (dir === 'avant' ? src.flow : opposite(src.flow));

/**
 * Côté d'arrivée sur l'équipement cible. Sans marche arrière programmée, la matière entre par
 * l'arrière (côté amont du flux, sur l'axe du canal). Avec marche arrière, elle peut partir dans les
 * deux sens : elle arrive au milieu, par le dessus ou le dessous (côté qui fait face à la source).
 */
export function arrivalSide(dst: Eq, src: Box, dstBox: Box): Flow {
  const reversible = !!dst.options.reverseAllowed && !dst.hg.some((h) => h.type === 'KM');
  if (!reversible) return opposite(dst.flow);
  return isHorizontal(dst.flow) ? (src.cy < dstBox.cy ? 'N' : 'S') : src.cx < dstBox.cx ? 'W' : 'E';
}

/**
 * Liens qui bouclent (recirculation) : un lien de marche avant qui revient vers un équipement déjà
 * traversé en amont. Parcours en profondeur depuis les entrées de ligne (équipements où rien n'arrive),
 * dans l'ordre du pivot ; un lien vers un équipement encore « en cours » de parcours ferme une boucle.
 * Les liens de marche arrière ne comptent pas : ce sont des données à part (pointillé « AR »).
 */
export function loopLinks(p: Pivot): Set<string> {
  const out = new Map<string, Link[]>();
  const fed = new Set<string>();
  for (const l of p.links) {
    if (l.from.dir !== 'avant' || l.from.eq === l.to.eq) continue;
    if (!out.has(l.from.eq)) out.set(l.from.eq, []);
    out.get(l.from.eq)!.push(l);
    fed.add(l.to.eq);
  }
  const loops = new Set<string>();
  const state = new Map<string, 1 | 2>(); // 1 = en cours, 2 = terminé
  const visit = (id: string) => {
    state.set(id, 1);
    for (const l of out.get(id) ?? []) {
      const s = state.get(l.to.eq);
      if (s === 1) loops.add(l.id);
      else if (!s) visit(l.to.eq);
    }
    state.set(id, 2);
  };
  const starts = [...p.equipments.filter((e) => !fed.has(e.id)), ...p.equipments];
  for (const e of starts) if (!state.has(e.id)) visit(e.id);
  return loops;
}

/** Écart entre deux sorties voisines d'un même canal, le long du côté : le groupe tient dans la bande du canal. */
export function portPitch(eq: Eq, box: Box, count: number): number {
  const band = (isHorizontal(eq.flow) ? box.h : box.w) / eq.channels.length - 6;
  return Math.min(14, band / Math.max(1, count - 1));
}

/** Décalage de la sortie de rang `rank` (0 = S1) dans un groupe de `count`, centré sur l'axe du canal. */
const slot = (eq: Eq, box: Box, rank: number, count: number) => (rank - (count - 1) / 2) * portPitch(eq, box, count);

/**
 * Décalage du départ de la sortie num par rapport à l'axe du canal. Les sorties déclarées (reliées ou
 * en attente) se partagent la bande du canal, centrées sur l'axe : S1 à gauche / en haut, puis S2, S3…
 * à droite / en dessous. Une sortie seule est sur l'axe.
 */
export function portOffset(eq: Eq, box: Box, ch: number, dir: Dir, num: number): number {
  const nums = (eq.channels[ch - 1]?.outputs ?? []).filter((o) => o.dir === dir).map((o) => o.num).sort((a, b) => a - b);
  return slot(eq, box, Math.max(0, nums.indexOf(num)), nums.length);
}

export function routeAll(p: Pivot): { links: RoutedLink[]; stubs: Stub[] } {
  const eqs = new Map(p.equipments.map((e) => [e.id, e]));
  const boxes = new Map(p.equipments.map((e) => [e.id, eqBox(e)]));
  const all = [...boxes.entries()];
  const obstaclesFor = (a: string, b: string) => all.filter(([id]) => id !== a && id !== b).map(([, bx]) => bx);

  // Chaque sortie reliée a son propre point de départ : la plus petite (S1) sur l'axe du canal, les
  // suivantes décalées de part et d'autre. Aucun tronc commun : on voit d'où part chaque trait.
  const ports = new Map<string, number>();
  const groups = new Map<string, Link[]>();
  for (const l of p.links) {
    const k = `${l.from.eq}|${l.from.ch}|${l.from.dir}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(l);
  }
  // Ordre fixe, sorties en attente comprises, groupe centré sur l'axe du canal : S1, puis S2, S3… toujours à droite
  // (côté horizontal) ou en dessous (côté vertical) : 1.2 est toujours à droite de 1.1.
  for (const g of groups.values()) {
    const e = eqs.get(g[0].from.eq);
    if (!e) continue;
    for (const l of g) ports.set(l.id, portOffset(e, boxes.get(e.id)!, l.from.ch, l.from.dir, l.from.num));
  }

  const valid = p.links.filter((l) => eqs.has(l.from.eq) && eqs.has(l.to.eq));
  const route = (l: Link, placed: Placed[]): Pt[] => {
    const src = eqs.get(l.from.eq)!;
    const dst = eqs.get(l.to.eq)!;
    const a: End = { eq: src, box: boxes.get(src.id)!, ch: l.from.ch, port: ports.get(l.id) ?? 0 };
    const b: End = { eq: dst, box: boxes.get(dst.id)!, ch: l.to.ch };
    if (src.id === dst.id) {
      const sSide = l.from.dir === 'avant' ? src.flow : opposite(src.flow);
      return selfLoop(a.box, channelAnchor(src, a.box, sSide, a.ch), channelAnchor(src, a.box, opposite(sSide), b.ch), sSide);
    }
    return routeLink(a, b, obstaclesFor(src.id, dst.id), departureSide(src, l.from.dir), arrivalSide(dst, a.box, b.box), placed);
  };
  // 1re passe : chaque trait évite ceux déjà tracés. 2e et 3e passes : un trait qui croise encore est
  // retracé en tenant compte de tous les autres, gardé seulement s'il ne croise plus rien.
  const paths: Pt[][] = [];
  const asPlaced = (pts: Pt[]): Placed => ({ pts, end: pts[pts.length - 1] });
  for (const l of valid) paths.push(route(l, paths.map(asPlaced)));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < valid.length; i++) {
      const others = paths.filter((_, j) => j !== i).map(asPlaced);
      if (crossesNone(paths[i], paths[i][paths[i].length - 1], others)) continue;
      const again = route(valid[i], others);
      if (crossesNone(again, again[again.length - 1], others)) paths[i] = again;
    }
  }

  const links: RoutedLink[] = [];
  valid.forEach((l, i) => {
    const src = eqs.get(l.from.eq)!;
    const dst = eqs.get(l.to.eq)!;
    const points = paths[i];
    let inner: [Pt, Pt] | undefined;
    if (dst.channels.length > 1 && src.id !== dst.id && points.length >= 2) {
      const e = points[points.length - 1];
      const q = points[points.length - 2];
      const off = channelOffset(dst.channels.length, l.to.ch);
      const box = boxes.get(dst.id)!;
      if (isHorizontal(dst.flow) && Math.abs(q[0] - e[0]) < 1) inner = [e, [e[0], box.cy + off]];
      if (!isHorizontal(dst.flow) && Math.abs(q[1] - e[1]) < 1) inner = [e, [box.cx + off, e[1]]];
    }
    links.push({
      id: l.id,
      link: l,
      points,
      inner,
      num: l.from.num,
      dashed: l.from.dir === 'arriere',
      label: `${outputLabel(src, l.from.ch, l.from.dir, l.from.num)}  →  ${dst.repere || '?'} · CH${String(l.to.ch).padStart(2, '0')}`,
    });
  });

  // Sorties libres : petit trait sur l'axe du canal, côté flux (avant) ou côté opposé (arrière),
  // légèrement écartées entre elles pour rester saisissables.
  const linked = new Set(p.links.map((l) => `${l.from.eq}|${l.from.ch}|${l.from.dir}|${l.from.num}`));
  const stubs: Stub[] = [];
  for (const e of p.equipments) {
    const box = boxes.get(e.id)!;
    e.channels.forEach((c, ci) => {
      const ch = ci + 1;
      for (const dir of ['avant', 'arriere'] as Dir[]) {
        const free = c.outputs.filter((o) => o.dir === dir && !linked.has(`${e.id}|${ch}|${dir}|${o.num}`)).sort((x, y) => x.num - y.num);
        const side = dir === 'avant' ? e.flow : opposite(e.flow);
        const [vx, vy] = flowVec(side);
        // Même place que si la sortie était reliée : jamais sur une autre sortie.
        free.forEach((o) => {
          const [ax, ay] = anchor(box, side, sideOffset(e, side, ch) + portOffset(e, box, ch, dir, o.num));
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

/**
 * Position des poignées « + » : une par canal et par sens, hors du contour. Sur l'axe du canal si le
 * canal n'a encore aucune sortie dans ce sens ; sinon décalée à droite (côté horizontal) ou en dessous
 * (côté vertical), là où viendra la sortie suivante, pour ne pas la confondre avec la sortie 1.
 */
export function handlePositions(eq: Eq, box: Box, dir: Dir): { ch: number; at: Pt }[] {
  const side = dir === 'avant' ? eq.flow : opposite(eq.flow);
  const [vx, vy] = flowVec(side);
  return eq.channels.map((c, i) => {
    const [ax, ay] = channelAnchor(eq, box, side, i + 1);
    const count = c.outputs.filter((o) => o.dir === dir).length;
    const used = count > 0;
    // À la place de la sortie suivante, un peu au-delà du bout des traits.
    // Plusieurs canaux : pas de place entre les axes, le « + » s'éloigne au-delà des étiquettes.
    const multi = eq.channels.length > 1;
    const lat = used && !multi ? slot(eq, box, count, count + 1) : 0;
    const out = !used ? 26 : multi ? 48 : 34;
    return { ch: i + 1, at: [ax + vx * out + (vx === 0 ? lat : 0), ay + vy * out + (vy === 0 ? lat : 0)] as Pt };
  });
}
