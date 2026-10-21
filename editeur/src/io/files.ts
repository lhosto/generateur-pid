// Fichier pivot (enregistrer / ouvrir) et rapport de génération FICTIF (retour d'erreurs surlignées).
import { tx } from '../i18n';
import type { Catalogue } from '../model/catalogue';
import { PIVOT_FORMAT, type Pivot } from '../model/pivot';
import { hgName, optionLabel } from '../model/rules';

// Textes vus par l'opérateur. Les noms TIA (24A_DRIV01, 08Fb_Main), codes HG / HS (OPSO, SewDfc),
// « Global Library » et « Unified » (produits Siemens) restent tels quels dans les deux langues.
// Messages du rapport à marqueurs « [HS] » : affichés avec i18n.rich (terme technique en petit).
const L = {
  notPivot: {
    fr: (f: string) => 'Ce fichier n’est pas un pivot de l’éditeur (format ' + f + ').',
    en: (f: string) => 'This file is not an editor pivot file (format ' + f + ').',
  },
  hsMissing: {
    fr: (n: string, hs: string, v: string) => `${n} : matériel spécifique [HS] ${hs} absent de la Global Library (catalogue ${v})`,
    en: (n: string, hs: string, v: string) => `${n}: Hardware Specific [HS] ${hs} missing from the Global Library (catalogue ${v})`,
  },
  ipFull: {
    fr: (n: string) => `${n} : plage IP variateurs saturée (.50 à .100)`,
    en: (n: string) => `${n}: drive IP range full (.50 to .100)`,
  },
  // Nom de l'option repris de la fiche (rules.optionLabel) : même libellé dans la fiche et le rapport.
  optionMissing: {
    fr: (n: string, o: string) => `${n} : option « ${o} » absente de l'interface du bloc équipement [EQ]`,
    en: (n: string, o: string) => `${n}: option “${o}” missing from the Equipment [EQ] block interface`,
  },
  textIndex: {
    fr: (r: string, i: string) => `${r} : index Unified ${i} (OPSO) introuvable dans la liste de textes`,
    en: (r: string, i: string) => `${r}: Unified index ${i} (OPSO) not found in the text list`,
  },
};

export function download(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const pivotFileName = (p: Pivot) => (p.site.name || 'site').replace(/[^\w-]+/g, '_') + '.pivot.json';

export function savePivot(p: Pivot) {
  download(pivotFileName(p), JSON.stringify(p, null, 2));
}

export async function openPivot(file: File): Promise<Pivot> {
  const p = JSON.parse(await file.text()) as Pivot;
  if (p.format !== PIVOT_FORMAT || !Array.isArray(p.equipments)) throw new Error(tx(L.notPivot, String(p.format)));
  return p;
}

export interface ReportItem {
  eq: string;
  message: string;
}

/**
 * Rapport FICTIF : imite le retour du générateur (élément en cause pointé dans le fichier du
 * chargé d'affaires). Choisit quelques EQ du pivot pour montrer le surlignage.
 */
export function fakeReport(cat: Catalogue, p: Pivot): ReportItem[] {
  const out: ReportItem[] = [];
  const sew = p.equipments.find((e) => e.hg.some((h) => h.hs === 'SewDfc'));
  const drives = p.equipments.filter((e) => e.hg.some((h) => h.type === 'DRIV'));
  const press = p.equipments.find((e) => e.hg[0]?.type === 'PRBA');
  const sorter = p.equipments.find((e) => e.hg[0]?.type === 'OPSO');
  if (sew) {
    const h = sew.hg.find((x) => x.hs === 'SewDfc')!;
    out.push({ eq: sew.id, message: tx(L.hsMissing, hgName(sew, h), 'SewDfc', String(p.site.catalogueVersion)) });
  } else if (drives[3]) {
    const h = drives[3].hg.find((x) => x.type === 'DRIV')!;
    out.push({ eq: drives[3].id, message: tx(L.ipFull, hgName(drives[3], h)) });
  }
  if (press) {
    const o = cat.eqOptions.find((x) => x.id === 'startDelay');
    out.push({ eq: press.id, message: tx(L.optionMissing, `${press.repere}_Main`, o ? optionLabel(o) : 'startDelay') });
  }
  if (sorter) out.push({ eq: sorter.id, message: tx(L.textIndex, sorter.repere, String(cat.hgTypes.OPSO?.idWinCC ?? '?')) });
  return out;
}
