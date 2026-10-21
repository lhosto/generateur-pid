import { beforeAll, describe, expect, it } from 'vitest';
import catJson from '../catalogue.json';
import { siteTest } from '../fictif/siteTest.fictif';
import { setLang } from '../i18n';
import { align, distribute } from './align';
import { principals, type Catalogue } from './catalogue';
import { SYMBOLS, aktidSymbolOf, setActiveShapes, symbolOf } from './symbols';
import { straighten } from './straighten';
import { boxAt, eqBox, sideOffset } from './geometry';
import { addChannel, addEq, addOutput, addOutputWithNext, connect, createEq, duplicate, emptyPivot, findEq, removeChannel, removeLink, setChainType, setOutputNum, takeOutput, updateEq, activeStandard, duplicateStandard, setStandardBase, setActiveStandard, deleteStandard } from './ops';
import type { Pivot } from './pivot';
import { loopLinks, routeAll, shortTag, tagFor } from './route';
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
    expect(r.p.links[0].from).toMatchObject({ eq: a.id, ch: 1, dir: 'avant', num: 2 }); // la sortie 1 reste en attente
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
  it('un tapis qui descend est vertical ; plus de canaux = plus épais, pas plus long', () => {
    const h = eqBox(createEq(cat, emptyPivot(cat), 'BELT', 0, 0, { flow: 'S' }));
    expect(h.h).toBeGreaterThan(h.w);
    const b3 = eqBox(createEq(cat, emptyPivot(cat), 'BELT', 0, 0, { flow: 'S', channels: 3 }));
    expect(b3.h).toBe(h.h);
    expect(b3.w).toBeGreaterThan(h.w);
    const flat = eqBox(createEq(cat, emptyPivot(cat), 'BELT', 0, 0, { flow: 'E', channels: 2 }));
    expect(flat.w).toBeGreaterThan(flat.h);
  });
});

describe('boucles', () => {
  it('repère le lien qui ferme une recirculation, pas la marche arrière', () => {
    const p = siteTest(cat);
    const rep = (id: string) => p.equipments.find((e) => e.id === id)!.repere;
    const loops = [...loopLinks(p)].map((id) => p.links.find((l) => l.id === id)!).map((l) => `${rep(l.from.eq)}>${rep(l.to.eq)}`);
    expect(loops).toEqual(['27Pb>08Ae']);
  });
});

describe('numéros de sortie', () => {
  const three = () => {
    const a = addEq(cat, emptyPivot(cat), 'BS', 100, 100, { repere: 'AAa' });
    let p = a.p;
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const t = addEq(cat, p, 'BELT', 300, 100 + i * 80);
      p = connect(t.p, { eq: a.id, ch: 1, dir: 'avant', num: i + 1 }, { eq: t.id, ch: 1 });
      ids.push(t.id);
    }
    return { p, a: a.id, ids };
  };
  const numTo = (p: Pivot, target: string) => p.links.find((l) => l.to.eq === target)!.from.num;
  it('supprimer le trait de la sortie 1 fait remonter les suivantes', () => {
    const { p, ids } = three();
    const q = removeLink(p, p.links.find((l) => l.to.eq === ids[0])!.id);
    expect([numTo(q, ids[1]), numTo(q, ids[2])]).toEqual([1, 2]);
    expect(findEq(q, q.links[0].from.eq)!.channels[0].outputs.map((o) => o.num).sort()).toEqual([1, 2]);
  });
  it('mettre le trait de la sortie 2 sur une sortie 1 en attente : la sortie vide disparaît', () => {
    const a = addEq(cat, emptyPivot(cat), 'BELT', 300, 300);
    const r = addOutputWithNext(cat, a.p, a.id, 1, 'avant', 'BELT');
    const q = setOutputNum(r.p, r.p.links[0].from, 1);
    expect(findEq(q, a.id)!.channels[0].outputs).toEqual([{ dir: 'avant', num: 1 }]);
    expect(q.links[0].from.num).toBe(1);
  });
  it('mettre une sortie en 1 décale les autres', () => {
    const { p, ids } = three();
    const ref = p.links.find((l) => l.to.eq === ids[2])!.from;
    const q = setOutputNum(p, ref, 1);
    expect(ids.map((id) => numTo(q, id))).toEqual([2, 3, 1]);
  });
});

