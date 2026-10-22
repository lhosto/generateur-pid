// Rendu des symboles PID : silhouette de la famille (forme de base du HG0) + marqueur de technologie
// (model/symbols.ts, dessins dans markers.ts), en gris, version édition (pas de barre d'état ni de
// couleur d'animation). Seule une erreur de génération colore la forme (rouge défaut).
import { memo } from 'react';
import { CH_PITCH, CHUTE_SIZE, FONT, flareMarkerScale, HEAP_TOP, isHorizontal, type Box } from '../model/geometry';
import type { Flow } from '../model/pivot';
import { symbolOf, type Base, type Marker } from '../model/symbols';
import { gear, MARKERS } from './markers';

type Look = { fill: string; stroke: string; sw: number; dash?: string };
const FAMILY: Look = { fill: 'var(--pid-body)', stroke: 'var(--pid-edge)', sw: 0.9 };
const LOOK: Record<Base, Look> = {
  pill: FAMILY,
  flare: FAMILY,
  heap: FAMILY,
  crusher: FAMILY,
  frame: { ...FAMILY, dash: '2.5 1.5' },
  card: { fill: 'var(--pid-card)', stroke: 'var(--pid-stroke-card)', sw: 1.5 },
  screen: { fill: 'var(--pid-tile)', stroke: 'var(--pid-stroke-light)', sw: 1.5 },
  grid: { fill: 'var(--pid-card)', stroke: 'var(--pid-stroke-card)', sw: 1.5 },
  diamond: { fill: 'var(--pid-tile)', stroke: 'var(--pid-stroke-diamond)', sw: 1.5 },
  para: { fill: 'var(--pid-tile)', stroke: 'var(--pid-stroke-light)', sw: 1.5 },
  circle: FAMILY,
  silo: FAMILY,
  hopper: { fill: 'var(--pid-tile)', stroke: 'var(--pid-stroke-light)', sw: 1.5 },
  cabinet: { fill: 'var(--pid-band)', stroke: '#8d9791', sw: 1 },
  desk: { fill: 'var(--pid-band)', stroke: '#8d9791', sw: 1 },
  unknown: { fill: 'var(--pid-tile)', stroke: '#8d9791', sw: 1, dash: '3 3' },
};

const RADIUS: Partial<Record<Base, number>> = { card: 7, screen: 4, grid: 4, cabinet: 2, frame: 2, unknown: 4 };

/** Forme allongée posée à la verticale (flux vers le haut ou le bas). */
const tall = (b: Box) => b.h > b.w;

/** Rétrécissement de la séparation côté entrée (de chaque côté). */
const FLARE_IN = 8;

/** Point à d unités de l'entrée (d > 0) ou de la sortie (d < 0), sur l'axe du flux. */
function along(b: Box, flow: Flow, d: number): { x: number; y: number } {
  const from = d >= 0;
  const k = Math.abs(d);
  switch (flow) {
    case 'E': return { x: from ? b.x0 + k : b.x1 - k, y: b.cy };
    case 'W': return { x: from ? b.x1 - k : b.x0 + k, y: b.cy };
    case 'S': return { x: b.cx, y: from ? b.y0 + k : b.y1 - k };
    default: return { x: b.cx, y: from ? b.y1 - k : b.y0 + k };
  }
}

/** Marqueur : centre et échelle (dessin -11..11) ; rien quand la forme le dessine elle-même. */
function markerAt(base: Base, marker: Marker, b: Box, flow: Flow): { x: number; y: number; s: number } | null {
  if (marker === 'vis' || marker === 'engrenages' || marker === 'ecluse') return null;
  switch (base) {
    case 'pill': return { ...along(b, flow, 10), s: 0.42 };
    case 'flare': {
      // Un seul marqueur, côté sorties, qui grandit avec l'épaisseur (canaux).
      const s = flareMarkerScale(isHorizontal(flow) ? b.h : b.w);
      return { ...along(b, flow, -(11 * s + 3)), s };
    }
    case 'heap': return { x: b.cx, y: b.y0 + 7, s: 0.42 };
    case 'crusher': return { x: b.cx, y: b.cy + 1, s: Math.min(1.15, (b.h - 4) / 22) };
    case 'frame': return { x: b.x0 + 10, y: b.cy, s: 0.62 };
    case 'silo': return { x: b.cx, y: b.y1 - 8, s: 0.4 };
    case 'diamond':
    case 'circle': return { x: b.cx, y: b.cy, s: 0.6 };
    case 'grid':
    case 'hopper': return null;
    default: return tall(b) ? { x: b.cx, y: b.y0 + 10, s: 0.5 } : { x: b.x0 + 10, y: b.cy, s: 0.5 };
  }
}

