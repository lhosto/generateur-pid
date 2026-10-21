import { describe, expect, it } from 'vitest';
import catJson from '../catalogue.json';
import type { Catalogue } from './catalogue';
import { siteTest } from '../fictif/siteTest.fictif';
import { overlapping, reorganize } from './layout';
import { routeAll } from './route';

const cat = catJson as unknown as Catalogue;

describe('réorganiser (ELK)', () => {
  it('site de test : liens inchangés, aucun chevauchement, tient dans l\'écran', async () => {
    const p = siteTest(cat);
    const { p: q, bounds } = await reorganize(p);
    expect(q.links).toEqual(p.links);
    expect(q.equipments.map((e) => e.channels)).toEqual(p.equipments.map((e) => e.channels));
    expect(overlapping(q)).toBe(0);
    expect(bounds.w <= 1920 - 120 && bounds.h <= 1080 - 120).toBe(true);
    expect(routeAll(q).links).toHaveLength(p.links.length);
  });
  it('équipements mélangés : rangés sans chevauchement, liens inchangés', async () => {
    const p = siteTest(cat);
    let k = 7;
    const r = () => (k = (k * 9301 + 49297) % 233280) / 233280;
    const mixed = { ...p, equipments: p.equipments.map((e) => ({ ...e, x: 100 + Math.round(r() * 170) * 10, y: 100 + Math.round(r() * 85) * 10 })) };
    const { p: q } = await reorganize(mixed);
    expect(q.links).toEqual(p.links);
    expect(overlapping(q)).toBe(0);
  });
});