describe('côtés imposés par le flux', () => {
  it('flux vers le bas : la marche arrière part par le haut, la marche avant par le bas', () => {
    let p = emptyPivot(cat);
    const a = addEq(cat, p, 'BELT', 300, 300, { flow: 'S', options: { reverseAllowed: true } });
    p = setChainType(cat, a.p, a.id, 2, 'DRIV');
    const up = addEq(cat, p, 'BELT', 500, 100);
    const down = addEq(cat, up.p, 'BELT', 500, 500);
    p = connect(down.p, { eq: a.id, ch: 1, dir: 'arriere', num: 1 }, { eq: up.id, ch: 1 });
    p = connect(p, { eq: a.id, ch: 1, dir: 'avant', num: 1 }, { eq: down.id, ch: 1 });
    const box = eqBox(findEq(p, a.id)!);
    const r = routeAll(p).links;
    const start = (to: string) => r.find((l) => l.link.to.eq === to)!.points[0];
    expect(start(up.id)[1]).toBe(box.y0);
    expect(start(down.id)[1]).toBe(box.y1);
  });
});

describe('sortie 1.1 en attente et étiquettes courtes', () => {
  it('un nouvel équipement a sa sortie 1.1 libre ; le + ajoute la sortie 2 et laisse la 1 en attente', () => {
    const a = addEq(cat, emptyPivot(cat), 'BELT', 300, 300);
    expect(findEq(a.p, a.id)!.channels[0].outputs).toEqual([{ dir: 'avant', num: 1 }]);
    const r = addOutputWithNext(cat, a.p, a.id, 1, 'avant', 'BELT');
    expect(findEq(r.p, a.id)!.channels[0].outputs).toHaveLength(2);
    expect(r.p.links[0].from.num).toBe(2);
    expect(takeOutput(r.p, a.id, 1, 'avant').ref!.num).toBe(1);
  });
  it('un nouveau canal arrive avec sa sortie 1 en attente', () => {
    const a = addEq(cat, emptyPivot(cat), 'BELT', 300, 300);
    const p = addChannel(a.p, a.id);
    expect(findEq(p, a.id)!.channels[1].outputs).toEqual([{ dir: 'avant', num: 1 }]);
  });
  it('arrivée par l\'arrière derrière la source : le trait contourne, sans traverser la cible', () => {
    let p = emptyPivot(cat);
    const f = addEq(cat, p, 'BELT', 300, 300, { flow: 'S', options: { reverseAllowed: true } });
    p = setChainType(cat, f.p, f.id, 2, 'DRIV');
    const j = addEq(cat, p, 'BELT', 190, 300, { flow: 'N' });
    p = connect(j.p, { eq: f.id, ch: 1, dir: 'arriere', num: 1 }, { eq: j.id, ch: 1 });
    const pts = routeAll(p).links[0].points;
    const box = eqBox(findEq(p, j.id)!);
    expect(pts[pts.length - 1][1]).toBe(box.y1);
    expect(pts[pts.length - 2][1]).toBeGreaterThan(box.y1);
  });
  it('étiquette : rien pour une sortie unique, numéro seul si besoin', () => {
    const a = addEq(cat, emptyPivot(cat), 'BELT', 300, 300);
    const e = findEq(a.p, a.id)!;
    expect(shortTag(e, 1, 1, 'avant')).toBe('');
    expect(shortTag(e, 1, 1, 'arriere')).toBe('AR');
    const two = { ...e, channels: [{ outputs: [{ dir: 'avant' as const, num: 1 }, { dir: 'avant' as const, num: 2 }] }] };
    expect(shortTag(two, 1, 1, 'avant')).toBe('−');
    expect(shortTag(two, 1, 2, 'avant')).toBe('+');
    const ch2 = { ...e, channels: [{ outputs: [{ dir: 'avant' as const, num: 1 }] }, { outputs: [{ dir: 'avant' as const, num: 1 }] }] };
    expect(shortTag(ch2, 2, 1, 'avant')).toBe('2');
    const mix = { ...e, channels: [two.channels[0], ch2.channels[1]] };
    expect(shortTag(mix, 1, 2, 'avant')).toBe('1+');
    expect(tagFor(2, 1, 3, 3, 'avant')).toBe('1++');
    expect(tagFor(1, 1, 3, 3, 'arriere')).toBe('++ AR');
    // Dès 4 sorties, numérotation 1.1, 1.2… (même avec un seul canal).
    expect(tagFor(1, 1, 1, 4, 'avant')).toBe('1.1(−)');
    expect(tagFor(1, 1, 4, 4, 'avant')).toBe('1.4');
  });
});

