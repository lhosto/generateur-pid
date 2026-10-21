import { describe, expect, it } from 'vitest';
import catJson from '../catalogue.json';
import type { Catalogue } from './catalogue';
import { addChannel, addEq, addOutput, connect, emptyPivot, findEq, moveItems, removeChannel, removeOutput } from './ops';
import { cover, coverage, dockedLinks, dockedNumsFree, dockedOn, dockLinkTo, dockOnDrop, settleDocked, swapDocked, touching, uncover } from './dock';
import { eqBox, type Box } from './geometry';
import type { Pivot } from './pivot';
import { routeAll, shortTag } from './route';

const cat = catJson as unknown as Catalogue;

/** Boîte b posée sur a (à l'intérieur, au jeu près). */
const inside = (b: Box, a: Box) => b.x0 >= a.x0 - 0.5 && b.x1 <= a.x1 + 0.5 && b.y0 >= a.y0 - 0.5 && b.y1 <= a.y1 + 0.5;
const box = (p: Pivot, id: string) => eqBox(findEq(p, id)!);

describe('overband accolé au convoyeur', () => {
  const setup = (channels = 1) => {
    let p = emptyPivot(cat);
    const c = addEq(cat, p, 'BELT', 300, 300, { channels });
    const m = addEq(cat, c.p, 'OVPM', 305, 265);
    p = dockOnDrop(m.p, m.id);
    return { p, c: c.id, m: m.id };
  };
  it('lâché près du tapis : superposé au tapis, lien créé, pas de trait mais un joint', () => {
    const { p, c, m } = setup();
    expect(inside(box(p, m), box(p, c))).toBe(true);
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
    const q = settleDocked(moveItems(p, [c, ...carried], [], 100, 40));
    expect(inside(box(q, m), box(q, c))).toBe(true);
  });
  it('canal ajouté au convoyeur : l’overband reste dessus (joint, pas de trait)', () => {
    const { p, c, m } = setup();
    const q = settleDocked(addChannel(p, c));
    expect(inside(box(q, m), box(q, c))).toBe(true);
    expect(routeAll(q).links.find((l) => l.link.to.eq === m)!.docked).toBeDefined();
  });
  it('le tapis s’allonge vers l’aval : même épaisseur, même entrée', () => {
    const before = eqBox(addEq(cat, emptyPivot(cat), 'BELT', 300, 300).p.equipments[0]);
    let { p, c } = setup();
    for (const hg0 of ['ROBO', 'PICK', 'PICK']) {
      const m = addEq(cat, p, hg0, 305, hg0 === 'PICK' ? 260 : 300);
      p = dockOnDrop(m.p, m.id);
    }
    const after = box(p, c);
    expect(after.h).toBe(before.h);
    expect(after.x0).toBeCloseTo(before.x0);
    expect(after.w).toBeGreaterThan(before.w);
  });
  it('électroaimant au bout du tapis : son bord aval est le bout du tapis', () => {
    const { p, c, m } = setup();
    expect(box(p, m).x1).toBeCloseTo(box(p, c).x1);
  });
  it('overband accolé : rien n’est écrit sur les sorties du tapis', () => {
    const { p, c } = setup(2);
    const e = findEq(p, c)!;
    // La représentation suffit : les sorties du tapis gardent leur nom ordinaire.
    expect(shortTag(e, 1, 1, 'avant')).toBe('');
    expect(shortTag(e, 2, 1, 'avant')).toBe('');
  });
  it('canal 1 du tapis supprimé : l’overband reste relié (canal 1), toujours accolé', () => {
    const { p, c, m } = setup(2);
    const q = settleDocked(removeChannel(p, c, 1));
    const links = q.links.filter((l) => l.from.eq === c && l.to.eq === m);
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links.every((l) => l.from.ch === 1 && l.from.num >= 2)).toBe(true);
    expect(findEq(q, m)!.dockedTo).toBe(c);
  });
  it('sortie principale 1− supprimée : l’overband reste en 1+, la sortie 1 revient en attente', () => {
    const { p, c, m } = setup();
    const q = settleDocked(removeOutput(p, { eq: c, ch: 1, dir: 'avant', num: 1 }));
    const dl = q.links.find((l) => l.from.eq === c && l.to.eq === m)!;
    expect(dl.from.num).toBeGreaterThan(1);
    expect(findEq(q, c)!.channels[0].outputs.some((o) => o.num === 1 && !o.docked)).toBe(true);
    expect(shortTag(findEq(q, c)!, 1, 1, 'avant')).toBe('');
  });
  it('lâché loin : pas accolé', () => {
    let p = emptyPivot(cat);
    const c = addEq(cat, p, 'BELT', 300, 300);
    const m = addEq(cat, c.p, 'OVPM', 300, 150);
    p = dockOnDrop(m.p, m.id);
    expect(p.links).toHaveLength(0);
  });
});

