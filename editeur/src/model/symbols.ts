// Visuel PID de chaque HG principal (forme de base + pictogramme). PROPOSITION de maquette, à valider
// puis à reporter dans la colonne « P&D - Symbole » de la liste SharePoint des HG.
// Formes de base reprises du synoptique SCADA 2026 ; pictogrammes monotrait dessinés dans une boîte 12×12.
import { tx, type Entry } from '../i18n';

export type Base =
  | 'pill' | 'card' | 'screen' | 'grid' | 'diamond' | 'para' | 'circle' | 'silo' | 'hopper' | 'cabinet' | 'desk' | 'unknown';

export interface SymbolSpec {
  base: Base;
  /** Tracé du pictogramme, coordonnées 0..12. */
  picto?: string;
  /** Groupe d'affichage dans la bibliothèque (présentation seulement ; clé de GROUP_ORDER, libellé dans GROUP_LABELS). */
  group: string;
}

export const BASE_SIZE: Record<Base, [number, number]> = {
  pill: [48, 24],
  card: [64, 32],
  screen: [56, 30],
  grid: [48, 32],
  diamond: [38, 38],
  para: [64, 26],
  circle: [32, 32],
  silo: [44, 40],
  hopper: [52, 34],
  cabinet: [56, 30],
  desk: [52, 28],
  unknown: [60, 30],
};

const P = {
  eye: 'M0 6Q6 0 12 6Q6 12 0 6ZM6 4.6a1.4 1.4 0 1 0 .01 0',
  drum: 'M6 1a5 5 0 1 0 .01 0M6 4a2 2 0 1 0 .01 0',
  ticks: 'M2 2v8M6 2v8M10 2v8',
  waves: 'M0 4q3-3 6 0t6 0M0 8.5q3-3 6 0t6 0',
  rolls: 'M3.2 3.7a2.4 2.4 0 1 0 .01 0M8.8 3.7a2.4 2.4 0 1 0 .01 0M0 11h12',
  zigzag: 'M0 7l2-3 2 5 2-5 2 5 2-5 2 3',
  teeth: 'M0 3l2 4 2-4 2 4 2-4 2 4 2-4M0 10.5h12',
  dots: 'M2 3h.01M6 3h.01M10 3h.01M4 6h.01M8 6h.01M2 9h.01M6 9h.01M10 9h.01',
  ram: 'M0 6h6M4 3l3 3-3 3M9 1v10M11.5 1v10',
  bale: 'M1 3h10v6H1zM4 3v6M8 3v6',
  cube: 'M2 4l4-2 4 2v5l-4 2-4-2zM2 4l4 2 4-2M6 6v5',
  bricks: 'M1 3h10v6H1zM1 6h10M6 3v3M3.5 6v3M8.5 6v3',
  spiral: 'M6 6.5a1 1 0 1 1 1.2-1a2.5 2.5 0 1 1-3.7 2.2A4 4 0 1 1 10 6',
  robot: 'M1 11h5M3.5 11V7l4-3 2.5 2M10 6l1.5 1.5M10 6l1.5-1.5',
  fan: 'M6 6c0-3 3-4 4-2M6 6c3 0 4 3 2 4M6 6c0 3-3 4-4 2M6 6c-3 0-4-3-2-4',
  burst: 'M6 0.5v3M6 8.5v3M0.5 6h3M8.5 6h3M2 2l2.2 2.2M7.8 7.8L10 10M10 2L7.8 4.2M4.2 7.8L2 10',
  bags: 'M1 1.5h10M2.5 1.5v8a1 1 0 0 0 2 0v-8M7.5 1.5v8a1 1 0 0 0 2 0v-8',
  smart: 'M1 3.5h7M2 3.5v7M5 3.5v7M8 3.5v7M10.5 0.5v4M8.5 2.5h4',
  plenum: 'M0 2h12M0 6q3-2 6 0t6 0M0 10h12',
  eyeFlame: 'M0 6Q6 0 12 6Q6 12 0 6ZM6 3.8c1.2 1 1.2 2.6 0 3.8c-1.2-1.2-1.2-2.8 0-3.8',
  flame: 'M6 0.5c3.5 3 3.5 7 0 11c-3.5-4-3.5-8 0-11ZM6 5.5c1 1 1 3 0 4.5c-1-1.5-1-3.5 0-4.5',
  person: 'M6 1.5a2 2 0 1 0 .01 0M2.5 11.5v-3a3.5 3.5 0 0 1 7 0v3',
  chevrons: 'M1 2.5l3.5 3.5L1 9.5M6 2.5l3.5 3.5L6 9.5',
  helix: 'M0 6h12M1.5 2l2 8M5 2l2 8M8.5 2l2 8',
  cylinder: 'M0 3.5h7v5H0zM7 6h5M11 4v4',
  tipper: 'M2.5 4.5l6.5-2 1.5 5-6.5 2zM1 11.5h11',
  star: 'M6 0.5v11M0.5 6h11M2.1 2.1l7.8 7.8M9.9 2.1l-7.8 7.8',
  compressor: 'M6 1.5a4.5 4.5 0 1 0 .01 0M6 3.5l2.3 4.5H3.7z',
  drop: 'M6 0.5c3 4 4.5 6 4.5 7.5a4.5 4.5 0 0 1-9 0C1.5 6.5 3 4.5 6 0.5Z',
  dropX: 'M6 1.5c2.3 3 3.3 4.4 3.3 5.6a3.3 3.3 0 0 1-6.6 0c0-1.2 1-2.6 3.3-5.6ZM0.5 11.5l11-11',
  snow: 'M6 0.5v11M1.2 3.2l9.6 5.6M1.2 8.8l9.6-5.6',
  mist: 'M1.5 3h.01M6 1.5h.01M10.5 3h.01M3.8 6h.01M8.2 6h.01M1.5 9h.01M6 10.5h.01M10.5 9h.01',
  magnet: 'M3 1.5v5a3 3 0 0 0 6 0v-5M3 3.5h2M7 3.5h2',
  magnetBar: 'M3 2.5v4a3 3 0 0 0 6 0v-4M1 0.8h10',
  remote: 'M3.5 3h5v8.5h-5zM6 3V0.5M5 6h2M5 8.5h2',
  weight: 'M2.5 11h7L8.3 5H3.7zM6 5a1.4 1.4 0 1 1 .01 0',
  door: 'M1 0.5h10v11H1zM6 0.5v11M4.5 6h.01M7.5 6h.01',
};

