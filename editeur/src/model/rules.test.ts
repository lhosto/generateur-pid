import { beforeAll, describe, expect, it } from 'vitest';
import catJson from '../catalogue.json';
import { siteTest } from '../fictif/siteTest.fictif';
import { setLang } from '../i18n';
import { align, distribute } from './align';
import { principals, type Catalogue } from './catalogue';
import { SYMBOLS } from './symbols';
import { straighten } from './straighten';
import { boxAt, eqBox } from './geometry';
import { addChannel, addEq, addOutput, addOutputWithNext, connect, createEq, duplicate, emptyPivot, findEq, removeChannel, setChainType } from './ops';
import { routeAll } from './route';
import {
  canAddOutput, defaultStack, hgName, hsName, incompleteReasons, isFirstChannel, MAX, nextOutputNum, reverseBlocked, suggestRepere,
} from './rules';

const cat = catJson as unknown as Catalogue;
const base = cat.baseDefaults;
const drivBase = { ...base, command: 'DRIV' as const };
const types = (hg0: string, b = base) => defaultStack(cat, b, hg0).map((h) => h.type);

// Les libellés vérifiés sont les textes français : la langue ne dépend pas d'un éventuel stockage local.
beforeAll(() => setLang('fr'));

describe('catalogue (liste HG réelle)', () => {
  it('reprend les 48 HG principaux, chacun avec un symbole', () => {
    const p = principals(cat);
    expect(p).toHaveLength(48);
    expect(p.filter((k) => !SYMBOLS[k])).toEqual([]);
  });
});

describe('pile HG par défaut (supérieurs de la liste HG)', () => {
  it('suit « Superieur 1 (défaut) » : BELT → MRAS → KM → QM', () => {
    expect(types('BELT')).toEqual(['BELT', 'MRAS', 'KM', 'QM']);
  });
  it('la commande des réglages de base remplace le défaut au niveau commande seulement', () => {
    expect(types('BELT', drivBase)).toEqual(['BELT', 'MRAS', 'DRIV', 'Q']);
    expect(types('OVPM', drivBase)).toEqual(['OVPM', 'MRAS', 'DRIV', 'Q']);
  });
  it('crible balistique : Q directement', () => {
    expect(types('BS')).toEqual(['BS', 'Q']);
  });
  it('choisit le HS par défaut du projet', () => {
    expect(defaultStack(cat, drivBase, 'BELT')[2].hs).toBe('SiemensG120C');
  });
});

describe('chaîne cinématique', () => {
  it('insérer un SWDI au-dessus du MRS ajoute KM puis la protection', () => {
    const { p, id } = addEq(cat, emptyPivot(cat), 'BELT', 100, 100, { repere: '08Aa' });
    const next = setChainType(cat, p, id, 2, 'SWDI');
    expect(findEq(next, id)!.hg.map((h) => h.type)).toEqual(['BELT', 'MRAS', 'SWDI', 'KM', 'QM']);
  });
  it('passer en KM interdit la marche arrière', () => {
    const { p: p0, id } = addEq(cat, emptyPivot(cat), 'BELT', 100, 100, { options: { reverseAllowed: true } });
    const p = setChainType(cat, p0, id, 2, 'DRIV');
    expect(reverseBlocked(findEq(p, id)!)).toBeNull();
    const km = setChainType(cat, p, id, 2, 'KM');
    expect(reverseBlocked(findEq(km, id)!)).toMatch(/KM/);
    expect(canAddOutput(findEq(km, id)!, 1, 'arriere')).toBe(false);
  });
});

