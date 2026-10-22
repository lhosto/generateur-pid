// Canevas PID : écran Unified 1920×1080, zoom/déplacement, sélection, gestes « + », liens.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getLang, hgLabel, plain, rich, tx } from '../i18n';
import type { Catalogue } from '../model/catalogue';
import { type Box, boxAt, chAxis, chEdges, CHUTE_SIZE, eqBox, flowVec, FONT, hg0Of, isHorizontal, leftSign, opposite, SCREEN, snap, textWidth } from '../model/geometry';
import { axisCandidates } from '../model/straighten';
import { guideSnap } from '../model/align';
import {
  addChannel, addChute, addEq, assembleChutes, addOutput, addOutputWithNext, connect, removeLink, removeOutput, setOutputNum, DEFAULT_CHUTE_LABEL, findEq, moveItems, removeChannel, sameOutput,
  placeNext, setLinkTarget, updateEq,
} from '../model/ops';
import type { Dir, Eq, OutputRef, Pivot } from '../model/pivot';
import { handlePositions, loopLinks, outputColor, placeTags, shortTag, arMark, routeAll, tagAnchor, type Pt } from '../model/route';
import {
  canAddChannel, canAddOutput, canRemoveOutput, freeOutputNum, hgDef, isNoAction, MAX, nextOutputNum, outputPolarity, outputsOf, pad2, reverseBlocked,
  chainRepere, zoneOf,
} from '../model/rules';
import { Icon } from '../ui/ui';
import { Glyph } from '../panels/Palette';
import { EqNode } from './EqNode';
import { ChuteShape, labelPos } from './symbols';
import { symbolOf } from '../model/symbols';
import { cover, dockedBand, dockedChannelAt, dockedLinks, dockedNumsFree, dockedOn, dockKind, dockLinkTo, dockOnDrop, swapDocked, uncover } from '../model/dock';

export interface Selection {
  eqs: string[];
  chutes: string[];
  link: string | null;
  stub: OutputRef | null;
}
export const EMPTY_SEL: Selection = { eqs: [], chutes: [], link: null, stub: null };

export interface View {
  zoom: number;
  px: number;
  py: number;
}

interface Props {
  cat: Catalogue;
  pivot: Pivot;
  commit: (next: Pivot, from?: Pivot) => void;
  preview: (next: Pivot) => void;
  sel: Selection;
  setSel: (s: Selection) => void;
  view: View;
  setView: (f: (v: View) => View) => void;
  faults: Map<string, string>;
  incomplete: Map<string, string[]>;
  currentNature: string;
  grid: boolean;
  onOpenEq: (id: string) => void;
  /** Fiche équipement ouverte : le double-clic renomme alors le repère sur place. */
  drawerOpen: boolean;
  onSize: (w: number, h: number) => void;
  /** Ouvre la planche des HG principaux pour choisir l'équipement à ajouter. */
  onPickOther: (apply: (hg0: string) => void) => void;
  /** Mémorise le dernier HG principal choisi autre que le convoyeur (« dernier choix » du menu du « + »). */
  onChosen: (hg0: string) => void;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; v: View }
  | { kind: 'band'; a: Pt; b: Pt; additive: boolean; base: Selection }
  | { kind: 'move'; start: Pivot; a: Pt; eqs: string[]; chutes: string[]; primary: Pt; primaryId: string | null; moved: boolean; clicked: string | null }
  | { kind: 'wire'; mode: 'new' | 'stub' | 'retarget'; src: { eq: string; ch: number; dir: Dir }; ref?: OutputRef; linkId?: string; a: Pt; cur: Pt; moved: boolean; target: string | null; targetCh: number; origin: Pt };

/** Ligne d'infobulle : titre en phrase simple, détail, nom technique (petit), aide, alertes. */
type TipKind = 'title' | 'sub' | 'tech' | 'hint' | 'warn' | 'fault';
interface TipLine {
  text: ReactNode;
  kind?: TipKind;
}
interface Tip {
  source: 'eq' | 'pointer';
  x: number;
  y: number;
  lines: TipLine[];
}

/** Menu du « + » d'une sortie : choisir l'équipement à ajouter. */
/** Machines proposées par le « + » au bout d'un convoyeur : celles qui se posent dessus, de tête d'abord. */
const DOCK_MENU = ['OVPM', 'OVCA', 'MAGP', 'OPSO', 'ROBO', 'PICK'];

/** Nom d'un canal par sa place dans le sens du flux : canal principal (un seul), de gauche, du centre, de droite. */
const chLabel = (eq: Eq, ch: number) => {
  const n = eq.channels.length;
  return tx(n < 2 ? L.chMain : ch === 1 ? L.chLeft : ch === n ? L.chRight : L.chCenter);
};

/** Sens dominant d'un équipement vers un point (pour orienter ce qu'on y pose). */
const towards = (from: Eq, at: Pt): 'E' | 'W' | 'S' | 'N' => {
  const dx = at[0] - from.x;
  const dy = at[1] - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'E' : 'W') : dy >= 0 ? 'S' : 'N';
};

/** Majuscule initiale (« Canal de gauche »). */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Menu « poser sur le tapis » ouvert depuis le « + » au bout d'un convoyeur. */
interface DockMenu {
  x: number;
  y: number;
  conv: string;
}

interface AddMenu {
  x: number;
  y: number;
  src: { eq: string; ch: number; dir: Dir };
  /** Point de dépôt (geste glissé dans le vide) ; sinon placement automatique. */
  at?: Pt;
  /** Sortie libre existante à raccorder (au lieu d'en créer une). */
  ref?: OutputRef;
}

const TIP_STYLE: Record<TipKind, React.CSSProperties> = {
  title: { font: '600 13px var(--font-sans)', color: '#fff' },
  sub: { font: '400 12px var(--font-sans)', color: 'var(--text-secondary)' },
  tech: { font: '500 10.5px var(--font-tag)', color: 'var(--text-muted)', letterSpacing: '.02em' },
  hint: { font: '400 12px var(--font-sans)', color: 'var(--text-muted)' },
  warn: { font: '400 12px var(--font-sans)', color: 'var(--pid-warn)' },
  fault: { font: '400 12px var(--font-sans)', color: 'var(--pid-fault-stroke)' },
};

const FIT_PAD = 28;

/** Équipement proposé en tête du menu du « + ». */
const DEFAULT_NEXT = 'BELT';

/**
 * Onglet des canaux « − n canaux + », posé hors de la forme : au-dessus en flux horizontal, à droite en flux
 * vertical (le haut y est pris par les « + » des sorties). L'écart rejoint la zone de clic de l'équipement.
 */
const TAB = { w: 76, h: 16, gap: 4 };
/** Nom de sortie « canal.sortie » : posé sur le trait, en italique, un peu plus petit et plus foncé que les repères ; halo du fond translucide (le trait se devine derrière). */
const TAG_STYLE: React.CSSProperties = { font: `italic 500 ${FONT.out}px var(--font-tag)`, fill: 'var(--pid-out-name)', paintOrder: 'stroke', stroke: 'var(--pid-bg)', strokeOpacity: 0.75, strokeWidth: 4, strokeLinejoin: 'round', pointerEvents: 'none' };

/** Trait d'un lien : tirets pour la marche arrière, pointillé rond pour un retour de boucle, plein sinon. */
const lineDash = (reverse: boolean, loop: boolean) => (reverse ? '5 5' : loop ? '0.1 5' : undefined);

/** Texte d'étiquette de sortie : les signes − et + en gras et un peu plus grands, le reste normal. */
const tagText = (t: string) =>
  t.split(/([−+]+)/).filter(Boolean).map((part, i) =>
    /^[−+]+$/.test(part) ? <tspan key={i} style={{ fontWeight: 800, fontSize: FONT.sign }}>{part}</tspan> : part,
  );