describe('repère du convoyeur suivant', () => {
  const chain = (first: string, n: number) => {
    let a = addEq(cat, emptyPivot(cat), 'BELT', 100, 100, { repere: first });
    let p = a.p;
    let id = a.id;
    const out = [first];
    for (let i = 0; i < n; i++) {
      const r = addOutputWithNext(cat, p, id, 1, 'avant', 'BELT');
      p = r.p;
      id = r.id!;
      out.push(findEq(p, id)!.repere);
    }
    return { p, id, out };
  };
  it('lettre suivante : 04a → 04b → 04c', () => expect(chain('04a', 2).out).toEqual(['04a', '04b', '04c']));
  it('nombre suivant : 10 → 11 → 12', () => expect(chain('10', 2).out).toEqual(['10', '11', '12']));
  it('le pas établi est conservé : 10, 20 → 30 → 40', () => {
    const { p, id } = chain('10', 1);
    const q = updateEq(p, id, { repere: '20' });
    const r1 = addOutputWithNext(cat, q, id, 1, 'avant', 'BELT');
    const r2 = addOutputWithNext(cat, r1.p, r1.id!, 1, 'avant', 'BELT');
    expect([findEq(r1.p, r1.id!)!.repere, findEq(r2.p, r2.id!)!.repere]).toEqual(['30', '40']);
  });
});

describe('départs de sorties', () => {
  it('sortie 1 en attente et sortie 2 reliée : départs distincts, dans la forme', () => {
    const a = addEq(cat, emptyPivot(cat), 'BELT', 300, 300);
    const r = addOutputWithNext(cat, a.p, a.id, 1, 'avant', 'BELT');
    const box = eqBox(findEq(r.p, a.id)!);
    const { links, stubs } = routeAll(r.p);
    const s2 = links.find((l) => l.link.from.eq === a.id)!.points[0];
    const s1 = stubs.find((s) => s.ref.eq === a.id)!.points[0];
    // Flux horizontal : la sortie 2 (positive) au-dessus de la sortie 1.
    expect(s2[1]).toBeLessThan(s1[1]);
    for (const y of [s1[1], s2[1]]) expect(y > box.y0 && y < box.y1).toBe(true);
  });
});

