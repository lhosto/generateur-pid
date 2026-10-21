// Opérations pures sur le pivot : chaque fonction rend un nouveau pivot (annuler/rétablir par copie).
import type { BaseSettings, Catalogue } from './catalogue';
import { boxAt, eqBox, flowVec, hg0Of, opposite, overlaps, sideOffset, sizeOf, snap, type Box } from './geometry';
import { PIVOT_FORMAT, uid, type Chute, type Dir, type Eq, type Flow, type Link, type OutputRef, type Pivot } from './pivot';
import {
  defaultOptions, defaultSetpoints, defaultStack, chainOf, hgDef, proximityOf, makeHg,
  chainRepere, nextOutputNum, normalizeChain, suggestRepere, zoneOf, MAX, canAddChannel, canAddOutput,
  freeOutputNum, reverseBlocked,
} from './rules';
import { symbolOf } from './symbols';

/** Pivot vide. Le nom est un titre libre (modifiable dans l'en-tête) : l'interface passe sa traduction. */
export function emptyPivot(cat: Catalogue, name = 'Nouveau site'): Pivot {
  return {
    format: PIVOT_FORMAT,
    site: { name, catalogueVersion: cat.version, modifiedAt: new Date().toISOString(), base: structuredClone(cat.baseDefaults) },
    equipments: [],
    links: [],
    chutes: [],
    safety: { loops: [], inputs: {}, actuators: {}, validated: null },
  };
}

const touch = (p: Pivot): Pivot => ({ ...p, site: { ...p.site, modifiedAt: new Date().toISOString() } });
const mapEq = (p: Pivot, id: string, f: (e: Eq) => Eq): Pivot => ({ ...p, equipments: p.equipments.map((e) => (e.id === id ? f(e) : e)) });
export const findEq = (p: Pivot, id: string) => p.equipments.find((e) => e.id === id);

export interface NewEqOpts {
  repere?: string;
  flow?: Flow;
  channels?: number;
  zone?: string;
  options?: Record<string, boolean | number>;
}

export function createEq(cat: Catalogue, p: Pivot, hg0: string, x: number, y: number, o: NewEqOpts = {}): Eq {
  const base = p.site.base;
  const hg = defaultStack(cat, base, hg0);
  return {
    id: uid('eq'),
    repere: o.repere ?? suggestRepere(cat, p, hg0, o.zone),
    repereAktid: '',
    descriptif: hgDef(cat, hg0).label,
    x: snap(x),
    y: snap(y),
    flow: o.flow ?? 'E',
    hg,
    options: { ...defaultOptions(cat), ...(o.options ?? {}) },
    setpoints: defaultSetpoints(cat, hg[0].type),
    // Nativement, le canal 1 a sa sortie 1.1 déclarée, en attente de raccordement (sauf armoire « no action »).
    channels: Array.from({ length: Math.min(MAX.channels, o.channels ?? 1) }, (_, i) => ({
      outputs: i === 0 && !cat.noAction.includes(hg0) ? [{ dir: 'avant' as const, num: 1 }] : [],
    })),
  };
}

/** Sortie à raccorder : la première sortie en attente du canal, sinon une nouvelle. */
export function takeOutput(p: Pivot, eqId: string, ch: number, dir: Dir): { p: Pivot; ref: OutputRef | null } {
  const eq = findEq(p, eqId);
  if (!eq) return { p, ref: null };
  if (dir === 'arriere' && reverseBlocked(eq)) return { p, ref: null };
  const free = freeOutputNum(p, eq, ch, dir);
  return free !== null ? { p, ref: { eq: eqId, ch, dir, num: free } } : addOutput(p, eqId, ch, dir);
}

export function addEq(cat: Catalogue, p: Pivot, hg0: string, x: number, y: number, o: NewEqOpts = {}): { p: Pivot; id: string } {
  const eq = createEq(cat, p, hg0, x, y, o);
  return { p: touch({ ...p, equipments: [...p.equipments, eq] }), id: eq.id };
}

/** Une sortie mène à un seul canal : relier remplace le lien existant de cette sortie. */
export function connect(p: Pivot, from: OutputRef, to: { eq: string; ch: number }): Pivot {
  const src = findEq(p, from.eq);
  // Canal de départ absent : pas de lien orphelin dans le pivot envoyé au générateur.
  if (!src || !src.channels[from.ch - 1]) return p;
  const has = src.channels[from.ch - 1]?.outputs.some((o) => o.dir === from.dir && o.num === from.num);
  let next = p;
  if (!has) {
    next = mapEq(next, src.id, (e) => ({
      ...e,
      channels: e.channels.map((c, i) => (i === from.ch - 1 ? { outputs: [...c.outputs, { dir: from.dir, num: from.num }] } : c)),
    }));
  }
  const links = next.links.filter((l) => !sameOutput(l.from, from));
  return touch({ ...next, links: [...links, { id: uid('ln'), from, to }] });
}

