// Règles du standard appliquées par l'éditeur. Elles viennent du catalogue (liste HG : supérieurs,
// options) ; celles marquées PROPOSITION sont à confirmer par Alex (docs/05-points-ouverts.md).
import type { BaseSettings, Catalogue, HgTypeDef } from './catalogue';
import { hg0Of } from './geometry';
import { uid, type Dir, type Eq, type Hg, type Pivot, type Setpoint } from './pivot';

export const MAX = { channels: 3, outputs: 6, setpoints: 4, hg: 23 };

const PROXIMITY_ROLES = new Set(['proximite', 'securite']);

export function hgDef(cat: Catalogue, type: string): HgTypeDef {
  const d = cat.hgTypes[type];
  if (!d) throw new Error('Type de HG inconnu : ' + type);
  return d;
}

export const isProximity = (cat: Catalogue, type: string) => PROXIMITY_ROLES.has(hgDef(cat, type).role);
export const isNoAction = (cat: Catalogue, eq: Eq) => cat.noAction.includes(hg0Of(eq));

/** HS par défaut d'un type de HG : réglage de base du projet, sinon le premier du catalogue. */
export function defaultHs(cat: Catalogue, base: BaseSettings, type: string): string | null {
  const d = hgDef(cat, type);
  if (d.hs.length === 0) return null;
  const wanted = base.hs[type];
  return d.hs.some((h) => h.id === wanted) ? wanted : d.hs[0].id;
}

/**
 * Supérieur par défaut : « Superieur 1 (défaut) » de la liste HG, sauf au niveau commande où la
 * commande imposée par les réglages de base (ex. variateurs) l'emporte si elle est permise.
 */
function pickSuperior(cat: Catalogue, allowed: string[], base: BaseSettings): string {
  const def = allowed[0];
  if (base.command && allowed.includes(base.command) && cat.hgTypes[def]?.role === 'commande') return base.command;
  return def;
}

/**
 * Remet la chaîne cinématique d'aplomb : chaque HG doit être un supérieur autorisé du précédent
 * (liste HG), et la chaîne monte jusqu'à un HG sans supérieur (la protection).
 */
export function normalizeChain(cat: Catalogue, base: BaseSettings, chain: string[]): string[] {
  const out = chain.slice(0, 1);
  for (let i = 1; i < chain.length; i++) {
    const allowed = hgDef(cat, out[i - 1]).superiors;
    if (allowed.length === 0) break;
    out.push(allowed.includes(chain[i]) ? chain[i] : pickSuperior(cat, allowed, base));
  }
  for (let guard = 0; guard < MAX.hg; guard++) {
    const allowed = hgDef(cat, out[out.length - 1]).superiors;
    if (allowed.length === 0) break;
    out.push(pickSuperior(cat, allowed, base));
  }
  return out;
}

export function makeHg(cat: Catalogue, base: BaseSettings, type: string): Hg {
  return { id: uid('hg'), type, hs: defaultHs(cat, base, type) };
}

/** Pile par défaut d'un HG principal posé en HG0 : HG0 + supérieurs par défaut (liste HG + réglages de base). */
export function defaultStack(cat: Catalogue, base: BaseSettings, hg0: string): Hg[] {
  return normalizeChain(cat, base, [hg0]).map((t) => makeHg(cat, base, t));
}

export function chainOf(cat: Catalogue, eq: Eq): Hg[] {
  return eq.hg.filter((h) => !isProximity(cat, h.type));
}

export function proximityOf(cat: Catalogue, eq: Eq): Hg[] {
  return eq.hg.filter((h) => isProximity(cat, h.type));
}

/** HG de proximité proposés : options (liste HG) des HG de la chaîne. */
export function proximityChoices(cat: Catalogue, eq: Eq): { type: string; on: string }[] {
  const out: { type: string; on: string }[] = [];
  for (const h of chainOf(cat, eq)) {
    for (const o of hgDef(cat, h.type).options) if (cat.hgTypes[o] && !out.some((x) => x.type === o)) out.push({ type: o, on: h.type });
  }
  return out;
}

/** Types possibles à la position i de la chaîne (supérieurs du HG en dessous). */
export function alternativesAt(cat: Catalogue, eq: Eq, i: number): string[] {
  const chain = chainOf(cat, eq);
  if (i <= 0 || i >= chain.length) return [];
  return hgDef(cat, chain[i - 1].type).superiors;
}

export const isKM = (eq: Eq) => eq.hg.some((h) => h.type === 'KM');

