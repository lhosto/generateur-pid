import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, EMPTY_SEL, fitView, ZoomBar, type Selection, type View } from './canvas/Canvas';
import { siteTest, stressSite } from './fictif/siteTest.fictif';
import { fakeReport, openPivot, savePivot, type ReportItem } from './io/files';
import { align, distribute, type AlignMode, type Axis } from './model/align';
import { readEmbeddedCatalogue } from './model/catalogue';
import { boxAt, CHUTE_SIZE, eqBox, SCREEN } from './model/geometry';
import { addEq, deleteItems, duplicate, emptyPivot, findEq, moveItems, removeLink, removeOutput, setBase, setPositions } from './model/ops';
import type { Pivot } from './model/pivot';
import { incompleteReasons } from './model/rules';
import { loadSaved, usePivotHistory } from './model/store';
import { EqDrawer } from './panels/EqDrawer';
import { AlignBar, BaseSettingsDialog, CatalogueBanner, ReportPanel } from './panels/Overlays';
import { Palette } from './panels/Palette';
import { SymbolSheet } from './panels/SymbolSheet';
import { NetworkTab } from './tabs/NetworkTab';
import { SafetyTab } from './tabs/SafetyTab';
import { Button, Icon } from './ui/ui';

const cat = readEmbeddedCatalogue();
type Tab = 'pid' | 'reseau' | 'securite';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'pid', label: 'PID', icon: 'workflow' },
  { id: 'reseau', label: 'Réseau', icon: 'link' },
  { id: 'securite', label: 'Sécurité', icon: 'octagon-x' },
];

