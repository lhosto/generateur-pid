import { describe, expect, it } from 'vitest';
import catJson from '../catalogue.json';
import type { Catalogue } from './catalogue';
import { addChannel, addEq, emptyPivot, findEq, moveItems, removeChannel } from './ops';
import { dockedLinks, dockedOn, dockOnDrop, settleDocked, touching } from './dock';
import { eqBox } from './geometry';
import { routeAll, shortTag } from './route';

const cat = catJson as unknown as Catalogue;

describe('overband accolé au convoyeur', () => {
  const setup = (channels = 1) => {
    let p = emptyPivot(cat);
    const c = addEq(cat, p, 'BELT', 300, 300, { channels });
    const m = addEq(cat, c.p, 'OVPM', 305, 265);
    p = dockOnDrop(m.p, m.id);
    return { p, c: c.id, m: m.id };
  };
  it('lâché près du tapis : collé dessus, lien créé, pas de trait mais un joint', () => {
    const { p, c, m } = setup();
    expect(touching(eqBox(findEq(p, c)!), eqBox(findEq(p, m)!))).toBe(true);
    expect(p.links.filter((l) => l.from.eq === c && l.to.eq === m)).toHaveLength(1);
    const r = routeAll(p).links.find((l) => l.link.to.eq === m)!;
    expect(r.docked).toBeDefined();
    expect(dockedLinks(p).size).toBe(1);
  });
  it('jamais sur la sortie 1 du canal, même si elle n’existe pas encore', () => {
    let p = emptyPivot(cat);
    const c = addEq(cat, p, 'BELT', 300, 300);
    // Sortie 1 supprimée : le canal n'a plus de sortie.
    p = { ...c.p, equipments: c.p.equipments.map((e) => (e.id === c.id ? { ...e, channels: [{ outputs: [] }] } : e)) };
    const m = addEq(cat, p, 'OVPM', 305, 265);
    p = dockOnDrop(m.p, m.id);
    expect(p.links.find((l) => l.to.eq === m.id)!.from.num).toBe(2);
    expect(findEq(p, c.id)!.channels[0].outputs.map((o) => o.num).sort()).toEqual([1, 2]);
  });
  it('la sortie principale du tapis reste libre pour la suite', () => {
    const { p, c } = setup();
    const linked = new Set(p.links.filter((l) => l.from.eq === c).map((l) => l.from.num));
    expect(findEq(p, c)!.channels[0].outputs.some((o) => !linked.has(o.num))).toBe(true);
  });
  it('tapis à 2 canaux : l’overband garde 1 canal, liens 1 → 1 et 2 → 1', () => {
    const { p, c, m } = setup(2);
    expect(findEq(p, m)!.channels).toHaveLength(1);
    expect(p.links.filter((l) => l.from.eq === c && l.to.eq === m).map((l) => [l.from.ch, l.to.ch]).sort()).toEqual([[1, 1], [2, 1]]);
  });
  it('déplacer le convoyeur emmène l’overband', () => {
    const { p, c, m } = setup();
    const carried = dockedOn(p, c);
    expect(carried).toEqual([m]);
    const q = moveItems(p, [c, ...carried], [], 100, 40);
    expect(touching(eqBox(findEq(q, c)!), eqBox(findEq(q, m)!))).toBe(true);
  });
  it('canal ajouté au convoyeur : l’overband reste accolé à son flanc (joint, pas de trait)', () => {
    const { p, c, m } = setup();
    const q = settleDocked(addChannel(p, c));
    expect(touching(eqBox(findEq(q, c)!), eqBox(findEq(q, m)!))).toBe(true);
    expect(routeAll(q).links.find((l) => l.link.to.eq === m)!.docked).toBeDefined();
  });
  it('l’overband posé dessus n’élargit pas le convoyeur', () => {
    const before = eqBox(addEq(cat, emptyPivot(cat), 'BELT', 300, 300).p.equipments[0]);
    const { p, c } = setup();
    const after = eqBox(findEq(p, c)!);
    expect([after.w, after.h]).toEqual([before.w, before.h]);
  });
  it('overband accolé : la sortie principale du canal devient 1− (le joint est 1+)', () => {
    const { p, c } = setup(2);
    const e = findEq(p, c)!;
    expect(shortTag(e, 1, 1, 'avant')).toBe('1−');
    expect(shortTag(e, 2, 1, 'avant')).toBe('2−');
  });
  it('canal 1 du tapis supprimé : l’overband reste relié (canal 1), toujours accolé', () => {
    const { p, c, m } = setup(2);
    const q = settleDocked(removeChannel(p, c, 1));
    const links = q.links.filter((l) => l.from.eq === c && l.to.eq === m);
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links.every((l) => l.from.ch === 1 && l.from.num >= 2)).toBe(true);
    expect(findEq(q, m)!.dockedTo).toBe(c);
  });
  it('lâché loin : pas accolé', () => {
    let p = emptyPivot(cat);
    const c = addEq(cat, p, 'BELT', 300, 300);
    const m = addEq(cat, c.p, 'OVPM', 300, 150);
    p = dockOnDrop(m.p, m.id);
    expect(p.links).toHaveLength(0);
  });
});