describe('valoriste (PICK)', () => {
  const belt = (channels: number) => addEq(cat, emptyPivot(cat), 'BELT', 300, 300, { channels });
  it('collé au flanc, relié au seul canal de son côté (dessus → canal 1)', () => {
    const c = belt(3);
    const m = addEq(cat, c.p, 'PICK', 305, 250);
    const p = dockOnDrop(m.p, m.id);
    expect(findEq(p, m.id)!.dockedTo).toBe(c.id);
    expect(touching(box(p, c.id), box(p, m.id))).toBe(true);
    expect(p.links.filter((l) => l.to.eq === m.id).map((l) => l.from.ch)).toEqual([1]);
  });
  it('canal ajouté au tapis : le valoriste du dessous passe sur le nouveau dernier canal, plus rien sur le canal 1', () => {
    const c = belt(1);
    const m = addEq(cat, c.p, 'PICK', 305, 350);
    let p = dockOnDrop(m.p, m.id);
    expect(p.links.filter((l) => l.to.eq === m.id).map((l) => l.from.ch)).toEqual([1]);
    p = settleDocked(addChannel(p, c.id));
    expect(p.links.filter((l) => l.to.eq === m.id).map((l) => l.from.ch)).toEqual([2]);
    expect(findEq(p, c.id)!.channels[0].outputs.some((o) => o.docked)).toBe(false);

  });
  it('dessous → dernier canal', () => {
    const c = belt(3);
    const m = addEq(cat, c.p, 'PICK', 305, 350);
    const p = dockOnDrop(m.p, m.id);
    expect(p.links.filter((l) => l.to.eq === m.id).map((l) => l.from.ch)).toEqual([3]);
  });
  it('serrés vers le bout : le dernier dessus fait face au dessous ; deux dessus : le premier en amont', () => {
    const c = belt(3);
    let p = c.p;
    const drop = (y: number) => {
      const m = addEq(cat, p, 'PICK', 305, y);
      p = dockOnDrop(m.p, m.id);
      return m.id;
    };
    const a = drop(250), b = drop(350), d = drop(250);
    expect(box(p, d).cx).toBeCloseTo(box(p, b).cx);
    expect(box(p, d).cx).toBeGreaterThan(box(p, a).cx + 10);
  });
});

describe('machines de tête et robots', () => {
  it('robot posé après le trieur optique : le robot passe avant et prend le numéro le plus petit', () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 300, 300).p;
    const c = p.equipments[0].id;
    const o = addEq(cat, p, 'OPSO', 305, 300);
    p = dockOnDrop(o.p, o.id);
    const r = addEq(cat, p, 'ROBO', 305, 300);
    p = dockOnDrop(r.p, r.id);
    expect(box(p, r.id).cx).toBeLessThan(box(p, o.id).cx);
    expect(box(p, o.id).x1).toBeCloseTo(box(p, c).x1);
    const num = (m: string) => p.links.find((l) => l.from.eq === c && l.to.eq === m)!.from.num;
    expect(num(r.id)).toBeLessThan(num(o.id));
  });
});

