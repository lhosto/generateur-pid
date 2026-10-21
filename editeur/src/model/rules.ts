// Règles du standard appliquées par l'éditeur. Elles viennent du catalogue (liste HG : supérieurs,
// options) ; celles marquées PROPOSITION sont à confirmer par Alex (docs/05-points-ouverts.md).
import { getLang, tx } from '../i18n';
import type { BaseSettings, Catalogue, EqOptionDef, HgTypeDef, HsDef } from './catalogue';
import { hg0Of } from './geometry';
import { uid, type Dir, type Eq, type Hg, type Pivot, type Setpoint } from './pivot';
import { isSeparation } from './symbols';

export const MAX = { channels: 3, outputs: 6, setpoints: 4, hg: 23 };

const PROXIMITY_ROLES = new Set(['proximite', 'securite']);

// Textes vus par l'opérateur. Le français est la langue par défaut : rules.test.ts vérifie ces libellés.
// Les noms TIA (24A_DRIV01), codes HG (KM), repères et numéros de sortie (S1) restent tels quels.
// « [HS] » = terme technique affiché en petit après le mot simple (i18n.rich ; i18n.plain dans un title).
const L = {
  unknownHg: { fr: (t: string) => `Matériel générique (HG) inconnu : ${t}`, en: (t: string) => `Unknown Hardware Generic (HG): ${t}` },
  kmNoReverse: { fr: 'Commande par contacteur (KM) : marche arrière impossible', en: 'Contactor control (KM): reverse not possible' },
  reverseOff: { fr: "Marche arrière non autorisée (option de l'équipement [EQ])", en: 'Reverse not allowed (Equipment [EQ] option)' },
  negative: { fr: 'négative', en: 'negative' },
  main: { fr: 'principale', en: 'main' },
  positive: { fr: 'positive', en: 'positive' },
  forward: { fr: 'avant', en: 'forward' },
  reverse: { fr: 'arrière', en: 'reverse' },
  noRepere: { fr: 'Repère client manquant', en: 'Customer tag missing' },
  dupRepere: { fr: (r: string) => 'Repère client en double : ' + r, en: (r: string) => 'Duplicate customer tag: ' + r },
  dupAktid: { fr: (r: string) => 'Repère Aktid en double : ' + r, en: (r: string) => 'Duplicate Aktid tag: ' + r },
  noHs: { fr: (n: string) => `${n} : matériel spécifique [HS] à choisir`, en: (n: string) => `${n}: Hardware Specific [HS] not selected` },
  tooManyHg: { fr: (n: number) => `Plus de ${n} matériels génériques [HG]`, en: (n: number) => `More than ${n} Hardware Generic items [HG]` },
  kmReverse: { fr: 'Sortie marche arrière avec une commande KM', en: 'Reverse output with KM control' },
  // HS provisoire du catalogue (scripts/catalogue.mjs) : affiché sous un en-tête « Matériel spécifique · HS ».
  hsTbd: { fr: 'À définir', en: 'To be defined' },
};

// Anglais des options du bloc EQ, en attendant un labelEn dans le catalogue (sinon : libellé français).
// Partagé par la fiche et le rapport de génération, pour qu'ils nomment l'option de la même façon.
const OPTION_EN: Record<string, string> = {
  reverseAllowed: 'Allow reverse',
  bypassType: 'Bypass type (direction set at commissioning)',
  bypassInterlocksAtStart: 'Bypass interlocks at start-up',
  startDelay: 'Start-up delay',
};

/** Libellé affiché d'une option du bloc EQ : celui du catalogue, ou sa traduction anglaise. */
export const optionLabel = (o: Pick<EqOptionDef, 'id' | 'label'>) => (getLang() === 'en' && OPTION_EN[o.id]) || o.label;