describe('croisements de traits', () => {
  const crossings = (links: { points: [number, number][] }[]) => {
    let n = 0;
    const segs = links.map((l) => l.points.slice(1).map((q, i) => [l.points[i], q] as const));
    for (let a = 0; a < segs.length; a++)
      for (let b = a + 1; b < segs.length; b++)
        for (const [p0, p1] of segs[a])
          for (const [q0, q1] of segs[b]) {
            const pH = p0[1] === p1[1];
            const qH = q0[1] === q1[1];
            if (pH === qH) continue;
            const [h0, h1, v0, v1] = pH ? [p0, p1, q0, q1] : [q0, q1, p0, p1];
            const x = v0[0];
            const y = h0[1];
            if (x > Math.min(h0[0], h1[0]) + 0.5 && x < Math.max(h0[0], h1[0]) - 0.5 && y > Math.min(v0[1], v1[1]) + 0.5 && y < Math.max(v0[1], v1[1]) - 0.5) n++;
          }
    return n;
  };
  it('deux arrivées sur le même équipement, l\'une d\'en haut, l\'autre d\'en bas : pas de croisement', () => {
    let p = emptyPivot(cat);
    const up = addEq(cat, p, 'BELT', 100, 100);
    const down = addEq(cat, up.p, 'BELT', 100, 400);
    const dst = addEq(cat, down.p, 'BELT', 400, 250);
    p = connect(dst.p, { eq: up.id, ch: 1, dir: 'avant', num: 1 }, { eq: dst.id, ch: 1 });
    p = connect(p, { eq: down.id, ch: 1, dir: 'avant', num: 1 }, { eq: dst.id, ch: 1 });
    expect(crossings(routeAll(p).links)).toBe(0);
  });
  it('deux traits vers deux équipements différents ne courent pas côte à côte', () => {
    let p = emptyPivot(cat);
    const s = addEq(cat, p, 'BELT', 400, 400, { channels: 3 });
    const t1 = addEq(cat, s.p, 'BELT', 530, 410);
    const t2 = addEq(cat, t1.p, 'BELT', 530, 440);
    const a = addEq(cat, t2.p, 'BELT', 410, 480);
    p = connect(a.p, { eq: s.id, ch: 1, dir: 'avant', num: 1 }, { eq: t1.id, ch: 1 });
    p = connect(p, { eq: a.id, ch: 1, dir: 'avant', num: 1 }, { eq: t1.id, ch: 1 });
    p = connect(p, { eq: a.id, ch: 1, dir: 'avant', num: 2 }, { eq: t2.id, ch: 1 });
    const r = routeAll(p).links;
    const xs = (to: string) => r.filter((l) => l.link.to.eq === to).flatMap((l) => l.points.slice(1, -1).filter((q, i, arr) => i > 0 && q[0] === arr[i - 1][0]).map((q) => q[0]));
    for (const x2 of xs(t2.id)) for (const x1 of xs(t1.id)) expect(Math.abs(x2 - x1)).toBeGreaterThanOrEqual(8);
  });
  it('site de test : seuls restent les croisements imposés (ordre des sorties, canaux différents)', () => {
    expect(crossings(routeAll(siteTest(cat)).links)).toBeLessThanOrEqual(16);
  });
});

describe('convoyeur : départ direct ou variateur', () => {
  it('la commande choisie est posée dans la pile', () => {
    const a = addEq(cat, emptyPivot(cat), 'BELT', 300, 300);
    const km = addOutputWithNext(cat, a.p, a.id, 1, 'avant', 'BELT', undefined, 'KM');
    const dr = addOutputWithNext(cat, a.p, a.id, 1, 'avant', 'BELT', undefined, 'DRIV');
    const types = (p: typeof km.p, id: string) => findEq(p, id)!.hg.map((h) => h.type);
    expect(types(km.p, km.id!)).toContain('KM');
    expect(types(dr.p, dr.id!)).toContain('DRIV');
    expect(types(dr.p, dr.id!)).not.toContain('KM');
    // Marche arrière autorisée d'office sur variateur, pas en départ direct.
    expect(findEq(dr.p, dr.id!)!.options.reverseAllowed).toBe(true);
    expect(findEq(km.p, km.id!)!.options.reverseAllowed).toBeFalsy();
  });
});