describe('canaux et sorties', () => {
  it('limite à 3 canaux et 6 sorties par sens', () => {
    let { p, id } = addEq(cat, emptyPivot(cat), 'OPSO', 100, 100);
    for (let i = 0; i < 5; i++) p = addChannel(p, id);
    expect(findEq(p, id)!.channels.length).toBe(MAX.channels);
    for (let i = 0; i < 8; i++) p = addOutput(p, id, 1, 'avant').p;
    expect(findEq(p, id)!.channels[0].outputs.length).toBe(MAX.outputs);
    expect(nextOutputNum(findEq(p, id)!, 1, 'avant')).toBeNull();
  });
  it('le geste + crée l’EQ suivant raccordé, et first channel suit les liens', () => {
    const a = addEq(cat, emptyPivot(cat), 'BELT', 100, 100, { repere: '08Aa' });
    const r = addOutputWithNext(cat, a.p, a.id, 1, 'avant', 'BELT');
    expect(r.p.links).toHaveLength(1);
    expect(r.p.links[0].from).toMatchObject({ eq: a.id, ch: 1, dir: 'avant', num: 1 });
    expect(isFirstChannel(r.p, a.id, 1)).toBe(true);
    expect(isFirstChannel(r.p, r.id!, 1)).toBe(false);
    expect(findEq(r.p, r.id!)!.repere).toBe('08Ab');
  });
  it('aucune sortie ni aucun lien depuis un canal qui n’existe plus', () => {
    const a = addEq(cat, emptyPivot(cat), 'BELT', 100, 100, { repere: '08Aa' });
    const two = addChannel(a.p, a.id);
    // Menu du « + » ouvert sur le canal 2, puis canal retiré (Ctrl+Z ou « − ») avant le choix.
    const back = removeChannel(two, a.id, 2);
    expect(canAddOutput(findEq(back, a.id)!, 2, 'avant')).toBe(false);
    const r = addOutputWithNext(cat, back, a.id, 2, 'avant', 'BELT');
    expect(r.id).toBeNull();
    expect(r.p).toBe(back);
    const b = addEq(cat, back, 'BELT', 300, 100);
    expect(connect(b.p, { eq: a.id, ch: 2, dir: 'avant', num: 1 }, { eq: b.id, ch: 1 })).toBe(b.p);
  });
  it('retirer un canal renumérote les liens des canaux suivants', () => {
    let { p, id } = addEq(cat, emptyPivot(cat), 'OPSO', 300, 300, { channels: 3 });
    const t = addEq(cat, p, 'BELT', 500, 300);
    p = connect(t.p, { eq: id, ch: 3, dir: 'avant', num: 1 }, { eq: t.id, ch: 1 });
    p = removeChannel(p, id, 2);
    expect(p.links[0].from.ch).toBe(2);
  });
  it('retirer le dernier canal supprime ses sorties et les liens qui y arrivent, jamais le dernier canal restant', () => {
    let { p, id } = addEq(cat, emptyPivot(cat), 'OPSO', 300, 300, { channels: 2 });
    const up = addEq(cat, p, 'BELT', 100, 300);
    const down = addEq(cat, up.p, 'BELT', 500, 300);
    p = connect(down.p, { eq: up.id, ch: 1, dir: 'avant', num: 1 }, { eq: id, ch: 2 });
    p = connect(p, { eq: id, ch: 2, dir: 'avant', num: 1 }, { eq: down.id, ch: 1 });
    p = connect(p, { eq: id, ch: 1, dir: 'avant', num: 1 }, { eq: down.id, ch: 1 });
    p = removeChannel(p, id, 2);
    expect(findEq(p, id)!.channels).toHaveLength(1);
    expect(p.links.map((l) => [l.from.eq, l.from.ch, l.to.eq])).toEqual([[id, 1, down.id]]);
    expect(findEq(p, up.id)!.channels[0].outputs).toHaveLength(1); // la sortie amont reste, libre
    expect(removeChannel(p, id, 1)).toBe(p);
  });
});

describe('nommage et contrôles', () => {
  it('nomme HG et HS selon la convention du standard', () => {
    const e0 = emptyPivot(cat);
    const { p, id } = addEq(cat, { ...e0, site: { ...e0.site, base: drivBase } }, 'BELT', 100, 100, { repere: '24A' });
    const eq = findEq(p, id)!;
    expect(hgName(eq, eq.hg[2])).toBe('24A_DRIV01');
    expect(hsName(eq, eq.hg[2])).toBe('24A_DRIV01_SiemensG120C');
  });
  it('signale un repère en double', () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 100, 100, { repere: '08Aa' }).p;
    const b = addEq(cat, p, 'BELT', 300, 100, { repere: '08Aa' });
    p = b.p;
    expect(incompleteReasons(cat, p, findEq(p, b.id)!)).toContain('Repère client en double : 08Aa');
  });
  it('propose le repère libre suivant dans la zone', () => {
    const p = addEq(cat, emptyPivot(cat), 'BELT', 100, 100, { repere: '08Fa' }).p;
    expect(suggestRepere(cat, p, 'BELT', 'F')).toBe('08Fb');
  });
});

