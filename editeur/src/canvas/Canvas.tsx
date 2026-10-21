// Canevas PID : écran Unified 1920×1080, zoom/déplacement, sélection, gestes « + », liens.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Abbr, getLang, hgLabel, plain, rich, tx } from '../i18n';
import type { Catalogue } from '../model/catalogue';
import { boxAt, CH_PITCH, channelOffset, CHUTE_SIZE, eqBox, hg0Of, flowVec, isHorizontal, opposite, snap, SCREEN, type Box } from '../model/geometry';
import { axisCandidates } from '../model/straighten';
import { guideSnap } from '../model/align';
import {
  addChannel, addChute, addEq, addOutput, addOutputWithNext, connect, removeLink, removeOutput, setOutputNum, DEFAULT_CHUTE_LABEL, findEq, moveItems, removeChannel, sameOutput,
  placeNext, setLinkTarget,
} from '../model/ops';
import type { Dir, Eq, OutputRef, Pivot } from '../model/pivot';
import { handlePositions, loopLinks, outputColor, outputTag, placeTags, shortTag, routeAll, tagAnchor, type Pt } from '../model/route';
import {
  canAddChannel, canAddOutput, freeOutputNum, hgDef, isNoAction, MAX, nextOutputNum, outputsOf, pad2, polarity, reverseBlocked,
  chainRepere, zoneOf,
} from '../model/rules';
import { Icon } from '../ui/ui';
import { Glyph } from '../panels/Palette';
import { EqNode } from './EqNode';
import { ChuteShape } from './symbols';

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
/** Étiquette « canal.sortie » d'un trait : petite, chasse fixe, halo du fond pour rester lisible sur les traits. */
const TAG_STYLE: React.CSSProperties = { font: '600 8.5px var(--font-tag)', fill: 'var(--pid-caption)', paintOrder: 'stroke', stroke: 'var(--pid-bg)', strokeWidth: 3, strokeLinejoin: 'round', pointerEvents: 'none' };

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
  stubTitle: { fr: (n: number, fwd: boolean) => `Sortie ${n} vers l’${fwd ? 'avant' : 'arrière'}, non reliée`, en: (n: number, fwd: boolean) => `Output ${n}, ${fwd ? 'forward' : 'reverse'}, not connected` },
  nbChannels: { fr: (n: number) => (n > 1 ? `${n} canaux` : '1 canal'), en: (n: number) => (n > 1 ? `${n} channels` : '1 channel') },
  nbHg: { fr: (n: number) => `${n} matériel${n > 1 ? 's' : ''}`, en: (n: number) => `${n} hardware item${n > 1 ? 's' : ''}` },
  tabAdd: { fr: (n: number) => `Ajouter un canal (passer à ${n})`, en: (n: number) => `Add a channel (go to ${n})` },
  tabRemove: { fr: (n: number) => `Retirer le canal ${n}`, en: (n: number) => `Remove channel ${n}` },
  tabMax: { fr: (n: number) => `${n} canaux au maximum`, en: (n: number) => `${n} channels at most` },
  tabMin: { fr: 'Un équipement garde au moins un canal', en: 'An Equipment item keeps at least one channel' },
  tabWhat: { fr: 'Canaux [CH] : voies de matière de l’équipement', en: 'Channels [CH]: material lanes of the Equipment item' },
  menuTitle: { fr: (r: string) => `Ajouter après ${r}`, en: (r: string) => `Add after ${r}` },
  menuDefault: { fr: 'par défaut', en: 'default' },
  menuLast: { fr: 'dernier choix', en: 'last choice' },
  numBar: { fr: (ch: number) => `Numéro de sortie (canal ${ch})`, en: (ch: number) => `Output number (channel ${ch})` },
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
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

  const live = useRef(props);
  live.current = props;

  const boxes = useMemo(() => new Map(pivot.equipments.map((e) => [e.id, eqBox(e)])), [pivot.equipments]);
  // Les libellés des liens (outputLabel) sont traduits : recalcul aussi au changement de langue.
  const lang = getLang();
  const routed = useMemo(() => routeAll(pivot), [pivot, lang]);
  const loops = useMemo(() => loopLinks(pivot), [pivot.links, pivot.equipments]);
  const tags = useMemo(
    () => placeTags(pivot, routed.links, (l) => shortTag(findEq(pivot, l.link.from.eq), l.link.from.ch, l.link.from.num, l.link.from.dir) + (loops.has(l.id) ? ' ↺' : '')),
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
      if (!(e.target instanceof Node && menuRef.current?.contains(e.target))) setMenu(null);
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [menu]);
  useEffect(() => setMenu(null), [pivot, view]);

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
    drag.current = {
      kind: 'move',
      start: pv,
      a: toWorld(e.clientX, e.clientY),
      eqs: next.eqs,
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
    const n = eq.channels.length;
    const d = isHorizontal(eq.flow) ? p[1] - b.cy : p[0] - b.cx;
    return Math.min(n, Math.max(1, Math.round(d / CH_PITCH + (n - 1) / 2) + 1));
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
      if (d.moved) commit(pv, d.start);
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
    props.commit(removeOutput(live.current.pivot, ref));
    props.setSel(EMPTY_SEL);
  };

  /** Crée l'équipement choisi dans le menu du « + », déjà raccordé à la sortie. */
  const addFromMenu = (m: AddMenu, hg0: string) => {
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
      // Même sens que le « + » : une sortie arrière repart à contre-flux.
      const flow = ref.dir === 'avant' ? src.flow : opposite(src.flow);
      const made = addEq(cat, pv, hg0, at[0], at[1], { flow, zone: zoneOf(src.repere), repere: chainRepere(pv, src, hg0) });
      next = { p: connect(made.p, ref, { eq: made.id, ch: 1 }), id: made.id };
    } else {
      next = addOutputWithNext(cat, pv, src.id, m.src.ch, m.src.dir, hg0, m.at ? { x: m.at[0], y: m.at[1] } : undefined);
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
      props.commit(r.p);
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
      { text: tx(L.linkSub, lk.from.num, fwd, polarity(lk.from.num, a ? outputsOf(a, lk.from.ch, lk.from.dir).length : 1), lk.from.ch, (a?.channels.length ?? 1) > 1, lk.to.ch, (b?.channels.length ?? 1) > 1), kind: 'sub' },
      ...(loops.has(lk.id) ? [{ text: tx(L.loop), kind: 'sub' as const }] : []),
      { text: `${ra}_CH${pad2(lk.from.ch)} · S${lk.from.num} → ${rb}_CH${pad2(lk.to.ch)}`, kind: 'tech' },
      { text: rich(tx(L.linkHint)), kind: 'hint' },
    ];
  };

  const stubTip = (ref: OutputRef): TipLine[] => {
    const a = findEq(pivot, ref.eq);
    const ra = a?.repere || '?';
    return [
      { text: tx(L.stubTitle, ref.num, ref.dir === 'avant'), kind: 'title' },
      { text: tx(L.outSub, polarity(ref.num, a ? outputsOf(a, ref.ch, ref.dir).length : 1), ref.ch, (a?.channels.length ?? 1) > 1), kind: 'sub' },
      { text: `${ra}_CH${pad2(ref.ch)} · S${ref.num}`, kind: 'tech' },
      { text: rich(tx(L.stubHint)), kind: 'hint' },
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
          if (id) props.onOpenEq(id);
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
                    strokeWidth={on || hot ? 2.6 : l.dashed ? 1.6 : 2}
                    strokeDasharray={l.dashed ? '5 5' : undefined}
                    markerEnd={l.inner ? undefined : `url(#${on ? 'arw-sel' : 'arw-' + Math.min(l.num, 6)})`}
                  />
                  {(() => {
                    const ta = tags.get(l.id) ?? tagAnchor(l.points);
                    return (
                      // Étiquette cliquable : sélectionne le trait (comme un clic sur le trait).
                      <text x={ta.x} y={ta.y} textAnchor={ta.anchor} dominantBaseline="central" style={{ ...TAG_STYLE, pointerEvents: 'auto', cursor: 'pointer', fill: on ? 'var(--pid-select)' : TAG_STYLE.fill }}>
                        {shortTag(findEq(pivot, l.link.from.eq), l.link.from.ch, l.link.from.num, l.link.from.dir)}{loops.has(l.id) ? ' ↺' : ''}
                      </text>
                    );
                  })()}
                </g>
              );
            })}
            {routed.stubs.map((s) => {
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
                  <text x={b[0] + (b[0] - a[0]) * 0.5 + (b[0] === a[0] ? 0 : Math.sign(b[0] - a[0]) * 4)} y={b[1] + (b[1] - a[1]) * 0.5} textAnchor={b[0] === a[0] ? 'middle' : b[0] > a[0] ? 'start' : 'end'} dominantBaseline="central" style={{ ...TAG_STYLE, pointerEvents: 'auto', cursor: 'crosshair', fill: on ? 'var(--pid-select)' : 'var(--abi-orange-text)' }}>
                    {shortTag(findEq(pivot, s.ref.eq), s.ref.ch, s.ref.num, s.ref.dir)}
                  </text>
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
            />
          ))}

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
                  strokeWidth={on || hoverLink === l.id ? 2.6 : l.dashed ? 1.6 : 2}
                  strokeDasharray={l.dashed ? '5 5' : undefined}
                  markerEnd={`url(#${on ? 'arw-sel' : 'arw-' + Math.min(l.num, 6)})`}
                />
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
                // Bande du canal visé : CH_PITCH autour de son axe, comme channelAt et les séparations
                // dessinées ; les bandes extrêmes vont jusqu'au bord de la boîte.
                const hor = isHorizontal(t.flow);
                const axis = (hor ? b.cy : b.cx) + channelOffset(n, k);
                const lo = k === 1 ? (hor ? b.y0 : b.x0) : axis - CH_PITCH / 2;
                const hi = k === n ? (hor ? b.y1 : b.x1) : axis + CH_PITCH / 2;
                const band = hor
                  ? { x: b.x0 - 3, y: lo, w: b.w + 6, h: hi - lo }
                  : { x: lo, y: b.y0 - 3, w: hi - lo, h: b.h + 6 };
                return (
                  <g>
                    <rect x={b.x0 - 6} y={b.y0 - 6} width={b.w + 12} height={b.h + 12} rx={7} fill="none" stroke="var(--pid-select)" strokeWidth={2} />
                    {n > 1 && <rect x={band.x} y={band.y} width={band.w} height={band.h} fill="rgba(6,208,110,0.28)" stroke="var(--pid-select)" strokeWidth={1.2} />}
                    {/* Canal visé : mot simple, puis nom technique (08Aa_CH02) en petit. */}
                    <text x={b.cx} y={b.y0 - 14} textAnchor="middle" style={{ font: '600 12px var(--font-sans)', fill: 'var(--abi-green-glow)', paintOrder: 'stroke', stroke: 'var(--pid-bg)', strokeWidth: 4, strokeLinejoin: 'round' }}>
                      {tx(L.targetCh, wire.targetCh)}
                      <tspan dx={5} style={{ font: '600 9px var(--font-tag)', fill: 'var(--pid-caption)' }}>
                        {(t.repere || '?') + '_CH' + pad2(wire.targetCh)}
                      </tspan>
                    </text>
                  </g>
                );
              })()}
              <line x1={wire.origin[0]} y1={wire.origin[1]} x2={wire.cur[0]} y2={wire.cur[1]} stroke={outputColor(wireNum)} strokeWidth={2} strokeDasharray="6 4" markerEnd={`url(#arw-${Math.min(wireNum, 6)})`} />
            </g>
          )}

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
              onAddChannel={() => props.commit(addChannel(pivot, handleTarget.id))}
              onRemoveChannel={() => props.commit(removeChannel(pivot, handleTarget.id, handleTarget.channels.length))}
              onBodyDown={(e) => onEqDown(e, handleTarget.id)}
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

      {selLink && !wire && !menu && (() => {
        const ref = selLink.link.from;
        const src = findEq(pivot, ref.eq);
        if (!src) return null;
        const count = (src.channels[ref.ch - 1]?.outputs ?? []).filter((o) => o.dir === ref.dir).length;
        const tp = tags.get(selLink.id) ?? tagAnchor(selLink.points);
        const [hx, hy] = toHost([tp.x, tp.y]);
        const btn: React.CSSProperties = { minWidth: 24, height: 24, border: '1px solid var(--border-nav)', borderRadius: 3, cursor: 'pointer', font: '600 12px var(--font-tag)' };
        return (
          <div
            role="toolbar"
            aria-label={tx(L.numBar, ref.ch)}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', left: hx - 10, top: hy + 12, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', background: 'var(--surface-page)', border: '1px solid var(--abi-green)', zIndex: 5, boxShadow: 'var(--shadow-drawer)' }}
          >
            {/* Une seule sortie dans ce sens : rien à réordonner, seulement la suppression. */}
            {count > 1 && <span title={tx(L.numHint)} style={{ font: '400 12px var(--font-sans)', color: 'var(--text-secondary)', marginRight: 2 }}>{tx(L.numBar, ref.ch)}</span>}
            {count > 1 && Array.from({ length: count }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={n === ref.num}
                title={tx(L.numHint)}
                className="abi-btn"
                onClick={() => n !== ref.num && props.commit(setOutputNum(pivot, ref, n))}
                style={{ ...btn, background: n === ref.num ? 'var(--abi-green)' : 'var(--surface-nav)', color: '#fff' }}
              >
                {outputTag(ref.ch, n, ref.dir)}
              </button>
            ))}
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
      {menu && (() => {
        const src = findEq(pivot, menu.src.eq);
        if (!src) return null;
        const items: { hg0: string; note: string }[] = [];
        if (cat.hgTypes[DEFAULT_NEXT]?.principal) items.push({ hg0: DEFAULT_NEXT, note: tx(L.menuDefault) });
        if (props.currentNature !== DEFAULT_NEXT && cat.hgTypes[props.currentNature]) items.push({ hg0: props.currentNature, note: tx(L.menuLast) });
        const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '3px 10px 3px 4px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff' };
        const pos = menuPos ?? { left: menu.x + 10, top: menu.y + 10 };
        // Sortie libre raccordée : son propre numéro ; sinon celui de la sortie qui sera créée.
        const outNum = menu.ref?.num ?? nextOutputNum(src, menu.src.ch, menu.src.dir) ?? 1;
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
              {tx(L.menuTitle, src.repere || '?')}
              <span style={{ ...TIP_STYLE.tech, marginLeft: 8 }}>{tx(L.outTitle, outNum, menu.src.dir === 'avant')}</span>
            </div>
            {items.map((it) => (
              <button key={it.hg0} type="button" role="menuitem" className="abi-row" onClick={() => addFromMenu(menu, it.hg0)} style={row}>
                <Glyph hg0={it.hg0} width={64} height={38} />
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* Libellé puis code HG en petit, juste après le mot qu'il nomme. */}
                  <span style={{ font: '500 13px var(--font-sans)' }}>
                    {hgLabel(cat.hgTypes[it.hg0])}
                    <Abbr>{it.hg0}</Abbr>
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
                <span style={{ font: '400 11px var(--font-sans)', color: 'var(--text-muted)' }}>{tx(L.menuOtherSub)}</span>
              </span>
            </button>
            {/* Sortie en attente : on peut aussi la supprimer d'ici (le menu garde le clavier). */}
            {menu.ref && (
              <button type="button" role="menuitem" className="abi-row" onClick={() => dropPending(menu.ref!)} style={{ ...row, padding: '9px 10px', borderTop: '1px solid var(--border-divider)' }}>
                <Icon name="trash" size={18} color="var(--pid-fault-stroke)" />
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ font: '500 13px var(--font-sans)' }}>{tx(L.menuDelete)}</span>
                  <span style={{ font: '400 11px var(--font-sans)', color: 'var(--text-muted)' }}>{tx(L.menuDeleteSub)}</span>
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
}) {
  const { eq, box } = props;
  if (isNoAction(props.cat, eq)) return null;
  const n = eq.channels.length;
  const blocked = reverseBlocked(eq);
  const chip = (dir: Dir, ch: number, at: Pt) => {
    const ok = canAddOutput(eq, ch, dir);
    const num = nextOutputNum(eq, ch, dir);
    // Nouvelle sortie seulement quand toutes les sorties du canal sont raccordées.
    if (num === null || props.pending.has(`${ch}|${dir}`)) return null;
    const lines: TipLine[] = ok
      ? [
          { text: tx(L.outTitle, num, dir === 'avant'), kind: 'title' },
          { text: tx(L.outSub, polarity(num, outputsOf(eq, ch, dir).length + 1), ch, n > 1), kind: 'sub' },
          { text: `${eq.repere || '?'}_CH${pad2(ch)} · S${num}`, kind: 'tech' },
          { text: tx(L.addClick), kind: 'hint' },
          { text: tx(L.addDrag), kind: 'hint' },
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
        <circle cx={at[0]} cy={at[1]} r={7.5} fill="var(--pid-band)" stroke={ok ? 'var(--abi-green)' : '#6f7a74'} strokeWidth={1.5} strokeDasharray={dir === 'arriere' ? '2.5 2' : undefined} />
        <path d={`M${at[0] - 3.5} ${at[1]} h7 M${at[0]} ${at[1] - 3.5} v7`} stroke={ok ? '#fff' : '#6f7a74'} strokeWidth={1.5} strokeLinecap="round" />
        {n > 1 && ok && (
          // Numéro du canal à l'extérieur du « + », dans le sens de la sortie (pas sur le « + » voisin).
          <text x={at[0] + flowVec(dir === 'avant' ? eq.flow : opposite(eq.flow))[0] * 13} y={at[1] + flowVec(dir === 'avant' ? eq.flow : opposite(eq.flow))[1] * 13} textAnchor="middle" dominantBaseline="central" style={{ font: '600 8px var(--font-tag)', fill: 'var(--pid-caption)', pointerEvents: 'none' }}>
            {ch}
          </text>
        )}
      </g>
    );
  };

  // Onglet des canaux, hors de la forme : au-dessus en flux horizontal, à droite en flux vertical.
  const addCh = canAddChannel(eq);
  const rmCh = n > 1;
  const TW = TAB.w;
  const TH = TAB.h;
  const hor = isHorizontal(eq.flow);
  // Emplacements essayés dans l'ordre : au-dessus / dessous (flux horizontal), à droite / à gauche
  // (flux vertical), puis les deux autres ; le premier qui ne recouvre aucun équipement voisin.
  // Sur les côtés qui portent les « + » de sortie, l'onglet se pose au-delà d'eux.
  const vGap = hor ? TAB.gap : 34;
  const hGap = hor ? 34 : TAB.gap;
  const spots: [number, number][] = [
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
  return (
    <g>
      {handlePositions(eq, box, 'avant').map((h) => chip('avant', h.ch, h.at))}
      {handlePositions(eq, box, 'arriere').map((h) => chip('arriere', h.ch, h.at))}
      <g onPointerEnter={props.onEnter} onPointerLeave={props.onLeave} onPointerDown={props.onBodyDown} style={{ cursor: 'move' }}>
        <rect x={tx0} y={ty0} width={TW} height={TH} rx={TH / 2} fill="var(--pid-band)" stroke="#6f7a74" strokeWidth={1} />
        <text x={tx0 + TW / 2} y={ty0 + TH / 2} textAnchor="middle" dominantBaseline="central" style={{ font: '600 9.5px var(--font-sans)', fill: 'var(--pid-text)', pointerEvents: 'none' }}>
          {tx(L.nbChannels, n)}
        </text>
        {btn('minus')}
        {btn('plus')}
      </g>
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
