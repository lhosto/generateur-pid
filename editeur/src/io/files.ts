// Fichier pivot (enregistrer / ouvrir) et rapport de génération FICTIF (retour d'erreurs surlignées).
import type { Catalogue } from '../model/catalogue';
import { PIVOT_FORMAT, type Pivot } from '../model/pivot';
import { hgName } from '../model/rules';

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
  if (p.format !== PIVOT_FORMAT || !Array.isArray(p.equipments)) throw new Error('Ce fichier n’est pas un pivot de l’éditeur (format ' + String(p.format) + ').');
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
    out.push({ eq: sew.id, message: `${hgName(sew, h)} : HS SewDfc absent de la Global Library (catalogue ${p.site.catalogueVersion})` });
  } else if (drives[3]) {
    const h = drives[3].hg.find((x) => x.type === 'DRIV')!;
    out.push({ eq: drives[3].id, message: `${hgName(drives[3], h)} : plage IP variateurs saturée (.50 à .100)` });
  }
  if (press) out.push({ eq: press.id, message: `${press.repere}_Main : option « Tempo de démarrage » absente de l'interface du bloc EQ` });
  if (sorter) out.push({ eq: sorter.id, message: `${sorter.repere} : index Unified ${cat.hgTypes.OPSO?.idWinCC ?? '?'} (OPSO) introuvable dans la liste de textes` });
  return out;
}
