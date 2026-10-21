// Un équipement sur le PID : forme du HG0, repère, cadres d'état d'édition.
import { memo } from 'react';
import { chCuts, eqBox, hg0Of } from '../model/geometry';
import type { Eq } from '../model/pivot';
import { haloOf, labelPos, Shape, Tag } from './symbols';

interface Props {
  eq: Eq;
  selected: boolean;
  incomplete: boolean;
  fault: boolean;
  onDown: (e: React.PointerEvent, id: string) => void;
  onHover: (id: string | null) => void;
  /** Repère au-dessus de la forme (machine accolée au-dessus d'un convoyeur : le dessous est pris). */
  labelAbove?: boolean;
}

export const EqNode = memo(function EqNode({ eq, selected, incomplete, fault, onDown, onHover, labelAbove }: Props) {
  const box = eqBox(eq);
  const hg0 = hg0Of(eq);
  const base = labelPos(hg0, box);
  const lp = labelAbove && base.outside ? { ...base, y: box.y0 - 9 } : base;
  const { w, h } = box;
  return (
    <g
      data-eq={eq.id}
      onPointerDown={(e) => onDown(e, eq.id)}
      onPointerEnter={() => onHover(eq.id)}
      onPointerLeave={() => onHover(null)}
      style={{ cursor: 'move' }}
    >
      <rect x={box.x0 - 4} y={box.y0 - (lp.outside && labelAbove ? 16 : 4)} width={w + 8} height={h + (lp.outside ? 20 : 8)} fill="transparent" />
      {selected && <rect x={box.x0 - 5} y={box.y0 - 5} width={w + 10} height={h + 10} rx={6} fill="none" stroke="var(--pid-select)" strokeWidth={1.5} />}
      {incomplete && !fault && (
        <rect x={box.x0 - (selected ? 8 : 4)} y={box.y0 - (selected ? 8 : 4)} width={w + (selected ? 16 : 8)} height={h + (selected ? 16 : 8)} rx={7} fill="none" stroke="var(--pid-warn)" strokeWidth={1.2} strokeDasharray="4 3" />
      )}
      <Shape hg0={hg0} box={box} flow={eq.flow} channels={eq.channels.length} fault={fault} cuts={chCuts(eq)} />
      <Tag text={eq.repere || '?'} x={lp.x} y={lp.y} outside={lp.outside} halo={haloOf(hg0, fault)} />
    </g>
  );
});