// Textes du canevas : français pour l'opérateur, anglais préparé.
// « [CH] » dans un texte = terme technique affiché en petit après le mot simple (voir i18n.rich).
const L = {
  aria: { fr: 'Synoptique PID', en: 'P&ID overview' },
  screen: { fr: (site: string) => `Écran Unified 1920 × 1080 — ${site}`, en: (site: string) => `Unified screen 1920 × 1080 — ${site}` },
  channels: { fr: (n: number) => ` · ${n} canaux [CH]`, en: (n: number) => ` · ${n} Channels [CH]` },
  hgStack: { fr: 'Matériels génériques [HG] : ', en: 'Hardware Generic [HG]: ' },
  openSheet: { fr: 'Double-clic : ouvrir la fiche équipement [EQ]', en: 'Double-click: open the Equipment details [EQ]' },
  linkHint: {
    fr: 'Clic : sélectionner\nPuis glisser la pastille de la flèche vers un autre canal [CH]',
    en: 'Click: select\nThen drag the arrowhead dot to another Channel [CH]',
  },
  loop: { fr: '↺ Boucle : la matière revient vers un équipement en amont', en: '↺ Loop: material returns to an upstream Equipment item' },
  stubHint: { fr: 'Sortie en attente : clic pour choisir l’équipement [EQ] à raccorder, ou glisser vers un équipement existant · Suppr : la supprimer', en: 'Pending output: click to choose the Equipment item [EQ] to connect, or drag onto an existing one · Del: remove it' },
  renameAria: { fr: 'Repère client de l’équipement', en: 'Customer tag of the Equipment item' },
  retarget: {
    fr: 'Glisser pour changer de canal [CH] ou d’équipement [EQ] d’arrivée',
    en: 'Drag to change the destination Channel [CH] or Equipment item [EQ]',
  },
  targetCh: { fr: (n: number) => `Canal ${n}`, en: (n: number) => `Channel ${n}` },
  unavailable: { fr: 'Indisponible', en: 'Unavailable' },
  chipHint: {
    fr: 'Clic : ajouter l’équipement suivant, déjà relié\nGlisser : relier à un équipement [EQ]',
    en: 'Click: add the next Equipment item, already linked\nDrag: link to an Equipment item [EQ]',
  },
  addChannel: { fr: (c: string) => `Ajouter un canal [CH${c}]`, en: (c: string) => `Add a Channel [CH${c}]` },
  removeChannel: { fr: (c: string) => `Retirer le canal [CH${c}]`, en: (c: string) => `Remove Channel [CH${c}]` },
  outputsLost: {
    fr: (n: number) => `${n} sortie${n > 1 ? 's' : ''} supprimée${n > 1 ? 's' : ''}`,
    en: (n: number) => `${n} output${n > 1 ? 's' : ''} deleted`,
  },
  linksLost: {
    fr: (n: number) => `${n} lien${n > 1 ? 's' : ''} entrant${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''}`,
    en: (n: number) => `${n} incoming link${n > 1 ? 's' : ''} deleted`,
  },
  emptyChannel: { fr: 'Canal vide', en: 'Empty Channel' },
  outTitle: {
    fr: (n: number, fwd: boolean) => `Sortie ${n} vers l’${fwd ? 'avant' : 'arrière'}`,
    en: (n: number, fwd: boolean) => `Output ${n}, ${fwd ? 'forward' : 'reverse'}`,
  },
  outSub: {
    fr: (pol: string, ch: number, multi: boolean) => `${multi ? `Canal ${ch} · ` : ''}sortie ${pol}`,
    en: (pol: string, ch: number, multi: boolean) => `${multi ? `Channel ${ch} · ` : ''}${pol} output`,
  },
  addClick: { fr: 'Clic : choisir l’équipement à ajouter, déjà relié', en: 'Click: choose the Equipment item to add, already linked' },
  addDrag: { fr: 'Glisser : relier à un équipement existant', en: 'Drag: link to an existing Equipment item' },
  reverseOff: { fr: 'Sortie vers l’arrière indisponible', en: 'Reverse output unavailable' },
  linkTitle: { fr: (a: string, b: string) => `De ${a} vers ${b}`, en: (a: string, b: string) => `From ${a} to ${b}` },
  linkSub: {
    fr: (n: number, fwd: boolean, pol: string, ch: number, multi: boolean, toCh: number, toMulti: boolean) =>
      `Sortie ${n} vers l’${fwd ? 'avant' : 'arrière'} (${pol})${multi ? `, canal ${ch}` : ''}${toMulti ? ` → arrive dans le canal ${toCh}` : ''}`,
    en: (n: number, fwd: boolean, pol: string, ch: number, multi: boolean, toCh: number, toMulti: boolean) =>
      `Output ${n}, ${fwd ? 'forward' : 'reverse'} (${pol})${multi ? `, channel ${ch}` : ''}${toMulti ? ` → into channel ${toCh}` : ''}`,
  },
  // Sortie en attente : « 13Aa, canal principal » puis « sortie principale non reliée ».
  stubTitle: { fr: (r: string, ch: string) => `${r}, ${ch}`, en: (r: string, ch: string) => `${r}, ${ch}` },
  stubSub: {
    fr: (pol: string, fwd: boolean) => `sortie ${pol}${fwd ? '' : ' vers l’arrière'} non reliée`,
    en: (pol: string, fwd: boolean) => `${pol}${fwd ? '' : ' reverse'} output, not connected`,
  },
  addOutOn: { fr: (n: number) => `Ajouter une sortie (passer à ${n})`, en: (n: number) => `Add an output (go to ${n})` },
  addOutBackOn: { fr: (n: number) => `Ajouter une sortie arrière (passer à ${n})`, en: (n: number) => `Add a reverse output (go to ${n})` },
  chMain: { fr: 'canal principal', en: 'main channel' },
  chLeft: { fr: 'canal de gauche', en: 'left channel' },
  chCenter: { fr: 'canal du centre', en: 'center channel' },
  chRight: { fr: 'canal de droite', en: 'right channel' },
  nbChannels: { fr: (n: number) => (n > 1 ? `${n} canaux` : '1 canal'), en: (n: number) => (n > 1 ? `${n} channels` : '1 channel') },
  nbHg: { fr: (n: number) => `${n} matériel${n > 1 ? 's' : ''}`, en: (n: number) => `${n} hardware item${n > 1 ? 's' : ''}` },
  tabAdd: { fr: (n: number) => `Ajouter un canal (passer à ${n})`, en: (n: number) => `Add a channel (go to ${n})` },
  tabRemove: { fr: (n: number) => `Retirer le canal ${n}`, en: (n: number) => `Remove channel ${n}` },
  tabMax: { fr: (n: number) => `${n} canaux au maximum`, en: (n: number) => `${n} channels at most` },
  tabMin: { fr: 'Un équipement garde au moins un canal', en: 'An Equipment item keeps at least one channel' },
  tabWhat: { fr: 'Canaux [CH] : voies de matière de l’équipement', en: 'Channels [CH]: material lanes of the Equipment item' },
  menuTitle: { fr: (r: string) => `Ajouter après ${r}`, en: (r: string) => `Add after ${r}` },
  menuLinkPending: { fr: 'Raccorder la sortie en attente', en: 'Connect the pending output' },
  dockTitle: { fr: (r: string) => `Poser sur ${r}`, en: (r: string) => `Put on ${r}` },
  numHeld: { fr: 'Place non disponible : sortie négative, machine de bout de tapis ou machine posée sur le tapis', en: 'Not available: negative output, belt-head machine or machine on the belt' },
  coverLess: { fr: (r: string, k: number) => `Ne plus traiter le canal ${k} de ${r}`, en: (r: string, k: number) => `Stop handling channel ${k} of ${r}` },
  coverMore: { fr: (r: string, k: number) => `Traiter aussi le canal ${k} de ${r}`, en: (r: string, k: number) => `Also handle channel ${k} of ${r}` },
  dockHead: { fr: 'au bout du tapis', en: 'at the belt head' },
  dockOver: { fr: 'un peu avant le bout', en: 'just before the head' },
  dockFlank: { fr: 'au flanc, un seul canal', en: 'at the side, one channel' },
  dockTip: { fr: 'Poser une machine sur ce tapis', en: 'Put a machine on this belt' },
  dockTipSub: { fr: 'overband, trieur optique, robot, valoriste… le tapis s’allonge', en: 'overband, optical sorter, robot, manual sorting… the belt gets longer' },
  menuDefault: { fr: 'par défaut', en: 'default' },
  menuLast: { fr: 'dernier choix', en: 'last choice' },
  // Deux convoyeurs proposés : départ direct (contacteur KM) ou variateur (DRIV).
  beltDirect: { fr: 'départ direct', en: 'direct-on-line' },
  beltDrive: { fr: 'avec variateur', en: 'with drive' },
  // « 08Aa - Numéro de sortie du canal de droite ».
  numBar: { fr: (r: string, c: string) => `${r} - Numéro de sortie du ${c}`, en: (r: string, c: string) => `${r} - Output number of the ${c}` },
  numHint: { fr: 'Les autres sorties du canal se décalent', en: 'The other outputs of the channel shift' },
  delLink: { fr: 'Supprimer le trait et sa sortie (Suppr)', en: 'Delete the link and its output (Del)' },
  menuOther: { fr: 'Autre équipement…', en: 'Other Equipment item…' },
  menuOtherSub: { fr: 'ouvrir la liste complète', en: 'open the full list' },
  menuDelete: { fr: 'Supprimer cette sortie', en: 'Delete this output' },
  menuDeleteSub: { fr: 'elle n’est pas raccordée (Suppr)', en: 'it is not connected (Del)' },
  undo: { fr: ' · Ctrl+Z pour annuler', en: ' · Ctrl+Z to undo' },
  zoomOut: { fr: 'Zoom arrière', en: 'Zoom out' },
  zoomIn: { fr: 'Zoom avant', en: 'Zoom in' },
  zoomPct: { fr: (n: number) => `${n} %`, en: (n: number) => `${n}%` },
  fit: { fr: "Ajuster à l'écran", en: 'Fit to screen' },
  grid: { fr: 'Grille', en: 'Grid' },
  // Libellé par défaut d'une goulotte (ops.DEFAULT_CHUTE_LABEL) : la donnée reste en français, seul l'affichage est traduit.
  chute: { fr: 'Goulotte de tri', en: 'Sorting chute' },
  // Infobulle native (texte simple, via plain) : l'action déplace des équipements, pas des traits.
  reorganize: {
    fr: 'Réorganiser : range les équipements [EQ] en colonnes dans le sens du flux, avec moins de croisements (tous, ou la sélection). Les traits ne changent pas. Ctrl+Z pour annuler',
    en: 'Reorganize: arranges Equipment items [EQ] in columns along the flow, with fewer crossings (all, or the selection). Links are unchanged. Ctrl+Z to undo',
  },
  straighten: {
    fr: 'Redresser les liens : déplace les équipements [EQ] presque alignés pour que leurs liens deviennent droits',
    en: 'Straighten links: moves nearly aligned Equipment items [EQ] so that their links become straight',
  },
};

export function fitView(w: number, h: number): View {
  const zoom = Math.max(0.2, Math.min((w - FIT_PAD * 2) / SCREEN.w, (h - FIT_PAD * 2 - 16) / SCREEN.h));
  return { zoom, px: Math.round((w - SCREEN.w * zoom) / 2), py: Math.round((h - SCREEN.h * zoom) / 2 + 8) };
}

