import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, EMPTY_SEL, fitView, ZoomBar, type Selection, type View } from './canvas/Canvas';
import { siteTest, stressSite } from './fictif/siteTest.fictif';
import { fakeReport, openPivot, savePivot } from './io/files';
import { align, distribute, type AlignMode, type Axis } from './model/align';
import { readEmbeddedCatalogue } from './model/catalogue';
import { boxAt, CHUTE_SIZE, eqBox, SCREEN } from './model/geometry';
import { addEq, deleteItems, duplicate, emptyPivot, findEq, moveItems, removeLink, removeOutput, setBase, setPositions } from './model/ops';
import type { Pivot } from './model/pivot';
import { incompleteReasons } from './model/rules';
import { loadSaved, usePivotHistory } from './model/store';
import { straighten } from './model/straighten';
import { EqDrawer } from './panels/EqDrawer';
import { AlignBar, BaseSettingsDialog, CatalogueBanner, ReportPanel } from './panels/Overlays';
import { Palette } from './panels/Palette';
import { SymbolSheet } from './panels/SymbolSheet';
import { NetworkTab } from './tabs/NetworkTab';
import { SafetyTab } from './tabs/SafetyTab';
import { Button, Icon } from './ui/ui';
import { Abbr, fmtDate, hgLabel, LangToggle, Term, tx, useLang, type Entry } from './i18n';

const cat = readEmbeddedCatalogue();
type Tab = 'pid' | 'reseau' | 'securite';

// Textes de l'en-tête, du menu Site, des notifications et de la barre d'état (français / anglais).
const L = {
  appTitle: { fr: 'Éditeur PID', en: 'P&ID editor' },
  siteName: { fr: 'Nom du site', en: 'Site name' },
  tabs: { fr: 'Onglets', en: 'Tabs' },
  tabPid: { fr: 'PID', en: 'P&ID' },
  tabNetwork: { fr: 'Réseau', en: 'Network' },
  tabSafety: { fr: 'Sécurité', en: 'Safety' },
  undo: { fr: 'Annuler (Ctrl+Z)', en: 'Undo (Ctrl+Z)' },
  redo: { fr: 'Rétablir (Ctrl+Y)', en: 'Redo (Ctrl+Y)' },
  baseSettings: { fr: 'Réglages de base', en: 'Base settings' },
  baseApplied: { fr: 'Réglages de base appliqués aux nouveaux', en: 'Base settings applied to new' },
  report: { fr: 'Rapport', en: 'Report' },
  reportTitle: { fr: 'Charger un rapport de génération fictif', en: 'Load a mock generation report' },
  site: { fr: 'Site', en: 'Site' },
  reloadTest: { fr: 'Recharger le site de test', en: 'Reload the test site' },
  testLoaded: { fr: 'Site de test chargé', en: 'Test site loaded' },
  stress: { fr: 'Test de charge : ≈ 200 équipements', en: 'Load test: ≈ 200 Equipment items' },
  stressLoaded: { fr: 'Test de charge chargé', en: 'Load test loaded' },
  newSite: { fr: 'Nouveau site vide', en: 'New empty site' },
  newSiteDone: { fr: 'Nouveau site', en: 'New site' },
  open: { fr: 'Ouvrir', en: 'Open' },
  openTitle: { fr: 'Ouvrir un fichier pivot', en: 'Open a pivot file' },
  save: { fr: 'Enregistrer le pivot', en: 'Save pivot' },
  saveTitle: { fr: 'Enregistrer le fichier pivot (JSON)', en: 'Save the pivot file (JSON)' },
  saved: { fr: 'Pivot enregistré', en: 'Pivot saved' },
  opened: { fr: (name: string) => 'Pivot ouvert : ' + name, en: (name: string) => 'Pivot opened: ' + name },
  alreadyStraight: { fr: 'Liens déjà droits', en: 'Links already straight' },
  straightened: { fr: 'Liens redressés', en: 'Links straightened' },
  // Choix sur la planche des symboles : proposé en « dernier choix » dans le menu des « + », après le convoyeur.
  plusNature: { fr: (label: string) => 'Proposé dans le menu des « + » : ' + label, en: (label: string) => 'Offered in the “+” menu: ' + label },
  // Barre d'état
  hgList: { fr: 'Liste des matériels génériques', en: 'Hardware Generic list' },
  hgListInfo: {
    fr: (date: string, n: number) => `du ${date} · ${n} principaux · catalogue`,
    en: (date: string, n: number) => `dated ${date} · ${n} main items · catalogue`,
  },
  builtIn: { fr: (v: string) => ' ≠ intégré ' + v, en: (v: string) => ' ≠ built-in ' + v },
  eqCount: { fr: (n: number) => n + ' équipement' + (n > 1 ? 's' : ''), en: (n: number) => n + ' Equipment item' + (n !== 1 ? 's' : '') },
  links: { fr: (n: number) => n + ' lien' + (n > 1 ? 's' : ''), en: (n: number) => n + ' link' + (n !== 1 ? 's' : '') },
  incomplete: { fr: (n: number) => n + ' incomplet' + (n > 1 ? 's' : ''), en: (n: number) => n + ' incomplete' },
  errors: { fr: (n: number) => n + ' erreur' + (n > 1 ? 's' : '') + ' de génération', en: (n: number) => n + ' generation error' + (n !== 1 ? 's' : '') },
  command: { fr: 'commande :', en: 'control:' },
  // Commande vide = colonne « Superieur 1 » : même libellé que les réglages de base (Overlays, commandStd).
  listDefault: { fr: 'selon la liste (Superieur 1)', en: 'per list (Superieur 1)' },
  // Aide souris / clavier : dans l'infobulle du « ? », pour que le pied tienne sur un écran de 1366 px.
  shortcuts: { fr: 'Raccourcis', en: 'Shortcuts' },
  help: {
    fr: 'Double-clic : fiche · Espace + glisser : vue · Molette : zoom · Maj : sélection multiple · Suppr · Ctrl+Z / Y / D',
    en: 'Double-click: details · Space + drag: pan · Wheel: zoom · Shift: multi-select · Del · Ctrl+Z / Y / D',
  },
};