export const sameOutput = (a: OutputRef, b: OutputRef) => a.eq === b.eq && a.ch === b.ch && a.dir === b.dir && a.num === b.num;

export function addOutput(p: Pivot, eqId: string, ch: number, dir: Dir): { p: Pivot; ref: OutputRef | null } {
  const eq = findEq(p, eqId);
  if (!eq || !canAddOutput(eq, ch, dir)) return { p, ref: null };
  const num = nextOutputNum(eq, ch, dir)!;
  const next = mapEq(p, eqId, (e) => ({
    ...e,
    channels: e.channels.map((c, i) => (i === ch - 1 ? { outputs: [...c.outputs, { dir, num }] } : c)),
  }));
  return { p: touch(next), ref: { eq: eqId, ch, dir, num } };
}

/** Place un nouvel EQ dans le sens de la sortie, sans chevaucher l'existant. */
export function placeNext(p: Pivot, src: Eq, dir: Dir, hg0: string, ch: number): { x: number; y: number } {
  const f = dir === 'avant' ? src.flow : opposite(src.flow);
  const [vx, vy] = flowVec(f);
  const sb = eqBox(src);
  const size = sizeOf(symbolOf(hg0).base, 1, src.flow);
  const dist = (vx !== 0 ? sb.w / 2 + size.w / 2 : sb.h / 2 + size.h / 2) + 60;
  const others: Box[] = p.equipments.map((e) => eqBox(e));
  const step = vx !== 0 ? Math.max(60, size.h + 30) : Math.max(80, size.w + 30);
  const chOffset = sideOffset(src, f, ch);
  for (let k = 0; k < 12; k++) {
    const off = chOffset + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step);
    const x = snap(src.x + vx * dist + (vx === 0 ? off : 0));
    const y = snap(src.y + vy * dist + (vy === 0 ? off : 0));
    const b = boxAt(x, y, size.w, size.h);
    if (!others.some((o) => overlaps(o, b, 12))) return { x, y };
  }
  return { x: snap(src.x + vx * dist), y: snap(src.y + vy * dist + 40) };
}

/** Geste « + » d'une sortie : crée la sortie, l'EQ suivant déjà raccordé et pré-rempli. */
export function addOutputWithNext(cat: Catalogue, p: Pivot, eqId: string, ch: number, dir: Dir, hg0: string, at?: { x: number; y: number }): { p: Pivot; id: string | null } {
  const src = findEq(p, eqId);
  if (!src) return { p, id: null };
  // Le « + » ajoute toujours une nouvelle sortie (celle qu'il annonce) ; une sortie en attente se
  // raccorde depuis elle-même.
  const r = addOutput(p, eqId, ch, dir);
  if (!r.ref) return { p, id: null };
  const pos = at ?? placeNext(r.p, src, dir, hg0, ch);
  const flow = dir === 'avant' ? src.flow : opposite(src.flow);
  const made = addEq(cat, r.p, hg0, pos.x, pos.y, { flow, zone: zoneOf(src.repere), repere: chainRepere(r.p, src, hg0) });
  return { p: connect(made.p, r.ref, { eq: made.id, ch: 1 }), id: made.id };
}

/** Supprimer un trait supprime aussi sa sortie ; les sorties suivantes du canal remontent (1.2 → 1.1). */
export function removeLink(p: Pivot, linkId: string): Pivot {
  const l = p.links.find((x) => x.id === linkId);
  if (!l) return p;
  return removeOutput(p, l.from);
}

/**
 * Numéros des sorties d'un canal (dans un sens) réattribués 1, 2, 3… dans l'ordre donné ; les liens
 * suivent leur sortie. `order` = anciens numéros, dans le nouvel ordre.
 */
function renumber(p: Pivot, eqId: string, ch: number, dir: Dir, order: number[]): Pivot {
  const map = new Map(order.map((old, i) => [old, i + 1]));
  const next = mapEq(p, eqId, (e) => ({
    ...e,
    channels: e.channels.map((c, i) =>
      i === ch - 1 ? { outputs: c.outputs.map((o) => (o.dir === dir && map.has(o.num) ? { ...o, num: map.get(o.num)! } : o)) } : c,
    ),
  }));
  return {
    ...next,
    links: next.links.map((l) =>
      l.from.eq === eqId && l.from.ch === ch && l.from.dir === dir && map.has(l.from.num) ? { ...l, from: { ...l.from, num: map.get(l.from.num)! } } : l,
    ),
  };
}