describe('standards de formes', () => {
  it('Standard Aktid par défaut ; un standard créé ne change que la forme', () => {
    const p0 = addEq(cat, emptyPivot(cat), 'BELT', 300, 300).p;
    expect(activeStandard(p0).id).toBe('aktid');
    const d = duplicateStandard(p0, 'aktid', 'Client X');
    const p1 = setStandardBase(d.p, d.id, 'BELT', 'card');
    expect(activeStandard(p1).bases.BELT).toBe('card');
    setActiveShapes(activeStandard(p1).bases);
    expect(symbolOf('BELT').base).toBe('card');
    expect(symbolOf('BELT').picto).toBe(aktidSymbolOf('BELT').picto);
    const p2 = setActiveStandard(p1, 'aktid');
    setActiveShapes(activeStandard(p2).bases);
    expect(symbolOf('BELT').base).toBe(aktidSymbolOf('BELT').base);
    expect(activeStandard(deleteStandard(setActiveStandard(p1, d.id), d.id)).id).toBe('aktid');
  });
});

describe('coudes des sorties d\'un même départ', () => {
  it('1.1 vers le bas et 1.2 vers le haut coudent sur la même colonne', () => {
    let p = emptyPivot(cat);
    const a = addEq(cat, p, 'BELT', 100, 200);
    const up = addEq(cat, a.p, 'BELT', 260, 150);
    const down = addEq(cat, up.p, 'BELT', 300, 250);
    // Flux horizontal : 1.2 (positive) part au-dessus de 1.1.
    p = connect(down.p, { eq: a.id, ch: 1, dir: 'avant', num: 1 }, { eq: down.id, ch: 1 });
    p = connect(p, { eq: a.id, ch: 1, dir: 'avant', num: 2 }, { eq: up.id, ch: 1 });
    const r = routeAll(p).links;
    const bendX = (to: string) => r.find((l) => l.link.to.eq === to)!.points[1][0];
    expect(bendX(up.id)).toBe(bendX(down.id));
  });
});