/**
 * Position du repère : dans la forme (côté entrée d'une séparation, après le marqueur d'un convoyeur,
 * dans la trémie de dosage, à droite du marqueur d'un divers), ou dessous quand la forme est prise par
 * son dessin (écluse, vis, broyeur).
 */
export function labelPos(hg0: string, b: Box, flow: Flow = 'E', atEntry?: number): { x: number; y: number; outside: boolean } {
  const spec = symbolOf(hg0);
  if (spec.labelBelow) return { x: b.cx, y: b.y1 + 3 + FONT.tagOutside / 2, outside: true };
  // Tapis allongé pour ses machines accolées : repère à l'entrée, la suite est prise par les machines.
  if (atEntry !== undefined) return { ...along(b, flow, atEntry), outside: false };
  switch (spec.base) {
    case 'flare': return { ...along(b, flow, 17), outside: false };
    case 'pill': return spec.marker ? { ...along(b, flow, 32), outside: false } : { x: b.cx, y: b.cy, outside: false };
    case 'heap': return { x: b.cx, y: (b.y0 + HEAP_TOP + b.y1) / 2, outside: false };
    case 'frame': return { x: b.cx + 6, y: b.cy, outside: false };
    case 'silo': return { x: b.cx, y: b.cy - 4, outside: false };
    case 'circle':
    case 'diamond': return spec.marker ? { x: b.cx, y: b.y1 + 3 + FONT.tagOutside / 2, outside: true } : { x: b.cx, y: b.cy, outside: false };
    default:
      if (spec.marker && markerAt(spec.base, spec.marker, b, flow)) return tall(b) ? { x: b.cx, y: b.cy + 7, outside: false } : { x: b.cx + 7, y: b.cy, outside: false };
      return { x: b.cx, y: b.cy, outside: false };
  }
}

/** Couleur de fond derrière le repère (halo qui masque marqueurs et séparations). */
export const haloOf = (hg0: string, fault?: boolean) => (fault ? 'var(--pid-fault)' : LOOK[symbolOf(hg0).base].fill);

function outline(base: Base, b: Box, flow: Flow, p: Look) {
  const common = { fill: p.fill, stroke: p.stroke, strokeWidth: p.sw, strokeDasharray: p.dash, strokeLinejoin: 'round' as const };
  const i = FLARE_IN;
  switch (base) {
    case 'flare': {
      // Étroite à l'entrée, large aux sorties.
      const d =
        flow === 'E' ? `M${b.x0} ${b.y0 + i}L${b.x1} ${b.y0}V${b.y1}L${b.x0} ${b.y1 - i}Z`
        : flow === 'W' ? `M${b.x1} ${b.y0 + i}L${b.x0} ${b.y0}V${b.y1}L${b.x1} ${b.y1 - i}Z`
        : flow === 'S' ? `M${b.x0 + i} ${b.y0}H${b.x1 - i}L${b.x1} ${b.y1}H${b.x0}Z`
        : `M${b.x0 + i} ${b.y1}H${b.x1 - i}L${b.x1} ${b.y0}H${b.x0}Z`;
      return <path d={d} {...common} />;
    }
    case 'heap': {
      const yb = b.y0 + HEAP_TOP;
      return (
        <g>
          <path d={`M${b.x0 + 4} ${yb}C${b.x0 + 10} ${b.y0 - 2} ${b.x1 - 10} ${b.y0 - 2} ${b.x1 - 4} ${yb}Z`} {...common} fill="var(--pid-heap)" />
          <path d={`M${b.x0} ${yb}H${b.x1}L${b.x1 - 10} ${b.y1}H${b.x0 + 10}Z`} {...common} />
        </g>
      );
    }
    case 'crusher':
      return <path d={`M${b.x0} ${b.y0}H${b.x1}l-6 9V${b.y1}H${b.x0 + 6}V${b.y0 + 9}Z`} {...common} />;
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
    case 'pill':
      // Rouleau de convoyeur : bouts arrondis à rayon fixe (8), même en multicanal (pas de « patate »).
      return <rect x={b.x0} y={b.y0} width={b.w} height={b.h} rx={Math.min(8, b.w / 2, b.h / 2)} {...common} />;
    default:
      return <rect x={b.x0} y={b.y0} width={b.w} height={b.h} rx={RADIUS[base] ?? 4} {...common} />;
  }
}

const LINE = '#dfe3df';

