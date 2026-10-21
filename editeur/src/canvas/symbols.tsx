// Rendu des symboles PID : forme de base du HG0 + pictogramme (model/symbols.ts), style du
// synoptique SCADA 2026 en version édition (pas de barre d'état ni de couleur d'animation).
// Seule une erreur de génération colore la forme (rouge défaut).
import { memo } from 'react';
import { CH_PITCH, isHorizontal, type Box } from '../model/geometry';
import type { Flow } from '../model/pivot';
import { symbolOf, type Base } from '../model/symbols';

const LOOK: Record<Base, { fill: string; stroke: string; sw: number; dash?: string }> = {
  pill: { fill: 'var(--pid-tile)', stroke: 'var(--pid-stroke)', sw: 1 },
  card: { fill: 'var(--pid-card)', stroke: 'var(--pid-stroke-card)', sw: 1.5 },
  screen: { fill: 'var(--pid-tile)', stroke: 'var(--pid-stroke-light)', sw: 1.5 },
  grid: { fill: 'var(--pid-card)', stroke: 'var(--pid-stroke-card)', sw: 1.5 },
  diamond: { fill: 'var(--pid-tile)', stroke: 'var(--pid-stroke-diamond)', sw: 1.5 },
  para: { fill: 'var(--pid-tile)', stroke: 'var(--pid-stroke-light)', sw: 1.5 },
  circle: { fill: '#4a524e', stroke: 'var(--pid-stroke-card)', sw: 1.2 },
  silo: { fill: 'var(--pid-chute)', stroke: 'var(--pid-stroke-card)', sw: 1.5 },
  hopper: { fill: 'var(--pid-tile)', stroke: 'var(--pid-stroke-light)', sw: 1.5 },
  cabinet: { fill: 'var(--pid-band)', stroke: '#8d9791', sw: 1 },
  desk: { fill: 'var(--pid-band)', stroke: '#8d9791', sw: 1 },
  unknown: { fill: 'var(--pid-tile)', stroke: '#8d9791', sw: 1, dash: '3 3' },
};

const RADIUS: Partial<Record<Base, number>> = { pill: 5, card: 7, screen: 4, grid: 4, cabinet: 2, unknown: 4 };

/** Pictogramme : à gauche dans les formes allongées, au centre dans losanges et ronds. */
/** Forme allongée posée à la verticale (flux vers le haut ou le bas). */
const tall = (b: Box) => b.h > b.w;

function pictoAt(base: Base, b: Box): { x: number; y: number; s: number } | null {
  if (base === 'diamond' || base === 'circle') return { x: b.cx - 6, y: b.cy - 6, s: 1 };
  if (base === 'silo') return { x: b.cx - 4.2, y: b.y1 - 12, s: 0.7 };
  if (base === 'grid' || base === 'hopper') return null;
  if (tall(b)) return { x: b.cx - 6, y: b.y0 + (base === 'para' ? 10 : 7), s: 1 };
  return { x: b.x0 + (base === 'para' ? 10 : 7), y: b.cy - 6, s: 1 };
}

/** Position du repère : dans la forme, décalé si pictogramme ; sous la forme pour losange/rond à pictogramme. */
export function labelPos(hg0: string, b: Box): { x: number; y: number; outside: boolean } {
  const spec = symbolOf(hg0);
  if (spec.picto && (spec.base === 'diamond' || spec.base === 'circle')) return { x: b.cx, y: b.y1 + 9, outside: true };
  if (spec.base === 'circle') return { x: b.cx, y: b.cy, outside: false };
  if (spec.base === 'silo') return { x: b.cx, y: b.cy - 4, outside: false };
  if (spec.picto && pictoAt(spec.base, b)) return tall(b) ? { x: b.cx, y: b.cy + 7, outside: false } : { x: b.cx + 7, y: b.cy, outside: false };
  return { x: b.cx, y: b.cy, outside: false };
}

/** Couleur de fond derrière le repère (halo qui masque pictogrammes et séparations). */
export const haloOf = (hg0: string, fault?: boolean) => (fault ? 'var(--pid-fault)' : LOOK[symbolOf(hg0).base].fill);

function outline(base: Base, b: Box, p: { fill: string; stroke: string; sw: number; dash?: string }) {
  const common = { fill: p.fill, stroke: p.stroke, strokeWidth: p.sw, strokeDasharray: p.dash, strokeLinejoin: 'round' as const };
  switch (base) {
    case 'diamond':
      return <path d={`M${b.cx} ${b.y0}L${b.x1} ${b.cy}L${b.cx} ${b.y1}L${b.x0} ${b.cy}Z`} {...common} />;
    case 'para':
      return tall(b)
        ? <path d={`M${b.x0} ${b.y0 + 8}L${b.x1} ${b.y0}V${b.y1 - 8}L${b.x0} ${b.y1}Z`} {...common} />
        : <path d={`M${b.x0 + 8} ${b.y0}H${b.x1}L${b.x1 - 8} ${b.y1}H${b.x0}Z`} {...common} />;
    case 'circle':
      return <ellipse cx={b.cx} cy={b.cy} rx={b.w / 2} ry={b.h / 2} {...common} />;
    case 'silo':
      return <path d={`M${b.x0} ${b.y0}H${b.x1}V${b.y1 - 11}L${b.cx + 6} ${b.y1}H${b.cx - 6}L${b.x0} ${b.y1 - 11}Z`} {...common} />;
    case 'hopper':
      return <path d={`M${b.x0} ${b.y0}H${b.x1}L${b.x1 - 10} ${b.y1}H${b.x0 + 10}Z`} {...common} />;
    case 'desk':
      return <path d={`M${b.x0} ${b.y1}V${b.y0 + 9}L${b.x0 + 10} ${b.y0}H${b.x1 - 10}L${b.x1} ${b.y0 + 9}V${b.y1}Z`} {...common} />;
    default:
      return <rect x={b.x0} y={b.y0} width={b.w} height={b.h} rx={RADIUS[base] ?? 4} {...common} />;
  }
}

