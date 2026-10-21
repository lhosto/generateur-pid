// Réorganisation des équipements (bouton « Réorganiser ») : ELK, algorithme en couches (Sugiyama).
// ELK ne fait que PLACER les équipements : les traits restent ceux de l'utilisateur (qui va où, canal,
// numéro de sortie) et sont redessinés ensuite par notre routage (route.ts), avec ses règles.
// Les points de départ et d'arrivée sont donnés à ELK à leur position exacte (portConstraints
// FIXED_POS) : côté imposé par le flux, 1.2 à droite de 1.1, arrivée par l'arrière.
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { boxAt, CHUTE_SIZE, eqBox, GRID, opposite, overlaps, sideOffset, snap, type Box } from './geometry';
import type { Flow, Pivot } from './pivot';
import { anchor, channelAnchor, departureSide, portOffset } from './route';
import { straighten } from './straighten';
import { setPositions } from './ops';

const ELK_SIDE: Record<Flow, string> = { E: 'EAST', W: 'WEST', N: 'NORTH', S: 'SOUTH' };
const ELK_DIR: Record<Flow, string> = { E: 'RIGHT', W: 'LEFT', N: 'UP', S: 'DOWN' };

/** Marge autour du schéma réorganisé, dans l'écran 1920 × 1080. */
const MARGIN = 60;

/** Sens du flux le plus fréquent : sens général du rangement. */
function mainFlow(p: Pivot, ids: Set<string>): Flow {
  const n: Record<Flow, number> = { E: 0, W: 0, N: 0, S: 0 };
  for (const e of p.equipments) if (ids.has(e.id)) n[e.flow]++;
  return (Object.keys(n) as Flow[]).sort((a, b) => n[b] - n[a])[0];
}

export interface LayoutResult {
  p: Pivot;
  /** Encombrement du schéma réorganisé (pour signaler un dépassement de l'écran). */
  bounds: Box;
}

/**
 * Réorganise les équipements (tous, ou seulement `only`) : rangement en colonnes dans le sens du flux,
 * croisements réduits, ordre actuel conservé autant que possible. Les liens vers des équipements hors
 * sélection ne sont pas pris en compte. Les goulottes sont rangées avec le reste (réorganisation
 * complète) ; sur une sélection, elles ne bougent pas.
 */
export async function reorganize(p: Pivot, only?: Set<string>): Promise<LayoutResult> {
  const ids = new Set(p.equipments.filter((e) => !only || only.has(e.id)).map((e) => e.id));
  const eqs = p.equipments.filter((e) => ids.has(e.id));
  const boxes = new Map(eqs.map((e) => [e.id, eqBox(e)]));
  const children: ElkNode[] = eqs.map((e) => {
    const b = boxes.get(e.id)!;
    const ports: NonNullable<ElkNode['ports']> = [];
    // Sorties : une par sortie déclarée, à sa position exacte.
    e.channels.forEach((c, ci) => {
      for (const o of c.outputs) {
        const side = departureSide(e, o.dir);
        const [x, y] = anchor(b, side, sideOffset(e, side, ci + 1) + portOffset(e, b, ci + 1, o.dir, o.num));
        ports.push({ id: `${e.id}|o|${ci + 1}|${o.dir}|${o.num}`, x: x - b.x0, y: y - b.y0, width: 0, height: 0, layoutOptions: { 'elk.port.side': ELK_SIDE[side] } });
      }
      // Arrivée : par l'arrière, sur l'axe du canal.
      const side = opposite(e.flow);
      const [x, y] = channelAnchor(e, b, side, ci + 1);
      ports.push({ id: `${e.id}|i|${ci + 1}`, x: x - b.x0, y: y - b.y0, width: 0, height: 0, layoutOptions: { 'elk.port.side': ELK_SIDE[side] } });
    });
    return { id: e.id, x: b.x0, y: b.y0, width: b.w, height: b.h, ports, layoutOptions: { 'elk.portConstraints': 'FIXED_POS' } };
  });
  // Goulottes (objets de dessin) : rangées comme des objets isolés, pour qu'aucun équipement ne s'y pose.
  if (!only)
    for (const c of p.chutes) {
      const b = boxAt(c.x, c.y, CHUTE_SIZE.w, CHUTE_SIZE.h);
      boxes.set(c.id, b);
      children.push({ id: c.id, x: b.x0, y: b.y0, width: b.w, height: b.h });
    }
  const edges = p.links
    .filter((l) => ids.has(l.from.eq) && ids.has(l.to.eq) && l.from.eq !== l.to.eq)
    .map((l) => ({
      id: l.id,
      sources: [`${l.from.eq}|o|${l.from.ch}|${l.from.dir}|${l.from.num}`],
      targets: [`${l.to.eq}|i|${l.to.ch}`],
    }));
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': ELK_DIR[mainFlow(p, ids)],
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.spacing.edgeNode': '20',
      'elk.spacing.edgeEdge': '10',
      'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '60',
      // Ordre actuel conservé autant que possible (l'utilisateur garde la main sur la disposition).
      'elk.layered.crossingMinimization.semiInteractive': 'true',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
    },
    children,
    edges,
  };
  const out = await new ELK().layout(graph);

  // Position d'origine : coin haut-gauche de la sélection, sinon la marge de l'écran.
  const origin = only
    ? { x: Math.min(...[...boxes.values()].map((b) => b.x0)), y: Math.min(...[...boxes.values()].map((b) => b.y0)) }
    : { x: MARGIN, y: MARGIN };
  const pos: Record<string, { x: number; y: number }> = {};
  for (const n of out.children ?? []) {
    const b = boxes.get(n.id)!;
    pos[n.id] = { x: snap(origin.x + (n.x ?? 0) + b.w / 2), y: snap(origin.y + (n.y ?? 0) + b.h / 2) };
  }
  let next = setPositions(p, pos);
  // Alignement fin sur les axes de canal (arrondi à la grille), sans chevauchement.
  next = straighten(next, only ? ids : undefined);
  const moved = [...next.equipments.filter((e) => ids.has(e.id)).map(eqBox), ...(only ? [] : next.chutes.map((c) => boxAt(c.x, c.y, CHUTE_SIZE.w, CHUTE_SIZE.h)))];
  const bounds: Box = {
    x0: Math.min(...moved.map((b) => b.x0)),
    y0: Math.min(...moved.map((b) => b.y0)),
    x1: Math.max(...moved.map((b) => b.x1)),
    y1: Math.max(...moved.map((b) => b.y1)),
    cx: 0, cy: 0, w: 0, h: 0,
  };
  bounds.w = bounds.x1 - bounds.x0;
  bounds.h = bounds.y1 - bounds.y0;
  return { p: next, bounds };
}

/** Équipements qui se chevauchent après réorganisation (contrôle). */
export function overlapping(p: Pivot): number {
  const b = [...p.equipments.map(eqBox), ...p.chutes.map((c) => boxAt(c.x, c.y, CHUTE_SIZE.w, CHUTE_SIZE.h))];
  let n = 0;
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) if (overlaps(b[i], b[j], GRID / 2)) n++;
  return n;
}
