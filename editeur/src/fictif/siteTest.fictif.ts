// Site de test FICTIF (~45 EQ) sur les vrais HG principaux de la liste HG. Couvre les cas du pilote :
// deux entrées de ligne (first channel), trieur tricanal alimenté sur ses 3 canaux, marche arrière,
// recirculation qui reboucle, armoires no action, arrêts d'urgence, portes d'accès, goulottes.
// Les repères suivent les préfixes proposés (08 tapis, 13 tri optique…), à valider.
import type { Catalogue } from '../model/catalogue';
import { addChute, addEq, addProximity, connect, emptyPivot, findEq, setChainType, type NewEqOpts } from '../model/ops';
import type { Dir, Pivot } from '../model/pivot';
import { nextOutputNum } from '../model/rules';

const X = (c: number) => 90 + c * 130;
const Y = (r: number) => 110 + r * 110;

export function siteTest(cat: Catalogue): Pivot {
  const start = emptyPivot(cat, 'Site de test (fictif)');
  // Réglage de base du projet : commandes en variateur (G120C par défaut).
  let p: Pivot = { ...start, site: { ...start.site, base: { ...start.site.base, command: 'DRIV' } } };
  const id: Record<string, string> = {};
  const eq = (rep: string, hg0: string, c: number, r: number, o: NewEqOpts = {}) => {
    const made = addEq(cat, p, hg0, X(c), Y(r), { ...o, repere: rep });
    p = made.p;
    id[rep] = made.id;
  };
  const ln = (from: string, to: string, o: { ch?: number; dir?: Dir; toCh?: number } = {}) => {
    const ch = o.ch ?? 1;
    const dir = o.dir ?? 'avant';
    const num = nextOutputNum(findEq(p, id[from])!, ch, dir)!;
    p = connect(p, { eq: id[from], ch, dir, num }, { eq: id[to], ch: o.toCh ?? 1 });
  };
  const prox = (rep: string, type: string) => (p = addProximity(cat, p, id[rep], type));

  // Ligne 1 : trémie ouvreuse, crible balistique, overband, deux trieurs optiques en cascade.
  eq('42Aa', 'DOBO', 0, 0);
  eq('08Aa', 'BELT', 1, 0);
  eq('57Ma', 'BS', 2, 0);
  eq('08Ac', 'BELT', 3, 0);
  eq('36Ra', 'OVPM', 4, 0);
  eq('08Ae', 'BELT', 5, 0);
  eq('13Pa', 'OPSO', 6, 0);
  eq('08Af', 'BELT', 7, 0);
  eq('13Pb', 'OPSO', 8, 0);
  eq('08Ag', 'BELT', 9, 0);
  eq('21Bb', 'SWSD', 10, 0);
  eq('08Ab', 'BELT', 2, 1);
  eq('21Be', 'S', 3, 1);
  eq('08Ad', 'BELT', 3, 2);
  eq('21Ba', 'S', 4, 1);
  eq('27Pa', 'BELT', 6, 1, { options: { bypassType: true } });
  eq('35Ta', 'BYPA', 6, 2, { flow: 'S' });
  eq('21Bc', 'S', 5, 3);
  eq('21Bd', 'S', 7, 3);
  eq('27Pb', 'BELT', 8, 1, { flow: 'W', options: { bypassType: true } });
  eq('33Aa', 'FAN', 9, 1);
  eq('33Ab', 'DESA', 10, 1);

  ln('42Aa', '08Aa');
  ln('08Aa', '57Ma');
  ln('57Ma', '08Ab');
  ln('57Ma', '08Ac');
  ln('57Ma', '08Ad');
  ln('08Ab', '21Be');
  ln('08Ac', '36Ra');
  ln('36Ra', '08Ae');
  ln('36Ra', '21Ba');
  ln('08Ae', '13Pa');
  ln('13Pa', '08Af');
  ln('13Pa', '27Pa');
  ln('27Pa', '35Ta');
  ln('35Ta', '21Bc');
  ln('35Ta', '21Bd');
  ln('08Af', '13Pb');
  ln('13Pb', '08Ag');
  ln('13Pb', '27Pb');
  ln('27Pb', '08Ae'); // recirculation : reboucle en amont
  ln('08Ag', '21Bb');

  // Ligne 2 : trommel, tapis réversible, séparateur Foucault, trieur tricanal, crible à disques, presses.
  eq('42Fb', 'DOBO', 0, 4);
  eq('08Fa', 'BELT', 1, 4);
  eq('63Fa', 'TROM', 2, 4);
  eq('08Fb', 'BELT', 3, 4, { options: { reverseAllowed: true } });
  eq('64Sa', 'EDCU', 4, 4);
  eq('08Fd', 'BELT', 5, 4);
  eq('13Ca', 'OPSO', 6, 4, { channels: 3 });
  eq('08Fe', 'BELT', 7, 4);
  eq('19Da', 'SCDI', 8, 4);
  eq('08Ff', 'BELT', 9, 4);
  eq('11Pa', 'PRBA', 10, 4);
  eq('08Gb', 'BELT', 11, 4);
  eq('21Bi', 'S', 12, 4);
  eq('08Fc', 'BELT', 2, 5);
  eq('21Bf', 'S', 3, 3);
  eq('21Bg', 'S', 4, 5);
  eq('27Ca', 'BELT', 7, 5);
  eq('27Cb', 'BELT', 7, 6);
  eq('27Cc', 'BELT', 7, 7);
  eq('21Bh', 'S', 8, 5);
  eq('08Ga', 'BELT', 8, 7);
  eq('11Pb', 'PRPA', 9, 7);

  ln('42Fb', '08Fa');
  ln('08Fa', '63Fa');
  ln('63Fa', '08Fb');
  ln('63Fa', '08Fc');
  ln('08Fb', '64Sa');
  ln('08Fb', '21Bf', { dir: 'arriere' });
  ln('64Sa', '08Fd');
  ln('64Sa', '21Bg');
  ln('08Fd', '13Ca', { toCh: 1 });
  ln('08Fc', '13Ca', { toCh: 2 });
  ln('08Ad', '13Ca', { toCh: 3 });
  ln('13Ca', '08Fe', { ch: 1 });
  ln('13Ca', '27Ca', { ch: 1 });
  ln('13Ca', '08Fe', { ch: 2 });
  ln('13Ca', '27Cb', { ch: 2 });
  ln('13Ca', '08Fe', { ch: 3 });
  ln('13Ca', '27Cc', { ch: 3 });
  ln('08Fe', '19Da');
  ln('19Da', '08Ff');
  ln('19Da', '21Bh');
  ln('08Ff', '11Pa');
  ln('11Pa', '08Gb');
  ln('08Gb', '21Bi');
  ln('27Ca', '08Ga');
  ln('27Cb', '08Ga');
  ln('27Cc', '08Ga');
  ln('08Ga', '11Pb');

  // Armoires électriques (no action) : localisation des relais de sécurité.
  eq('AR01', 'C', 13, 0);
  eq('AR02', 'C', 13, 4);

  // HG de proximité (options de la liste HG) : arrêts d'urgence, portes d'accès, sondes.
  for (const r of ['42Aa', '08Fa', '08Ag', 'AR01']) prox(r, 'ESTO');
  for (const r of ['13Pa', '13Ca', '57Ma']) prox(r, 'SG');
  for (const r of ['08Ag', '08Gb']) prox(r, 'LT');
  p = setChainType(cat, p, id['27Pb'], 2, 'SOFT');

  for (const [x, y] of [[X(11), 250], [X(11) + 60, 250]]) p = addChute(p, x, y).p;

  // Matrice : 400A = AU générale, 400B = accès trieurs optiques. Non validée.
  const loops = [
    { id: 'loop-400A', name: '400A', pl: 'PL d' },
    { id: 'loop-400B', name: '400B', pl: 'PL d' },
    { id: 'loop-400C', name: '400C', pl: 'PL c' },
  ];
  const inputs: Record<string, string[]> = {};
  const actuators: Record<string, string[]> = {};
  for (const e of p.equipments) {
    for (const h of e.hg) {
      if (h.type === 'ESTO') inputs[e.id + '/' + h.id] = ['loop-400A'];
      if (h.type === 'SG') inputs[e.id + '/' + h.id] = ['loop-400B'];
    }
    if (!cat.noAction.includes(e.hg[0].type) && e.hg.length > 1) actuators[e.id] = ['loop-400A'];
  }
  for (const r of ['08Ae', '13Pa', '08Af', '08Fd', '13Ca', '08Fe']) actuators[id[r]] = ['loop-400A', 'loop-400B'];
  return { ...p, safety: { loops, inputs, actuators, validated: null } };
}

/** Test de charge : ~200 EQ en chaînes, pour vérifier la fluidité à la densité d'un vrai site. */
export function stressSite(cat: Catalogue): Pivot {
  let p = emptyPivot(cat, 'Test de charge (fictif)');
  const codes = ['BELT', 'BELT', 'OPSO', 'BELT', 'BS', 'TROM', 'BYPA', 'S'];
  for (let r = 0; r < 14; r++) {
    let prev: string | null = null;
    for (let c = 0; c < 14; c++) {
      const made = addEq(cat, p, codes[(r + c) % codes.length], 70 + c * 134, 60 + r * 73, { zone: String.fromCharCode(65 + (r % 26)) });
      p = made.p;
      if (prev) {
        const src = findEq(p, prev)!;
        const num = nextOutputNum(src, 1, 'avant');
        if (num) p = connect(p, { eq: prev, ch: 1, dir: 'avant', num }, { eq: made.id, ch: 1 });
      }
      prev = made.id;
    }
  }
  return p;
}
