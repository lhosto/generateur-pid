// Un équipement sur le PID : forme du HG0 (ou cartouche s'il est accolé à un tapis), repère, cadres
// d'état d'édition.
import { memo } from 'react';
import { labelSideOf } from '../model/dock';
import { baseOf, chCuts, eqBox, FONT, hg0Of, isHorizontal, textWidth, type Box } from '../model/geometry';
import type { Eq, Flow } from '../model/pivot';
import { DockedCard, haloOf, labelPos, Shape, Tag } from './symbols';

interface Props {
  eq: Eq;
  selected: boolean;
  incomplete: boolean;
  fault: boolean;
  onDown: (e: React.PointerEvent, id: string) => void;
  onHover: (id: string | null) => void;
  /** Machine accolée : boîte et sens du flux de son tapis (repère côté amont, coins du bout du tapis). */
  belt?: { box: Box; flow: Flow };
}

/**
 * Repère d'une machine accolée. Valoriste : côté amont du tapis. Machine superposée : à l'opposé de sa
 * sortie (sortie vers le haut → repère dessous).
 */
function dockedLabel(eq: Eq, b: Box, flow: Flow, belt?: Box): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const side = labelSideOf(eq, flow);
  if (side) {
    // Machine superposée : côté choisi dans sa fiche (défaut : à l'opposé de sa sortie). Tapis vertical :
    // à l'extérieur du tapis, centré sur la machine ; tapis horizontal : dessus / dessous de la machine.
    if (side === 'left') return { x: (belt ?? b).x0 - 3, y: b.cy, anchor: 'end' };
    if (side === 'right') return { x: (belt ?? b).x1 + 3, y: b.cy, anchor: 'start' };
    return side === 'top' ? { x: b.cx, y: b.y0 - FONT.tag / 2 - 2, anchor: 'middle' } : { x: b.cx, y: b.y1 + FONT.tag / 2 + 2, anchor: 'middle' };
  }
  // Tapis vertical : repère du valoriste sur son côté extérieur, un peu remonté (sa sortie passe dessous).
  if (!isHorizontal(flow) && belt) {
    const out = b.cx < belt.cx;
    // Décalé vers l'amont (au-dessus pour un flux vers le bas, en dessous pour un flux vers le haut) : la
    // place est réservée de ce côté au rangement.
    return { x: out ? b.x0 - 3 : b.x1 + 3, y: b.cy + (flow === 'N' ? 1 : -1) * FONT.tag * 0.55, anchor: out ? 'end' : 'start' };
  }
  const room = 3;
  switch (flow) {
    case 'E': return { x: b.x0 - room, y: b.cy, anchor: 'end' };
    case 'W': return { x: b.x1 + room, y: b.cy, anchor: 'start' };
    case 'S': return { x: b.cx, y: b.y0 - room - FONT.tag / 2, anchor: 'middle' };
    default: return { x: b.cx, y: b.y1 + room + FONT.tag / 2, anchor: 'middle' };
  }
}

export const EqNode = memo(function EqNode({ eq, selected, incomplete, fault, onDown, onHover, belt }: Props) {
  const box = eqBox(eq);
  const hg0 = hg0Of(eq);
  const docked = !!(eq.dockSize && belt);
  // Tapis allongé : repère à l'entrée (à la verticale, il ne prend que sa hauteur le long du flux).
  const entry = isHorizontal(eq.flow) ? textWidth(eq.repere || '?') / 2 + 6 : FONT.tag / 2 + 5;
  // Séparation : repère calé côté entrée (étroit), le marqueur garde le côté sorties.
  const flare = baseOf(eq) === 'flare' && !docked;
  const lp = labelPos(hg0, box, eq.flow, eq.len !== undefined || flare ? entry : undefined);
  const dl = docked ? dockedLabel(eq, box, belt!.flow, belt!.box) : null;
  const { w, h } = box;
  return (
    <g
      data-eq={eq.id}
      onPointerDown={(e) => onDown(e, eq.id)}
      onPointerEnter={() => onHover(eq.id)}
      onPointerLeave={() => onHover(null)}
      style={{ cursor: 'move' }}
    >
      <rect x={box.x0 - 4} y={box.y0 - 4} width={w + 8} height={h + (lp.outside && !docked ? 20 : 8)} fill="transparent" />
      {selected && <rect x={box.x0 - 5} y={box.y0 - 5} width={w + 10} height={h + 10} rx={6} fill="none" stroke="var(--pid-select)" strokeWidth={1.5} />}
      {incomplete && !fault && (
        <rect x={box.x0 - (selected ? 8 : 4)} y={box.y0 - (selected ? 8 : 4)} width={w + (selected ? 16 : 8)} height={h + (selected ? 16 : 8)} rx={7} fill="none" stroke="var(--pid-warn)" strokeWidth={1.2} strokeDasharray="4 3" />
      )}
      {docked ? (
        <>
          <DockedCard hg0={hg0} box={box} belt={belt!.box} beltFlow={belt!.flow} channels={eq.channels.length} fault={fault} />
          {/* Liseré couleur du tapis si le repère est posé dessus, couleur du fond sinon. */}
          <Tag text={eq.repere || '?'} x={dl!.x} y={dl!.y} anchor={dl!.anchor} halo={dl!.y > belt!.box.y0 && dl!.y < belt!.box.y1 && dl!.x > belt!.box.x0 && dl!.x < belt!.box.x1 ? 'var(--pid-body)' : 'var(--pid-bg)'} />
        </>
      ) : (
        <>
          <Shape hg0={hg0} box={box} flow={eq.flow} channels={eq.channels.length} fault={fault} cuts={chCuts(eq)} />
          {/* Forme étroite (convoyeur vertical) : le repère déborde, liseré couleur fond pour rester lisible. */}
          <Tag text={eq.repere || '?'} x={lp.x} y={lp.y} outside={lp.outside} halo={box.w < 30 ? 'var(--pid-bg)' : haloOf(hg0, fault)} />
        </>
      )}
    </g>
  );
});
