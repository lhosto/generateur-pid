// Alignement des traits : un lien est droit quand l'axe du canal de départ et celui du canal d'arrivée
// coïncident. « Redresser » déplace les EQ presque alignés pour que leurs liens deviennent droits ;
// l'aimantation propose les mêmes positions pendant un glisser.
import { eqBox, isHorizontal, overlaps, sideOffset, type Box } from './geometry';
import type { Dir, Eq, Flow, Pivot } from './pivot';
import { arrivalSide, departureSide } from './route';

interface Edge {
  from: string;
  to: string;
  /** Décalage d'axe sur chaque extrémité : coord(to) + offTo = coord(from) + offFrom. */
  offFrom: number;
  offTo: number;
}

/** Relation d'un lien : côté de départ face à l'arrivée, axe à aligner (y si côté E/W, x si N/S). */
/**
 * Relation d'un lien pour l'alignement : côtés de départ et d'arrivée imposés (sens du flux, arrivée
 * par l'arrière ou le milieu). Un trait ne peut être droit que si ces deux côtés se font face sur le
 * même axe ; sinon (départ en bas, arrivée à gauche…) rien à aligner.
 */
function relation(a: Eq, ab: Box, chA: number, dir: Dir, b: Eq, bb: Box, chB: number): { axis: 'x' | 'y'; offA: number; offB: number } | null {
  const sSide: Flow = departureSide(a, dir);
  const tSide: Flow = arrivalSide(b, ab, bb);
  if (isHorizontal(sSide) !== isHorizontal(tSide)) return null;
  return { axis: isHorizontal(sSide) ? 'y' : 'x', offA: sideOffset(a, sSide, chA), offB: sideOffset(b, tSide, chB) };
}

/**
 * Redresse les liens presque alignés (écart ≤ tol). Par composante de liens alignables, un EQ de
 * référence reste en place (celui qui a le plus de canaux, sinon le plus relié) et les autres prennent
 * l'axe du canal auquel ils sont reliés. Avec `only`, seuls ces EQ bougent. Un EQ qui chevaucherait
 * un autre reste en place. Rend le nouveau pivot.
 */
