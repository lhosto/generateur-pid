// Visuel PID de chaque HG principal : silhouette de la famille (forme de base) + marqueur de
// technologie. Design validé dans le canevas « Symboles PID — familles d'équipements » (planche
// « Tous les équipements », 21/10/2026), à reporter dans la colonne « P&D - Symbole » de la liste HG.
import { tx, type Entry } from '../i18n';

export type Base =
  | 'pill' | 'flare' | 'heap' | 'crusher' | 'frame'
  | 'card' | 'screen' | 'grid' | 'diamond' | 'para' | 'circle' | 'silo' | 'hopper' | 'cabinet' | 'desk' | 'unknown';

/** Marqueurs de technologie (dessins dans canvas/markers.ts ; « vis » et « engrenages » sont dessinés par la forme). */
export type Marker =
  | 'crible' | 'balistique' | 'vibrant' | 'disque' | 'trommel' | 'foucault' | 'aero' | 'rouleau' | 'optique' | 'robot'
  | 'manuel' | 'cabine' | 'aimant' | 'electro' | 'poulie'
  | 'chevrons' | 'helice' | 'fourche' | 'ecluse' | 'basculeur' | 'vis'
  | 'ouvreur' | 'engrenages' | 'grains' | 'verin' | 'balle' | 'paquet' | 'briquettes' | 'spirale' | 'poids'
  | 'ventilo' | 'cta' | 'manches' | 'decolmatage' | 'smart' | 'plenum' | 'compresseur' | 'goutte' | 'goutteX' | 'flocon'
  | 'brume' | 'flamme' | 'oeilFlamme' | 'armoire' | 'pupitre' | 'telecommande' | 'verinSeul';

export interface SymbolSpec {
  base: Base;
  /** Marqueur de technologie dessiné dans la forme. */
  marker?: Marker;
  /** Repère écrit sous la forme (la forme est prise par son dessin : écluse, vis, broyeur…). */
  labelBelow?: boolean;
  /** Groupe d'affichage dans la bibliothèque (présentation seulement ; clé de GROUP_ORDER, libellé dans GROUP_LABELS). */
  group: string;
}

export const BASE_SIZE: Record<Base, [number, number]> = {
  // Convoyeur : 28 par canal (repère et joints des valoristes face à face y tiennent).
  pill: [52, 28],
  // Séparation : étroite à l'entrée, large aux sorties (longueur × épaisseur côté sorties).
  flare: [54, 28],
  // Dosage : trémie surmontée d'un tas.
  heap: [48, 34],
  // Broyage / compactage : trémie, organes dedans.
  crusher: [52, 30],
  // Divers : cadre pointillé, hors flux matière.
  frame: [48, 20],
  card: [56, 24],
  screen: [56, 30],
  grid: [48, 32],
  diamond: [38, 38],
  para: [64, 26],
  circle: [28, 28],
  silo: [44, 40],
  hopper: [52, 34],
  cabinet: [56, 30],
  desk: [52, 28],
  unknown: [60, 30],
};

const sep = (marker: Marker): SymbolSpec => ({ base: 'flare', marker, group: 'Séparation' });
const crush = (marker: Marker): SymbolSpec => ({ base: 'crusher', marker, labelBelow: true, group: 'Broyage' });
const misc = (marker: Marker): SymbolSpec => ({ base: 'frame', marker, group: 'Divers' });