describe('site de test', () => {
  const p = siteTest(cat);
  it('est complet et cohérent', () => {
    expect(p.equipments.length).toBeGreaterThanOrEqual(40);
    expect(p.equipments.filter((e) => incompleteReasons(cat, p, e).length)).toEqual([]);
    const route = routeAll(p);
    expect(route.links).toHaveLength(p.links.length);
    for (const l of route.links) for (const [x, y] of l.points) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });
});

describe('alignement', () => {
  const items = [
    { id: 'a', box: boxAt(100, 100, 56, 28) },
    { id: 'b', box: boxAt(230, 117, 62, 32) },
    { id: 'c', box: boxAt(400, 90, 38, 38) },
  ];
  it('aligne en haut sur la boîte la plus haute', () => {
    const r = align(items, 'top');
    expect(r.a.y - 14).toBe(71);
    expect(r.b.y - 16).toBe(71);
    expect(r.c.y - 19).toBe(71);
  });
  it('répartit avec des écarts égaux', () => {
    const r = distribute(items, 'h');
    const gap1 = r.b.x - 31 - (r.a.x + 28);
    const gap2 = r.c.x - 19 - (r.b.x + 31);
    expect(Math.abs(gap1 - gap2)).toBeLessThanOrEqual(1);
  });
});

describe('traits alignés (axes de canal)', () => {
  const linked = (h0a: string, a: [number, number], h0b: string, b: [number, number], o: { chA?: number; chB?: number; nB?: number } = {}) => {
    const A = addEq(cat, emptyPivot(cat), h0a, a[0], a[1], { repere: 'AAa' });
    const B = addEq(cat, A.p, h0b, b[0], b[1], { repere: 'BBa', channels: o.nB ?? 1 });
    const p = connect(B.p, { eq: A.id, ch: o.chA ?? 1, dir: 'avant', num: 1 }, { eq: B.id, ch: o.chB ?? 1 });
    return { p, a: A.id, b: B.id };
  };
  it('redresse deux EQ presque alignés : le lien devient droit', () => {
    const { p } = linked('BELT', [100, 100], 'BELT', [300, 110]);
    expect(routeAll(p).links[0].points.length).toBeGreaterThan(2);
    const q = straighten(p);
    expect(new Set(q.equipments.map((e) => e.y)).size).toBe(1);
    expect(routeAll(q).links[0].points).toHaveLength(2);
  });
  it('aligne un tapis sur l’axe du canal 1 d’un trieur tricanal, le trieur ne bouge pas', () => {
    const { p, a, b } = linked('BELT', [300, 290], 'OPSO', [500, 300], { chB: 1, nB: 3 });
    const q = straighten(p);
    expect(findEq(q, b)!.y).toBe(300);
    expect(findEq(q, a)!.y).toBe(280);
    const pts = routeAll(q).links[0].points;
    expect(pts).toHaveLength(2);
    expect(pts[0][1]).toBe(280);
  });
  it('ne touche pas aux liens franchement décalés ni aux EQ hors sélection', () => {
    const { p } = linked('BELT', [100, 100], 'BELT', [300, 260]);
    expect(straighten(p)).toBe(p);
    const n = linked('BELT', [100, 100], 'BELT', [300, 110]);
    expect(straighten(n.p, new Set([n.a])).equipments.find((e) => e.id === n.a)!.y).toBe(110);
  });
  it('le geste « + » pose l’EQ suivant sur l’axe du canal', () => {
    const t = addEq(cat, emptyPivot(cat), 'OPSO', 300, 300, { channels: 3 });
    const r = addOutputWithNext(cat, t.p, t.id, 3, 'avant', 'BELT');
    expect(findEq(r.p, r.id!)!.y).toBe(320);
    expect(routeAll(r.p).links[0].points).toHaveLength(2);
  });
  it('site de test : liens d’une même rangée droits', () => {
    const p = siteTest(cat);
    const id = (rep: string) => p.equipments.find((e) => e.repere === rep)!.id;
    const straightPairs = [['08Aa', '57Ma'], ['08Ac', '36Ra'], ['08Fd', '13Ca'], ['13Ca', '08Fe'], ['42Fb', '08Fa']];
    for (const [f, t] of straightPairs) {
      const l = routeAll(p).links.find((x) => x.link.from.eq === id(f) && x.link.to.eq === id(t))!;
      expect([f, t, l.points.length]).toEqual([f, t, 2]);
    }
  });
});