describe('machine accolée supprimée', () => {
  it('sa sortie disparaît du tapis : il reste 3 sorties (pas de 1.4 en attente)', () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 300, 300).p;
    const c = p.equipments[0].id;
    const ids: string[] = [];
    for (const y of [250, 350, 350]) {
      const m = addEq(cat, p, 'PICK', 305, y);
      p = dockOnDrop(m.p, m.id);
      ids.push(m.id);
    }
    const gone = ids[2];
    p = settleDocked({ ...p, equipments: p.equipments.filter((e) => e.id !== gone), links: p.links.filter((l) => l.to.eq !== gone) });
    const e = findEq(p, c)!;
    expect(e.channels[0].outputs.map((o) => o.num).sort()).toEqual([1, 2, 3]);

  });
});

describe('raccordement des canaux tapis → machine posée dessus', () => {
  const twoCh = () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 300, 300, { channels: 2 }).p;
    const c = p.equipments[0].id;
    const m = addEq(cat, p, 'OPSO', 305, 300, { channels: 2 });
    p = dockOnDrop(m.p, m.id);
    return { p, c, m: m.id };
  };
  const map = (p: Pivot, c: string, m: string) => p.links.filter((l) => l.from.eq === c && l.to.eq === m).map((l) => [l.from.ch, l.to.ch]).sort();
  it('machine à 2 canaux sur tapis à 2 canaux : 1 → 1, 2 → 2 par défaut', () => {
    const { p, c, m } = twoCh();
    expect(map(p, c, m)).toEqual([[1, 1], [2, 2]]);
  });
  it('même nombre de canaux : gauche dans gauche, imposé (un trait 2 → 1 est remis en 2 → 2)', () => {
    const { p, c, m } = twoCh();
    const q = settleDocked(dockLinkTo(p, c, 2, m, 1));
    expect(map(q, c, m)).toEqual([[1, 1], [2, 2]]);
    expect(q.links.length).toBe(p.links.length);
  });
  it('machine à 2 canaux sur un tapis à 3 : le choix fait à la main est gardé', () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 300, 300, { channels: 3 }).p;
    const c = p.equipments[0].id;
    const m = addEq(cat, p, 'OPSO', 305, 300, { channels: 2 });
    p = dockOnDrop(m.p, m.id);
    const q = settleDocked(dockLinkTo(p, c, 3, m.id, 1));
    expect(map(q, c, m.id).find(([k]) => k === 3)).toEqual([3, 1]);
  });
  it('geste répété depuis la sortie principale : jamais de sortie en plus (pas de création à l’infini)', () => {
    const { p, c, m } = twoCh();
    let q = p;
    for (let i = 0; i < 5; i++) q = dockLinkTo(q, c, 1, m, 1);
    expect(findEq(q, c)!.channels[0].outputs.length).toBe(findEq(p, c)!.channels[0].outputs.length);
  });
});

describe('largeur d’une machine posée sur le tapis', () => {
  it('robot sur un tapis à 3 canaux : réduit au seul canal du dessous, puis étendu de nouveau', () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 300, 300, { channels: 3 }).p;
    const c = p.equipments[0].id;
    const r = addEq(cat, p, 'ROBO', 305, 300);
    p = dockOnDrop(r.p, r.id);
    const chs = (q: Pivot) => q.links.filter((l) => l.from.eq === c && l.to.eq === r.id).map((l) => l.from.ch).sort();
    expect(chs(p)).toEqual([1, 2, 3]);
    const cov = coverage(p, r.id)!;
    expect(cov.neg.shrink).toBe(1);
    expect(cov.neg.grow).toBeUndefined();
    p = uncover(uncover(p, r.id, 1), r.id, 2);
    expect(chs(p)).toEqual([3]);
    expect(coverage(p, r.id)!.pos.shrink).toBeUndefined();
    // Plus haut sur le tapis : il ne couvre plus que la bande du canal 3, sorties accolées retirées.
    expect(box(p, r.id).y0).toBeGreaterThan(box(p, c).cy);
    expect(findEq(p, c)!.channels[0].outputs.some((o) => o.docked)).toBe(false);
    p = cover(p, r.id, 2);
    expect(chs(p)).toEqual([2, 3]);
  });
});