/** Dessins portés par la forme elle-même : vis, roues dentées, rotor d'écluse, tas, décors hérités. */
function decor(hg0: string, base: Base, marker: Marker | undefined, b: Box, flow: Flow) {
  if (marker === 'vis') {
    // Arbre + spire en dents de scie sur toute la longueur.
    const h = isHorizontal(flow);
    const len = (h ? b.w : b.h) - 14;
    const amp = Math.min(4.5, (h ? b.h : b.w) / 2 - 3);
    const n = 4;
    const step = len / n;
    const pts: string[] = [];
    for (let k = 0; k < n; k++) pts.push(`${-len / 2 + (k + 0.5) * step} ${-amp}`, `${-len / 2 + (k + 1) * step} ${amp}`);
    return (
      <g transform={`translate(${b.cx} ${b.cy}) rotate(${h ? 0 : 90})`} fill="none" strokeLinejoin="round" strokeLinecap="round">
        <path d={`M${-len / 2} 0H${len / 2}`} stroke="#9aa39d" strokeWidth={1} />
        <path d={`M${-len / 2} ${amp}L${pts.join('L')}`} stroke={LINE} strokeWidth={1} />
      </g>
    );
  }
  if (marker === 'engrenages') {
    // Deux roues dentées engrenées (entraxe = rayon de tête + rayon de pied).
    const r = Math.min(9.6, b.h / 2 - 4);
    const y = b.cy + 1;
    const dx = (r + r * 0.74) / 2;
    return (
      <g>
        <path d={gear(b.cx - dx, y, 10, r, r * 0.74, -0.8 * (Math.PI / 5))} fill="#3e4643" stroke={LINE} strokeWidth={0.7} />
        <path d={gear(b.cx + dx, y, 10, r, r * 0.74, Math.PI - 0.3 * (Math.PI / 5))} fill="#3e4643" stroke={LINE} strokeWidth={0.7} />
        <circle cx={b.cx - dx} cy={y} r={r * 0.2} fill={LINE} />
        <circle cx={b.cx + dx} cy={y} r={r * 0.2} fill={LINE} />
      </g>
    );
  }
  if (marker === 'ecluse') {
    // Rotor à alvéoles dans le cercle.
    const r = Math.min(b.w, b.h) / 2 - 1.5;
    return (
      <g stroke={LINE} fill="none">
        {[0, 45, 90, 135].map((a) => <path key={a} d={`M${-r} 0H${r}`} transform={`translate(${b.cx} ${b.cy}) rotate(${a})`} strokeWidth={0.9} />)}
        <circle cx={b.cx} cy={b.cy} r={r * 0.3} fill="#3e4643" strokeWidth={0.9} />
        <circle cx={b.cx} cy={b.cy} r={1.2} fill={LINE} stroke="none" />
      </g>
    );
  }
  if (base === 'heap' && !marker) {
    // Quelques cailloux sur le tas.
    return <path d={`M${b.cx - 8} ${b.y0 + 6}l3-2M${b.cx + 2} ${b.y0 + 3}l3-1M${b.cx + 10} ${b.y0 + 7}l2-2`} stroke="#9aa39d" strokeWidth={0.7} />;
  }
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
function dividers(base: Base, b: Box, flow: Flow, n: number, cuts?: number[]) {
  if (n < 2) return null;
  const pointy = base === 'diamond' || base === 'circle';
  const d: string[] = [];
  for (let k = 1; k < n; k++) {
    const mid = cuts?.[k - 1] ?? (k - n / 2) * CH_PITCH;
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

export const Shape = memo(function Shape({ hg0, box, flow, channels, fault, cuts }: { hg0: string; box: Box; flow: Flow; channels: number; fault?: boolean; cuts?: number[] }) {
  const spec = symbolOf(hg0);
  const look = fault ? { fill: 'var(--pid-fault)', stroke: 'var(--pid-fault-stroke)', sw: 1.5 } : LOOK[spec.base];
  const at = spec.marker ? markerAt(spec.base, spec.marker, box, flow) : null;
  return (
    <g>
      {outline(spec.base, box, flow, look)}
      {decor(hg0, spec.base, spec.marker, box, flow)}
      {dividers(spec.base, box, flow, channels, cuts)}
      {at && spec.marker && <g transform={`translate(${at.x} ${at.y}) scale(${at.s})`} dangerouslySetInnerHTML={{ __html: MARKERS[spec.marker] }} />}
    </g>
  );
});

export function Tag({ text, x, y, dim, outside, halo, anchor = 'middle' }: { text: string; x: number; y: number; dim?: boolean; outside?: boolean; halo?: string; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="central"
      style={{
        font: `${dim ? 400 : 500} ${outside ? FONT.tagOutside : FONT.tag}px var(--font-tag)`,
        fill: dim ? 'var(--pid-text-dim)' : 'var(--pid-text)',
        paintOrder: 'stroke',
        stroke: outside ? 'var(--pid-bg)' : (halo ?? 'none'),
        strokeWidth: outside || halo ? 4 : 0,
        strokeLinejoin: 'round',
        pointerEvents: 'none',
      }}
    >
      {text}
    </text>
  );
}

/**
 * Goulotte de tri : petit rectangle (moitié d'un poste opérateur), sans asservissement ; elles
 * s'assemblent bord à bord. Libellé au survol seulement (title).
 */
export function ChuteShape({ x, y, label, selected }: { x: number; y: number; label: string; selected?: boolean }) {
  const { w, h } = CHUTE_SIZE;
  return (
    <g>
      <title>{label}</title>
      {selected && <rect x={x - w / 2 - 2.5} y={y - h / 2 - 2.5} width={w + 5} height={h + 5} rx={2} fill="none" stroke="var(--pid-select)" strokeWidth={1.5} />}
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={1} fill="var(--pid-chute)" stroke="var(--pid-stroke)" strokeWidth={1} />
      <path d={`M${x - w / 2 + 3} ${y - h / 2 + 3}L${x} ${y + h / 2 - 3}L${x + w / 2 - 3} ${y - h / 2 + 3}`} fill="none" stroke="var(--pid-divider)" strokeWidth={0.8} />
    </g>
  );
}

/** Rectangle à arrondis par coin [haut gauche, haut droit, bas droit, bas gauche]. */
function roundRect(b: Box, [a, c, d, e]: number[]): string {
  const { x0, y0, x1, y1 } = b;
  return `M${x0 + a} ${y0}H${x1 - c}${c ? `A${c} ${c} 0 0 1 ${x1} ${y0 + c}` : ''}V${y1 - d}${d ? `A${d} ${d} 0 0 1 ${x1 - d} ${y1}` : ''}` +
    `H${x0 + e}${e ? `A${e} ${e} 0 0 1 ${x0} ${y1 - e}` : ''}V${y0 + a}${a ? `A${a} ${a} 0 0 1 ${x0 + a} ${y0}` : ''}Z`;
}

/**
 * Machine accolée à un tapis : cartouche (même largeur pour toutes) avec son marqueur, posé sur les
 * canaux traités ou collé au flanc. Les coins qui tombent sur un coin du tapis (machine de tête au
 * bout) reprennent l'arrondi du tapis.
 */
export function DockedCard({ hg0, box, belt, beltFlow, channels = 1, fault }: { hg0: string; box: Box; belt?: Box; beltFlow?: Flow; channels?: number; fault?: boolean }) {
  const spec = symbolOf(hg0);
  const corner = (x: number, y: number) =>
    belt && [belt.x0, belt.x1].some((bx) => Math.abs(bx - x) < 0.5) && [belt.y0, belt.y1].some((by) => Math.abs(by - y) < 0.5) ? 8 : 0;
  const r = Math.min(4, box.w / 2, box.h / 2);
  const radii = [
    corner(box.x0, box.y0) || r,
    corner(box.x1, box.y0) || r,
    corner(box.x1, box.y1) || r,
    corner(box.x0, box.y1) || r,
  ];
  const s = Math.min(1.15, (Math.min(box.w, box.h) - 5) / 20);
  return (
    <g>
      <path d={roundRect(box, radii)} fill={fault ? 'var(--pid-fault)' : 'var(--pid-dock)'} fillOpacity={0.94} stroke={fault ? 'var(--pid-fault-stroke)' : '#dfe3df'} strokeWidth={0.8} />
      {/* Machine à plusieurs canaux : séparations dans le sens du flux du tapis, parts égales. */}
      {channels > 1 && (
        <path
          d={Array.from({ length: channels - 1 }, (_, i) => {
            const f = (i + 1) / channels;
            return beltFlow && !isHorizontal(beltFlow)
              ? `M${box.x0 + box.w * f} ${box.y0 + 3}V${box.y1 - 3}`
              : `M${box.x0 + 3} ${box.y0 + box.h * f}H${box.x1 - 3}`;
          }).join('')}
          stroke="var(--pid-divider)"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      )}
      {spec.marker && MARKERS[spec.marker] && (
        <g transform={`translate(${box.cx} ${box.cy}) scale(${s})`} dangerouslySetInnerHTML={{ __html: MARKERS[spec.marker] }} />
      )}
    </g>
  );
}