export function Canvas(props: Props) {
  const { cat, pivot, sel, view } = props;
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const [, force] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const hoverTimer = useRef<number>();
  const [guides, setGuides] = useState<{ gx?: number; gy?: number }>({});
  const [tip, setTip] = useState<Tip | null>(null);
  const [hoverLink, setHoverLink] = useState<string | null>(null);
  const [hoverStub, setHoverStub] = useState<string | null>(null);
  const [menu, setMenu] = useState<AddMenu | null>(null);
  const [dockMenu, setDockMenu] = useState<DockMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

  const live = useRef(props);
  live.current = props;

  const boxes = useMemo(() => new Map(pivot.equipments.map((e) => [e.id, eqBox(e)])), [pivot.equipments]);
  // Les libellés des liens (outputLabel) sont traduits : recalcul aussi au changement de langue.
  const lang = getLang();
  const routed = useMemo(() => routeAll(pivot), [pivot, lang]);
  const loops = useMemo(() => loopLinks(pivot), [pivot.links, pivot.equipments]);
  // Étiquette d'un lien : repère de sortie, puis ↺ pour un retour de boucle (comme « AR » pour la marche arrière).
  const linkTag = (lk: Pivot['links'][number], loop: boolean) =>
    [shortTag(findEq(pivot, lk.from.eq), lk.from.ch, lk.from.num, lk.from.dir), loop ? '↺' : ''].filter(Boolean).join(' ');
  const tags = useMemo(
    () => placeTags(pivot, routed.links, (l) => linkTag(l.link, loops.has(l.id))),
    [pivot, routed, loops],
  );
  const selEqs = useMemo(() => new Set(sel.eqs), [sel.eqs]);

  // Taille du conteneur (pour « ajuster »).
  useEffect(() => {
    const el = host.current!;
    const ro = new ResizeObserver(() => live.current.onSize(el.clientWidth, el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Espace maintenu = main pour déplacer la vue.
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(t.tagName);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isField(e.target)) {
        space.current = true;
        if (host.current) host.current.style.cursor = 'grab';
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        space.current = false;
        if (host.current) host.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Menu du « + » : fermé par tout appui hors de lui (équipement, lien, fiche, bibliothèque…), et dès que le
  // pivot (annuler, « − » de l'onglet…) ou la vue (molette, déplacement) change : il viserait une sortie ou
  // un point de dépôt qui ne correspondent plus à ce qui est affiché.
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Node && menuRef.current?.contains(e.target))) (setMenu(null), setDockMenu(null));
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [menu]);
  useEffect(() => (setMenu(null), setDockMenu(null)), [pivot, view]);

  // Menu recadré dans le canevas (ouvert vers le haut / la gauche près des bords), puis focus sur le premier
  // choix sans faire défiler le conteneur.
  useLayoutEffect(() => {
    const el = menuRef.current;
    const h = host.current;
    if (!menu || !el || !h) return;
    const w = el.offsetWidth;
    const hh = el.offsetHeight;
    const W = h.clientWidth;
    const H = h.clientHeight;
    let left = menu.x + 10;
    let top = menu.y + 10;
    if (left + w > W - 4) left = menu.x - 10 - w;
    if (top + hh > H - 4) top = menu.y - 10 - hh;
    setMenuPos({ left: Math.max(4, Math.min(left, W - 4 - w)), top: Math.max(4, Math.min(top, H - 4 - hh)) });
    el.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [menu]);

  // Molette = zoom autour du pointeur (écouteur non passif pour bloquer le défilement).
  useEffect(() => {
    const el = host.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      live.current.setView((v) => {
        const zoom = Math.min(4, Math.max(0.2, v.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        const k = zoom / v.zoom;
        return { zoom, px: mx - (mx - v.px) * k, py: my - (my - v.py) * k };
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const toWorld = useCallback((cx: number, cy: number): Pt => {
    const r = host.current!.getBoundingClientRect();
    const v = live.current.view;
    return [(cx - r.left - v.px) / v.zoom, (cy - r.top - v.py) / v.zoom];
  }, []);

  const toHost = (p: Pt): Pt => [p[0] * view.zoom + view.px, p[1] * view.zoom + view.py];
  // Renommage du repère sur place (double-clic, fiche ouverte).
  const [rename, setRename] = useState<{ id: string; value: string } | null>(null);
  const endRename = (keep: boolean) => {
    if (keep && rename) {
      const eq = findEq(live.current.pivot, rename.id);
      const v = rename.value.trim();
      if (eq && v && v !== eq.repere) props.commit(updateEq(live.current.pivot, rename.id, { repere: v }));
    }
    setRename(null);
  };

  const hitEq = (p: Pt, exclude?: string): string | null => {
    let found: string | null = null;
    for (const [id, b] of boxes) {
      if (id === exclude) continue;
      if (p[0] >= b.x0 - 6 && p[0] <= b.x1 + 6 && p[1] >= b.y0 - 6 && p[1] <= b.y1 + 6) found = id;
    }
    return found;
  };

  const capture = (e: React.PointerEvent) => svg.current?.setPointerCapture(e.pointerId);

  const setHoverDelayed = useCallback((id: string | null) => {
    window.clearTimeout(hoverTimer.current);
    if (id) setHover(id);
    else hoverTimer.current = window.setTimeout(() => setHover(null), 260);
  }, []);

  const keepHover = () => window.clearTimeout(hoverTimer.current);

  // ---------- démarrage des gestes ----------

  const startPan = (e: React.PointerEvent) => {
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v: live.current.view };
    capture(e);
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    setMenu(null);
    if (e.button === 1 || space.current) return startPan(e);
    if (e.button !== 0) return;
    const p = toWorld(e.clientX, e.clientY);
    const base = e.shiftKey ? live.current.sel : { ...EMPTY_SEL };
    if (!e.shiftKey) props.setSel(base);
    drag.current = { kind: 'band', a: p, b: p, additive: e.shiftKey, base };
    capture(e);
    force((n) => n + 1);
  };

  const startMove = (e: React.PointerEvent, kind: 'eq' | 'chute', id: string) => {
    const s = live.current.sel;
    const list = kind === 'eq' ? s.eqs : s.chutes;
    let next: Selection;
    if (e.shiftKey) {
      next = list.includes(id)
        ? { ...s, [kind === 'eq' ? 'eqs' : 'chutes']: list.filter((x) => x !== id) }
        : { ...s, link: null, stub: null, [kind === 'eq' ? 'eqs' : 'chutes']: [...list, id] };
    } else if (list.includes(id)) {
      next = { ...s, link: null, stub: null };
    } else {
      next = { ...EMPTY_SEL, [kind === 'eq' ? 'eqs' : 'chutes']: [id] };
    }
    props.setSel(next);
    const pv = live.current.pivot;
    const item = kind === 'eq' ? findEq(pv, id) : pv.chutes.find((c) => c.id === id);
    if (!item) return;
    // Les machines accolées (overband, poulie) suivent leur convoyeur.
    const carried = next.eqs.flatMap((eqId) => dockedOn(pv, eqId)).filter((x) => !next.eqs.includes(x));
    drag.current = {
      kind: 'move',
      start: pv,
      a: toWorld(e.clientX, e.clientY),
      eqs: [...next.eqs, ...carried],
      chutes: next.chutes,
      primary: [item.x, item.y],
      primaryId: kind === 'eq' ? id : null,
      moved: false,
      clicked: !e.shiftKey && list.includes(id) ? id : null,
    };
    capture(e);
  };

  const onEqDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (e.button === 1 || space.current) return startPan(e);
    if (e.button !== 0) return;
    startMove(e, 'eq', id);
  }, []);


  const startWire = (e: React.PointerEvent, src: { eq: string; ch: number; dir: Dir }, origin: Pt, ref?: OutputRef, linkId?: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const p = toWorld(e.clientX, e.clientY);
    const mode = linkId ? 'retarget' : ref ? 'stub' : 'new';
    setMenu(null);
    drag.current = { kind: 'wire', mode, src, ref, linkId, a: p, cur: p, moved: false, target: null, targetCh: 1, origin };
    setTip(null);
    capture(e);
  };

  /** Canal visé sous le curseur : bandes parallèles au flux, comme les séparations dessinées. */
  const channelAt = (eqId: string, p: Pt): number => {
    const eq = findEq(live.current.pivot, eqId);
    const b = boxes.get(eqId);
    if (!eq || !b || eq.channels.length <= 1) return 1;
    // Machine accolée : ses canaux suivent ceux du tapis.
    const belt = eq.dockSize && eq.dockedTo ? findEq(live.current.pivot, eq.dockedTo) : undefined;
    if (belt) return dockedChannelAt(eq, b, belt.flow, p[0], p[1]);
    const d = isHorizontal(eq.flow) ? p[1] - b.cy : p[0] - b.cx;
    // Bandes de largeur propre à chaque canal : le canal est celui dont la bande contient le curseur.
    for (let k = 1; k <= eq.channels.length; k++) {
      const [lo, hi] = chEdges(eq, k);
      if (d >= lo && d <= hi) return k;
    }
    return d < 0 === leftSign(eq.flow) > 0 ? 1 : eq.channels.length;
  };

  // ---------- suivi ----------

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      props.setView(() => ({ ...d.v, px: d.v.px + e.clientX - d.sx, py: d.v.py + e.clientY - d.sy }));
      return;
    }
    const p = toWorld(e.clientX, e.clientY);
    if (d.kind === 'band') {
      d.b = p;
      force((n) => n + 1);
      return;
    }
    if (d.kind === 'move') {
      const dx = p[0] - d.a[0];
      const dy = p[1] - d.a[1];
      if (!d.moved && Math.hypot(dx, dy) * view.zoom < 3) return;
      d.moved = true;
      let nx = snap(d.primary[0] + dx);
      let ny = snap(d.primary[1] + dy);
      const others: Box[] = [];
      for (const [id, b] of boxes) if (!d.eqs.includes(id)) others.push(b);
      // Priorité aux axes de canal des EQ reliés (trait droit), puis aux centres des autres EQ.
      const axis = d.primaryId ? axisCandidates(d.start, d.primaryId, nx, ny, new Set(d.eqs)) : { xs: [], ys: [] };
      const ga = guideSnap({ cx: nx, cy: ny }, axis.xs, axis.ys, 12 / view.zoom);
      const go = guideSnap({ cx: nx, cy: ny }, others.map((o) => o.cx), others.map((o) => o.cy), 6 / view.zoom);
      const gx = ga.gx ?? go.gx;
      const gy = ga.gy ?? go.gy;
      if (gx !== undefined) nx = gx;
      if (gy !== undefined) ny = gy;
      setGuides({ gx, gy });
      props.preview(moveItems(d.start, d.eqs, d.chutes, nx - d.primary[0], ny - d.primary[1]));
      return;
    }
    if (d.kind === 'wire') {
      d.cur = p;
      if (!d.moved && Math.hypot(p[0] - d.a[0], p[1] - d.a[1]) * view.zoom > 4) d.moved = true;
      d.target = d.moved ? hitEq(p, d.src.eq) : null;
      d.targetCh = d.target ? channelAt(d.target, p) : 1;
      force((n) => n + 1);
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setGuides({});
    if (!d) return;
    const { commit } = live.current;
    const pv = live.current.pivot;
    if (d.kind === 'band') {
      const x0 = Math.min(d.a[0], d.b[0]);
      const x1 = Math.max(d.a[0], d.b[0]);
      const y0 = Math.min(d.a[1], d.b[1]);
      const y1 = Math.max(d.a[1], d.b[1]);
      if (x1 - x0 > 2 || y1 - y0 > 2) {
        const inside = (b: Box) => b.x1 > x0 && b.x0 < x1 && b.y1 > y0 && b.y0 < y1;
        const eqs = pv.equipments.filter((q) => inside(boxes.get(q.id)!)).map((q) => q.id);
        const chutes = pv.chutes.filter((q) => inside(boxAt(q.x, q.y, CHUTE_SIZE.w, CHUTE_SIZE.h))).map((q) => q.id);
        props.setSel({
          ...EMPTY_SEL,
          eqs: [...new Set([...(d.additive ? d.base.eqs : []), ...eqs])],
          chutes: [...new Set([...(d.additive ? d.base.chutes : []), ...chutes])],
        });
      }
      force((n) => n + 1);
      return;
    }
    if (d.kind === 'move') {
      if (d.moved) {
        // Overband / poulie lâché près d'un convoyeur : il s'y accole (et le lien se crée).
        let q = pv;
        for (const eqId of d.eqs) q = dockOnDrop(q, eqId);
        // Goulottes lâchées près d'une autre : assemblées bord à bord.
        if (d.chutes.length) q = assembleChutes(q, d.chutes);
        commit(q, d.start);
      }
      else if (d.clicked) props.setSel({ ...EMPTY_SEL, eqs: findEq(pv, d.clicked) ? [d.clicked] : [], chutes: findEq(pv, d.clicked) ? [] : [d.clicked] });
      return;
    }
    if (d.kind === 'wire') {
      const src = findEq(pv, d.src.eq);
      if (!src) return;
      const at = toWorld(e.clientX, e.clientY);
      const r0 = host.current!.getBoundingClientRect();
      const menuAt = { x: e.clientX - r0.left, y: e.clientY - r0.top };
      if (d.mode === 'new' && !d.moved) {
        // Clic sur un « + » : petit menu (convoyeur par défaut, dernier choix, autre équipement).
        setMenu({ ...menuAt, src: d.src });
        force((n) => n + 1);
        return;
      }
      if (!d.moved) {
        // Clic sur une sortie libre : même menu, pour la raccorder à un nouvel équipement.
        if (d.ref) (setTip(null), setMenu({ ...menuAt, src: d.src, ref: d.ref }));
        return force((n) => n + 1);
      }
      const target = d.target ? findEq(pv, d.target) : null;
      if (d.mode === 'retarget') {
        if (target && d.linkId) commit(setLinkTarget(pv, d.linkId, { eq: target.id, ch: d.targetCh }));
        return force((n) => n + 1);
      }
      // Trait d'une sortie du tapis vers une machine posée dessus : raccordement de ce canal du tapis au
      // canal visé de la machine (un joint, pas un trait ; la sortie principale reste libre).
      if (target && target.dockedTo === src.id && d.src.dir === 'avant') {
        commit(dockLinkTo(pv, src.id, d.src.ch, target.id, d.targetCh));
        return force((n) => n + 1);
      }
      if (target) {
        const o = d.ref ? { p: pv, ref: d.ref } : addOutput(pv, src.id, d.src.ch, d.src.dir);
        if (o.ref) commit(connect(o.p, o.ref, { eq: target.id, ch: d.targetCh }));
      } else if (d.mode === 'new' || d.ref) {
        // Lâché dans le vide : même menu, l'équipement choisi sera posé à cet endroit.
        setMenu({ ...menuAt, src: d.src, at, ref: d.ref });
      }
      force((n) => n + 1);
    }
  };

  /** Supprime une sortie en attente (depuis son menu) ; les sorties suivantes du canal se renumérotent. */
  const dropPending = (ref: OutputRef) => {
    setMenu(null);
    // Dernière sortie d'un canal : obligatoire (sauf stockage) — rien n'est supprimé.
    const e = findEq(live.current.pivot, ref.eq);
    if (!e || !canRemoveOutput(e, ref.ch, ref.dir)) return;
    props.commit(removeOutput(live.current.pivot, ref));
    props.setSel(EMPTY_SEL);
  };

  /** Crée l'équipement choisi dans le menu du « + », déjà raccordé à la sortie. */
  /** Pose une machine sur le tapis : créée sur lui (valoriste : au-dessus / à gauche), puis accolée. */
  const dockFromMenu = (m: DockMenu, hg0: string) => {
    const pv = live.current.pivot;
    const conv = findEq(pv, m.conv);
    setDockMenu(null);
    if (!conv) return;
    const b = eqBox(conv);
    const flank = dockKind(hg0) === 'flank';
    const at: Pt = !flank ? [b.cx, b.cy] : isHorizontal(conv.flow) ? [b.cx, b.y0 - 12] : [b.x0 - 12, b.cy];
    const made = addEq(cat, pv, hg0, at[0], at[1], { zone: zoneOf(conv.repere), repere: chainRepere(pv, conv, hg0) });
    props.commit(dockOnDrop(made.p, made.id));
    props.setSel({ ...EMPTY_SEL, eqs: [made.id] });
  };

  const addFromMenu = (m: AddMenu, hg0: string, command?: 'KM' | 'DRIV') => {
    const pv = live.current.pivot;
    const src = findEq(pv, m.src.eq);
    setMenu(null);
    // Le pivot a pu changer depuis l'ouverture du menu (planche « Autre équipement… », annuler) : la source,
    // son canal et, pour une sortie libre, la sortie elle-même doivent encore exister.
    if (!src || !src.channels[m.src.ch - 1]) return;
    let next: { p: Pivot; id: string | null };
    if (m.ref) {
      const ref = m.ref;
      const at = m.at ?? (() => { const q = placeNext(pv, src, ref.dir, hg0, ref.ch); return [q.x, q.y] as Pt; })();
      const exists = outputsOf(src, ref.ch, ref.dir).some((o) => o.num === ref.num);
      if (!exists || pv.links.some((l) => sameOutput(l.from, ref))) return;
      // Même sens que le « + » : une sortie arrière repart à contre-flux. Machine posée sur un tapis : le
      // sens suit l'endroit où on pose l'équipement (en haut, en bas, à gauche, à droite).
      const flow = src.dockedTo && m.at ? towards(src, m.at) : ref.dir === 'avant' ? src.flow : opposite(src.flow);
      const made = addEq(cat, pv, hg0, at[0], at[1], { flow, zone: zoneOf(src.repere), repere: chainRepere(pv, src, hg0), command });
      next = { p: connect(made.p, ref, { eq: made.id, ch: 1 }), id: made.id };
    } else {
      next = addOutputWithNext(cat, pv, src.id, m.src.ch, m.src.dir, hg0, m.at ? { x: m.at[0], y: m.at[1] } : undefined, command);
      // Machine posée sur un tapis : l'équipement ajouté prend le sens de l'endroit où on l'a posé.
      if (src.dockedTo && m.at && next.id) next = { ...next, p: updateEq(next.p, next.id, { flow: towards(src, m.at) }) };
    }
    if (!next.id) return;
    props.commit(next.p);
    props.setSel({ ...EMPTY_SEL, eqs: [next.id] });
    // Le convoyeur est toujours proposé en tête : seul un autre choix devient le « dernier choix ».
    if (hg0 !== DEFAULT_NEXT) props.onChosen(hg0);
  };

  // ---------- dépôt depuis la bibliothèque ----------

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const hg0 = e.dataTransfer.getData('text/x-hg0');
    const isChute = e.dataTransfer.getData('text/x-chute');
    const p = toWorld(e.clientX, e.clientY);
    const pv = live.current.pivot;
    if (hg0) {
      const last = pv.equipments[pv.equipments.length - 1];
      const r = addEq(cat, pv, hg0, p[0], p[1], { zone: last ? zoneOf(last.repere) : undefined });
      props.commit(dockOnDrop(r.p, r.id));
      props.setSel({ ...EMPTY_SEL, eqs: [r.id] });
    } else if (isChute) {
      const r = addChute(pv, p[0], p[1]);
      props.commit(r.p);
      props.setSel({ ...EMPTY_SEL, chutes: [r.id] });
    }
  };

  // ---------- infobulles ----------

  const eqTip = (id: string) => {
    const eq = findEq(pivot, id);
    const b = boxes.get(id);
    if (!eq || !b) return;
    const d = hgDef(cat, hg0Of(eq));
    // Repère et descriptif sont des données : jamais passés à rich.
    const lines: TipLine[] = [
      { text: `${eq.repere || '?'} — ${eq.descriptif || hgLabel(d)}`, kind: 'title' },
      { text: `${hgLabel(d)} · ${tx(L.nbChannels, eq.channels.length)} · ${tx(L.nbHg, eq.hg.length)}`, kind: 'sub' },
      { text: eq.hg.map((h) => h.type).join(' · '), kind: 'tech' },
    ];
    // Message du rapport et raisons d'incomplétude : textes à marqueurs [HS] (files.ts, rules.ts).
    const f = props.faults.get(id);
    if (f) lines.push({ text: rich(f), kind: 'fault' });
    for (const r of props.incomplete.get(id) ?? []) lines.push({ text: rich(r), kind: 'warn' });
    lines.push({ text: rich(tx(L.openSheet)), kind: 'hint' });
    // Au-dessus de ce qui dépasse du haut de la forme, pour ne rien cacher : l'onglet des canaux en flux
    // horizontal ; en flux vertical, les « + » du haut (à 26 du bord, rayon 11, n° de canal au-dessus).
    const above = isNoAction(cat, eq) ? 4 : isHorizontal(eq.flow) ? TAB.gap + TAB.h + 2 : eq.channels.length > 1 ? 46 : 39;
    const h = toHost([b.x0, b.y0]);
    setTip({ source: 'eq', x: h[0], y: h[1] - 14 - above * view.zoom, lines });
  };

  useEffect(() => {
    if (hover && !drag.current) eqTip(hover);
    else setTip((t) => (t?.source === 'eq' ? null : t));
  }, [hover, pivot, view, lang]);

  const pointerTip = (e: React.PointerEvent, lines: TipLine[]) => {
    const r = host.current!.getBoundingClientRect();
    setTip({ source: 'pointer', x: e.clientX - r.left + 14, y: e.clientY - r.top + 12, lines });
  };

  /** Infobulle d'un lien : phrase simple, puis noms techniques en petit. */
  const linkTip = (lk: { id: string; from: OutputRef; to: { eq: string; ch: number } }): TipLine[] => {
    const a = findEq(pivot, lk.from.eq);
    const b = findEq(pivot, lk.to.eq);
    const ra = a?.repere || '?';
    const rb = b?.repere || '?';
    const fwd = lk.from.dir === 'avant';
    return [
      { text: tx(L.linkTitle, ra, rb), kind: 'title' },
      { text: tx(L.linkSub, lk.from.num, fwd, outputPolarity(a, lk.from.ch, lk.from.dir, lk.from.num), lk.from.ch, (a?.channels.length ?? 1) > 1, lk.to.ch, (b?.channels.length ?? 1) > 1), kind: 'sub' },
      ...(loops.has(lk.id) ? [{ text: tx(L.loop), kind: 'sub' as const }] : []),
      { text: `${ra}_CH${pad2(lk.from.ch)} · S${lk.from.num} → ${rb}_CH${pad2(lk.to.ch)}`, kind: 'tech' },
      { text: rich(tx(L.linkHint)), kind: 'hint' },
    ];
  };

  const stubTip = (ref: OutputRef): TipLine[] => {
    const a = findEq(pivot, ref.eq);
    const ra = a?.repere || '?';
    // Canal nommé par sa place dans le sens du flux : un seul → principal ; sinon gauche, (centre,) droit.
    const n = a?.channels.length ?? 1;
    const ch = n < 2 ? L.chMain : ref.ch === 1 ? L.chLeft : ref.ch === n ? L.chRight : L.chCenter;
    return [
      { text: tx(L.stubTitle, ra, tx(ch)), kind: 'title' },
      { text: tx(L.stubSub, outputPolarity(a, ref.ch, ref.dir, ref.num), ref.dir === 'avant'), kind: 'sub' },

    ];
  };

  // ---------- rendu ----------

  const d = drag.current;
  const handleEq = !d && (hover ?? (sel.eqs.length === 1 ? sel.eqs[0] : null));
  const handleTarget = handleEq ? findEq(pivot, handleEq) : undefined;
  const band = d?.kind === 'band' ? d : null;
  const wire = d?.kind === 'wire' && d.moved ? d : null;
  const selLink = sel.link ? routed.links.find((l) => l.id === sel.link) : undefined;
  const wireNum = wire ? (wire.ref ? wire.ref.num : nextOutputNum(findEq(pivot, wire.src.eq)!, wire.src.ch, wire.src.dir) ?? 1) : 1;

  return (
    <div
      ref={host}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'var(--pid-out)', touchAction: 'none' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <svg
        ref={svg}
        width="100%"
        height="100%"
        style={{ display: 'block', userSelect: 'none' }}
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={(e) => {
          const id = hitEq(toWorld(e.clientX, e.clientY));
          if (!id) return;
          // Fiche fermée : on l'ouvre ; fiche déjà ouverte : on renomme le repère sur place.
          const eq = findEq(pivot, id);
          if (props.drawerOpen && eq) {
            props.setSel({ ...EMPTY_SEL, eqs: [id] });
            props.onOpenEq(id);
            setRename({ id, value: eq.repere });
          } else props.onOpenEq(id);
        }}
        role="img"
        aria-label={tx(L.aria)}
      >
        <defs>
          <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.9" fill="#ffffff" fillOpacity="0.09" />
          </pattern>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <marker key={n} id={`arw-${n}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
              <path d="M0 0.5 L8 4 L0 7.5 Z" fill={outputColor(n)} />
            </marker>
          ))}
          <marker id="arw-sel" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M0 0.5 L8 4 L0 7.5 Z" fill="var(--pid-select)" />
          </marker>
        </defs>
        <g transform={`translate(${view.px} ${view.py}) scale(${view.zoom})`}>
          <text x={SCREEN.w} y={-10} textAnchor="end" style={{ font: '400 12px var(--font-sans)', fill: 'var(--text-muted)' }}>
            {tx(L.screen, pivot.site.name)}
          </text>
          <rect width={SCREEN.w} height={SCREEN.h} fill="var(--pid-bg)" />
          {props.grid && <rect width={SCREEN.w} height={SCREEN.h} fill="url(#dots)" pointerEvents="none" />}

          {pivot.chutes.map((c) => (
            <g key={c.id} onPointerDown={(e) => { e.stopPropagation(); if (e.button === 1 || space.current) return startPan(e); if (e.button === 0) startMove(e, 'chute', c.id); }} style={{ cursor: 'move' }}>
              <ChuteShape x={c.x} y={c.y} label={c.label === DEFAULT_CHUTE_LABEL ? tx(L.chute) : c.label} selected={sel.chutes.includes(c.id)} />
            </g>
          ))}

          <g fill="none" strokeLinejoin="round" strokeLinecap="round">
            {routed.links.map((l) => {
              if (wire && wire.mode === 'retarget' && wire.linkId === l.id) return null;
              const on = sel.link === l.id;
              const hot = hoverLink === l.id;
              const pts = l.points.map((q) => q.join(',')).join(' ');
              if (l.docked) return null; // joint dessiné par-dessus les équipements (plus bas)
              return (
                <g
                  key={l.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (e.button === 1 || space.current) return startPan(e);
                    props.setSel({ ...EMPTY_SEL, link: l.id });
                    setTip(null);
                  }}
                  onPointerEnter={(e) => { setHoverLink(l.id); if (sel.link !== l.id) pointerTip(e, linkTip(l.link)); }}
                  onPointerMove={(e) => hoverLink === l.id && sel.link !== l.id && pointerTip(e, linkTip(l.link))}
                  onPointerLeave={() => { setHoverLink(null); setTip(null); }}
                  style={{ cursor: 'pointer' }}
                >
                  <polyline points={pts} stroke="transparent" strokeWidth={10} />
                  <polyline
                    points={pts}
                    stroke={on ? 'var(--pid-select)' : outputColor(l.num)}
                    strokeWidth={on || hot ? 2.6 : l.dashed ? 1.6 : loops.has(l.id) ? 2.4 : 2}
                    strokeDasharray={lineDash(l.dashed, loops.has(l.id))}
                    strokeLinecap={loops.has(l.id) ? 'round' : undefined}
                    markerEnd={l.inner ? undefined : `url(#${on ? 'arw-sel' : 'arw-' + Math.min(l.num, 6)})`}
                  />
                </g>
              );
            })}
          </g>

          {pivot.equipments.map((eq) => (
            <EqNode
              key={eq.id}
              eq={eq}
              selected={selEqs.has(eq.id)}
              incomplete={props.incomplete.has(eq.id)}
              fault={props.faults.has(eq.id)}
              onDown={onEqDown}
              onHover={setHoverDelayed}
              belt={eq.dockedTo && boxes.get(eq.dockedTo) ? { box: boxes.get(eq.dockedTo)!, flow: findEq(pivot, eq.dockedTo)!.flow } : undefined}
            />
          ))}

          {/* Sorties en attente : après les équipements, leur « + » passe au-dessus des repères. */}
          <g>
            {routed.stubs.map((s, _i, all) => {
              // Sorties en attente côte à côte (même équipement, même côté) : étiquettes échelonnées une sur
              // deux le long du trait, pour qu'elles ne se chevauchent pas.
              const [sa, sb] = s.points;
              const side = (q: typeof s) => `${q.ref.eq}|${Math.sign(q.points[1][0] - q.points[0][0])}|${Math.sign(q.points[1][1] - q.points[0][1])}`;
              const mates = all.filter((q) => side(q) === side(s)).sort((x, y) => x.points[0][0] - y.points[0][0] || x.points[0][1] - y.points[0][1]);
              // Échelonnées seulement si elles se chevaucheraient (étiquettes plus larges que l'écart des sorties).
              const gapOf = (q: typeof s, r: typeof s) => Math.abs(q.points[0][0] - r.points[0][0]) + Math.abs(q.points[0][1] - r.points[0][1]);
              // Encombrement d'une étiquette en travers des sorties : sa largeur (sorties côte à côte, vers le
              // haut ou le bas) ou sa hauteur (sorties empilées, vers la gauche ou la droite ; signes − / + petits).
              const across = (q: typeof s) => {
                const t = shortTag(findEq(pivot, q.ref.eq), q.ref.ch, q.ref.num, q.ref.dir);
                return q.points[0][0] === q.points[1][0] ? textWidth(t, FONT.out) : /^[−+]+$/.test(t) ? FONT.sign * 0.9 : FONT.out * 0.9;
              };
              const wide = mates.some((q, i) => i > 0 && across(q) + 2 > gapOf(q, mates[i - 1]));
              const stagger = wide && mates.indexOf(s) % 2 === 1 ? FONT.out * 1.2 : 0;
              const on = !!sel.stub && sameOutput(sel.stub, s.ref);
              const [a, b] = s.points;
              return (
                <g
                  key={s.key}
                  onPointerDown={(e) => {
                    props.setSel({ ...EMPTY_SEL, stub: s.ref });
                    startWire(e, { eq: s.ref.eq, ch: s.ref.ch, dir: s.ref.dir }, b, s.ref);
                  }}
                  onPointerEnter={(e) => { setHoverStub(s.key); pointerTip(e, stubTip(s.ref)); }}
                  onPointerLeave={() => { setHoverStub(null); setTip(null); }}
                  style={{ cursor: 'crosshair' }}
                >
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={10} />
                  {/* Sortie libre (en attente de raccordement) : accentuée en orange, à raccorder ou à supprimer. */}
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={on ? 'var(--pid-select)' : 'var(--abi-orange-text)'} strokeWidth={2.4} strokeDasharray={s.dashed ? '4 3' : undefined} />
                  {hoverStub === s.key || on ? (
                    // Au survol : « + » au bout de la sortie, clic = choisir l'équipement à raccorder.
                    <g>
                      <circle cx={b[0]} cy={b[1]} r={6} fill="var(--pid-band)" stroke="var(--abi-green)" strokeWidth={1.4} />
                      <path d={`M${b[0] - 3} ${b[1]} h6 M${b[0]} ${b[1] - 3} v6`} stroke="#fff" strokeWidth={1.4} strokeLinecap="round" />
                    </g>
                  ) : (
                    <circle cx={b[0]} cy={b[1]} r={2.6} fill="var(--abi-orange-text)" />
                  )}
                  {/* Étiquette dans le prolongement du trait. */}
                  <text x={b[0] + (b[0] - a[0]) * 0.5 + (b[0] === a[0] ? 0 : Math.sign(b[0] - a[0]) * (4 + stagger))} y={b[1] + (b[1] - a[1]) * 0.5 + (b[1] === a[1] ? 0 : Math.sign(sb[1] - sa[1]) * stagger)} textAnchor={b[0] === a[0] ? 'middle' : b[0] > a[0] ? 'start' : 'end'} dominantBaseline="central" style={{ ...TAG_STYLE, pointerEvents: 'auto', cursor: 'crosshair', fill: on ? 'var(--pid-select)' : 'var(--abi-orange-text)' }}>
                    {tagText(shortTag(findEq(pivot, s.ref.eq), s.ref.ch, s.ref.num, s.ref.dir))}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Fins de flèche qui traversent un équipement jusqu'à l'axe du canal visé : par-dessus les formes. */}
          <g pointerEvents="none" fill="none" strokeLinecap="round">
            {routed.links.filter((l) => l.inner && !(wire && wire.mode === 'retarget' && wire.linkId === l.id)).map((l) => {
              const on = sel.link === l.id;
              const [a, b] = l.inner!;
              return (
                <line
                  key={l.id}
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  stroke={on ? 'var(--pid-select)' : outputColor(l.num)}
                  strokeWidth={on || hoverLink === l.id ? 2.6 : l.dashed ? 1.6 : loops.has(l.id) ? 2.4 : 2}
                  strokeDasharray={lineDash(l.dashed, loops.has(l.id))}
                  strokeLinecap={loops.has(l.id) ? 'round' : undefined}
                  markerEnd={`url(#${on ? 'arw-sel' : 'arw-' + Math.min(l.num, 6)})`}
                />
              );
            })}
          </g>

          {/* Joints des machines posées sur un tapis : ni dessinés ni cliquables (la représentation suffit). */}
          {/* Étiquettes des sorties : par-dessus tous les traits (jamais cachées derrière une flèche). Clic = sélectionner le trait. */}
          <g>
            {routed.links.map((l) => {
              if (wire && wire.mode === 'retarget' && wire.linkId === l.id) return null;
              if (l.docked) return null;
              const text = linkTag(l.link, loops.has(l.id));
              if (!text) return null;
              const ta = tags.get(l.id) ?? tagAnchor(l.points);
              const on = sel.link === l.id;
              // Pastille comme les numéros des joints, posée sur le trait (le trait se devine derrière).
              const w = textWidth(text, FONT.joint) + 3;
              const h = FONT.joint + 3;
              const x0 = ta.anchor === 'middle' ? ta.x - w / 2 : ta.x;
              return (
                <g
                  key={l.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (e.button === 1 || space.current) return startPan(e);
                    props.setSel({ ...EMPTY_SEL, link: l.id });
                    setTip(null);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect x={x0} y={ta.y - h / 2} width={w} height={h} rx={2} fill={on ? 'var(--pid-select)' : 'var(--pid-stroke-light)'} fillOpacity={0.88} />
                  <text x={x0 + w / 2} y={ta.y} textAnchor="middle" dominantBaseline="central" style={{ font: `600 ${FONT.joint}px var(--font-tag)`, fill: '#262c2a', pointerEvents: 'none' }}>
                    {text}
                  </text>
                </g>
              );
            })}
            {/* « AR » de la marche arrière : sur le trait pointillé, au milieu de son plus long segment. */}
            {routed.links.filter((l) => l.dashed && !(wire && wire.mode === 'retarget' && wire.linkId === l.id)).map((l) => {
              const m = arMark(l.points);
              return (
                <text key={'ar-' + l.id} x={m.x} y={m.y} textAnchor={m.anchor} dominantBaseline="central" style={{ ...TAG_STYLE, fill: sel.link === l.id ? 'var(--pid-select)' : TAG_STYLE.fill }}>
                  AR
                </text>
              );
            })}
          </g>

          {wire && (
            <g pointerEvents="none">
              {wire.target && boxes.get(wire.target) && (() => {
                const b = boxes.get(wire.target)!;
                const t = findEq(pivot, wire.target)!;
                const n = t.channels.length;
                const k = wire.targetCh;
                // Bande du canal visé, entre ses séparations (comme channelAt et les séparations
                // dessinées) ; les bandes extrêmes vont jusqu'au bord de la boîte.
                const hor = isHorizontal(t.flow);
                const c0 = hor ? b.cy : b.cx;
                const [e0, e1] = chEdges(t, k);
                const lo = c0 + e0;
                const hi = c0 + e1;
                const tBelt = t.dockSize && t.dockedTo ? findEq(pivot, t.dockedTo) : undefined;
                const db = tBelt ? dockedBand(t, b, tBelt.flow, k) : null;
                const band = db
                  ? { x: db.x0, y: db.y0, w: db.w, h: db.h }
                  : hor
                    ? { x: b.x0 - 3, y: lo, w: b.w + 6, h: hi - lo }
                    : { x: lo, y: b.y0 - 3, w: hi - lo, h: b.h + 6 };
                return (
                  <g>
                    <rect x={b.x0 - 6} y={b.y0 - 6} width={b.w + 12} height={b.h + 12} rx={7} fill="none" stroke="var(--pid-select)" strokeWidth={2} />
                    {n > 1 && <rect x={band.x} y={band.y} width={band.w} height={band.h} fill="rgba(6,208,110,0.28)" stroke="var(--pid-select)" strokeWidth={1.2} />}
                    {/* Canal visé (seulement s'il y a un choix) : mot simple, puis nom technique (08Aa_CH02) en petit. */}
                    {n > 1 && <text x={b.cx} y={b.y0 - 14} textAnchor="middle" style={{ font: '600 12px var(--font-sans)', fill: 'var(--abi-green-glow)', paintOrder: 'stroke', stroke: 'var(--pid-bg)', strokeWidth: 4, strokeLinejoin: 'round' }}>
                      {tx(L.targetCh, wire.targetCh)}
                      <tspan dx={5} style={{ font: '600 9px var(--font-tag)', fill: 'var(--pid-caption)' }}>
                        {(t.repere || '?') + '_CH' + pad2(wire.targetCh)}
                      </tspan>
                    </text>}
                  </g>
                );
              })()}
              <line x1={wire.origin[0]} y1={wire.origin[1]} x2={wire.cur[0]} y2={wire.cur[1]} stroke={outputColor(wireNum)} strokeWidth={2} strokeDasharray="6 4" markerEnd={`url(#arw-${Math.min(wireNum, 6)})`} />
            </g>
          )}

          {/* Machine posée sur le tapis, sélectionnée : un « − » / « + » par canal du tapis, sur son axe, juste en
              amont de la machine : retirer un canal traité (même celui du milieu) ou en ajouter un. */}
          {sel.eqs.length === 1 && (() => {
            const id = sel.eqs[0];
            const m = findEq(pivot, id);
            const belt = m?.dockedTo ? findEq(pivot, m.dockedTo) : undefined;
            const b = boxes.get(id);
            const bb = belt ? boxes.get(belt.id) : undefined;
            if (!m || !belt || !b || !bb || dockKind(hg0Of(m)) === 'flank') return null;
            const treated = new Set(pivot.links.filter((l) => l.from.eq === belt.id && l.to.eq === id && l.from.dir === 'avant').map((l) => l.from.ch));
            const hor = isHorizontal(belt.flow);
            const [fx, fy] = flowVec(belt.flow);
            const btn = (k: number) => {
              const kind: 'minus' | 'plus' = treated.has(k) ? 'minus' : 'plus';
              // Dernier canal traité : on ne le retire pas (la machine traite toujours au moins un canal).
              if (kind === 'minus' && treated.size < 2) return null;
              const a = chAxis(belt, k);
              const cx = hor ? b.cx - fx * (b.w / 2 + 7) : bb.cx + a;
              const cy = hor ? bb.cy + a : b.cy - fy * (b.h / 2 + 7);
              const lines: TipLine[] = [{ text: tx(kind === 'minus' ? L.coverLess : L.coverMore, belt.repere || '?', k), kind: 'title' }];
              return (
                <g
                  key={k}
                  onPointerEnter={(e) => pointerTip(e, lines)}
                  onPointerLeave={() => setTip(null)}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setTip(null);
                    props.commit(kind === 'minus' ? uncover(pivot, id, k) : cover(pivot, id, k));
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={cx} cy={cy} r={7} fill="transparent" />
                  <circle cx={cx} cy={cy} r={5.5} fill={kind === 'plus' ? 'var(--abi-green-deep)' : 'var(--abi-tint-red)'} stroke={kind === 'plus' ? 'var(--abi-green)' : 'var(--abi-orange)'} strokeWidth={1} />
                  <path d={kind === 'plus' ? `M${cx - 2.5} ${cy}h5M${cx} ${cy - 2.5}v5` : `M${cx - 2.5} ${cy}h5`} stroke="#fff" strokeWidth={1.3} strokeLinecap="round" />
                </g>
              );
            };
            return <g>{belt.channels.map((_, i) => btn(i + 1))}</g>;
          })()}
          {handleTarget && (
            <Handles
              cat={cat}
              eq={handleTarget}
              box={boxes.get(handleTarget.id)!}
              onEnter={keepHover}
              onLeave={() => setHoverDelayed(null)}
              onTip={pointerTip}
              onTipEnd={() => setTip(null)}
              onWire={startWire}
              pending={new Set(handleTarget.channels.flatMap((_, ci) => (['avant', 'arriere'] as Dir[]).filter((dir) => freeOutputNum(pivot, handleTarget, ci + 1, dir) !== null).map((dir) => `${ci + 1}|${dir}`)))}
              incomingLast={pivot.links.filter((l) => l.to.eq === handleTarget.id && l.to.ch === handleTarget.channels.length).length}
              others={[...boxes.entries()].filter(([id]) => id !== handleTarget.id).map(([, b]) => b)}
              channelCap={handleTarget.dockedTo ? findEq(pivot, handleTarget.dockedTo)?.channels.length : undefined}
              extent={(() => {
                // Tapis portant des machines : l'onglet des canaux se pose au-delà d'elles, côté entrée.
                const on = dockedOn(pivot, handleTarget.id).map((id) => boxes.get(id)).filter((b): b is Box => !!b);
                if (!on.length) return undefined;
                const all = [boxes.get(handleTarget.id)!, ...on];
                return { x0: Math.min(...all.map((b) => b.x0)), y0: Math.min(...all.map((b) => b.y0)), x1: Math.max(...all.map((b) => b.x1)), y1: Math.max(...all.map((b) => b.y1)) };
              })()}
              onAddChannel={() => props.commit(addChannel(pivot, handleTarget.id))}
              onRemoveChannel={() => props.commit(removeChannel(pivot, handleTarget.id, handleTarget.channels.length))}
              onBodyDown={(e) => onEqDown(e, handleTarget.id)}
              onDock={
                symbolOf(hg0Of(handleTarget)).group === 'Convoyage' && symbolOf(hg0Of(handleTarget)).base === 'pill'
                  ? (e) => {
                      const r0 = host.current!.getBoundingClientRect();
                      setTip(null);
                      setMenu(null);
                      setDockMenu({ x: e.clientX - r0.left, y: e.clientY - r0.top, conv: handleTarget.id });
                    }
                  : undefined
              }
            />
          )}

          {/* Pastille du lien sélectionné : après les poignées, pour rester saisissable sous l'onglet des canaux. */}
          {selLink && !wire && (() => {
            const tipPt = selLink.points[selLink.points.length - 1];
            return (
              <g
                onPointerDown={(e) => startWire(e, { eq: selLink.link.from.eq, ch: selLink.link.from.ch, dir: selLink.link.from.dir }, selLink.points[0], selLink.link.from, selLink.id)}
                onPointerEnter={(e) => pointerTip(e, [{ text: rich(tx(L.retarget)), kind: 'title' }])}
                onPointerLeave={() => setTip(null)}
                style={{ cursor: 'crosshair' }}
              >
                <circle cx={tipPt[0]} cy={tipPt[1]} r={9} fill="transparent" />
                <circle cx={tipPt[0]} cy={tipPt[1]} r={5} fill="var(--pid-band)" stroke="var(--pid-select)" strokeWidth={2} />
              </g>
            );
          })()}

          {guides.gx !== undefined && <line x1={guides.gx} y1={0} x2={guides.gx} y2={SCREEN.h} stroke="var(--pid-select)" strokeWidth={1 / view.zoom} strokeDasharray="4 4" pointerEvents="none" />}
          {guides.gy !== undefined && <line x1={0} y1={guides.gy} x2={SCREEN.w} y2={guides.gy} stroke="var(--pid-select)" strokeWidth={1 / view.zoom} strokeDasharray="4 4" pointerEvents="none" />}
          {band && (
            <rect
              x={Math.min(band.a[0], band.b[0])}
              y={Math.min(band.a[1], band.b[1])}
              width={Math.abs(band.b[0] - band.a[0])}
              height={Math.abs(band.b[1] - band.a[1])}
              fill="rgba(6,208,110,0.08)"
              stroke="var(--pid-select)"
              strokeWidth={1 / view.zoom}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      {tip && (
        <div style={{ position: 'absolute', left: tip.x, top: tip.y, transform: tip.source === 'eq' ? 'translateY(-100%)' : undefined, width: 'max-content', maxWidth: 380, padding: '8px 12px', background: 'var(--pid-band)', border: '1px solid #6f7a74', borderRadius: 4, pointerEvents: 'none', zIndex: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {tip.lines.map((l, i) => (
            // Retour à la ligne dans les 380 px (descriptif libre, message de rapport) ; la pile de HG coupe n'importe où.
            <span key={i} style={{ ...TIP_STYLE[l.kind ?? (i === 0 ? 'title' : 'sub')], whiteSpace: 'normal', overflowWrap: l.kind === 'tech' ? 'anywhere' : 'break-word', marginTop: l.kind === 'hint' && tip.lines[i - 1]?.kind !== 'hint' ? 3 : 0 }}>
              {l.text}
            </span>
          ))}
        </div>
      )}

      {rename && (() => {
        const eq = findEq(pivot, rename.id);
        const b = boxes.get(rename.id);
        if (!eq || !b) return null;
        const lp = labelPos(hg0Of(eq), b, eq.flow);
        const [hx, hy] = toHost([lp.x, lp.y]);
        return (
          <input
            autoFocus
            aria-label={tx(L.renameAria)}
            value={rename.value}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setRename({ ...rename, value: e.target.value })}
            onBlur={() => endRename(true)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') endRename(true);
              if (e.key === 'Escape') endRename(false);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', left: hx - 45, top: hy - 13, width: 90, height: 26, textAlign: 'center', font: '600 14px var(--font-tag)', color: '#fff', background: 'var(--surface-page)', border: '1px solid var(--abi-green)', zIndex: 6, outline: 'none' }}
          />
        );
      })()}
      {selLink && !wire && !menu && (() => {
        const ref = selLink.link.from;
        const src = findEq(pivot, ref.eq);
        if (!src) return null;
        const count = (src.channels[ref.ch - 1]?.outputs ?? []).filter((o) => o.dir === ref.dir).length;
        const dockedFree = dockedNumsFree(pivot, selLink.id);
        const tp = tags.get(selLink.id) ?? tagAnchor(selLink.points);
        const [hx, hy] = toHost([tp.x, tp.y]);
        const btn: React.CSSProperties = { minWidth: 24, height: 24, border: '1px solid var(--border-nav)', borderRadius: 3, cursor: 'pointer', font: '600 12px var(--font-tag)' };
        return (
          <div
            role="toolbar"
            aria-label={tx(L.numBar, src.repere || '?', chLabel(src, ref.ch))}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', left: hx - 10, top: hy + 12, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', background: 'var(--surface-page)', border: '1px solid var(--abi-green)', zIndex: 5, boxShadow: 'var(--shadow-drawer)' }}
          >
            {/* Une seule sortie dans ce sens : rien à réordonner, seulement la suppression. */}
            {count > 1 && <span title={tx(L.numHint)} style={{ font: '400 12px var(--font-sans)', color: 'var(--text-secondary)', marginRight: 2 }}>{tx(L.numBar, src.repere || '?', chLabel(src, ref.ch))}</span>}
            {count > 1 && Array.from({ length: count }, (_, i) => i + 1).map((n) => {
              // Même nom que sur le PID (« 2++ » quand une machine est posée sur le canal). Numéro tenu par
              // une machine posée sur le tapis : grisé, son rang suit le sens du flux.
              // Lien accolé (machine posée sur le tapis) : il peut prendre la place d'une autre machine, jamais la
              // sortie 1 ni celle d'une machine de tête ; lien ordinaire : jamais un numéro tenu par une machine.
              const docked = dockedLinks(pivot).has(selLink.id);
              const held = n !== ref.num && (docked ? !dockedFree.has(n) : (src.channels[ref.ch - 1]?.outputs ?? []).some((o) => o.dir === ref.dir && o.num === n && o.docked));
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={n === ref.num}
                  disabled={held}
                  title={held ? tx(L.numHeld) : tx(L.numHint)}
                  className="abi-btn"
                  onClick={() => !held && n !== ref.num && props.commit(docked ? swapDocked(pivot, selLink.id, n) : setOutputNum(pivot, ref, n))}
                  style={{ ...btn, background: n === ref.num ? 'var(--abi-green)' : 'var(--surface-nav)', color: held ? '#6f7a74' : '#fff', cursor: held ? 'not-allowed' : 'pointer', borderStyle: held ? 'dashed' : 'solid' }}
                >
                  {shortTag(src, ref.ch, n, ref.dir) || n}
                </button>
              );
            })}
            <button
              type="button"
              title={tx(L.delLink)}
              aria-label={tx(L.delLink)}
              className="abi-btn"
              onClick={() => { props.commit(removeLink(pivot, selLink.id)); props.setSel(EMPTY_SEL); }}
              style={{ ...btn, marginLeft: count > 1 ? 4 : 0, background: 'var(--abi-tint-red)', color: '#ffd7d3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        );
      })()}
      {dockMenu && (() => {
        const conv = findEq(pivot, dockMenu.conv);
        if (!conv) return null;
        const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '3px 10px 3px 4px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff' };
        const note = (hg0: string) => tx(dockKind(hg0) === 'head' ? L.dockHead : dockKind(hg0) === 'flank' ? L.dockFlank : L.dockOver);
        return (
          <div
            ref={menuRef}
            role="menu"
            aria-label={tx(L.dockTitle, conv.repere || '?')}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.ctrlKey || e.metaKey) return;
              e.stopPropagation();
              const all = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
              const at = all.indexOf(document.activeElement as HTMLElement);
              const go = (k: number) => { e.preventDefault(); all[(k + all.length) % all.length]?.focus(); };
              if (e.key === 'Escape' || e.key === 'Tab') (e.preventDefault(), setDockMenu(null));
              else if (e.key === 'ArrowDown') go(at + 1);
              else if (e.key === 'ArrowUp') go(at < 0 ? -1 : at - 1);
            }}
            style={{ position: 'absolute', left: dockMenu.x + 10, top: dockMenu.y + 10, width: 'max-content', minWidth: 250, background: 'var(--surface-page)', border: '1px solid var(--abi-green)', boxShadow: 'var(--shadow-drawer)', zIndex: 7 }}
          >
            <div style={{ padding: '7px 10px', background: 'var(--surface-panel-header)', font: '600 12px var(--font-sans)' }}>{tx(L.dockTitle, conv.repere || '?')}</div>
            {DOCK_MENU.filter((k) => cat.hgTypes[k]).map((k) => (
              <button key={k} type="button" role="menuitem" className="abi-row" onClick={() => dockFromMenu(dockMenu, k)} style={row}>
                <Glyph hg0={k} width={64} height={38} />
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ font: '500 13px var(--font-sans)' }}>
                    {hgLabel(cat.hgTypes[k])}
                  </span>
                  <span style={{ font: '400 11px var(--font-sans)', color: 'var(--text-muted)' }}>{note(k)}</span>
                </span>
              </button>
            ))}
          </div>
        );
      })()}
      {menu && (() => {
        const src = findEq(pivot, menu.src.eq);
        if (!src) return null;
        const items: { hg0: string; note: string; command?: 'KM' | 'DRIV'; variant?: string }[] = [];
        if (cat.hgTypes[DEFAULT_NEXT]?.principal) {
          // Convoyeur : deux choix de commande ; celui des réglages de base en tête, « par défaut ».
          const both = (['KM', 'DRIV'] as const).filter((c) => cat.hgTypes[c]);
          const first = both.includes(pivot.site.base.command as 'KM' | 'DRIV') ? (pivot.site.base.command as 'KM' | 'DRIV') : both[0];
          for (const c of [first, ...both.filter((x) => x !== first)].filter(Boolean))
            items.push({ hg0: DEFAULT_NEXT, command: c, variant: tx(c === 'KM' ? L.beltDirect : L.beltDrive), note: c === first ? tx(L.menuDefault) : '' });
          if (!both.length) items.push({ hg0: DEFAULT_NEXT, note: tx(L.menuDefault) });
        }
        if (props.currentNature !== DEFAULT_NEXT && cat.hgTypes[props.currentNature]) items.push({ hg0: props.currentNature, note: tx(L.menuLast) });
        const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '3px 10px 3px 4px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff' };
        const pos = menuPos ?? { left: menu.x + 10, top: menu.y + 10 };
        return (
          <div
            ref={menuRef}
            role="menu"
            aria-label={tx(L.menuTitle, src.repere || '?')}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              // Les touches restent dans le menu : sinon les raccourcis de l'App s'appliqueraient aussi (Entrée
              // ouvre la fiche, Échap la ferme, flèches et Suppr agissent sur la sélection, Espace déplace la vue).
              // Ctrl / Cmd passent (annuler…) : le menu se ferme alors avec le changement du pivot.
              if (e.ctrlKey || e.metaKey) return;
              e.stopPropagation();
              const all = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
              const at = all.indexOf(document.activeElement as HTMLElement);
              const go = (k: number) => {
                e.preventDefault();
                all[(k + all.length) % all.length]?.focus();
              };
              if (e.key === 'Escape') {
                e.preventDefault();
                setMenu(null);
              } else if (e.key === 'Tab') setMenu(null);
              else if ((e.key === 'Delete' || e.key === 'Backspace') && menu.ref) {
                e.preventDefault();
                dropPending(menu.ref);
              }
              else if (e.key === 'ArrowDown') go(at + 1);
              else if (e.key === 'ArrowUp') go(at < 0 ? -1 : at - 1);
              else if (e.key === 'Home') go(0);
              else if (e.key === 'End') go(-1);
            }}
            // Au-dessus de la fiche équipement (zIndex 6), sous les notifications (8).
            style={{ position: 'absolute', left: pos.left, top: pos.top, width: 'max-content', minWidth: 250, background: 'var(--surface-page)', border: '1px solid var(--abi-green)', boxShadow: 'var(--shadow-drawer)', zIndex: 7 }}
          >
            <div style={{ padding: '7px 10px', background: 'var(--surface-panel-header)', font: '600 12px var(--font-sans)' }}>
              {/* Mêmes textes que les bulles : « 08Aa - Canal de gauche », puis ce que fait le menu. */}
              {`${src.repere || '?'} - ${cap(chLabel(src, menu.src.ch))}`}
              <span style={{ ...TIP_STYLE.tech, marginLeft: 8 }}>
                {menu.ref ? tx(L.menuLinkPending) : tx(menu.src.dir === 'avant' ? L.addOutOn : L.addOutBackOn, outputsOf(src, menu.src.ch, menu.src.dir).length + 1)}
              </span>
            </div>
            {items.map((it) => (
              <button key={it.hg0 + (it.command ?? '')} type="button" role="menuitem" className="abi-row" onClick={() => addFromMenu(menu, it.hg0, it.command)} style={row}>
                <Glyph hg0={it.hg0} width={64} height={38} />
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* Libellé puis code HG en petit, juste après le mot qu'il nomme. */}
                  <span style={{ font: '500 13px var(--font-sans)' }}>
                    {hgLabel(cat.hgTypes[it.hg0])}
                    {it.variant && ` — ${it.variant}`}
                  </span>
                  <span style={{ font: '400 11px var(--font-sans)', color: 'var(--text-muted)' }}>{it.note}</span>
                </span>
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              className="abi-row"
              onClick={() => {
                const m = menu;
                setMenu(null);
                props.onPickOther((hg0) => addFromMenu(m, hg0));
              }}
              style={{ ...row, padding: '9px 10px', borderTop: '1px solid var(--border-divider)' }}
            >
              <Icon name="grid" size={18} />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ font: '500 13px var(--font-sans)' }}>{tx(L.menuOther)}</span>
              </span>
            </button>
            {/* Sortie en attente : on peut aussi la supprimer d'ici (le menu garde le clavier). */}
            {menu.ref && canRemoveOutput(src, menu.ref.ch, menu.ref.dir) && (
              <button type="button" role="menuitem" className="abi-row" onClick={() => dropPending(menu.ref!)} style={{ ...row, padding: '9px 10px', borderTop: '1px solid var(--border-divider)' }}>
                <Icon name="trash" size={18} color="var(--pid-fault-stroke)" />
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ font: '500 13px var(--font-sans)' }}>{tx(L.menuDelete)}</span>
                </span>
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/**
 * Poignées au survol : « + » des sorties (avant / arrière, une par canal) et, hors de la forme (voir TAB),
 * l'onglet des canaux « − 2 canaux + » (le « − » retire le dernier canal).
 */
function Handles(props: {
  cat: Catalogue;
  eq: Eq;
  box: Box;
  onEnter: () => void;
  onLeave: () => void;
  onTip: (e: React.PointerEvent, lines: TipLine[]) => void;
  onTipEnd: () => void;
  onWire: (e: React.PointerEvent, src: { eq: string; ch: number; dir: Dir }, origin: Pt) => void;
  incomingLast: number;
  /** Canaux et sens (« 1|avant ») qui ont déjà une sortie en attente : pas de « + » nouvelle sortie. */
  pending: Set<string>;
  /** Boîtes des autres équipements : l'onglet des canaux se pose là où il ne les recouvre pas. */
  others: Box[];
  onAddChannel: () => void;
  onRemoveChannel: () => void;
  /** Appui sur le corps de l'onglet : comme sur l'équipement (sélection, déplacement). */
  onBodyDown: (e: React.PointerEvent) => void;
  /** Convoyeur : « + » au bout, dedans, pour poser une machine dessus (overband, robot…). */
  onDock?: (e: React.PointerEvent) => void;
  /** Machine posée sur un tapis : nombre de canaux maximal (celui du tapis). */
  channelCap?: number;
  /** Tapis portant des machines : boîte qui les englobe ; l'onglet des canaux se pose au-delà, côté entrée. */
  extent?: { x0: number; y0: number; x1: number; y1: number };
}) {
  const { eq, box } = props;
  if (isNoAction(props.cat, eq)) return null;
  const n = eq.channels.length;
  const blocked = reverseBlocked(eq);
  const chip = (dir: Dir, ch: number, at: Pt, small = false) => {
    const r = small ? 6 : 7.5;
    const k = small ? 3 : 3.5;
    const ok = canAddOutput(eq, ch, dir);
    const num = nextOutputNum(eq, ch, dir);
    // Nouvelle sortie seulement quand toutes les sorties du canal sont raccordées.
    if (num === null || props.pending.has(`${ch}|${dir}`)) return null;
    // Canal nommé par sa place dans le sens du flux : un seul → principal ; sinon gauche, (centre,) droit.
    const chName = tx(n < 2 ? L.chMain : ch === 1 ? L.chLeft : ch === n ? L.chRight : L.chCenter);
    const lines: TipLine[] = ok
      ? [
          // « Ajouter une sortie (passer à 2) », dessous le canal (principal, de gauche…), comme l'onglet des canaux.
          { text: tx(dir === 'avant' ? L.addOutOn : L.addOutBackOn, outputsOf(eq, ch, dir).length + 1), kind: 'title' },
          { text: `${eq.repere || '?'} - ${cap(chName)}`, kind: 'sub' },
        ]
      : [
          { text: tx(L.reverseOff), kind: 'title' },
          { text: rich(blocked ?? tx(L.unavailable)), kind: 'sub' },
        ];
    return (
      <g
        key={dir + ch}
        onPointerEnter={(e) => { props.onEnter(); props.onTip(e, lines); }}
        onPointerLeave={() => { props.onLeave(); props.onTipEnd(); }}
        onPointerDown={(e) => {
          if (!ok) return e.stopPropagation();
          props.onTipEnd();
          props.onWire(e, { eq: eq.id, ch, dir }, at);
        }}
        // Indisponible (marche arrière non programmée) : à peine visible, l'infobulle explique au survol.
        style={{ cursor: ok ? 'pointer' : 'not-allowed', opacity: ok ? 1 : 0.3 }}
      >
        <circle cx={at[0]} cy={at[1]} r={11} fill="transparent" />
        <circle cx={at[0]} cy={at[1]} r={r} fill="var(--pid-band)" stroke={ok ? 'var(--abi-green)' : '#6f7a74'} strokeWidth={small ? 1.4 : 1.5} strokeDasharray={dir === 'arriere' ? '2.5 2' : undefined} />
        <path d={`M${at[0] - k} ${at[1]} h${2 * k} M${at[0]} ${at[1] - k} v${2 * k}`} stroke={ok ? '#fff' : '#6f7a74'} strokeWidth={1.5} strokeLinecap="round" />
        {n > 1 && ok && (
          // Numéro du canal à l'extérieur du « + », dans le sens de la sortie (pas sur le « + » voisin).
          <text x={at[0] + flowVec(dir === 'avant' ? eq.flow : opposite(eq.flow))[0] * 13} y={at[1] + flowVec(dir === 'avant' ? eq.flow : opposite(eq.flow))[1] * 13} textAnchor="middle" dominantBaseline="central" style={{ font: `600 ${FONT.stub}px var(--font-tag)`, fill: 'var(--pid-caption)', pointerEvents: 'none' }}>
            {ch}
          </text>
        )}
      </g>
    );
  };

  // Onglet des canaux, hors de la forme : au-dessus en flux horizontal, à droite en flux vertical.
  // Machine posée sur un tapis : jamais plus de canaux que lui (tricanal seulement sur un tapis tricanal).
  const addCh = canAddChannel(eq) && (props.channelCap === undefined || n < props.channelCap);
  const rmCh = n > 1;
  const TW = TAB.w;
  const TH = TAB.h;
  const hor = isHorizontal(eq.flow);
  // Emplacements essayés dans l'ordre : au-dessus / dessous (flux horizontal), à droite / à gauche
  // (flux vertical), puis les deux autres ; le premier qui ne recouvre aucun équipement voisin.
  // Sur les côtés qui portent les « + » de sortie, l'onglet se pose au-delà d'eux.
  const vGap = hor ? TAB.gap : 34;
  const hGap = hor ? 34 : TAB.gap;
  // Tapis portant des machines : au-delà d'elles, aligné sur l'entrée du tapis (là où rien n'est posé :
  // on y va depuis le tapis sans passer sur une machine).
  const ex = props.extent;
  const entryX = eq.flow === 'W' ? box.x1 - TW : box.x0;
  const entryY = eq.flow === 'N' ? box.y1 - TH : box.y0;
  const spots: [number, number][] = ex
    ? [
        [entryX, ex.y0 - TAB.gap - TH],
        [entryX, ex.y1 + TAB.gap],
        [ex.x1 + TAB.gap, entryY],
        [ex.x0 - TAB.gap - TW, entryY],
      ]
    : [
        [box.cx - TW / 2, box.y0 - vGap - TH],
        [box.cx - TW / 2, box.y1 + vGap],
        [box.x1 + hGap, box.cy - TH / 2],
        [box.x0 - hGap - TW, box.cy - TH / 2],
      ];
  const order = hor ? [0, 1, 2, 3] : [2, 3, 0, 1];
  const fits = ([x, y]: [number, number]) => !props.others.some((o) => x < o.x1 + 2 && x + TW > o.x0 - 2 && y < o.y1 + 2 && y + TH > o.y0 - 2);
  const [tx0, ty0] = order.map((i) => spots[i]).find(fits) ?? spots[order[0]];
  const lastOutputs = eq.channels[n - 1]?.outputs.length ?? 0;
  const loss = [lastOutputs ? tx(L.outputsLost, lastOutputs) : '', props.incomingLast ? tx(L.linksLost, props.incomingLast) : ''].filter(Boolean).join(' · ');
  const btn = (kind: 'minus' | 'plus') => {
    const ok = kind === 'plus' ? addCh : rmCh;
    const cx = kind === 'minus' ? tx0 + 9 : tx0 + TW - 9;
    const cy = ty0 + TH / 2;
    const lines: TipLine[] =
      kind === 'plus'
        ? ok
          ? [{ text: tx(L.tabAdd, n + 1), kind: 'title' }, { text: rich(tx(L.tabWhat)), kind: 'hint' }]
          : [{ text: tx(L.tabMax, MAX.channels), kind: 'title' }]
        : ok
          ? [{ text: tx(L.tabRemove, n), kind: 'title' }, { text: (loss || tx(L.emptyChannel)) + tx(L.undo), kind: 'sub' }, { text: `${eq.repere || '?'}_CH${pad2(n)}`, kind: 'tech' }]
          : [{ text: tx(L.tabMin), kind: 'title' }];
    // Survol : géré par le <g> de l'onglet (passer du bouton au libellé ne doit pas effacer les poignées).
    // Zone de clic r = 8 : elle reste dans l'onglet, sans déborder sur la forme.
    return (
      <g
        onPointerEnter={(e) => props.onTip(e, lines)}
        onPointerLeave={props.onTipEnd}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!ok) return;
          props.onTipEnd();
          if (kind === 'plus') props.onAddChannel();
          else props.onRemoveChannel();
        }}
        style={{ cursor: ok ? 'pointer' : 'not-allowed' }}
      >
        <circle cx={cx} cy={cy} r={8} fill="transparent" />
        <circle cx={cx} cy={cy} r={6} fill={ok ? (kind === 'plus' ? 'var(--abi-green-deep)' : 'var(--abi-tint-red)') : 'transparent'} stroke={ok ? (kind === 'plus' ? 'var(--abi-green)' : 'var(--abi-orange)') : '#6f7a74'} strokeWidth={1.2} />
        <path d={kind === 'plus' ? `M${cx - 3} ${cy}h6M${cx} ${cy - 3}v6` : `M${cx - 3} ${cy}h6`} stroke={ok ? '#fff' : '#6f7a74'} strokeWidth={1.4} strokeLinecap="round" />
      </g>
    );
  };
  // « + » de pose, dans le tapis, près de son bout aval.
  const dock = (() => {
    if (!props.onDock) return null;
    const [vx, vy] = flowVec(eq.flow);
    // Tapis nu : près du bout aval. Tapis portant des machines (le bout est pris) : juste après son
    // repère, côté entrée, toujours libre.
    const half = (hor ? box.w : box.h) / 2;
    const d = props.extent ? -half + (hor ? textWidth(eq.repere || '?') : FONT.tag) + 14 : half - 10;
    const cx = box.cx + vx * d;
    const cy = box.cy + vy * d;
    const lines: TipLine[] = [{ text: tx(L.dockTip), kind: 'title' }, { text: tx(L.dockTipSub), kind: 'hint' }];
    return (
      <g
        onPointerEnter={(e) => { props.onEnter(); props.onTip(e, lines); }}
        onPointerLeave={props.onTipEnd}
        onPointerDown={(e) => { e.stopPropagation(); props.onTipEnd(); props.onDock!(e); }}
        style={{ cursor: 'pointer' }}
      >
        <circle cx={cx} cy={cy} r={7} fill="transparent" />
        <circle cx={cx} cy={cy} r={5} fill="var(--abi-green-deep)" stroke="var(--abi-green)" strokeWidth={1} />
        <path d={`M${cx - 2.5} ${cy}h5M${cx} ${cy - 2.5}v5`} stroke="#fff" strokeWidth={1.3} strokeLinecap="round" />
      </g>
    );
  })();
  return (
    <g>
      {dock}
      {handlePositions(eq, box, 'avant').map((h) => chip('avant', h.ch, h.at, h.small))}
      {/* Machine posée sur un convoyeur : pas de marche arrière, aucun « + » de ce côté. */}
      {!eq.dockedTo && handlePositions(eq, box, 'arriere').map((h) => chip('arriere', h.ch, h.at, h.small))}
      {/* Valoriste : un seul canal, pas d'onglet des canaux. */}
      {hg0Of(eq) !== 'PICK' && <g onPointerEnter={props.onEnter} onPointerLeave={props.onLeave} onPointerDown={props.onBodyDown} style={{ cursor: 'move' }}>
        <rect x={tx0} y={ty0} width={TW} height={TH} rx={TH / 2} fill="var(--pid-band)" stroke="#6f7a74" strokeWidth={1} />
        <text x={tx0 + TW / 2} y={ty0 + TH / 2} textAnchor="middle" dominantBaseline="central" style={{ font: '600 9.5px var(--font-sans)', fill: 'var(--pid-text)', pointerEvents: 'none' }}>
          {tx(L.nbChannels, n)}
        </text>
        {btn('minus')}
        {btn('plus')}
      </g>}
    </g>
  );
}

export const ZoomBar = ({ view, onZoom, onFit, grid, onGrid, onStraighten, onReorganize }: {
  view: View; onZoom: (k: number) => void; onFit: () => void; grid: boolean; onGrid: () => void; onStraighten: () => void; onReorganize: () => void;
}) => (
  <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 4, alignItems: 'center', background: 'var(--surface-page)', border: '1px solid var(--border-nav)', padding: 4, zIndex: 3 }}>
    <ToolBtn icon="zoom-out" title={tx(L.zoomOut)} onClick={() => onZoom(1 / 1.2)} />
    <span style={{ width: 44, textAlign: 'center', font: '400 12px var(--font-sans)', color: 'var(--text-secondary)' }}>{tx(L.zoomPct, Math.round(view.zoom * 100))}</span>
    <ToolBtn icon="zoom-in" title={tx(L.zoomIn)} onClick={() => onZoom(1.2)} />
    <ToolBtn icon="maximize-2" title={tx(L.fit)} onClick={onFit} />
    <span style={{ width: 1, height: 22, background: 'var(--border-nav)', margin: '0 2px' }} />
    <ToolBtn icon="grid" title={tx(L.grid)} on={grid} onClick={onGrid} />
    <ToolBtn icon="straighten" title={plain(tx(L.straighten))} onClick={onStraighten} />
    <ToolBtn icon="workflow" title={plain(tx(L.reorganize))} onClick={onReorganize} />
  </div>
);

function ToolBtn({ icon, title, on, onClick }: { icon: string; title: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className="abi-btn" style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--abi-green)' : 'var(--surface-nav)', color: on ? '#fff' : '#ddd', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
      <Icon name={icon} size={17} />
    </button>
  );
}
