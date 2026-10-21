// Types du catalogue intégré à l'éditeur. La liste des HG vient de l'export SharePoint
// (kit/sharepoint/Hardware Generic.csv, via scripts/catalogue.mjs) ; HS, interface du bloc EQ et
// préfixes de repère sont encore fictifs (src/fictif/complements.fictif.json).
import { tx, type Entry } from '../i18n';

export type HgRole = 'matiere' | 'moteur' | 'commande' | 'protection' | 'proximite' | 'securite';

export interface HsDef {
  id: string;
  label: string;
  profinet?: boolean;
  safetyTwin?: string;
}

export interface SetpointDef {
  name: string;
  unit: string;
  default: number;
}

export interface HgTypeDef {
  label: string;
  labelEn: string;
  /** « HG principal » de la liste : peut être HG0 d'un EQ, a un visuel distinct sur le PID. */
  principal: boolean;
  /** ID WinCC (index Unified). */
  idWinCC: string | null;
  /** Colonne « P&D - Symbole » de la liste (vide à ce jour). */
  symbole: string | null;
  etat: string | null;
  aSaisir: boolean;
  role: HgRole;
  /** Supérieurs autorisés ; le premier est le défaut (« Superieur 1 (défaut) »). */
  superiors: string[];
  /** HG de proximité possibles sur ce HG (colonnes « Option »). */
  options: string[];
  hs: HsDef[];
  /** HS côté safety, pour les entrées de sécu qui n'ont pas de HS standard. */
  safetyHs?: string;
  setpoints?: SetpointDef[];
}

export interface EqOptionDef {
  id: string;
  label: string;
  type: 'bool' | 'number';
  unit?: string;
  default: boolean | number;
  rule?: 'reverse';
}

export interface BaseSettings {
  /** Commande imposée au-dessus du moteur ; vide = défaut du standard (Supérieur 1). */
  command: '' | 'DRIV' | 'SOFT' | 'KM' | 'KMIN';
  cpu: 'S7-1517' | 'S7-1515F';
  /** HS par défaut, par type de HG. */
  hs: Record<string, string>;
}

export interface Catalogue {
  version: string;
  date: string;
  fictif: boolean;
  sources: {
    hg: { fichier: string; lignes: number; principaux: number; date: string };
    complements: string;
  };
  hgTypes: Record<string, HgTypeDef>;
  /** HG0 d'un EQ « no action » (armoire électrique…). */
  noAction: string[];
  /** PROPOSITION : préfixe de repère proposé par HG0. */
  prefixes: Record<string, string>;
  eqOptions: EqOptionDef[];
  baseDefaults: BaseSettings;
}

const NO_CATALOGUE: Entry = { fr: 'Catalogue absent du fichier HTML', en: 'Catalogue missing from the HTML file' };

/** Lit le catalogue embarqué dans la page (bloc <script id="catalogue">). */
export function readEmbeddedCatalogue(): Catalogue {
  const el = document.getElementById('catalogue');
  if (!el || !el.textContent) throw new Error(tx(NO_CATALOGUE));
  return JSON.parse(el.textContent) as Catalogue;
}

export const principals = (cat: Catalogue) => Object.keys(cat.hgTypes).filter((k) => cat.hgTypes[k].principal);

/** États logiciels de la liste HG : la valeur de la liste reste la clé, seul l'affichage est traduit. */
const ETAT_LABELS: Record<string, Entry> = {
  'A coder': { fr: 'À coder', en: 'To be coded' },
  'Programmation en cours': { fr: 'Programmation en cours', en: 'Programming in progress' },
  'AF/AO en cours': { fr: 'AF/AO en cours', en: 'AF/AO in progress' },
  'FAT en cours': { fr: 'FAT en cours', en: 'FAT in progress' },
  'FAT ok': { fr: 'FAT ok', en: 'FAT ok' },
  'SAT ok': { fr: 'SAT ok', en: 'SAT ok' },
  NA: { fr: 'NA', en: 'N/A' },
};

/** Libellé affiché d'un état logiciel (la valeur brute si elle n'est pas traduite, '' si absente). */
export const etatLabel = (e: string | null | undefined) => (e && ETAT_LABELS[e] ? tx(ETAT_LABELS[e]) : e ?? '');
