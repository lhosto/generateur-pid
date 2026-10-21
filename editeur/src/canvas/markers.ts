// Marqueurs de technologie (style « v2 » du canevas Design) : dessins gris dans une boîte -11..11,
// centrés sur 0, posés dans la forme de la famille (model/symbols.ts dit lequel). Balisage SVG brut,
// inséré tel quel dans un <g> à l'échelle voulue.
import type { Marker } from '../model/symbols';

const L = '#dfe3df', M = '#c9d0ca', D = '#9aa39d', F1 = '#3e4643', F2 = '#262c2a';
const g = (s: string) => `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${s}</g>`;

/** Roue dentée (dents dessinées à la géométrie) : chemin SVG. */
export function gear(cx: number, cy: number, n: number, ro: number, ri: number, phase: number): string {
  const pts: [number, number][] = [];
  const s = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a = phase + i * s;
    for (const [r, t] of [[ri, a], [ro, a + s * 0.15], [ro, a + s * 0.45], [ri, a + s * 0.6]]) pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return 'M' + pts.map((q) => q[0].toFixed(2) + ' ' + q[1].toFixed(2)).join('L') + 'Z';
}


export const MARKERS: Record<Marker, string> = {
  // Dessinés par la forme (symbols.tsx) : vis sur toute la longueur, roues dentées du broyeur.
  vis: '',
  engrenages: '',
  crible: `<rect x="-8" y="-8" width="16" height="16" rx="2.2" fill="${F1}" stroke="${L}" stroke-width="0.9"/><g fill="${F2}" stroke="${M}" stroke-width="0.4">${[-6, -1.7, 2.6].flatMap((x) => [-6, -1.7, 2.6].map((y) => `<rect x="${x}" y="${y}" width="3.4" height="3.4" rx="0.7"/>`)).join('')}</g>`,
  balistique: g(`<path d="M-9 6L9-5" stroke="${L}" stroke-width="1.2"/><path d="M-6 4.2v-3M-1.5 1.4v-3M3 -1.4v-3M7.5 -4.2v-3" stroke="${M}" stroke-width="1"/><circle cx="-6.5" cy="-5.5" r="1.8" fill="${L}" stroke="none"/>`),
  vibrant: g(`<path d="M-9-7l18 4M-9-1l18 4M-9 5l18 4" stroke="${L}" stroke-width="1.1"/><path d="M-10.5-9l-1 1.5 1 1.5M10.5 7l1 1.5-1 1.5" stroke="${D}" stroke-width="0.7"/>`),
  disque: g(`${[0, 60, 120].map((a) => `<path d="M-8 0H8" transform="rotate(${a})" stroke="${L}" stroke-width="1.3"/>`).join('')}<circle r="2.6" fill="${F2}" stroke="${L}" stroke-width="0.8"/>${[0, 60, 120, 180, 240, 300].map((a) => `<circle cx="8" cy="0" r="1.2" transform="rotate(${a})" fill="${L}" stroke="none"/>`).join('')}`),
  trommel: g(`<path d="M-7-6h14M-7 6h14" stroke="${L}" stroke-width="0.9"/><ellipse cx="-7" cy="0" rx="2.4" ry="6" fill="${F1}" stroke="${L}" stroke-width="0.9"/><path d="M7-6a2.4 6 0 0 1 0 12" stroke="${L}" stroke-width="0.9"/><g fill="${M}" stroke="none"><circle cx="-2" cy="-3" r="0.9"/><circle cx="2" cy="-3" r="0.9"/><circle cx="0" cy="0" r="0.9"/><circle cx="4" cy="0" r="0.9"/><circle cx="-2" cy="3" r="0.9"/><circle cx="2" cy="3" r="0.9"/></g>`),
  foucault: g(`<circle cx="-3" cy="4" r="5.5" fill="${F1}" stroke="${L}" stroke-width="0.9"/><circle cx="-3" cy="4" r="1" fill="${L}" stroke="none"/><path d="M1.5-1q2.5-6 7-6.5" stroke="${L}" stroke-width="0.9" stroke-dasharray="1.2 1.2"/><rect x="6.6" y="-10.2" width="3" height="3" rx="0.6" transform="rotate(25 8.1 -8.7)" fill="${L}" stroke="none"/>`),
  aero: g(`<path d="M-9-4.5h9.5q3.8 0 3.8-3q0-2-2-2M-9 0h13M-9 4.5h9.5q3.8 0 3.8 3q0 2-2 2" stroke="${L}" stroke-width="1"/><path d="M2.5-1.6l2 1.6-2 1.6" stroke="${L}" stroke-width="1"/>`),
  rouleau: g(`<circle r="6.5" fill="${F1}" stroke="${L}" stroke-width="1"/><circle r="1.4" fill="${L}" stroke="none"/><path d="M-4.5-8.5a9 9 0 0 1 9 0" stroke="${D}" stroke-width="0.8"/><path d="M3.2-10l1.5 1.5-2 0.6" stroke="${D}" stroke-width="0.8"/>`),
  optique: g(`<path d="M-9.5 -1q9.5-9 19 0q-9.5 9-19 0z" fill="${F1}" stroke="${L}" stroke-width="0.9"/><circle cx="0" cy="-1" r="3.6" fill="${F2}" stroke="${L}" stroke-width="0.8"/><circle cx="0" cy="-1" r="1.5" fill="${L}" stroke="none"/>`),
  robot: g(`<rect x="-9" y="7" width="9" height="2" rx="0.6" fill="${F1}" stroke="${L}" stroke-width="0.7"/><path d="M-4.5 7V-1L3-6l4 4" stroke="${L}" stroke-width="1.6"/><circle cx="-4.5" cy="-1" r="1.4" fill="${F2}" stroke="${L}" stroke-width="0.7"/><circle cx="3" cy="-6" r="1.4" fill="${F2}" stroke="${L}" stroke-width="0.7"/><path d="M7-2l-1.5 3M7-2l2.5 2.4" stroke="${L}" stroke-width="0.9"/>`),
  manuel: g(`<circle cx="0" cy="-6.5" r="2.6" fill="${L}" stroke="none"/><path d="M-4.5 4v-4.5a4.5 4.5 0 0 1 9 0V4" fill="${F1}" stroke="${L}" stroke-width="0.9"/><path d="M-4.5 0l-3 4.5M4.5 0l3 4.5" stroke="${L}" stroke-width="0.9"/>`),
  cabine: g(`<rect x="-9" y="-9" width="18" height="18" rx="2" fill="${F2}" stroke="${L}" stroke-width="0.9"/><circle cx="0" cy="-3.5" r="2.2" fill="${L}" stroke="none"/><path d="M-4 5v-2.5a4 4 0 0 1 8 0V5" fill="${F1}" stroke="${L}" stroke-width="0.8"/>`),
  aimant: g(`<path d="M-7-6h4.4v6.5a2.6 2.6 0 0 0 5.2 0V-6H7v6.6a7 7 0 0 1-14 0z" fill="${F1}" stroke="${L}" stroke-width="1"/><path d="M-7-6h4.4v3H-7zM2.6-6H7v3H2.6z" fill="${L}" stroke="${L}" stroke-width="0.6"/>`),
  electro: g(`<g transform="translate(-2 1) scale(0.85)"><path d="M-7-6h4.4v6.5a2.6 2.6 0 0 0 5.2 0V-6H7v6.6a7 7 0 0 1-14 0z" fill="${F1}" stroke="${L}" stroke-width="1"/><path d="M-7-6h4.4v3H-7zM2.6-6H7v3H2.6z" fill="${L}"/></g><path d="M8-10l-3 5h3l-3 5" stroke="${L}" stroke-width="1"/>`),
  poulie: g(`<circle r="8" fill="${F1}" stroke="${L}" stroke-width="1"/><g transform="scale(0.6)"><path d="M-7-6h4.4v6.5a2.6 2.6 0 0 0 5.2 0V-6H7v6.6a7 7 0 0 1-14 0z" fill="${F2}" stroke="${L}" stroke-width="1.4"/></g>`),
  // Convoyage
  chevrons: g(`<path d="M-8-5l4 5-4 5M-1-5l4 5-4 5M6-5l4 5-4 5" stroke="${L}" stroke-width="1.2"/>`),
  helice: g(`<path d="M-10 0H10" stroke="${D}" stroke-width="0.8"/><path d="M-9 5q2.5-10 5 0t5 0t5 0t4 0" stroke="${L}" stroke-width="1.1"/>`),
  fourche: g(`<path d="M-10 0H-2l8-7M-2 0l8 7" stroke="${L}" stroke-width="1.3"/><path d="M4-9l3 2-1 3M4 9l3-2-1-3" stroke="${L}" stroke-width="0.9"/>`),
  ecluse: g(`<circle r="8" fill="${F1}" stroke="${L}" stroke-width="0.9"/>${[0, 60, 120].map((a) => `<path d="M-8 0H8" transform="rotate(${a})" stroke="${L}" stroke-width="1"/>`).join('')}<circle r="2" fill="${L}" stroke="none"/>`),
  basculeur: g(`<path d="M-7-2l11-5 3 8-11 5z" fill="${F1}" stroke="${L}" stroke-width="0.9"/><path d="M-9 9a10 10 0 0 0 14-3" stroke="${D}" stroke-width="0.8"/><path d="M4 4.5l1.5 2 1-2.6" stroke="${D}" stroke-width="0.8"/>`),
  // Dosage, broyage / compactage
  ouvreur: g(`<path d="M-8 6l3-8 3 8 3-8 3 8 3-8" stroke="${L}" stroke-width="1.1"/>`),
  grains: g(`<g fill="${L}" stroke="none"><circle cx="-5" cy="-4" r="1.5"/><circle cx="1" cy="-6" r="1.5"/><circle cx="5" cy="-1" r="1.5"/><circle cx="-2" cy="1" r="1.5"/><circle cx="-6" cy="5" r="1.5"/><circle cx="3" cy="5" r="1.5"/></g>`),
  verin: g(`<rect x="-10" y="-4" width="9" height="8" rx="1" fill="${F1}" stroke="${L}" stroke-width="0.9"/><path d="M-1 0h6" stroke="${L}" stroke-width="1.4"/><rect x="5" y="-7" width="2.4" height="14" rx="0.6" fill="${L}" stroke="none"/><path d="M8.5-5h1.5M8.5 0h1.5M8.5 5h1.5" stroke="${D}" stroke-width="0.8"/>`),
  balle: g(`<rect x="-8" y="-6" width="16" height="12" rx="1.6" fill="${F1}" stroke="${L}" stroke-width="0.9"/><path d="M-3-6v12M3-6v12" stroke="${L}" stroke-width="0.9"/><path d="M-8-2h16M-8 2h16" stroke="${D}" stroke-width="0.5" stroke-dasharray="1 1"/>`),
  paquet: g(`<path d="M0-8l7 4v8l-7 4-7-4v-8z" fill="${F1}" stroke="${L}" stroke-width="0.9"/><path d="M-7-4l7 4 7-4M0 0v8" stroke="${L}" stroke-width="0.9"/>`),
  briquettes: g(`<g fill="${F1}" stroke="${L}" stroke-width="0.8"><rect x="-9" y="1" width="8" height="5" rx="1"/><rect x="1" y="1" width="8" height="5" rx="1"/><rect x="-4" y="-5" width="8" height="5" rx="1"/></g>`),
  spirale: g(`<path d="M0 0a2 2 0 0 1 3 1a4 4 0 0 1-5 4a6 6 0 0 1-5-7a8 8 0 0 1 9-6a9 9 0 0 1 7 8" stroke="${L}" stroke-width="1"/>`),
  poids: g(`<path d="M-6 6l2-9h8l2 9z" fill="${F1}" stroke="${L}" stroke-width="0.9"/><circle cx="0" cy="-5.5" r="2" stroke="${L}" stroke-width="0.9"/>`),
  // Divers
  ventilo: g(`<circle r="9" stroke="${D}" stroke-width="0.7"/>${[0, 120, 240].map((a) => `<path d="M0 0q2-7 6-6q1 4-6 6z" transform="rotate(${a})" fill="${F1}" stroke="${L}" stroke-width="0.8"/>`).join('')}<circle r="1.4" fill="${L}" stroke="none"/>`),
  cta: g(`<rect x="-10" y="-8" width="20" height="16" rx="1.5" stroke="${L}" stroke-width="0.8"/>${[0, 120, 240].map((a) => `<path d="M0 0q1.5-5 4.5-4.5q.8 3-4.5 4.5z" transform="rotate(${a})" fill="${F1}" stroke="${L}" stroke-width="0.7"/>`).join('')}`),
  manches: g(`${[-6, 0, 6].map((x) => `<rect x="${x - 2}" y="-8" width="4" height="15" rx="2" fill="${F1}" stroke="${L}" stroke-width="0.8"/>`).join('')}`),
  decolmatage: g(`${[-6, 0, 6].map((x) => `<rect x="${x - 2}" y="-3" width="4" height="11" rx="2" fill="${F1}" stroke="${L}" stroke-width="0.8"/><path d="M${x}-5v-4" stroke="${L}" stroke-width="0.8"/><path d="M${x - 1.5}-6.5l1.5 1.5 1.5-1.5" stroke="${L}" stroke-width="0.8"/>`).join('')}`),
  smart: g(`<rect x="-7" y="-6" width="9" height="14" rx="2" fill="${F1}" stroke="${L}" stroke-width="0.8"/><path d="M6-9v4M4-7h4M8 0v3M6.5 1.5h3" stroke="${L}" stroke-width="0.9"/>`),
  plenum: g(`<rect x="-10" y="-6" width="20" height="12" rx="1.5" fill="${F1}" stroke="${L}" stroke-width="0.8"/><path d="M-6 0h10M1.5-2.5l3 2.5-3 2.5" stroke="${L}" stroke-width="1"/>`),
  compresseur: g(`<circle r="8" fill="${F1}" stroke="${L}" stroke-width="0.9"/><path d="M-5-5.5L6 0-5 5.5" stroke="${L}" stroke-width="1"/>`),
  goutte: g(`<path d="M0-9q6 8 6 12a6 6 0 0 1-12 0q0-4 6-12z" fill="${F1}" stroke="${L}" stroke-width="0.9"/>`),
  goutteX: g(`<path d="M0-9q6 8 6 12a6 6 0 0 1-12 0q0-4 6-12z" fill="${F1}" stroke="${L}" stroke-width="0.9"/><path d="M-2.5 1l5 5M2.5 1l-5 5" stroke="${L}" stroke-width="0.9"/>`),
  flocon: g(`${[0, 60, 120].map((a) => `<path d="M0-9V9M-2-7l2 2 2-2M-2 7l2-2 2 2" transform="rotate(${a})" stroke="${L}" stroke-width="0.9"/>`).join('')}`),
  brume: g(`<path d="M-9 0h5" stroke="${L}" stroke-width="1.4"/><g fill="${L}" stroke="none"><circle cx="0" cy="-4" r="1"/><circle cx="2" cy="0" r="1"/><circle cx="0" cy="4" r="1"/><circle cx="5" cy="-6" r="1"/><circle cx="6" cy="-1" r="1"/><circle cx="6" cy="4" r="1"/><circle cx="9" cy="-3" r="1"/><circle cx="9" cy="2" r="1"/></g>`),
  flamme: g(`<path d="M0 9a6 6 0 0 1-6-6q0-5 4-8q0 4 2 4q1-5 4-8q2 6 2 12a6 6 0 0 1-6 6z" fill="${F1}" stroke="${L}" stroke-width="0.9"/>`),
  oeilFlamme: g(`<path d="M-10 2q6-7 12 0q-6 7-12 0z" fill="${F1}" stroke="${L}" stroke-width="0.8"/><circle cx="-4" cy="2" r="1.8" fill="${L}" stroke="none"/><path d="M6 9a3.5 3.5 0 0 1-3.5-3.5q0-3 2.5-5q0 2.5 1 2.5q.5-3 2.5-5q1.2 3.5 1.2 7.5a3.5 3.5 0 0 1-3.7 3.5z" fill="${F1}" stroke="${L}" stroke-width="0.8"/>`),
  armoire: g(`<rect x="-7" y="-9" width="14" height="18" rx="1" fill="${F1}" stroke="${L}" stroke-width="0.9"/><path d="M0-9v18" stroke="${L}" stroke-width="0.7"/><path d="M-2 0h-1M2 0h1" stroke="${L}" stroke-width="1.2"/>`),
  pupitre: g(`<path d="M-9 6l3-9h12l3 9z" fill="${F1}" stroke="${L}" stroke-width="0.9"/><g fill="${L}" stroke="none"><circle cx="-3" cy="0" r="1.1"/><circle cx="1" cy="0" r="1.1"/><circle cx="5" cy="0" r="1.1"/></g>`),
  telecommande: g(`<rect x="-4" y="-5" width="8" height="14" rx="1.6" fill="${F1}" stroke="${L}" stroke-width="0.9"/><path d="M-4-8q4-3 8 0M-6-10.5q6-4.5 12 0" stroke="${D}" stroke-width="0.7"/><g fill="${L}" stroke="none"><circle cx="0" cy="-1" r="1.2"/><circle cx="0" cy="3.5" r="1.2"/></g>`),
  verinSeul: g(`<rect x="-10" y="-4" width="11" height="8" rx="1" fill="${F1}" stroke="${L}" stroke-width="0.9"/><path d="M1 0h8" stroke="${L}" stroke-width="1.4"/><path d="M-6-4v-3M-2-4v-3" stroke="${D}" stroke-width="0.8"/>`),
};