/** Décors propres à la forme de base (diagonale du crible, grille du crible à disques). */
function decor(hg0: string, base: Base, b: Box) {
  if (base === 'screen') return <path d={`M${b.x0 + 2} ${b.y1 - 2}L${b.x1 - 2} ${b.y0 + 2}`} stroke="var(--pid-divider)" strokeWidth={1} />;
  if (base === 'grid') {
    // Disques perpendiculaires au flux, deux lisses dans le sens du flux.
    const d: string[] = [];
    let thirds = '';
    if (tall(b)) {
      for (let y = b.y0 + 8; y <= b.y1 - 7; y += 7) d.push(`M${b.x0 + 6} ${y}h${b.w - 12}`);
      d.push(`M${b.cx - 4} ${b.y0 + 4}v${b.h - 8}`, `M${b.cx + 4} ${b.y0 + 4}v${b.h - 8}`);
      if (hg0 === 'SCD3') thirds = `M${b.x0 + 2} ${b.y0 + b.h / 3}H${b.x1 - 2}M${b.x0 + 2} ${b.y0 + (2 * b.h) / 3}H${b.x1 - 2}`;
    } else {
      for (let x = b.x0 + 8; x <= b.x1 - 7; x += 7) d.push(`M${x} ${b.y0 + 6}v${b.h - 12}`);
      d.push(`M${b.x0 + 4} ${b.cy - 4}h${b.w - 8}`, `M${b.x0 + 4} ${b.cy + 4}h${b.w - 8}`);
      if (hg0 === 'SCD3') thirds = `M${b.x0 + b.w / 3} ${b.y0 + 2}V${b.y1 - 2}M${b.x0 + (2 * b.w) / 3} ${b.y0 + 2}V${b.y1 - 2}`;
    }
    return (
      <g>
        <path d={d.join(' ')} stroke="#8d9791" strokeWidth={0.8} />
        {thirds && <path d={thirds} stroke="var(--pid-stroke-card)" strokeWidth={1.6} />}
      </g>
    );
  }
  return null;
}

/** Séparations de canaux, parallèles au flux (comme les trieurs multicanaux du PID actuel). */
function dividers(base: Base, b: Box, flow: Flow, n: number) {
  if (n < 2) return null;
  const pointy = base === 'diamond' || base === 'circle';
  const d: string[] = [];
  for (let k = 1; k < n; k++) {
    const mid = (k - n / 2) * CH_PITCH;
    if (isHorizontal(flow)) {
      const y = b.cy + mid;
      const inset = pointy ? b.w * 0.3 : 5;
      d.push(`M${b.x0 + inset} ${y}H${b.x1 - inset}`);
    } else {
      const x = b.cx + mid;
      const inset = pointy ? b.h * 0.3 : 5;
      d.push(`M${x} ${b.y0 + inset}V${b.y1 - inset}`);
    }
  }
  return <path d={d.join(' ')} stroke="var(--pid-divider)" strokeWidth={1} strokeDasharray="3 2" />;
}

export const Shape = memo(function Shape({ hg0, box, flow, channels, fault }: { hg0: string; box: Box; flow: Flow; channels: number; fault?: boolean }) {
  const spec = symbolOf(hg0);
  const look = fault ? { fill: 'var(--pid-fault)', stroke: 'var(--pid-fault-stroke)', sw: 1.5 } : LOOK[spec.base];
  const at = spec.picto ? pictoAt(spec.base, box) : null;
  return (
    <g>
      {outline(spec.base, box, look)}
      {decor(hg0, spec.base, box)}
      {dividers(spec.base, box, flow, channels)}
      {at && spec.picto && (
        <path
          d={spec.picto}
          transform={`translate(${at.x} ${at.y}) scale(${at.s})`}
          fill="none"
          stroke={fault ? '#ffd7d3' : 'var(--pid-picto)'}
          strokeWidth={1.1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
});

export function Tag({ text, x, y, dim, outside, halo }: { text: string; x: number; y: number; dim?: boolean; outside?: boolean; halo?: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      style={{
        font: `${dim ? 500 : 600} ${outside ? 10 : 11}px var(--font-tag)`,
        fill: dim ? 'var(--pid-text-dim)' : 'var(--pid-text)',
        paintOrder: 'stroke',
        stroke: outside ? 'var(--pid-bg)' : (halo ?? 'none'),
        strokeWidth: outside || halo ? 3 : 0,
        strokeLinejoin: 'round',
        pointerEvents: 'none',
      }}
    >
      {text}
    </text>
  );
}

/** Goulotte de tri : bande verticale avec son libellé. */
export function ChuteShape({ x, y, label, selected }: { x: number; y: number; label: string; selected?: boolean }) {
  return (
    <g>
      {selected && <rect x={x - 16} y={y - 57} width={32} height={114} rx={9} fill="none" stroke="var(--pid-select)" strokeWidth={1.5} />}
      <rect x={x - 11} y={y - 52} width={22} height={104} rx={7} fill="var(--pid-chute)" stroke="var(--pid-stroke)" strokeWidth={1} />
      <text
        transform={`translate(${x} ${y}) rotate(-90)`}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ font: '500 9.5px var(--font-sans)', fill: 'var(--pid-caption)', pointerEvents: 'none' }}
      >
        {label}
      </text>
    </g>
  );
}