describe('tapis tourné', () => {
  it('valoriste à droite du flux : il y reste quand le tapis passe vers le bas (même canal, côté écran recalculé)', () => {
    const c = addEq(cat, emptyPivot(cat), 'BELT', 300, 300, { channels: 3 });
    const m = addEq(cat, c.p, 'PICK', 305, 350);
    let p = dockOnDrop(m.p, m.id);
    expect(findEq(p, m.id)!.dockSide).toBe('right');
    p = settleDocked({ ...p, equipments: p.equipments.map((e) => (e.id === c.id ? { ...e, flow: 'S' as const } : e)) });
    expect(p.links.filter((l) => l.to.eq === m.id).map((l) => l.from.ch)).toEqual([3]);
    // Flux vers le bas : la droite du flux est à gauche de l'écran.
    expect(box(p, m.id).cx).toBeLessThan(box(p, c.id).cx);
    expect(touching(box(p, c.id), box(p, m.id))).toBe(true);
  });
});

describe('place d’une machine posée sur le tapis', () => {
  it('le valoriste passe avant le robot ; ni la sortie 1 ni la place du trieur de bout ne sont proposées', () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 300, 300).p;
    const c = p.equipments[0].id;
    const add = (hg0: string, y: number) => {
      const m = addEq(cat, p, hg0, 305, y);
      p = dockOnDrop(m.p, m.id);
      return m.id;
    };
    const robot = add('ROBO', 300);
    const opso = add('OPSO', 300);
    const pick = add('PICK', 250);
    const link = (m: string) => p.links.find((l) => l.from.eq === c && l.to.eq === m)!;
    expect(box(p, pick).cx).toBeGreaterThan(box(p, robot).cx);
    const free = dockedNumsFree(p, link(pick).id);
    expect(free.has(1)).toBe(false);
    expect(free.has(link(opso).from.num)).toBe(false);
    p = swapDocked(p, link(pick).id, link(robot).from.num);
    expect(box(p, pick).cx).toBeLessThan(box(p, robot).cx);
    expect(link(pick).from.num).toBeLessThan(link(robot).from.num);
    expect(box(p, opso).x1).toBeCloseTo(box(p, c).x1);
  });
});

describe('valoriste posé avant la mémoire du côté', () => {
  it('tourner le tapis garde son canal (déduit du lien), même placé de l’autre côté à l’écran', () => {
    const c = addEq(cat, emptyPivot(cat), 'BELT', 300, 300, { channels: 3 });
    const m = addEq(cat, c.p, 'PICK', 340, 250);
    let p = dockOnDrop(m.p, m.id);
    // Ancien pivot : pas de côté mémorisé.
    p = { ...p, equipments: p.equipments.map((e) => (e.id === m.id ? { ...e, dockSide: undefined } : e)) };
    p = settleDocked({ ...p, equipments: p.equipments.map((e) => (e.id === c.id ? { ...e, flow: 'N' as const } : e)) });
    expect(p.links.filter((l) => l.to.eq === m.id).map((l) => l.from.ch)).toEqual([1]);
    expect(findEq(p, m.id)!.dockSide).toBe('left');
  });
});

