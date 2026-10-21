// Fichier pivot — format PROVISOIRE de maquette. Le format définitif est figé en semaine 1.
import type { BaseSettings } from './catalogue';
import type { ShapeStandard } from './symbols';

export const PIVOT_FORMAT = 'pivot-provisoire-1';

export type Dir = 'avant' | 'arriere';
/** Sens du flux matière dans l'équipement (côté des sorties marche avant). */
export type Flow = 'E' | 'S' | 'W' | 'N';

export interface Hg {
  id: string;
  type: string;
  /** HS choisi (id du catalogue) ; null pour une entrée de sécu (HS côté safety). */
  hs: string | null;
}

/** Une sortie de canal : objet nommé du pivot (canal, numéro, sens). S1 = négative. */
export interface Output {
  dir: Dir;
  num: number;
}

export interface Channel {
  outputs: Output[];
}

export interface Setpoint {
  name: string;
  unit: string;
  value: number;
}

export interface Eq {
  id: string;
  /** Repère client : nomme les blocs TIA (FC <repère>_Main). */
  repere: string;
  repereAktid: string;
  descriptif: string;
  /** Centre de la forme dans l'écran 1920×1080. */
  x: number;
  y: number;
  flow: Flow;
  /** Pile ordonnée : HG0 (HG principal, celui qui touche la matière, fixe la forme sur le PID)
   *  puis ses supérieurs, puis les HG de proximité. */
  hg: Hg[];
  options: Record<string, boolean | number>;
  setpoints: Setpoint[];
  /** 1 à 3 canaux ; le canal n est channels[n-1]. */
  channels: Channel[];
}

export interface OutputRef {
  eq: string;
  ch: number;
  dir: Dir;
  num: number;
}

export interface Link {
  id: string;
  from: OutputRef;
  to: { eq: string; ch: number };
}

/** Goulotte de tri : objet de dessin (statut dans le pivot à confirmer). */
export interface Chute {
  id: string;
  x: number;
  y: number;
  label: string;
}

export interface SafetyLoop {
  id: string;
  name: string;
  /** Performance level : informatif, sans effet sur la génération. */
  pl: string;
}

export interface Safety {
  loops: SafetyLoop[];
  /** Feuille 1 : clé `<eqId>/<hgId>` de l'entrée de sécu → boucles qu'elle coupe. */
  inputs: Record<string, string[]>;
  /** Feuille 2 : clé `<eqId>` de l'actionneur → boucles qui le mettent en sécurité. */
  actuators: Record<string, string[]>;
  validated: { by: string; at: string } | null;
}

export interface Pivot {
  format: typeof PIVOT_FORMAT;
  site: {
    name: string;
    catalogueVersion: string;
    modifiedAt: string;
    base: BaseSettings;
    /**
     * Standards de formes du site (facultatif : absent = Standard Aktid). `active` = id du standard
     * affiché ; `standards` = standards créés (le Standard Aktid n'y figure pas, il est fixe).
     */
    shapes?: { active: string; standards: ShapeStandard[] };
  };
  equipments: Eq[];
  links: Link[];
  chutes: Chute[];
  safety: Safety;
}

let seq = 0;
export function uid(prefix = 'id'): string {
  seq += 1;
  return prefix + '-' + Date.now().toString(36).slice(-4) + seq.toString(36) + Math.random().toString(36).slice(2, 5);
}