export function straighten(p: Pivot, only?: Set<string>, tol = 40): Pivot {
  const eqs = new Map(p.equipments.map((e) => [e.id, { ...e }]));
  for (const axis of ['y', 'x'] as const) {
    const edges: Edge[] = [];
    const boxes = new Map([...eqs.values()].map((e) => [e.id, eqBox(e)]));
    for (const l of p.links) {
      if (l.from.eq === l.to.eq) continue;
      const a = eqs.get(l.from.eq);
      const b = eqs.get(l.to.eq);
      if (!a || !b) continue;
      const r = relation(a, boxes.get(a.id)!, l.from.ch, l.from.dir, b, boxes.get(b.id)!, l.to.ch);
      if (!r || r.axis !== axis) continue;
      if (Math.abs(a[axis] + r.offA - (b[axis] + r.offB)) > tol) continue;
      edges.push({ from: a.id, to: b.id, offFrom: r.offA, offTo: r.offB });
    }
    const adj = new Map<string, { other: string; offSelf: number; offOther: number }[]>();
    const add = (k: string, v: { other: string; offSelf: number; offOther: number }) => {
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k)!.push(v);
    };
    for (const e of edges) {
      add(e.from, { other: e.to, offSelf: e.offFrom, offOther: e.offTo });
      add(e.to, { other: e.from, offSelf: e.offTo, offOther: e.offFrom });
    }
    const done = new Set<string>();
    const weight = (id: string) => eqs.get(id)!.channels.length * 100 + (adj.get(id)?.length ?? 0);
    const nodes = [...adj.keys()].sort((a, b) => weight(b) - weight(a));
    for (const start of nodes) {
      if (done.has(start)) continue;
      // Composante : sources fixes = EQ hors sélection (avec `only`), sinon l'EQ de référence.
      const comp: string[] = [];
      const stack = [start];
      const seen = new Set([start]);
      while (stack.length) {
        const u = stack.pop()!;
        comp.push(u);
        for (const n of adj.get(u) ?? []) if (!seen.has(n.other)) (seen.add(n.other), stack.push(n.other));
      }
      const fixed = only ? comp.filter((id) => !only.has(id)) : [];
      // Référence : l'EQ qui fait bouger le moins d'EQ (un EQ décalé revient sur la rangée, la rangée
      // ne le suit pas) ; à égalité, celui qui a le plus de canaux puis de liens.
      const moves = (ref: string) => {
        const at = new Map([[ref, eqs.get(ref)![axis]]]);
        const q = [ref];
        let n = 0;
        while (q.length) {
          const u = q.shift()!;
          for (const e of adj.get(u) ?? []) {
            if (at.has(e.other)) continue;
            const want = at.get(u)! + e.offSelf - e.offOther;
            at.set(e.other, want);
            if (want !== eqs.get(e.other)![axis]) n++;
            q.push(e.other);
          }
        }
        return n;
      };
      const ranked = comp.map((id) => ({ id, m: moves(id), w: weight(id) })).sort((a, b) => a.m - b.m || b.w - a.w);
      const queue = fixed.length ? fixed : [ranked[0].id];
      for (const q of queue) done.add(q);
      while (queue.length) {
        const u = queue.shift()!;
        const eu = eqs.get(u)!;
        for (const n of adj.get(u) ?? []) {
          if (done.has(n.other)) continue;
          done.add(n.other);
          const ev = eqs.get(n.other)!;
          const want = eu[axis] + n.offSelf - n.offOther;
          if (want !== ev[axis] && (!only || only.has(ev.id))) {
            const moved = { ...ev, [axis]: want };
            const mb = eqBox(moved);
            const blocked = [...eqs.values()].some((o) => o.id !== ev.id && overlaps(eqBox(o), mb, 4));
            if (!blocked) eqs.set(ev.id, moved);
          }
          queue.push(n.other);
        }
      }
    }
  }
  const changed = p.equipments.some((e) => {
    const n = eqs.get(e.id)!;
    return n.x !== e.x || n.y !== e.y;
  });
  if (!changed) return p;
  return { ...p, equipments: p.equipments.map((e) => eqs.get(e.id)!), site: { ...p.site, modifiedAt: new Date().toISOString() } };
}

/**
 * Aimantation : positions du centre de l'EQ déplacé (cx, cy) qui rendraient droits ses liens vers les
 * EQ immobiles. Rend les x et y candidats.
 */
export function axisCandidates(p: Pivot, eqId: string, cx: number, cy: number, moving: Set<string>): { xs: number[]; ys: number[] } {
  const me = p.equipments.find((e) => e.id === eqId);
  const xs: number[] = [];
  const ys: number[] = [];
  if (!me) return { xs, ys };
  const mine = { ...me, x: cx, y: cy };
  const myBox = eqBox(mine);
  for (const l of p.links) {
    const outgoing = l.from.eq === eqId;
    const incoming = l.to.eq === eqId;
    if (!outgoing && !incoming) continue;
    const otherId = outgoing ? l.to.eq : l.from.eq;
    if (otherId === eqId || moving.has(otherId)) continue;
    const other = p.equipments.find((e) => e.id === otherId);
    if (!other) continue;
    const ob = eqBox(other);
    const r = outgoing
      ? relation(mine, myBox, l.from.ch, l.from.dir, other, ob, l.to.ch)
      : relation(other, ob, l.from.ch, l.from.dir, mine, myBox, l.to.ch);
    if (!r) continue;
    const offMine = outgoing ? r.offA : r.offB;
    const offOther = outgoing ? r.offB : r.offA;
    const want = other[r.axis] + offOther - offMine;
    (r.axis === 'x' ? xs : ys).push(want);
  }
  return { xs, ys };
}