/** Les 48 HG principaux de la liste HG (export du 20/10/2026). */
export const SYMBOLS: Record<string, SymbolSpec> = {
  BELT: { base: 'pill', group: 'Convoyage' },
  TBF: { base: 'pill', picto: P.chevrons, group: 'Convoyage' },
  SCRE: { base: 'pill', picto: P.helix, group: 'Convoyage' },
  BYPA: { base: 'diamond', group: 'Convoyage' },
  ROVA: { base: 'card', picto: P.star, group: 'Convoyage' },
  BINT: { base: 'card', picto: P.tipper, group: 'Convoyage' },
  OPSO: { base: 'card', picto: P.eye, group: 'Tri et séparation' },
  EDCU: { base: 'card', picto: P.ticks, group: 'Tri et séparation' },
  FIEX: { base: 'card', picto: P.waves, group: 'Tri et séparation' },
  ROUS: { base: 'card', picto: P.rolls, group: 'Tri et séparation' },
  ROBO: { base: 'card', picto: P.robot, group: 'Tri et séparation' },
  CAB: { base: 'card', picto: P.person, group: 'Tri et séparation' },
  BS: { base: 'screen', group: 'Criblage' },
  SCVI: { base: 'screen', picto: P.zigzag, group: 'Criblage' },
  SCDI: { base: 'grid', group: 'Criblage' },
  SCD3: { base: 'grid', picto: 'M4 0v12M8 0v12', group: 'Criblage' },
  TROM: { base: 'card', picto: P.drum, group: 'Criblage' },
  OVPM: { base: 'diamond', picto: P.magnet, group: 'Magnétique' },
  OVCA: { base: 'diamond', picto: P.magnetBar, group: 'Magnétique' },
  MAGP: { base: 'circle', picto: P.magnet, group: 'Magnétique' },
  DOBO: { base: 'para', group: 'Ouverture, broyage, presses' },
  SHRE: { base: 'card', picto: P.teeth, group: 'Ouverture, broyage, presses' },
  GRAN: { base: 'card', picto: P.dots, group: 'Ouverture, broyage, presses' },
  COMP: { base: 'card', picto: P.ram, group: 'Ouverture, broyage, presses' },
  PRBA: { base: 'card', picto: P.bale, group: 'Ouverture, broyage, presses' },
  PRPA: { base: 'card', picto: P.cube, group: 'Ouverture, broyage, presses' },
  PRBR: { base: 'card', picto: P.bricks, group: 'Ouverture, broyage, presses' },
  WRAP: { base: 'card', picto: P.spiral, group: 'Ouverture, broyage, presses' },
  DOBU: { base: 'hopper', group: 'Stockage et dosage' },
  S: { base: 'silo', group: 'Stockage et dosage' },
  SWSD: { base: 'silo', picto: P.weight, group: 'Stockage et dosage' },
  FAN: { base: 'circle', picto: P.fan, group: 'Air et dépoussiérage' },
  CTA: { base: 'card', picto: P.fan, group: 'Air et dépoussiérage' },
  DESA: { base: 'card', picto: P.bags, group: 'Air et dépoussiérage' },
  DECO: { base: 'card', picto: P.burst, group: 'Air et dépoussiérage' },
  SMFI: { base: 'card', picto: P.smart, group: 'Air et dépoussiérage' },
  PLEN: { base: 'card', picto: P.plenum, group: 'Air et dépoussiérage' },
  AIRC: { base: 'circle', picto: P.compressor, group: 'Air et dépoussiérage' },
  ACD: { base: 'circle', picto: P.drop, group: 'Air et dépoussiérage' },
  DRYA: { base: 'circle', picto: P.dropX, group: 'Air et dépoussiérage' },
  DRYR: { base: 'circle', picto: P.snow, group: 'Air et dépoussiérage' },
  MIST: { base: 'circle', picto: P.mist, group: 'Air et dépoussiérage' },
  OPCI: { base: 'card', picto: P.eyeFlame, group: 'Analyse' },
  PCI: { base: 'card', picto: P.flame, group: 'Analyse' },
  C: { base: 'cabinet', picto: P.door, group: 'Électrique et commande' },
  P: { base: 'desk', group: 'Électrique et commande' },
  REMO: { base: 'card', picto: P.remote, group: 'Électrique et commande' },
  CYL: { base: 'card', picto: P.cylinder, group: 'Électrique et commande' },
};

