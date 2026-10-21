// Site PROTOTYPE transcrit à la main d'un PID réel (ligne A : E-IN, I-Ligne A, J-OUT, K-OUT), pour
// éprouver l'éditeur sur une vraie densité. Positions reprises de l'image (coordonnées × 1,45).
// Repère client = numéro du haut (090), repère Aktid = libellé du bas (05b). Correspondance des formes
// PROVISOIRE : ronds → convoyeur, overband à aimant → OVPM, « L » à sorties −/+ → trieur optique,
// losange → BYPA, colonnes colorées → cabine de tri, trémie → DOBU, broyeur → SHRE, bennes B0xx → silo.
// Les sorties vers les bacs (BS) et les petits bacs de cabine ne sont pas reprises (sorties en attente).
import type { Catalogue } from '../model/catalogue';
import { addEq, connect, emptyPivot, takeOutput, updateEq } from '../model/ops';
import type { Dir, Flow, Pivot } from '../model/pivot';

const X = (x: number) => 40 + x * 1.45;
const Y = (y: number) => 40 + y * 1.45;

export function siteLigneA(cat: Catalogue): Pivot {
  const start = emptyPivot(cat, 'Ligne A (prototype d’après PID)');
  let p: Pivot = { ...start, site: { ...start.site, base: { ...start.site.base, command: 'DRIV' } } };
  const id: Record<string, string> = {};
  // [repère client, repère Aktid, HG0, x image, y image, sens du flux]
  const eq = (rep: string, aktid: string, hg0: string, x: number, y: number, flow: Flow = 'S') => {
    const made = addEq(cat, p, hg0, X(x), Y(y), { repere: rep, flow });
    p = aktid ? updateEq(made.p, made.id, { repereAktid: aktid }) : made.p;
    id[rep] = made.id;
  };
  const ln = (from: string, to: string, dir: Dir = 'avant') => {
    const t = takeOutput(p, id[from], 1, dir);
    if (t.ref) p = connect(t.p, t.ref, { eq: id[to], ch: 1 });
  };

  // E-IN : broyeur, alimentation, crible, ouvreur.
  eq('020', '50a', 'SHRE', 42, 407, 'E');
  eq('030', '08a', 'BELT', 122, 416, 'N');
  eq('031', '90b', 'BELT', 122, 497, 'S');
  eq('040', '05a', 'BELT', 122, 333, 'E');
  eq('050', '13a', 'OVPM', 72, 300, 'W');
  eq('B001', '', 'S', 20, 333);
  eq('060', '98a', 'SCDI', 178, 290, 'N');
  eq('070', '24b', 'BELT', 178, 222, 'N');
  eq('080', '30a', 'TBF', 178, 140, 'N');
  eq('090', '05b', 'BELT', 255, 80, 'E');
  eq('100', '24c', 'BELT', 255, 140, 'S');
  eq('110', '24d', 'BELT', 255, 228, 'S');
  eq('120', '13b', 'OVPM', 300, 205, 'S');
  eq('280', '08z', 'BELT', 255, 307, 'S');
  eq('290', '06b', 'BELT', 255, 447, 'S');
  eq('B020', 'Refus', 'S', 255, 640);

  // I-Ligne A : trémies, trieurs optiques en cascade.
  eq('300A', '47aA', 'BELT', 340, 80, 'E');
  eq('310T', '47aT', 'DOBU', 420, 80, 'E');
  eq('310S', '47aS', 'BELT', 500, 80, 'E');
  eq('400A', '47bA', 'BELT', 790, 80, 'E');
  eq('410T', '47bT', 'DOBU', 870, 80, 'E');
  eq('410S', '47bS', 'BELT', 985, 80, 'S');
  eq('320A', '64a', 'BELT', 420, 130);
  eq('320L', '63a', 'OPSO', 420, 178);
  eq('330A', '64b', 'BELT', 420, 222);
  eq('330L', '63b', 'OPSO', 420, 262);
  eq('340', '05f', 'BELT', 360, 300);
  eq('331', '08q', 'BELT', 565, 300);
  eq('350', '13c', 'OVPM', 325, 260);
  eq('121', '05k', 'BELT', 325, 410, 'E');
  eq('122', '05l', 'BELT', 405, 447);
  eq('B060', 'Acier', 'S', 405, 640);
  eq('360', '05g', 'BELT', 520, 358);
  eq('370', '05h', 'BELT', 520, 447);
  eq('380', '35c', 'BYPA', 520, 500);
  eq('380C', '', 'CAB', 520, 560);
  eq('381', '35cB1', 'BELT', 560, 625);
  eq('382', '35cB2', 'BELT', 520, 690, 'W');
  eq('391', '08h', 'BELT', 455, 720);
  eq('B040', 'Refus', 'S', 455, 800);
  eq('326', '08j', 'BELT', 608, 760);
  eq('321', '08o', 'BELT', 730, 250);
  eq('322', '05c', 'BELT', 730, 447);
  eq('323', '35b', 'BYPA', 730, 500);
  eq('323C', '', 'CAB', 730, 560);
  eq('324', '35bB', 'BELT', 730, 670);
  eq('325', '08l', 'BELT', 730, 760);
  eq('420A', '64c', 'BELT', 870, 140);
  eq('420L', '63c', 'OPSO', 870, 182);
  eq('430', '05e', 'BELT', 870, 447);
  eq('440', '35a', 'BYPA', 870, 500);
  eq('440C', '', 'CAB', 870, 560);
  eq('450', '33a', 'BELT', 870, 740);
  eq('B100', 'Films', 'S', 870, 810);
  eq('500', '08l', 'BELT', 985, 447);
  eq('510', '08i', 'BELT', 985, 620, 'W');
  eq('515', '08l', 'BELT', 655, 690, 'W');
  eq('530', '08e', 'BELT', 655, 430);
  eq('540', '13d', 'OVPM', 600, 395, 'W');

  // K-OUT : broyeur, overband, trieur, sortie CSR.
  eq('550', '08d', 'BELT', 655, 307, 'E');
  eq('600', '49a', 'SHRE', 785, 307, 'E');
  eq('610', '86b', 'BELT', 1090, 300);
  eq('620', '17a', 'OVPM', 1090, 350);
  eq('B300', '', 'S', 1215, 350);
  eq('625', '17aR', 'BELT', 1090, 405);
  eq('630', '08m', 'BELT', 1090, 450);
  eq('631L', '63d', 'OPSO', 1150, 430);
  eq('640', '08m8', 'BELT', 1090, 513);
  eq('650', '86a', 'BELT', 1090, 620);

  // Auxiliaires (sans lien) : aspiration des trémies, dépoussiérage, air, brumisation.
  eq('310V', '47aV', 'FAN', 420, 25);
  eq('410V', '47bV', 'FAN', 870, 25);
  eq('925', '26a', 'SMFI', 640, 45, 'E');
  eq('921', '76a1', 'DESA', 1120, 45, 'E');
  eq('922', '76a2', 'DESA', 1120, 95, 'E');
  eq('930', '69a', 'CTA', 1210, 160, 'E');
  eq('911', '70a1', 'AIRC', 1210, 200, 'E');
  eq('912', '70a2', 'AIRC', 1210, 235, 'E');
  eq('915', '70b', 'DRYA', 1210, 270, 'E');
  eq('940', '82a', 'MIST', 1210, 305, 'E');

  // Liens, dans l'ordre des sorties (1re = sortie 1 ; trieurs : − puis +).
  ln('020', '030');
  ln('030', '040');
  ln('030', '031');
  ln('040', '060');
  ln('050', 'B001');
  ln('060', '070');
  ln('070', '080');
  ln('080', '090');
  ln('080', '100');
  ln('090', '300A');
  ln('100', '110');
  ln('110', '280');
  ln('120', '121');
  ln('280', '290');
  ln('280', '550');
  ln('290', 'B020');
  ln('300A', '310T');
  ln('310T', '310S');
  ln('310T', '320A');
  ln('310S', '400A');
  ln('400A', '410T');
  ln('410T', '410S');
  ln('410T', '420A');
  ln('410S', '500');
  ln('320A', '320L');
  ln('320L', '330A');
  ln('320L', '321');
  ln('330A', '330L');
  ln('330L', '340');
  ln('330L', '331');
  ln('340', '360');
  ln('331', '360');
  ln('350', '121');
  ln('360', '370');
  ln('121', '122');
  ln('122', 'B060');
  ln('370', '380');
  ln('380', '380C');
  ln('380C', '381');
  ln('380C', '391');
  ln('380C', '326');
  ln('381', '382');
  ln('382', '391');
  ln('391', 'B040');
  ln('321', '322');
  ln('322', '323');
  ln('323', '323C');
  ln('323C', '324');
  ln('324', '325');
  ln('420A', '420L');
  ln('420L', '430');
  ln('420L', '430');
  ln('430', '440');
  ln('440', '440C');
  ln('440C', '450');
  ln('450', 'B100');
  ln('500', '510');
  ln('510', '515');
  ln('530', '515');
  ln('540', '121');
  ln('550', '600');
  ln('550', '530');
  ln('600', '610');
  ln('610', '620');
  ln('620', '625');
  ln('620', 'B300');
  ln('625', '630');
  ln('630', '640');
  ln('631L', '640');
  ln('640', '650');
  return p;
}