export function hgDef(cat: Catalogue, type: string): HgTypeDef {
  const d = cat.hgTypes[type];
  if (!d) throw new Error(tx(L.unknownHg, type));
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

/** Marche arrière : grisée si la commande est un KM, sinon soumise à l'option du bloc EQ (texte à marqueurs, voir L). */
export function reverseBlocked(eq: Eq): string | null {
  if (isKM(eq)) return tx(L.kmNoReverse);
  if (!eq.options.reverseAllowed) return tx(L.reverseOff);
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

/** Plus petite sortie déclarée mais pas encore raccordée (en attente), sinon null. */
export function freeOutputNum(p: Pivot, eq: Eq, ch: number, dir: Dir): number | null {
  const linked = new Set(p.links.filter((l) => l.from.eq === eq.id && l.from.ch === ch && l.from.dir === dir).map((l) => l.from.num));
  const free = outputsOf(eq, ch, dir).map((o) => o.num).filter((n) => !linked.has(n));
  return free.length ? Math.min(...free) : null;
}

export function canAddOutput(eq: Eq, ch: number, dir: Dir): boolean {
  // Canal absent (retiré entre-temps, par ex. menu du « + » resté ouvert) : aucune sortie possible.
  if (!eq.channels[ch - 1]) return false;
  if (dir === 'arriere' && reverseBlocked(eq)) return false;
  return nextOutputNum(eq, ch, dir) !== null;
}

export const canAddChannel = (eq: Eq) => eq.channels.length < MAX.channels;

/**
 * Type d'une sortie. Hors machine de séparation (convoyeur…) : toujours « principale » (deux sorties
 * coupent le flux en deux). Séparation : seule sortie → « principale » ; sinon S1 = négative, les
 * suivantes = positives.
 */
export const polarity = (num: number, count = 2, separation = true) =>
  tx(count <= 1 || !separation ? L.main : num === 1 ? L.negative : L.positive);
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** Étiquette d'une sortie : repère · CH01 · S1 · sens · polarité (CH01 et S1 sont des noms, non traduits). */
export function outputLabel(eq: Eq, ch: number, dir: Dir, num: number): string {
  return `${eq.repere || '?'} · CH${pad2(ch)} · S${num} · ${tx(dir === 'avant' ? L.forward : L.reverse)} · ${polarity(num, outputsOf(eq, ch, dir).length, isSeparation(eq.hg[0]?.type ?? ''))}`;
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

/** Libellé affiché d'un HS du catalogue : le HS provisoire « HS à définir » passe en mots simples. */
export const hsLabel = (h: Pick<HsDef, 'label'>) => (h.label === 'HS à définir' ? tx(L.hsTbd) : h.label);

export function defaultSetpoints(cat: Catalogue, hg0: string): Setpoint[] {
  return (hgDef(cat, hg0).setpoints ?? []).slice(0, MAX.setpoints).map((s) => ({ name: s.name, unit: s.unit, value: s.default }));
}

export function defaultOptions(cat: Catalogue): Record<string, boolean | number> {
  const o: Record<string, boolean | number> = {};
  for (const d of cat.eqOptions) o[d.id] = d.default;
  return o;
}

/**
 * Autres équipements qui portent déjà ce repère (client ou Aktid). Comparaison sans tenir compte de la
 * casse ni des espaces autour : 08Aa et 08AA nommeraient les mêmes blocs TIA. Repère vide : aucun doublon.
 */
export function repereUsers(p: Pivot, eqId: string, kind: 'client' | 'aktid', value: string): Eq[] {
  const v = value.trim().toLowerCase();
  if (!v) return [];
  return p.equipments.filter((o) => o.id !== eqId && (kind === 'client' ? o.repere : o.repereAktid).trim().toLowerCase() === v);
}

/** Raisons pour lesquelles un EQ n'est pas encore utilisable par le générateur (textes à marqueurs, voir L). */
export function incompleteReasons(cat: Catalogue, p: Pivot, eq: Eq): string[] {
  const r: string[] = [];
  if (!eq.repere.trim()) r.push(tx(L.noRepere));
  else if (repereUsers(p, eq.id, 'client', eq.repere).length) r.push(tx(L.dupRepere, eq.repere));
  if (repereUsers(p, eq.id, 'aktid', eq.repereAktid).length) r.push(tx(L.dupAktid, eq.repereAktid.trim()));
  for (const h of eq.hg) {
    const d = hgDef(cat, h.type);
    if (d.hs.length > 0 && !h.hs) r.push(tx(L.noHs, hgName(eq, h)));
  }
  if (eq.hg.length > MAX.hg) r.push(tx(L.tooManyHg, MAX.hg));
  if (isKM(eq) && eq.channels.some((c) => c.outputs.some((o) => o.dir === 'arriere'))) r.push(tx(L.kmReverse));
  return r;
}

/**
 * PROPOSITION : repère suivant = préfixe du HG0 + zone du dernier EQ posé + première lettre libre
 * (08Aa, 08Ab…). Règle réelle à confirmer.
 */
export function suggestRepere(cat: Catalogue, p: Pivot, hg0: string, zoneHint?: string): string {
  const prefix = cat.prefixes[hg0] ?? '99';
  const zone = zoneHint && /^[A-Z]$/.test(zoneHint) ? zoneHint : 'A';
  // Même comparaison que les doublons (repereUsers) : sans casse ni espaces, sinon 08AA ferait proposer 08Aa.
  const used = new Set(p.equipments.map((e) => e.repere.trim().toLowerCase()));
  for (let i = 0; i < 26 * 27; i++) {
    const suffix = i < 26 ? String.fromCharCode(97 + i) : String.fromCharCode(96 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
    const r = prefix + zone + suffix;
    if (!used.has(r.toLowerCase())) return r;
  }
  return prefix + zone + '?';
}

/**
 * Repère de l'équipement suivant dans un enchaînement de même type (convoyeur après convoyeur) : on
 * prolonge le repère de l'équipement de départ. Fin en lettre → lettre suivante (04a → 04b) ; fin en
 * nombre → nombre suivant (10 → 11). Si l'équipement qui alimente le départ suit la même forme, son
 * écart donne le pas (10 → 20 → 30) : la dernière règle établie est conservée. Rend undefined si le
 * repère ne se prolonge pas (vide, après z…) : on revient alors à la proposition par préfixe.
 */
export function chainRepere(p: Pivot, src: Eq, hg0: string): string | undefined {
  if ((src.hg[0]?.type ?? '') !== hg0) return undefined;
  const parse = (r: string) => {
    const m = /^(.*?)(\d+|[A-Za-z])$/.exec(r.trim());
    if (!m) return null;
    const num = /^\d+$/.test(m[2]);
    return { stem: m[1], tail: m[2], num, val: num ? parseInt(m[2], 10) : m[2].toLowerCase().charCodeAt(0) - 97 };
  };
  const cur = parse(src.repere);
  if (!cur) return undefined;
  // Pas établi par l'équipement amont (lien de marche avant qui arrive sur le départ), même forme.
  let step = 1;
  for (const l of p.links) {
    if (l.to.eq !== src.id || l.from.dir !== 'avant' || l.from.eq === src.id) continue;
    const up = p.equipments.find((e) => e.id === l.from.eq);
    const prev = up && parse(up.repere);
    if (prev && prev.stem === cur.stem && prev.num === cur.num && cur.val > prev.val) {
      step = cur.val - prev.val;
      break;
    }
  }
  const used = new Set(p.equipments.map((e) => e.repere.trim().toLowerCase()));
  for (let k = 1; k <= 50; k++) {
    const v = cur.val + step * k;
    let tail: string;
    if (cur.num) tail = String(v).padStart(cur.tail.length, '0');
    else if (v < 26) tail = String.fromCharCode((cur.tail === cur.tail.toUpperCase() ? 65 : 97) + v);
    else return undefined;
    const r = cur.stem + tail;
    if (!used.has(r.toLowerCase())) return r;
  }
  return undefined;
}

export function zoneOf(repere: string): string | undefined {
  return /^[0-9A-Z]{2}([A-Z])/.exec(repere)?.[1];
}
