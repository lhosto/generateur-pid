import { describe, expect, it } from 'vitest';
import catJson from '../catalogue.json';
import { siteTest } from '../fictif/siteTest.fictif';
import { align, distribute } from './align';
import { principals, type Catalogue } from './catalogue';
import { SYMBOLS } from './symbols';
import { boxAt } from './geometry';
import { addChannel, addEq, addOutput, addOutputWithNext, connect, emptyPivot, findEq, removeChannel, setChainType } from './ops';
import { routeAll } from './route';
import {
  canAddOutput, defaultStack, hgName, hsName, incompleteReasons, isFirstChannel, MAX, nextOutputNum, reverseBlocked, suggestRepere,
} from './rules';

const cat = catJson as unknown as Catalogue;
const base = cat.baseDefaults;
const drivBase = { ...base, command: 'DRIV' as const };
const types = (hg0: string, b = base) => defaultStack(cat, b, hg0).map((h) => h.type);

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
  it('retirer un canal renumérote les liens des canaux suivants', () => {
    let { p, id } = addEq(cat, emptyPivot(cat), 'OPSO', 300, 300, { channels: 3 });
    const t = addEq(cat, p, 'BELT', 500, 300);
    p = connect(t.p, { eq: id, ch: 3, dir: 'avant', num: 1 }, { eq: t.id, ch: 1 });
    p = removeChannel(p, id, 2);
    expect(p.links[0].from.ch).toBe(2);
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