const TABS: { id: Tab; label: Entry; icon: string }[] = [
  { id: 'pid', label: L.tabPid, icon: 'workflow' },
  { id: 'reseau', label: L.tabNetwork, icon: 'link' },
  { id: 'securite', label: L.tabSafety, icon: 'octagon-x' },
];

export function App() {
  const lang = useLang(); // tout l'arbre se re-rend au changement de langue
  const h = usePivotHistory(() => loadSaved() ?? siteTest(cat));
  const { pivot, commit } = h;
  const [tab, setTab] = useState<Tab>('pid');
  const [sel, setSel] = useState<Selection>(EMPTY_SEL);
  const [view, setView] = useState<View>({ zoom: 0.6, px: 20, py: 30 });
  const size = useRef({ w: 1200, h: 700 });
  const fitted = useRef(false);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [current, setCurrent] = useState('BELT');
  // Planche des HG principaux : consultation (HG proposé dans le menu des « + ») ou choix de l'équipement à ajouter.
  const [sheet, setSheet] = useState<null | { pick?: (hg0: string) => void }>(null);
  const [grid, setGrid] = useState(true);
  // Rapport fictif : pivot au moment du clic ; les messages sont recalculés au changement de langue.
  const [reportSrc, setReportSrc] = useState<Pivot | null>(null);
  const [baseOpen, setBaseOpen] = useState(false);
  const [siteMenu, setSiteMenu] = useState(false);
  const [notice, setNotice] = useState<ReactNode>('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Notification : texte simple, ou libellé avec terme technique en petit (<Term/>, <Abbr/>).
  const say = (t: ReactNode) => {
    setNotice(t);
    window.setTimeout(() => setNotice(''), 2200);
  };

  // Raisons traduites : recalcul aussi au changement de langue (infobulles du canevas).
  const incomplete = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of pivot.equipments) {
      const r = incompleteReasons(cat, pivot, e);
      if (r.length) m.set(e.id, r);
    }
    return m;
  }, [pivot, lang]);
  const report = useMemo(() => (reportSrc ? fakeReport(cat, reportSrc) : null), [reportSrc, lang]);
  const faults = useMemo(() => new Map((report ?? []).filter((r) => findEq(pivot, r.eq)).map((r) => [r.eq, r.message])), [report, pivot]);

  const onSize = useCallback((w: number, hh: number) => {
    size.current = { w, h: hh };
    if (!fitted.current && w > 0) {
      fitted.current = true;
      setView(fitView(w, hh));
    }
  }, []);
  const fit = () => setView(fitView(size.current.w, size.current.h));
  const zoomBy = (k: number) =>
    setView((v) => {
      const zoom = Math.min(4, Math.max(0.2, v.zoom * k));
      const cx = size.current.w / 2;
      const cy = size.current.h / 2;
      return { zoom, px: cx - (cx - v.px) * (zoom / v.zoom), py: cy - (cy - v.py) * (zoom / v.zoom) };
    });
  const centerOn = (id: string) => {
    const e = findEq(pivot, id);
    if (!e) return;
    setView((v) => {
      const zoom = Math.max(v.zoom, 1);
      return { zoom, px: size.current.w / 2 - e.x * zoom, py: size.current.h / 2 - e.y * zoom };
    });
  };

  const replace = (p: Pivot, msg: ReactNode) => {
    commit(p);
    setSel(EMPTY_SEL);
    setDrawer(null);
    setReportSrc(null);
    setSiteMenu(false);
    fit();
    say(msg);
  };

  const deleteSelection = () => {
    if (sel.link) commit(removeLink(pivot, sel.link));
    else if (sel.stub) commit(removeOutput(pivot, sel.stub));
    else if (sel.eqs.length || sel.chutes.length) {
      commit(deleteItems(pivot, sel.eqs, sel.chutes));
      if (drawer && sel.eqs.includes(drawer)) setDrawer(null);
    }
    setSel(EMPTY_SEL);
  };

  const duplicateSelection = () => {
    if (!sel.eqs.length) return;
    const r = duplicate(cat, pivot, sel.eqs);
    commit(r.p);
    setSel({ ...EMPTY_SEL, eqs: r.ids });
  };

  const items = () => [
    ...sel.eqs.map((id) => ({ id, box: eqBox(findEq(pivot, id)!) })),
    ...sel.chutes.map((id) => {
      const c = pivot.chutes.find((x) => x.id === id)!;
      return { id, box: boxAt(c.x, c.y, CHUTE_SIZE.w, CHUTE_SIZE.h) };
    }),
  ];
  const onAlign = (m: AlignMode) => commit(setPositions(pivot, align(items(), m)));
  const onDistribute = (a: Axis) => commit(setPositions(pivot, distribute(items(), a)));
  const straightenAll = (only?: Set<string>) => {
    const next = straighten(pivot, only);
    if (next === pivot) return say(tx(L.alreadyStraight));
    commit(next);
    say(tx(L.straightened));
  };

  // Raccourcis clavier (hors champs de saisie).
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keys.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { h.undo(); e.preventDefault(); return; }
    if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { h.redo(); e.preventDefault(); return; }
    if (tab !== 'pid') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); e.preventDefault(); return; }
    if (mod && e.key.toLowerCase() === 'd') { duplicateSelection(); e.preventDefault(); return; }
    if (mod && e.key.toLowerCase() === 'a') { setSel({ ...EMPTY_SEL, eqs: pivot.equipments.map((x) => x.id), chutes: pivot.chutes.map((x) => x.id) }); e.preventDefault(); return; }
    if (e.key === 'Escape') { setSel(EMPTY_SEL); setDrawer(null); return; }
    if (e.key === 'Enter' && sel.eqs.length === 1) { setDrawer(sel.eqs[0]); return; }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && (sel.eqs.length || sel.chutes.length)) {
      const step = e.shiftKey ? 50 : 10;
      commit(moveItems(pivot, sel.eqs, sel.chutes, arrows[e.key][0] * step, arrows[e.key][1] * step));
      e.preventDefault();
    }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const placeCenter = (hg0: string) => {
    const r = addEq(cat, pivot, hg0, SCREEN.w / 2, SCREEN.h / 2);
    commit(r.p);
    setSel({ ...EMPTY_SEL, eqs: [r.id] });
  };

  const selCount = sel.eqs.length + sel.chutes.length;
  const eqName = (id: string) => findEq(pivot, id)?.repere ?? '?';
  const base = pivot.site.base;
  const drive = cat.hgTypes.DRIV.hs.find((x) => x.id === base.hs.DRIV)?.label;
  // Planche des symboles : le HG choisi est proposé dans le menu des « + » (libellé simple, code en petit).
  const pickNature = (k: string) => {
    setCurrent(k);
    setSheet(null);
    say(<>{tx(L.plusNature, cat.hgTypes[k] ? hgLabel(cat.hgTypes[k]) : k)}<Abbr>{k}</Abbr></>);
  };

  return (
    <div style={{ display: 'grid', gridTemplateRows: '56px auto 1fr 28px', height: '100%' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: 'var(--surface-rail)', borderBottom: '1px solid var(--surface-panel-header)', minWidth: 0 }}>
        <div style={{ font: '700 16px var(--font-sans)', textTransform: 'uppercase', whiteSpace: 'nowrap', marginRight: 6 }}>{tx(L.appTitle)}</div>
        <input
          aria-label={tx(L.siteName)}
          value={pivot.site.name}
          onChange={(e) => commit({ ...pivot, site: { ...pivot.site, name: e.target.value } })}
          style={{ width: 220, height: 32, padding: '0 8px', background: 'transparent', border: '1px solid var(--border-nav)', color: '#fff', font: '400 14px var(--font-sans)' }}
        />
        <nav aria-label={tx(L.tabs)} style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              className="abi-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
                background: tab === t.id ? 'var(--surface-nav-active)' : 'var(--surface-nav)',
                border: tab === t.id ? '2px solid #e8e8e8' : '1px solid var(--border-nav)',
                color: '#fff', font: '700 13px var(--font-sans)', textTransform: 'uppercase', cursor: 'pointer',
              }}
            >
              <Icon name={t.icon} size={18} />
              {tx(t.label)}
            </button>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <Button icon="undo" title={tx(L.undo)} disabled={!h.canUndo} onClick={h.undo} />
        <Button icon="undo" title={tx(L.redo)} disabled={!h.canRedo} onClick={h.redo} style={{ transform: 'scaleX(-1)' }} />
        <span style={{ width: 1, height: 28, background: 'var(--border-nav)', margin: '0 4px' }} />
        <LangToggle />
        <Button icon="settings" onClick={() => setBaseOpen(true)}>{tx(L.baseSettings)}</Button>
        <Button icon="file-check" variant="acknowledge" title={tx(L.reportTitle)} onClick={() => { setReportSrc(pivot); setTab('pid'); }}>{tx(L.report)}</Button>
        <div style={{ position: 'relative' }}>
          <Button icon="workflow" onClick={() => setSiteMenu((v) => !v)}>{tx(L.site)} <Icon name="chevron-down" size={14} /></Button>
          {siteMenu && (
            <div style={{ position: 'absolute', right: 0, top: 38, width: 240, background: 'var(--surface-page)', border: '1px solid var(--border-input)', zIndex: 30 }}>
              {[
                { id: 'test', label: tx(L.reloadTest), act: () => replace(siteTest(cat), tx(L.testLoaded)) },
                { id: 'charge', label: <>{tx(L.stress)}<Abbr>EQ</Abbr></>, act: () => replace(stressSite(cat), tx(L.stressLoaded)) },
                { id: 'vide', label: tx(L.newSite), act: () => replace(emptyPivot(cat, tx(L.newSiteDone)), tx(L.newSiteDone)) },
              ].map((m) => (
                <button key={m.id} type="button" className="abi-row" onClick={m.act} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-divider)', cursor: 'pointer', font: '400 13px var(--font-sans)' }}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button icon="folder-open" title={tx(L.openTitle)} onClick={() => fileRef.current?.click()}>{tx(L.open)}</Button>
        <Button variant="primary" icon="save" title={tx(L.saveTitle)} onClick={() => { savePivot(pivot); say(tx(L.saved)); }}>{tx(L.save)}</Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) openPivot(f).then((p) => replace(p, tx(L.opened, p.site.name)), (err: Error) => say(err.message));
          }}
        />
      </header>

      <CatalogueBanner cat={cat} />

      {tab === 'pid' && (
        <main style={{ display: 'grid', gridTemplateColumns: '236px 1fr', minHeight: 0 }}>
          <Palette cat={cat} current={current} onCurrent={setCurrent} onPlace={placeCenter} onSymbols={() => setSheet({})} />
          <div style={{ position: 'relative', minWidth: 0, minHeight: 0 }}>
            <Canvas
              cat={cat}
              pivot={pivot}
              commit={commit}
              preview={h.preview}
              sel={sel}
              setSel={setSel}
              view={view}
              setView={setView}
              faults={faults}
              incomplete={incomplete}
              currentNature={current}
              grid={grid}
              onOpenEq={setDrawer}
              onSize={onSize}
              onPickOther={(apply) => setSheet({ pick: apply })}
              onChosen={setCurrent}
            />
            <ZoomBar view={view} onZoom={zoomBy} onFit={fit} grid={grid} onGrid={() => setGrid(!grid)} onStraighten={() => straightenAll()} />
            {selCount >= 2 && <AlignBar count={selCount} onAlign={onAlign} onDistribute={onDistribute} onStraighten={() => straightenAll(new Set(sel.eqs))} />}
            {report && <ReportPanel items={report} eqName={eqName} onPick={(id) => { setSel({ ...EMPTY_SEL, eqs: [id] }); centerOn(id); }} onClose={() => setReportSrc(null)} />}
            {drawer && (
              <EqDrawer
                cat={cat}
                pivot={pivot}
                eqId={drawer}
                commit={commit}
                fault={faults.get(drawer)}
                onClose={() => setDrawer(null)}
                onSelect={(id) => { setSel({ ...EMPTY_SEL, eqs: [id] }); setDrawer(id); }}
                onDuplicate={() => { const r = duplicate(cat, pivot, [drawer]); commit(r.p); setSel({ ...EMPTY_SEL, eqs: r.ids }); setDrawer(r.ids[0]); }}
                onDelete={() => { commit(deleteItems(pivot, [drawer])); setDrawer(null); setSel(EMPTY_SEL); }}
              />
            )}
            {notice && <div role="status" style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', background: 'var(--abi-green-deep)', color: '#fff', padding: '8px 14px', font: '400 13px var(--font-sans)', zIndex: 8 }}>{notice}</div>}
          </div>
        </main>
      )}
      {tab === 'reseau' && <main style={{ minHeight: 0 }}><NetworkTab cat={cat} pivot={pivot} /></main>}
      {tab === 'securite' && <main style={{ minHeight: 0 }}><SafetyTab cat={cat} pivot={pivot} commit={commit} /></main>}

      <footer style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 12px', background: 'var(--surface-rail)', borderTop: '1px solid var(--surface-panel-header)', font: '400 12px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span>
          {tx(L.hgList)}<Abbr>HG</Abbr> {tx(L.hgListInfo, fmtDate(cat.sources.hg.date), cat.sources.hg.principaux)} <span className="mono">{pivot.site.catalogueVersion}</span>
          {pivot.site.catalogueVersion !== cat.version && <strong style={{ color: 'var(--abi-orange-text)' }}>{tx(L.builtIn, cat.version)}</strong>}
        </span>
        <span>{tx(L.eqCount, pivot.equipments.length)}<Abbr>EQ</Abbr> · {tx(L.links, pivot.links.length)}</span>
        <span style={{ color: incomplete.size ? 'var(--abi-orange-text)' : undefined }}>{tx(L.incomplete, incomplete.size)}</span>
        <span style={{ color: faults.size ? 'var(--abi-red)' : undefined }}>{tx(L.errors, faults.size)}</span>
        <span>
          {base.cpu} · {tx(L.command)} {base.command ? base.command : tx(L.listDefault)}
          {base.command === 'DRIV' && drive ? ' ' + drive : ''}
        </span>
        <span
          tabIndex={0}
          title={tx(L.help).split(' · ').join('\n')}
          aria-label={tx(L.help)}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', cursor: 'help' }}
        >
          {tx(L.shortcuts)}
          <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 8, border: '1px solid currentColor', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '600 11px var(--font-sans)' }}>?</span>
        </span>
      </footer>

      {sheet && (
        <SymbolSheet
          cat={cat}
          mode={sheet.pick ? 'pick' : 'browse'}
          onClose={() => setSheet(null)}
          onPick={(k) => {
            if (!sheet.pick) return pickNature(k);
            setSheet(null);
            sheet.pick(k);
          }}
        />
      )}
      {baseOpen && <BaseSettingsDialog cat={cat} base={base} onClose={() => setBaseOpen(false)} onApply={(b) => { commit(setBase(pivot, b)); setBaseOpen(false); say(<Term k="eq" plural before={tx(L.baseApplied)} />); }} />}
    </div>
  );
}