describe('glisser une machine posée sur le tapis', () => {
  it('le valoriste lâché avant le robot passe avant lui ; lâché de l’autre côté, il change de canal', () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 300, 300, { channels: 2 }).p;
    const c = p.equipments[0].id;
    const r = addEq(cat, p, 'ROBO', 305, 300);
    p = dockOnDrop(r.p, r.id);
    const k = addEq(cat, p, 'PICK', 305, 260);
    p = dockOnDrop(k.p, k.id);
    expect(box(p, k.id).cx).toBeGreaterThan(box(p, r.id).cx);
    // Glissé en amont du robot.
    const moved = { ...p, equipments: p.equipments.map((e) => (e.id === k.id ? { ...e, x: box(p, r.id).x0 - 30 } : e)) };
    p = dockOnDrop(moved, k.id);
    expect(box(p, k.id).cx).toBeLessThan(box(p, r.id).cx);
    // Glissé sous le tapis : canal 2 (côté droit du flux).
    const below = { ...p, equipments: p.equipments.map((e) => (e.id === k.id ? { ...e, y: box(p, c).y1 + 10 } : e)) };
    p = dockOnDrop(below, k.id);
    expect(p.links.filter((l) => l.to.eq === k.id).map((l) => l.from.ch)).toEqual([2]);
  });
  it('robot réduit à un canal puis déplacé : il garde son seul canal', () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 300, 300, { channels: 3 }).p;
    const r = addEq(cat, p, 'ROBO', 305, 300);
    p = uncover(uncover(dockOnDrop(r.p, r.id), r.id, 1), r.id, 2);
    const moved = { ...p, equipments: p.equipments.map((e) => (e.id === r.id ? { ...e, x: e.x - 5 } : e)) };
    p = dockOnDrop(moved, r.id);
    expect(p.links.filter((l) => l.to.eq === r.id).map((l) => l.from.ch)).toEqual([3]);
  });
});

describe('place libre le long du tapis', () => {
  it('valoriste de droite glissé à la hauteur de celui de gauche : il s’y aligne, ses liens ne changent pas', () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 300, 300, { channels: 2 }).p;
    const c = p.equipments[0].id;
    const drop = (y: number) => {
      const m = addEq(cat, p, 'PICK', 305, y);
      p = dockOnDrop(m.p, m.id);
      return m.id;
    };
    const left = drop(250);
    drop(250);
    const r1 = drop(350);
    const r2 = drop(350);
    const before = p.links.filter((l) => l.to.eq === r2).map((l) => [l.from.ch, l.from.num]);
    const target = box(p, left).cx;
    const moved = { ...p, equipments: p.equipments.map((e) => (e.id === r1 ? { ...e, x: target } : e)) };
    p = dockOnDrop(moved, r1);
    expect(box(p, r1).cx).toBeCloseTo(target, 0);
    expect(p.links.filter((l) => l.to.eq === r2).map((l) => [l.from.ch, l.from.num])).toEqual(before);
    expect(box(p, c).x0).toBeLessThanOrEqual(box(p, r1).x0);
  });
});

describe('robot vers des goulottes des deux côtés', () => {
  it('chaque sortie part du côté du tapis où est l’équipement relié (automatique)', () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 300, 300).p;
    const r = addEq(cat, p, 'ROBO', 305, 300);
    p = dockOnDrop(r.p, r.id);
    const up = findEq(p, r.id)!.flow;
    const a = addEq(cat, p, 'BELT', 300, 150);
    const b = addEq(cat, a.p, 'BELT', 300, 450);
    p = connect(b.p, { eq: r.id, ch: 1, dir: 'avant', num: 1 }, { eq: a.id, ch: 1 });
    p = connect(addOutput(p, r.id, 1, 'avant').p, { eq: r.id, ch: 1, dir: 'avant', num: 2 }, { eq: b.id, ch: 1 });
    void up;
    const rb = box(p, r.id);
    const start = (to: string) => routeAll(p).links.find((l) => l.link.from.eq === r.id && l.link.to.eq === to)!.points[0];
    expect(start(a.id)[1]).toBeLessThan(rb.cy);
    expect(start(b.id)[1]).toBeGreaterThan(rb.cy);
  });
});

describe('machine de séparation posée sur un tapis', () => {
  it('une seule sortie (positive) : le négatif est le tapis qui continue', () => {
    let p = addEq(cat, emptyPivot(cat), 'BELT', 300, 300).p;
    const o = addEq(cat, p, 'OPSO', 305, 300);
    expect(findEq(o.p, o.id)!.channels[0].outputs).toHaveLength(2);
    p = dockOnDrop(o.p, o.id);
    expect(findEq(p, o.id)!.channels[0].outputs).toHaveLength(1);
  });
});