const numsOf = (p: Pivot, eqId: string, ch: number, dir: Dir) =>
  (findEq(p, eqId)?.channels[ch - 1]?.outputs ?? []).filter((o) => o.dir === dir).map((o) => o.num).sort((a, b) => a - b);

/** Supprime une sortie (et son lien) ; les sorties suivantes du canal remontent d'un numéro. */
export function removeOutput(p: Pivot, ref: OutputRef): Pivot {
  const next = mapEq(p, ref.eq, (e) => ({
    ...e,
    channels: e.channels.map((c, i) => (i === ref.ch - 1 ? { outputs: c.outputs.filter((o) => !(o.dir === ref.dir && o.num === ref.num)) } : c)),
  }));
  const cleaned = { ...next, links: next.links.filter((l) => !sameOutput(l.from, ref)) };
  return touch(renumber(cleaned, ref.eq, ref.ch, ref.dir, numsOf(cleaned, ref.eq, ref.ch, ref.dir)));
}

/** Donne à une sortie le numéro voulu (ex. la mettre en sortie 1) ; les autres se décalent. */
export function setOutputNum(p: Pivot, ref: OutputRef, num: number): Pivot {
  const order = numsOf(p, ref.eq, ref.ch, ref.dir).filter((n) => n !== ref.num);
  if (order.length + 1 < num || num < 1) return p;
  order.splice(num - 1, 0, ref.num);
  return touch(renumber(p, ref.eq, ref.ch, ref.dir, order));
}

export function addChannel(p: Pivot, eqId: string): Pivot {
  const eq = findEq(p, eqId);
  if (!eq || !canAddChannel(eq)) return p;
  // Le nouveau canal arrive, comme un nouvel équipement, avec sa sortie 1 en attente de raccordement.
  return touch(mapEq(p, eqId, (e) => ({ ...e, channels: [...e.channels, { outputs: [{ dir: 'avant' as const, num: 1 }] }] })));
}

/** Retire le canal n : ses sorties et les liens qui y arrivent disparaissent, les canaux suivants remontent. */
export function removeChannel(p: Pivot, eqId: string, ch: number): Pivot {
  const eq = findEq(p, eqId);
  if (!eq || eq.channels.length <= 1) return p;
  const shift = (c: number) => (c > ch ? c - 1 : c);
  const links = p.links
    .filter((l) => !(l.from.eq === eqId && l.from.ch === ch) && !(l.to.eq === eqId && l.to.ch === ch))
    .map((l) => ({
      ...l,
      from: l.from.eq === eqId ? { ...l.from, ch: shift(l.from.ch) } : l.from,
      to: l.to.eq === eqId ? { ...l.to, ch: shift(l.to.ch) } : l.to,
    }));
  const next = mapEq(p, eqId, (e) => ({ ...e, channels: e.channels.filter((_, i) => i !== ch - 1) }));
  return touch({ ...next, links });
}

export function deleteItems(p: Pivot, eqIds: string[], chuteIds: string[] = []): Pivot {
  const ids = new Set(eqIds);
  const inputs = Object.fromEntries(Object.entries(p.safety.inputs).filter(([k]) => !ids.has(k.split('/')[0])));
  const actuators = Object.fromEntries(Object.entries(p.safety.actuators).filter(([k]) => !ids.has(k)));
  return touch({
    ...p,
    equipments: p.equipments.filter((e) => !ids.has(e.id)),
    links: p.links.filter((l) => !ids.has(l.from.eq) && !ids.has(l.to.eq)),
    chutes: p.chutes.filter((c) => !chuteIds.includes(c.id)),
    safety: { ...p.safety, inputs, actuators, validated: null },
  });
}

export function moveItems(p: Pivot, eqIds: string[], chuteIds: string[], dx: number, dy: number): Pivot {
  const e = new Set(eqIds);
  const c = new Set(chuteIds);
  return {
    ...p,
    equipments: p.equipments.map((q) => (e.has(q.id) ? { ...q, x: q.x + dx, y: q.y + dy } : q)),
    chutes: p.chutes.map((q) => (c.has(q.id) ? { ...q, x: q.x + dx, y: q.y + dy } : q)),
  };
}

export function setPositions(p: Pivot, pos: Record<string, { x: number; y: number }>): Pivot {
  return touch({
    ...p,
    equipments: p.equipments.map((q) => (pos[q.id] ? { ...q, ...pos[q.id] } : q)),
    chutes: p.chutes.map((q) => (pos[q.id] ? { ...q, ...pos[q.id] } : q)),
  });
}

