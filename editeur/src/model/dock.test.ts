import { describe, expect, it } from 'vitest';
import catJson from '../catalogue.json';
import type { Catalogue } from './catalogue';
import { addEq, emptyPivot, findEq, moveItems } from './ops';
import { dockedLinks, dockedOn, dockOnDrop, touching } from './dock';
import { eqBox } from './geometry';
import { routeAll } from './route';

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
  it('la sortie principale du tapis reste libre pour la suite', () => {
    const { p, c } = setup();
    const linked = new Set(p.links.filter((l) => l.from.eq === c).map((l) => l.from.num));
    expect(findEq(p, c)!.channels[0].outputs.some((o) => !linked.has(o.num))).toBe(true);
  });
  it('tapis à 2 canaux : l’overband prend 2 canaux, 1 → 1 et 2 → 2', () => {
    const { p, c, m } = setup(2);
    expect(findEq(p, m)!.channels).toHaveLength(2);
    expect(p.links.filter((l) => l.from.eq === c && l.to.eq === m).map((l) => [l.from.ch, l.to.ch]).sort()).toEqual([[1, 1], [2, 2]]);
  });
  it('déplacer le convoyeur emmène l’overband', () => {
    const { p, c, m } = setup();
    const carried = dockedOn(p, c);
    expect(carried).toEqual([m]);
    const q = moveItems(p, [c, ...carried], [], 100, 40);
    expect(touching(eqBox(findEq(q, c)!), eqBox(findEq(q, m)!))).toBe(true);
  });
  it('lâché loin : pas accolé', () => {
    let p = emptyPivot(cat);
    const c = addEq(cat, p, 'BELT', 300, 300);
    const m = addEq(cat, c.p, 'OVPM', 300, 150);
    p = dockOnDrop(m.p, m.id);
    expect(p.links).toHaveLength(0);
  });
});