/** Ordre des groupes : les noms français servent de clés (SymbolSpec.group), l'affichage passe par GROUP_LABELS. */
export const GROUP_ORDER = [
  'Convoyage', 'Tri et séparation', 'Criblage', 'Magnétique', 'Ouverture, broyage, presses',
  'Stockage et dosage', 'Air et dépoussiérage', 'Analyse', 'Électrique et commande', 'Sans symbole',
];

/** Libellé affiché de chaque groupe (français / anglais). */
export const GROUP_LABELS: Record<string, Entry> = {
  'Convoyage': { fr: 'Convoyage', en: 'Conveying' },
  'Tri et séparation': { fr: 'Tri et séparation', en: 'Sorting and separation' },
  'Criblage': { fr: 'Criblage', en: 'Screening' },
  'Magnétique': { fr: 'Magnétique', en: 'Magnetic' },
  'Ouverture, broyage, presses': { fr: 'Ouverture, broyage, presses', en: 'Bag opening, shredding, presses' },
  'Stockage et dosage': { fr: 'Stockage et dosage', en: 'Storage and dosing' },
  'Air et dépoussiérage': { fr: 'Air et dépoussiérage', en: 'Air and dust extraction' },
  'Analyse': { fr: 'Analyse', en: 'Analysis' },
  'Électrique et commande': { fr: 'Électrique et commande', en: 'Electrical and control' },
  'Sans symbole': { fr: 'Sans symbole', en: 'No symbol' },
};

/** Nom affiché d'un groupe dans la langue courante (la clé elle-même si elle n'est pas traduite). */
export const groupLabel = (g: string) => (GROUP_LABELS[g] ? tx(GROUP_LABELS[g]) : g);

/** HG principal sans visuel défini : forme neutre, signalée « symbole à définir ». */
/**
 * Standard de formes : remplace la forme de base de certains HG principaux (le pictogramme reste).
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
export const BASES: Base[] = ['pill', 'card', 'screen', 'grid', 'diamond', 'para', 'circle', 'silo', 'hopper', 'cabinet', 'desk'];

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