export function updateEq(p: Pivot, id: string, patch: Partial<Eq>): Pivot {
  return touch(mapEq(p, id, (e) => ({ ...e, ...patch })));
}

/** Changer de HG0 (HG principal) repose la pile par défaut et la forme ; les HG de proximité restent. */
export function changeHg0(cat: Catalogue, p: Pivot, id: string, hg0: string): Pivot {
  return touch(mapEq(p, id, (e) => {
    const stack = defaultStack(cat, p.site.base, hg0);
    const wasDefault = e.descriptif === hgDef(cat, hg0Of(e)).label;
    return {
      ...e,
      descriptif: wasDefault ? hgDef(cat, hg0).label : e.descriptif,
      hg: [...stack, ...proximityOf(cat, e)],
      setpoints: defaultSetpoints(cat, hg0),
    };
  }));
}

/** Change le type d'un HG de la chaîne puis remet la chaîne d'aplomb au-dessus. */
export function setChainType(cat: Catalogue, p: Pivot, eqId: string, index: number, type: string): Pivot {
  const base = p.site.base;
  return touch(mapEq(p, eqId, (e) => {
    const chain = chainOf(cat, e);
    const types = chain.map((h) => h.type);
    types[index] = type;
    const norm = normalizeChain(cat, base, types);
    const hg = norm.map((t, i) => (chain[i] && chain[i].type === t ? chain[i] : makeHg(cat, base, t)));
    const options = type === 'KM' ? { ...e.options, reverseAllowed: false } : e.options;
    return { ...e, hg: [...hg, ...proximityOf(cat, e)], options };
  }));
}

export function setHs(p: Pivot, eqId: string, hgId: string, hs: string): Pivot {
  return touch(mapEq(p, eqId, (e) => ({ ...e, hg: e.hg.map((h) => (h.id === hgId ? { ...h, hs } : h)) })));
}

export function addProximity(cat: Catalogue, p: Pivot, eqId: string, type: string): Pivot {
  return touch(mapEq(p, eqId, (e) => (e.hg.length >= MAX.hg ? e : { ...e, hg: [...e.hg, makeHg(cat, p.site.base, type)] })));
}

export function removeHg(p: Pivot, eqId: string, hgId: string): Pivot {
  const key = eqId + '/' + hgId;
  const inputs = { ...p.safety.inputs };
  delete inputs[key];
  return touch({ ...mapEq(p, eqId, (e) => ({ ...e, hg: e.hg.filter((h) => h.id !== hgId) })), safety: { ...p.safety, inputs } });
}

/** Dupliquer : mêmes réglages, nouveaux repères (client proposé, Aktid vide) ; les liens ne sont pas recopiés. */
export function duplicate(cat: Catalogue, p: Pivot, eqIds: string[]): { p: Pivot; ids: string[] } {
  let next = p;
  const ids: string[] = [];
  for (const id of eqIds) {
    const e = findEq(p, id);
    if (!e) continue;
    const copy: Eq = {
      ...structuredClone(e),
      id: uid('eq'),
      repere: suggestRepere(cat, next, hg0Of(e), zoneOf(e.repere)),
      // Le repère Aktid est propre à chaque équipement : le recopier créerait un doublon.
      repereAktid: '',
      x: e.x + 40,
      y: e.y + 40,
      hg: e.hg.map((h) => ({ ...h, id: uid('hg') })),
      channels: e.channels.map((_, i) => ({ outputs: i === 0 && !cat.noAction.includes(e.hg[0]?.type ?? '') ? [{ dir: 'avant' as const, num: 1 }] : [] })),
    };
    next = { ...next, equipments: [...next.equipments, copy] };
    ids.push(copy.id);
  }
  return { p: touch(next), ids };
}

/** Libellé enregistré d'une goulotte neuve (donnée, en français) ; le canevas le traduit à l'affichage. */
export const DEFAULT_CHUTE_LABEL = 'Goulotte de tri';

export function addChute(p: Pivot, x: number, y: number): { p: Pivot; id: string } {
  const c: Chute = { id: uid('gt'), x: snap(x), y: snap(y), label: DEFAULT_CHUTE_LABEL };
  return { p: touch({ ...p, chutes: [...p.chutes, c] }), id: c.id };
}

/** Les réglages de base ne s'appliquent qu'aux nouveaux équipements. */
export function setBase(p: Pivot, base: BaseSettings): Pivot {
  return touch({ ...p, site: { ...p.site, base } });
}

export function setLinkTarget(p: Pivot, linkId: string, to: { eq: string; ch: number }): Pivot {
  return touch({ ...p, links: p.links.map((l: Link) => (l.id === linkId ? { ...l, to } : l)) });
}

