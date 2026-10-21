// Textes de l'interface : français pour l'opérateur, anglais préparé. Chaque notion du standard
// s'affiche en mots simples suivis, en plus petit, de son terme technique (Matériel générique · HG).
import { Fragment, useSyncExternalStore, type ReactNode } from 'react';
import type { HgTypeDef } from './model/catalogue';

export type Lang = 'fr' | 'en';

/** Entrée de dictionnaire : un texte par langue, ou une fonction pour les textes à paramètres. */
export type Entry<A extends unknown[] = []> = { fr: string | ((...a: A) => string); en: string | ((...a: A) => string) };

const KEY = 'editeur-pid.lang';
let lang: Lang = 'fr';
try {
  const saved = localStorage.getItem(KEY);
  if (saved === 'fr' || saved === 'en') lang = saved;
} catch {
  /* stockage indisponible : français par défaut */
}
const listeners = new Set<() => void>();

/** Langue de la page (lecteurs d'écran, césure) ; absente hors navigateur (tests). */
function markDocument() {
  try {
    document.documentElement.lang = lang;
  } catch {
    /* pas de document */
  }
}
markDocument();

export const getLang = () => lang;

export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* confort seulement */
  }
  markDocument();
  listeners.forEach((f) => f());
}

// Fonction d'abonnement stable : React ne réabonne pas l'écouteur à chaque rendu.
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

/** Abonne un composant à la langue (à appeler à la racine : tout l'arbre se re-rend au changement). */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** Traduit une entrée dans la langue courante. Utilisable hors React (modèle, rapports). */
export function tx<A extends unknown[]>(e: Entry<A>, ...args: A): string {
  const v = e[lang];
  return typeof v === 'function' ? v(...args) : v;
}

/** Locale des dates et heures affichées. */
export const locale = () => (lang === 'en' ? 'en-GB' : 'fr-FR');

/** Date du catalogue (AAAA-MM-JJ) au format de la langue : 20/10/2026. Lue en date locale, sans décalage horaire. */
export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale());
}

/** Notions du standard : mot simple (fr / en) et terme technique. */
export const TERMS = {
  eq: { fr: 'Équipement', frPl: 'Équipements', en: 'Equipment', enPl: 'Equipment', abbr: 'EQ' },
  ch: { fr: 'Canal', frPl: 'Canaux', en: 'Channel', enPl: 'Channels', abbr: 'CH' },
  hg: { fr: 'Matériel générique', frPl: 'Matériels génériques', en: 'Hardware Generic', enPl: 'Hardware Generic', abbr: 'HG' },
  hs: { fr: 'Matériel spécifique', frPl: 'Matériels spécifiques', en: 'Hardware Specific', enPl: 'Hardware Specific', abbr: 'HS' },
  fu: { fr: 'Fonction', frPl: 'Fonctions', en: 'Function', enPl: 'Functions', abbr: 'FU' },
} as const;

export type TermKey = keyof typeof TERMS;

/** Mot simple d'une notion, dans la langue courante. */
export function termWord(k: TermKey, plural = false): string {
  const t = TERMS[k];
  return lang === 'fr' ? (plural ? t.frPl : t.fr) : plural ? t.enPl : t.en;
}

/** Terme technique en petit, à placer après un libellé en mots simples. */
export function Abbr({ children }: { children: ReactNode }) {
  return <small className="term">{children}</small>;
}

/**
 * Notion du standard dans un libellé : mot simple puis terme technique en petit.
 * `before` / `after` encadrent le mot (ex. « Pile de » + matériels génériques).
 */
export function Term({ k, plural, before, after, abbr }: { k: TermKey; plural?: boolean; before?: ReactNode; after?: ReactNode; abbr?: string }) {
  return (
    <span>
      {before}
      {before ? ' ' : ''}
      {lang === 'fr' && before ? termWord(k, plural).toLowerCase() : termWord(k, plural)}
      {after ? ' ' : ''}
      {after}
      <Abbr>{abbr ?? TERMS[k].abbr}</Abbr>
    </span>
  );
}

// Marqueur de terme technique dans un texte du dictionnaire : « matériel spécifique [HS] à choisir ».
// Il se place juste après le mot simple ; seules les majuscules, chiffres et _ sont reconnus, ce que
// n'ont jamais les données insérées (repères, noms TIA comme 08Aa_DRIV01).
const MARK = / ?\[([A-Z0-9_]+)\]/;

/**
 * Texte à termes techniques : « canal [CH] » → canal + CH en petit ; « \n » → retour à la ligne.
 * Pour les textes du dictionnaire et les messages construits avec eux (raisons, rapport).
 */
export function rich(s: string): ReactNode {
  if (!/[[\n]/.test(s)) return s;
  return (
    <>
      {s.split('\n').map((line, j) => (
        <Fragment key={j}>
          {j > 0 && <br />}
          {line.split(MARK).map((p, i) => (i % 2 ? <Abbr key={i}>{p}</Abbr> : p))}
        </Fragment>
      ))}
    </>
  );
}

/** Même texte pour un attribut (title, aria-label) : « matériel spécifique (HS) à choisir ». */
export const plain = (s: string) => s.replace(new RegExp(MARK.source, 'g'), ' ($1)');

/** Libellé d'un HG du catalogue (la liste HG porte le français et l'anglais). */
export const hgLabel = (d: Pick<HgTypeDef, 'label' | 'labelEn'>) => (lang === 'en' && d.labelEn ? d.labelEn : d.label);

/** Bascule FR / EN de l'en-tête. */
export function LangToggle() {
  const l = useLang();
  return (
    <div role="group" aria-label="Langue / Language" style={{ display: 'flex', border: '1px solid var(--border-nav)', borderRadius: 3, overflow: 'hidden' }}>
      {(['fr', 'en'] as Lang[]).map((x) => (
        <button
          key={x}
          type="button"
          aria-pressed={l === x}
          onClick={() => setLang(x)}
          className="abi-btn"
          style={{ height: 32, padding: '0 9px', border: 'none', background: l === x ? 'var(--surface-nav-active)' : 'var(--surface-nav)', color: l === x ? '#fff' : 'var(--text-muted)', font: '600 12px var(--font-sans)', cursor: 'pointer' }}
        >
          {x.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