/** Marche arrière : grisée si la commande est un KM, sinon soumise à l'option du bloc EQ. */
export function reverseBlocked(eq: Eq): string | null {
  if (isKM(eq)) return 'Commande par contacteur (KM) : marche arrière impossible';
  if (!eq.options.reverseAllowed) return "Marche arrière non autorisée (option de l'EQ)";
  return null;
}

export function outputsOf(eq: Eq, ch: number, dir: Dir) {
  return (eq.channels[ch - 1]?.outputs ?? []).filter((o) => o.dir === dir).sort((a, b) => a.num - b.num);
}

export function nextOutputNum(eq: Eq, ch: number, dir: Dir): number | null {
  const used = new Set(outputsOf(eq, ch, dir).map((o) => o.num));
  for (let n = 1; n <= MAX.outputs; n++) if (!used.has(n)) return n;
  return null;
}

export function canAddOutput(eq: Eq, ch: number, dir: Dir): boolean {
  if (dir === 'arriere' && reverseBlocked(eq)) return false;
  return nextOutputNum(eq, ch, dir) !== null;
}

export const canAddChannel = (eq: Eq) => eq.channels.length < MAX.channels;

export const polarity = (num: number) => (num === 1 ? 'négative' : 'positive');
export const pad2 = (n: number) => String(n).padStart(2, '0');

export function outputLabel(eq: Eq, ch: number, dir: Dir, num: number): string {
  return `${eq.repere || '?'} · CH${pad2(ch)} · S${num} · ${dir === 'avant' ? 'avant' : 'arrière'} · ${polarity(num)}`;
}

/** First channel : coché automatiquement si aucune sortie n'arrive dans le canal. */
export function isFirstChannel(p: Pivot, eqId: string, ch: number): boolean {
  return !p.links.some((l) => l.to.eq === eqId && l.to.ch === ch);
}

/** Nom TIA d'un HG : <EQ>_<TYPE><nn>, nn compté par type dans la pile. */
export function hgName(eq: Eq, hg: Hg): string {
  let n = 0;
  for (const h of eq.hg) {
    if (h.type === hg.type) n++;
    if (h.id === hg.id) break;
  }
  return `${eq.repere || '?'}_${hg.type}${pad2(n)}`;
}

/** Nom TIA d'un HS : <HG>_<FabricantModèle>. */
export function hsName(eq: Eq, hg: Hg): string | null {
  return hg.hs ? `${hgName(eq, hg)}_${hg.hs}` : null;
}

export function defaultSetpoints(cat: Catalogue, hg0: string): Setpoint[] {
  return (hgDef(cat, hg0).setpoints ?? []).slice(0, MAX.setpoints).map((s) => ({ name: s.name, unit: s.unit, value: s.default }));
}

export function defaultOptions(cat: Catalogue): Record<string, boolean | number> {
  const o: Record<string, boolean | number> = {};
  for (const d of cat.eqOptions) o[d.id] = d.default;
  return o;
}

/** Raisons pour lesquelles un EQ n'est pas encore utilisable par le générateur. */
export function incompleteReasons(cat: Catalogue, p: Pivot, eq: Eq): string[] {
  const r: string[] = [];
  if (!eq.repere.trim()) r.push('Repère client manquant');
  else if (p.equipments.some((o) => o.id !== eq.id && o.repere === eq.repere)) r.push('Repère client en double : ' + eq.repere);
  for (const h of eq.hg) {
    const d = hgDef(cat, h.type);
    if (d.hs.length > 0 && !h.hs) r.push(`${hgName(eq, h)} : HS à choisir`);
  }
  if (eq.hg.length > MAX.hg) r.push(`Plus de ${MAX.hg} HG`);
  if (isKM(eq) && eq.channels.some((c) => c.outputs.some((o) => o.dir === 'arriere'))) r.push('Sortie marche arrière avec une commande KM');
  return r;
}

/**
 * PROPOSITION : repère suivant = préfixe du HG0 + zone du dernier EQ posé + première lettre libre
 * (08Aa, 08Ab…). Règle réelle à confirmer.
 */
export function suggestRepere(cat: Catalogue, p: Pivot, hg0: string, zoneHint?: string): string {
  const prefix = cat.prefixes[hg0] ?? '99';
  const zone = zoneHint && /^[A-Z]$/.test(zoneHint) ? zoneHint : 'A';
  const used = new Set(p.equipments.map((e) => e.repere));
  for (let i = 0; i < 26 * 27; i++) {
    const suffix = i < 26 ? String.fromCharCode(97 + i) : String.fromCharCode(96 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
    const r = prefix + zone + suffix;
    if (!used.has(r)) return r;
  }
  return prefix + zone + '?';
}

export function zoneOf(repere: string): string | undefined {
  return /^[0-9A-Z]{2}([A-Z])/.exec(repere)?.[1];
}