describe('redresser après un glisser', () => {
  it('un EQ décalé revient sur la rangée, la rangée ne bouge pas', () => {
    const p0 = siteTest(cat);
    const a = p0.equipments.find((e) => e.repere === '08Aa')!;
    const moved = { ...p0, equipments: p0.equipments.map((e) => (e.id === a.id ? { ...e, y: e.y + 30 } : e)) };
    const q = straighten(moved);
    expect(findEq(q, a.id)!.y).toBe(a.y);
    const others = q.equipments.filter((e) => e.id !== a.id);
    expect(others.every((e) => e.y === p0.equipments.find((o) => o.id === e.id)!.y)).toBe(true);
  });
});

describe('repères en double et formes orientées', () => {
  it('signale un repère Aktid en double et ignore la casse du repère client', () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 100, 100, { repere: '08Aa' }).p;
    p = { ...p, equipments: p.equipments.map((e) => ({ ...e, repereAktid: 'TAP-01' })) };
    const b = addEq(cat, p, 'BELT', 300, 100, { repere: '08AA' });
    p = { ...b.p, equipments: b.p.equipments.map((e) => (e.id === b.id ? { ...e, repereAktid: ' tap-01 ' } : e)) };
    const r = incompleteReasons(cat, p, findEq(p, b.id)!);
    expect(r).toContain('Repère client en double : 08AA');
    expect(r).toContain('Repère Aktid en double : tap-01');
  });
  it('propose un repère libre sans tenir compte de la casse', () => {
    const p = addEq(cat, emptyPivot(cat), 'BELT', 100, 100, { repere: '08AA' }).p;
    expect(suggestRepere(cat, p, 'BELT', 'A')).toBe('08Ab');
    const b = addEq(cat, p, 'BELT', 300, 100, { zone: 'A' });
    expect(incompleteReasons(cat, b.p, findEq(b.p, b.id)!)).toEqual([]);
  });
  it('dupliquer ne recopie pas le repère Aktid', () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 100, 100, { repere: '08Aa' }).p;
    p = { ...p, equipments: p.equipments.map((e) => ({ ...e, repereAktid: 'TAP-01' })) };
    const r = duplicate(cat, p, [p.equipments[0].id]);
    expect(findEq(r.p, r.ids[0])!.repereAktid).toBe('');
    expect(r.p.equipments.filter((e) => incompleteReasons(cat, r.p, e).length)).toEqual([]);
  });
  it('un tapis qui descend est vertical, et reste allongé avec deux canaux', () => {
    const h = eqBox(createEq(cat, emptyPivot(cat), 'BELT', 0, 0, { flow: 'S' }));
    expect(h.h).toBeGreaterThan(h.w);
    const two = createEq(cat, emptyPivot(cat), 'BELT', 0, 0, { flow: 'S', channels: 2 });
    const b2 = eqBox(two);
    expect(b2.h).toBeGreaterThan(b2.w);
    const flat = eqBox(createEq(cat, emptyPivot(cat), 'BELT', 0, 0, { flow: 'E', channels: 2 }));
    expect(flat.w).toBeGreaterThan(flat.h);
  });
});