export function App() {
  const h = usePivotHistory(() => loadSaved() ?? siteTest(cat));
  const { pivot, commit } = h;
  const [tab, setTab] = useState<Tab>('pid');
  const [sel, setSel] = useState<Selection>(EMPTY_SEL);
  const [view, setView] = useState<View>({ zoom: 0.6, px: 20, py: 30 });
  const size = useRef({ w: 1200, h: 700 });
  const fitted = useRef(false);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [current, setCurrent] = useState('BELT');
  const [sheet, setSheet] = useState(false);
  const [grid, setGrid] = useState(true);
  const [report, setReport] = useState<ReportItem[] | null>(null);
  const [baseOpen, setBaseOpen] = useState(false);
  const [siteMenu, setSiteMenu] = useState(false);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const say = (t: string) => {
    setNotice(t);
    window.setTimeout(() => setNotice(''), 2200);
  };

  const incomplete = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of pivot.equipments) {
      const r = incompleteReasons(cat, pivot, e);
      if (r.length) m.set(e.id, r);
    }
    return m;
  }, [pivot]);
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

  const replace = (p: Pivot, msg: string) => {
    commit(p);
    setSel(EMPTY_SEL);
    setDrawer(null);
    setReport(null);
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

  return (
    <div style={{ display: 'grid', gridTemplateRows: '56px auto 1fr 28px', height: '100%' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: 'var(--surface-rail)', borderBottom: '1px solid var(--surface-panel-header)', minWidth: 0 }}>
        <div style={{ font: '700 16px var(--font-sans)', textTransform: 'uppercase', whiteSpace: 'nowrap', marginRight: 6 }}>Éditeur PID</div>
        <input
          aria-label="Nom du site"
          value={pivot.site.name}
          onChange={(e) => commit({ ...pivot, site: { ...pivot.site, name: e.target.value } })}
          style={{ width: 220, height: 32, padding: '0 8px', background: 'transparent', border: '1px solid var(--border-nav)', color: '#fff', font: '400 14px var(--font-sans)' }}
        />
        <nav aria-label="Onglets" style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
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
              {t.label}
            </button>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <Button icon="undo" title="Annuler (Ctrl+Z)" disabled={!h.canUndo} onClick={h.undo} />
        <Button icon="undo" title="Rétablir (Ctrl+Y)" disabled={!h.canRedo} onClick={h.redo} style={{ transform: 'scaleX(-1)' }} />
        <span style={{ width: 1, height: 28, background: 'var(--border-nav)', margin: '0 4px' }} />
        <Button icon="settings" onClick={() => setBaseOpen(true)}>Réglages de base</Button>
        <Button icon="file-check" variant="acknowledge" title="Charger un rapport de génération fictif" onClick={() => { setReport(fakeReport(cat, pivot)); setTab('pid'); }}>Rapport</Button>
        <div style={{ position: 'relative' }}>
          <Button icon="workflow" onClick={() => setSiteMenu((v) => !v)}>Site <Icon name="chevron-down" size={14} /></Button>
          {siteMenu && (
            <div style={{ position: 'absolute', right: 0, top: 38, width: 240, background: 'var(--surface-page)', border: '1px solid var(--border-input)', zIndex: 30 }}>
              {[
                { label: 'Recharger le site de test', act: () => replace(siteTest(cat), 'Site de test chargé') },
                { label: 'Test de charge (≈ 200 EQ)', act: () => replace(stressSite(cat), 'Test de charge chargé') },
                { label: 'Nouveau site vide', act: () => replace(emptyPivot(cat), 'Nouveau site') },
              ].map((m) => (
                <button key={m.label} type="button" className="abi-row" onClick={m.act} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-divider)', cursor: 'pointer', font: '400 13px var(--font-sans)' }}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button icon="folder-open" title="Ouvrir un pivot" onClick={() => fileRef.current?.click()}>Ouvrir</Button>
        <Button variant="primary" icon="save" title="Enregistrer le fichier pivot (JSON)" onClick={() => { savePivot(pivot); say('Pivot enregistré'); }}>Enregistrer le pivot</Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) openPivot(f).then((p) => replace(p, 'Pivot ouvert : ' + p.site.name), (err: Error) => say(err.message));
          }}
        />
      </header>

      <CatalogueBanner cat={cat} />

      {tab === 'pid' && (
        <main style={{ display: 'grid', gridTemplateColumns: '236px 1fr', minHeight: 0 }}>
          <Palette cat={cat} current={current} onCurrent={setCurrent} onPlace={placeCenter} onSymbols={() => setSheet(true)} />
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
            />
            <ZoomBar view={view} onZoom={zoomBy} onFit={fit} grid={grid} onGrid={() => setGrid(!grid)} />
            {selCount >= 2 && <AlignBar count={selCount} onAlign={onAlign} onDistribute={onDistribute} />}
            {report && <ReportPanel items={report} eqName={eqName} onPick={(id) => { setSel({ ...EMPTY_SEL, eqs: [id] }); centerOn(id); }} onClose={() => setReport(null)} />}
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
        <span>Liste HG {cat.sources.hg.date} · {cat.sources.hg.principaux} principaux · catalogue <span className="mono">{pivot.site.catalogueVersion}</span>{pivot.site.catalogueVersion !== cat.version && <strong style={{ color: 'var(--abi-orange-text)' }}> ≠ intégré {cat.version}</strong>}</span>
        <span>{pivot.equipments.length} EQ · {pivot.links.length} liens</span>
        <span style={{ color: incomplete.size ? 'var(--abi-orange-text)' : undefined }}>{incomplete.size} incomplet{incomplete.size > 1 ? 's' : ''}</span>
        <span style={{ color: faults.size ? 'var(--abi-red)' : undefined }}>{faults.size} erreur{faults.size > 1 ? 's' : ''} de génération</span>
        <span>{base.cpu} · commande {base.command || 'défaut liste HG'}{base.command === 'DRIV' && drive ? ' ' + drive : ''}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>Double-clic : fiche · Espace + glisser : vue · Molette : zoom · Maj : sélection multiple · Suppr · Ctrl+Z / Y / D</span>
      </footer>

      {sheet && <SymbolSheet cat={cat} onClose={() => setSheet(false)} onPick={(k) => { setCurrent(k); setSheet(false); say(k + ' : HG0 des gestes « + »'); }} />}
      {baseOpen && <BaseSettingsDialog cat={cat} base={base} onClose={() => setBaseOpen(false)} onApply={(b) => { commit(setBase(pivot, b)); setBaseOpen(false); say('Réglages de base appliqués aux nouveaux EQ'); }} />}
    </div>
  );
}