/** Les 49 HG principaux de la liste HG (export du 21/10/2026). */
export const SYMBOLS: Record<string, SymbolSpec> = {
  BELT: { base: 'pill', group: 'Convoyage' },
  TBF: { base: 'pill', marker: 'chevrons', group: 'Convoyage' },
  SCRE: { base: 'pill', marker: 'vis', labelBelow: true, group: 'Convoyage' },
  BYPA: { base: 'pill', marker: 'fourche', group: 'Convoyage' },
  ROVA: { base: 'circle', marker: 'ecluse', labelBelow: true, group: 'Convoyage' },
  BS: sep('balistique'),
  SCVI: sep('vibrant'),
  SCDI: sep('disque'),
  SCD3: sep('disque'),
  TROM: sep('trommel'),
  EDCU: sep('foucault'),
  FIEX: sep('aero'),
  ROUS: sep('rouleau'),
  OPSO: sep('optique'),
  OVPM: sep('aimant'),
  OVCA: sep('electro'),
  MAGP: sep('poulie'),
  ROBO: sep('robot'),
  // Poste de tri manuel (valoriste) : se pose au flanc d'un tapis de tri.
  PICK: sep('manuel'),
  CAB: sep('cabine'),
  DOBU: { base: 'heap', group: 'Dosage' },
  DOBO: { base: 'heap', marker: 'ouvreur', group: 'Dosage' },
  SHRE: crush('engrenages'),
  GRAN: crush('grains'),
  COMP: crush('verin'),
  PRBA: crush('balle'),
  PRPA: crush('paquet'),
  PRBR: crush('briquettes'),
  WRAP: crush('spirale'),
  S: { base: 'silo', group: 'Stockage' },
  SWSD: { base: 'silo', marker: 'poids', group: 'Stockage' },
  FAN: misc('ventilo'),
  CTA: misc('cta'),
  DESA: misc('manches'),
  DECO: misc('decolmatage'),
  SMFI: misc('smart'),
  PLEN: misc('plenum'),
  AIRC: misc('compresseur'),
  ACD: misc('goutte'),
  DRYA: misc('goutteX'),
  DRYR: misc('flocon'),
  MIST: misc('brume'),
  OPCI: misc('oeilFlamme'),
  PCI: misc('flamme'),
  C: misc('armoire'),
  P: misc('pupitre'),
  REMO: misc('telecommande'),
  CYL: misc('verinSeul'),
  BINT: misc('basculeur'),
};

/**
 * Familles générales du matériel générique (PROVISOIRE : viendront de la liste HG). Les noms français
 * servent de clés (SymbolSpec.group), l'affichage passe par GROUP_LABELS. Seule la Séparation a des
 * sorties négative / positives (− / +) ; ailleurs toutes les sorties sont principales.
 */
export const GROUP_ORDER = ['Convoyage', 'Séparation', 'Dosage', 'Broyage', 'Stockage', 'Divers', 'Sans symbole'];

/** Libellé affiché de chaque famille (français / anglais). */
export const GROUP_LABELS: Record<string, Entry> = {
  'Convoyage': { fr: 'Convoyage', en: 'Conveying' },
  'Séparation': { fr: 'Séparation', en: 'Separation' },
  'Dosage': { fr: 'Dosage', en: 'Dosing' },
  'Broyage': { fr: 'Broyage', en: 'Shredding' },
  'Stockage': { fr: 'Stockage', en: 'Storage' },
  'Divers': { fr: 'Divers', en: 'Miscellaneous' },
  'Sans symbole': { fr: 'Sans symbole', en: 'No symbol' },
};

export const groupLabel = (g: string) => (GROUP_LABELS[g] ? tx(GROUP_LABELS[g]) : g);

/** HG principal sans visuel défini : forme neutre, signalée « symbole à définir ». */
/**
 * Standard de formes : remplace la forme de base de certains HG principaux (le marqueur reste).
 * « Standard Aktid » = aucune substitution (formes de SYMBOLS) ; d'autres standards (un client…) se
 * créent par duplication et ne changent que les formes.
 */
export interface ShapeStandard {
  id: string;
  name: string;
  /** HG principal → forme de base qui remplace celle du standard Aktid. */
  bases: Record<string, Base>;
}

export const AKTID_STANDARD: ShapeStandard = { id: 'aktid', name: 'Standard Aktid', bases: {} };

/** Formes de base proposées dans un standard (« à définir » exclu). */
export const BASES: Base[] = ['pill', 'flare', 'heap', 'crusher', 'frame', 'card', 'screen', 'grid', 'diamond', 'para', 'circle', 'silo', 'hopper', 'cabinet', 'desk'];

// Standard actif : posé par l'application à chaque rendu (comme la langue), lu par symbolOf.
let active: Record<string, Base> = {};
export const setActiveShapes = (bases: Record<string, Base>) => {
  active = bases;
};

/** Visuel Aktid d'un HG principal, sans substitution du standard actif. */
export const aktidSymbolOf = (hg0: string): SymbolSpec => SYMBOLS[hg0] ?? { base: 'unknown', group: 'Sans symbole' };

export const symbolOf = (hg0: string): SymbolSpec => {
  const s = aktidSymbolOf(hg0);
  const b = active[hg0];
  return b ? { ...s, base: b } : s;
};

/** Machine de séparation : ses sorties ont un sens (négative − / positives +). */
export const isSeparation = (hg0: string) => symbolOf(hg0).group === 'Séparation';