describe('pas de petit décrochement', () => {
  it('arrivée par le dessous d\'un équipement réversible : trait en L net', () => {
    let p = emptyPivot(cat);
    const a = addEq(cat, p, 'BELT', 100, 300, { command: 'DRIV' });
    const up = addEq(cat, a.p, 'BELT', 300, 200, { command: 'DRIV' });
    const down = addEq(cat, up.p, 'BELT', 260, 400, { command: 'DRIV' });
    p = connect(down.p, { eq: a.id, ch: 1, dir: 'avant', num: 1 }, { eq: up.id, ch: 1 });
    p = connect(p, { eq: a.id, ch: 1, dir: 'avant', num: 2 }, { eq: down.id, ch: 1 });
    p = connect(p, { eq: up.id, ch: 1, dir: 'arriere', num: 1 }, { eq: down.id, ch: 1 });
    // 1.1 vers l'équipement du haut, arrivée par le dessous : un seul coude (L).
    expect(routeAll(p).links.find((l) => l.link.from.num === 1 && l.link.from.dir === 'avant')!.points).toHaveLength(3);
    for (const l of routeAll(p).links) {
      const q = l.points;
      for (let i = 2; i < q.length - 1; i++) expect(Math.abs(q[i][0] - q[i - 1][0]) + Math.abs(q[i][1] - q[i - 1][1])).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('boucle par la marche arrière', () => {
  it('088 AR → 091 → 092 → 086 : le retour vers 086 porte le repère de boucle', () => {
    let p = emptyPivot(cat);
    const mk = (x: number, y: number, flow: 'E' | 'W' = 'E') => {
      const r = addEq(cat, p, 'BELT', x, y, { command: 'DRIV', flow });
      p = r.p;
      return r.id;
    };
    const e85 = mk(0, 200), e86 = mk(100, 200), e87 = mk(200, 200), e88 = mk(300, 150);
    const e91 = mk(200, 100, 'W'), e92 = mk(100, 100, 'W');
    p = connect(p, { eq: e85, ch: 1, dir: 'avant', num: 1 }, { eq: e86, ch: 1 });
    p = connect(p, { eq: e86, ch: 1, dir: 'avant', num: 1 }, { eq: e87, ch: 1 });
    p = connect(p, { eq: e87, ch: 1, dir: 'avant', num: 1 }, { eq: e88, ch: 1 });
    p = connect(p, { eq: e88, ch: 1, dir: 'arriere', num: 1 }, { eq: e91, ch: 1 });
    p = connect(p, { eq: e91, ch: 1, dir: 'avant', num: 1 }, { eq: e92, ch: 1 });
    p = connect(p, { eq: e92, ch: 1, dir: 'avant', num: 1 }, { eq: e86, ch: 1 });
    const loops = loopLinks(p);
    const back = p.links.find((l) => l.from.eq === e92)!;
    expect([...loops]).toEqual([back.id]);
  });
});

describe('pas de coude sur les étiquettes', () => {
  it('087 : 1.1 monte vers 088 après la zone des étiquettes', () => {
    let p = emptyPivot(cat);
    const a = addEq(cat, p, 'BELT', 100, 300);
    const up = addEq(cat, a.p, 'BELT', 300, 200);
    const right = addEq(cat, up.p, 'BELT', 260, 300);
    p = connect(right.p, { eq: a.id, ch: 1, dir: 'avant', num: 1 }, { eq: up.id, ch: 1 });
    p = connect(p, { eq: a.id, ch: 1, dir: 'avant', num: 2 }, { eq: right.id, ch: 1 });
    const box = eqBox(findEq(p, a.id)!);
    const l11 = routeAll(p).links.find((l) => l.link.to.eq === up.id)!;
    expect(l11.points[1][0] - box.x1).toBeGreaterThanOrEqual(28);
  });
});

describe('pas de trait qui dépasse', () => {
  it('087 : trois sorties vers le haut, le bas et loin, aucun demi-tour', () => {
    let p = emptyPivot(cat);
    const a = addEq(cat, p, 'BELT', 100, 300);
    const t93 = addEq(cat, a.p, 'BELT', 230, 230);
    const t90 = addEq(cat, t93.p, 'BELT', 230, 370);
    const far = addEq(cat, t90.p, 'BELT', 500, 100);
    p = connect(far.p, { eq: a.id, ch: 1, dir: 'avant', num: 1 }, { eq: far.id, ch: 1 });
    p = connect(p, { eq: a.id, ch: 1, dir: 'avant', num: 2 }, { eq: t90.id, ch: 1 });
    p = connect(p, { eq: a.id, ch: 1, dir: 'avant', num: 3 }, { eq: t93.id, ch: 1 });
    for (const l of routeAll(p).links) {
      const q = l.points;
      for (let i = 1; i < q.length - 1; i++) {
        const dot = (q[i][0] - q[i - 1][0]) * (q[i + 1][0] - q[i][0]) + (q[i][1] - q[i - 1][1]) * (q[i + 1][1] - q[i][1]);
        const col = (q[i - 1][0] === q[i][0] && q[i][0] === q[i + 1][0]) || (q[i - 1][1] === q[i][1] && q[i][1] === q[i + 1][1]);
        expect(col && dot < 0).toBe(false);
      }
    }
  });
});

describe('bande des canaux', () => {
  it('2 canaux avec 2 et 3 sorties : départs de canaux voisins à 10 px au moins', () => {
    let p = emptyPivot(cat);
    const a = addEq(cat, p, 'BELT', 100, 300, { channels: 2 });
    p = a.p;
    let y = 100;
    const targets: string[] = [];
    for (let i = 0; i < 5; i++) {
      const t = addEq(cat, p, 'BELT', 400, y);
      p = t.p;
      targets.push(t.id);
      y += 60;
    }
    p = connect(p, { eq: a.id, ch: 1, dir: 'avant', num: 1 }, { eq: targets[0], ch: 1 });
    p = connect(p, { eq: a.id, ch: 1, dir: 'avant', num: 2 }, { eq: targets[1], ch: 1 });
    p = connect(p, { eq: a.id, ch: 2, dir: 'avant', num: 1 }, { eq: targets[2], ch: 1 });
    p = connect(p, { eq: a.id, ch: 2, dir: 'avant', num: 2 }, { eq: targets[3], ch: 1 });
    p = connect(p, { eq: a.id, ch: 2, dir: 'avant', num: 3 }, { eq: targets[4], ch: 1 });
    const ys = routeAll(p).links.map((l) => l.points[0][1]).sort((u, v) => u - v);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(10);
    const box = eqBox(findEq(p, a.id)!);
    for (const v of ys) expect(v > box.y0 && v < box.y1).toBe(true);
  });
});

describe('flux vertical, trois sorties vers une colonne à droite', () => {
  it('2−, 2+, 2++ : un seul coude chacun, sans croisement', () => {
    let p = emptyPivot(cat);
    const a = addEq(cat, p, 'BELT', 100, 100, { channels: 2, flow: 'S' });
    p = a.p;
    const mk = (x: number, y: number) => {
      const t = addEq(cat, p, 'BELT', x, y);
      p = t.p;
      return t.id;
    };
    const t96 = mk(240, 140), t95 = mk(240, 180), t94 = mk(240, 210);
    p = connect(p, { eq: a.id, ch: 2, dir: 'avant', num: 1 }, { eq: t94, ch: 1 });
    p = connect(p, { eq: a.id, ch: 2, dir: 'avant', num: 2 }, { eq: t95, ch: 1 });
    p = connect(p, { eq: a.id, ch: 2, dir: 'avant', num: 3 }, { eq: t96, ch: 1 });
    for (const l of routeAll(p).links) expect(l.points).toHaveLength(3);
  });
});

describe('équipements proches', () => {
  it('64a juste au-dessus de 63a, décalé : trait en angles droits, jamais en diagonale', () => {
    let p = emptyPivot(cat);
    const a = addEq(cat, p, 'BELT', 100, 100, { flow: 'S' });
    const b = addEq(cat, a.p, 'BELT', 112, 170, { flow: 'S', channels: 2 });
    p = connect(b.p, { eq: a.id, ch: 1, dir: 'avant', num: 1 }, { eq: b.id, ch: 1 });
    const pts = routeAll(p).links[0].points;
    for (let i = 1; i < pts.length; i++) expect(pts[i][0] === pts[i - 1][0] || pts[i][1] === pts[i - 1][1]).toBe(true);
  });
});

describe('largeur propre à chaque canal', () => {
  it('3 sorties à gauche et 1 à droite : moins large que 3 et 3', () => {
    const mk = (n2: number) => {
      let p = emptyPivot(cat);
      const a = addEq(cat, p, 'BELT', 100, 100, { channels: 2, flow: 'S' });
      p = a.p;
      for (let i = 1; i <= 3; i++) p = connect(p, { eq: a.id, ch: 1, dir: 'avant', num: i }, { eq: a.id, ch: 1 });
      for (let i = 1; i <= n2; i++) p = connect(p, { eq: a.id, ch: 2, dir: 'avant', num: i }, { eq: a.id, ch: 2 });
      return eqBox(findEq(p, a.id)!).w;
    };
    expect(mk(1)).toBeLessThan(mk(3));
  });
  it('une sortie par canal : axes tous les 20 px, comme avant', () => {
    const a = addEq(cat, emptyPivot(cat), 'BELT', 100, 100, { channels: 3 });
    const e = findEq(a.p, a.id)!;
    expect([1, 2, 3].map((k) => sideOffset(e, 'E', k))).toEqual([-20, 0, 20]);
  });
});

describe('canal 1 à gauche dans le sens du flux', () => {
  it('droite → en haut, bas → à droite, gauche → en bas, haut → à gauche', () => {
    const side = (flow: 'E' | 'S' | 'W' | 'N') => {
      const a = addEq(cat, emptyPivot(cat), 'BELT', 100, 100, { channels: 2, flow });
      const e = findEq(a.p, a.id)!;
      const out = flow; // côté de sortie avant
      return Math.sign(sideOffset(e, out, 1));
    };
    expect(side('E')).toBe(-1); // y négatif : en haut
    expect(side('S')).toBe(1); // x positif : à droite
    expect(side('W')).toBe(1); // y positif : en bas
    expect(side('N')).toBe(-1); // x négatif : à gauche
  });
});

describe('sorties sœurs', () => {
  it('flux vers le bas : 1− vers la droite et 1+ tout droit ne se croisent pas collés aux étiquettes', () => {
    let p = emptyPivot(cat);
    const a = addEq(cat, p, 'BELT', 100, 100, { flow: 'S' });
    const below = addEq(cat, a.p, 'BELT', 100, 260, { flow: 'S' });
    const right = addEq(cat, below.p, 'BELT', 260, 180);
    p = connect(right.p, { eq: a.id, ch: 1, dir: 'avant', num: 1 }, { eq: right.id, ch: 1 });
    p = connect(p, { eq: a.id, ch: 1, dir: 'avant', num: 2 }, { eq: below.id, ch: 1 });
    const box = eqBox(findEq(p, a.id)!);
    const r = routeAll(p).links;
    const minus = r.find((l) => l.link.to.eq === right.id)!.points;
    const plus = r.find((l) => l.link.to.eq === below.id)!.points;
    // Point où 1− croise la verticale de 1+ : à 28 px au moins sous l'équipement.
    for (let i = 1; i < minus.length; i++) {
      const [u, v] = [minus[i - 1], minus[i]];
      if (u[1] === v[1] && Math.min(u[0], v[0]) < plus[0][0] && Math.max(u[0], v[0]) > plus[0][0]) expect(u[1] - box.y1).toBeGreaterThanOrEqual(28);
    }
  });
});

describe('boucle par canal', () => {
  it('63a canal 1 → 08Ad → 63a canal 2 : pas une boucle', () => {
    let p = emptyPivot(cat);
    const a = addEq(cat, p, 'BELT', 100, 100, { channels: 2 });
    const d = addEq(cat, a.p, 'BELT', 300, 100);
    p = connect(d.p, { eq: a.id, ch: 1, dir: 'avant', num: 1 }, { eq: d.id, ch: 1 });
    p = connect(p, { eq: d.id, ch: 1, dir: 'avant', num: 1 }, { eq: a.id, ch: 2 });
    expect(loopLinks(p).size).toBe(0);
    // Retour dans le canal 1 : boucle.
    const q = connect(p, { eq: d.id, ch: 1, dir: 'avant', num: 1 }, { eq: a.id, ch: 1 });
    expect(loopLinks(q).size).toBe(1);
  });
});

describe('arrivée droite sur un équipement collé', () => {
  it('équipement juste dessous, légèrement décalé : dernier segment vertical (flèche vers le bas)', () => {
    let p = emptyPivot(cat);
    const a = addEq(cat, p, 'BELT', 100, 100, { flow: 'S' });
    const b = addEq(cat, a.p, 'OPSO', 106, 146, { flow: 'S', channels: 2 });
    p = connect(b.p, { eq: a.id, ch: 1, dir: 'avant', num: 1 }, { eq: b.id, ch: 1 });
    const l = routeAll(p).links[0];
    const q = l.points;
    expect(q[q.length - 1][0]).toBe(q[q.length - 2][0]);
    expect(l.inner).toBeUndefined();
  });
});
