// Éléments posés sur le canevas : barre d'alignement, légende des sorties, rapport de génération,
// fenêtre des réglages de base, bandeau du catalogue.
import { useState } from 'react';
import type { AlignMode, Axis } from '../model/align';
import type { BaseSettings, Catalogue } from '../model/catalogue';
import { outputColor } from '../model/route';
import { hsLabel } from '../model/rules';
import { Button, Field, Icon, inputStyle, PanelHead } from '../ui/ui';
import type { ReportItem } from '../io/files';
import { Abbr, fmtDate, hgLabel, plain, rich, Term, termWord, tx, type Entry } from '../i18n';

/** Textes de ce fichier : français pour l'opérateur, anglais préparé. « [EQ] » : voir i18n.rich / plain. */
const L = {
  // Barre d'alignement
  toolbar: { fr: 'Alignement', en: 'Alignment' },
  selected: { fr: (n: number) => `${n} sélectionnés`, en: (n: number) => `${n} selected` },
  min3: { fr: ' (3 objets minimum)', en: ' (at least 3 objects)' },
  straighten: { fr: 'Redresser', en: 'Straighten' },
  straightenTip: {
    fr: 'Redresser les liens de la sélection : déplace les équipements [EQ] presque alignés pour que leurs liens deviennent droits',
    en: 'Straighten the selected links: moves nearly aligned Equipment items [EQ] so that their links become straight',
  },
  // Légende
  outputs: { fr: 'Sorties', en: 'Outputs' },
  forwardLine: { fr: 'marche avant', en: 'forward' },
  reverseLine: { fr: 'marche arrière (AR)', en: 'reverse (AR)' },
  tagMeaning: { fr: 'canal 1, sortie 2 (écrit seulement si utile)', en: 'channel 1, output 2 (shown only when needed)' },
  pendingMeaning: { fr: 'sortie en attente : à raccorder ou supprimer', en: 'pending output: connect or remove it' },
  loopMeaning: { fr: 'boucle, retour en amont', en: 'loop, back upstream' },
  colorsTbc: { fr: 'couleurs à valider', en: 'colors to be confirmed' },
  negative: { fr: 'négative', en: 'negative' },
  positive: { fr: 'positive', en: 'positive' },
  reverse: { fr: 'marche arrière', en: 'reverse' },
  // Rapport de génération
  reportTitle: {
    fr: (n: number) => `Rapport de génération (fictif) — ${n} erreur${n > 1 ? 's' : ''}`,
    en: (n: number) => `Generation report (mock) — ${n} error${n > 1 ? 's' : ''}`,
  },
  clearReport: { fr: 'Effacer le rapport', en: 'Clear the report' },
  reportHintA: { fr: "Clic sur une ligne : centrer la vue sur l'équipement", en: 'Click a row to center the view on the related Equipment item' },
  reportHintB: { fr: ' en cause.', en: '.' },
  // Réglages de base
  baseTitle: { fr: 'Réglages de base du projet', en: 'Project base settings' },
  close: { fr: 'Fermer', en: 'Close' },
  intro1: { fr: 'Ces réglages partent des standards Aktid. Chaque ', en: 'These settings are based on the Aktid standards. Every ' },
  introNew: { fr: 'nouvel', en: 'new' },
  introEq: { fr: 'équipement', en: 'Equipment item' },
  intro2: {
    fr: 'les reçoit ; les équipements déjà posés se modifient au cas par cas dans leur fiche.',
    en: 'gets them; Equipment items already placed are changed one by one in their details panel.',
  },
  command: { fr: 'Commande par défaut', en: 'Default control' },
  commandHint: {
    fr: 'Appareil qui pilote le moteur. Remplace la colonne « Superieur 1 (défaut) » de la liste des matériels génériques',
    en: 'Device that drives the motor. Overrides the “Superieur 1 (défaut)” column of the Hardware Generic list',
  },
  // Commande vide : même libellé que la barre d'état (App, listDefault). « défaut » seul évoque une panne.
  commandStd: { fr: 'Selon la liste (Superieur 1)', en: 'Per list (Superieur 1)' },
  hsHead: { fr: ' par défaut, selon le matériel générique', en: ' defaults, per Hardware Generic' },
  hsAria: { fr: (t: string) => `Matériel spécifique [HS] par défaut pour ${t}`, en: (t: string) => `Default Hardware Specific [HS] for ${t}` },
  cpu: { fr: 'Automate (CPU)', en: 'PLC (CPU)' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
  applyNew: { fr: 'Appliquer aux nouveaux équipements', en: 'Apply to new Equipment items' },
  // Bandeau du catalogue
  hgList: { fr: ' : liste ', en: ': ' },
  real: { fr: 'réelle', en: 'real' },
  hgSource: {
    fr: (d: string, n: number) => ` (export SharePoint du ${d}, ${n} principaux)`,
    en: (d: string, n: number) => ` list (SharePoint export of ${d}, ${n} main items)`,
  },
  fictifEq: { fr: ', options des équipements', en: ', Equipment' },
  fictifEnd: { fr: ' et préfixes FICTIFS', en: ' options and prefixes are MOCK' },
  fictifNote: {
    fr: 'en attendant la Global Library — maquette, ne pas utiliser sur une affaire.',
    en: 'until the Global Library is available — mock-up, do not use on a customer project.',
  },
  catalogue: {
    fr: (v: string, d: string) => `Catalogue ${v} du ${d} — vérifier qu'il s'agit de la dernière version (ouvrir toujours depuis le même dossier SharePoint).`,
    en: (v: string, d: string) => `Catalogue ${v} of ${d} — check that it is the latest version (always open it from the same SharePoint folder).`,
  },
};

const ALIGN_ICONS: Record<AlignMode | 'dh' | 'dv', string> = {
  left: 'M4 3v18M8 7h10v4H8zM8 13h6v4H8z',
  hcenter: 'M12 3v18M6 7h12v4H6zM8 13h8v4H8z',
  right: 'M20 3v18M6 7h10v4H6zM10 13h6v4h-6z',
  top: 'M3 4h18M7 8h4v10H7zM13 8h4v6h-4z',
  vcenter: 'M3 12h18M7 6h4v12H7zM13 8h4v8h-4z',
  bottom: 'M3 20h18M7 6h4v10H7zM13 10h4v6h-4z',
  dh: 'M4 4v16M20 4v16M9 8h6v8H9z',
  dv: 'M4 4h16M4 20h16M8 9h8v6H8z',
};

const ALIGN_LABELS: Record<AlignMode | 'dh' | 'dv', Entry> = {
  left: { fr: 'Aligner à gauche', en: 'Align left' },
  hcenter: { fr: 'Centrer horizontalement', en: 'Center horizontally' },
  right: { fr: 'Aligner à droite', en: 'Align right' },
  top: { fr: 'Aligner en haut', en: 'Align top' },
  vcenter: { fr: 'Centrer verticalement', en: 'Center vertically' },
  bottom: { fr: 'Aligner en bas', en: 'Align bottom' },
  dh: { fr: 'Répartir horizontalement', en: 'Distribute horizontally' },
  dv: { fr: 'Répartir verticalement', en: 'Distribute vertically' },
};

export function AlignBar({ count, onAlign, onDistribute, onStraighten }: { count: number; onAlign: (m: AlignMode) => void; onDistribute: (a: Axis) => void; onStraighten: () => void }) {
  const btn = (k: AlignMode | 'dh' | 'dv', disabled = false) => (
    <button
      key={k}
      type="button"
      title={tx(ALIGN_LABELS[k]) + (disabled ? tx(L.min3) : '')}
      aria-label={tx(ALIGN_LABELS[k])}
      disabled={disabled}
      className="abi-btn"
      onClick={() => (k === 'dh' ? onDistribute('h') : k === 'dv' ? onDistribute('v') : onAlign(k))}
      style={{ width: 32, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-nav)', color: '#ddd', border: 'none', borderRadius: 3, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1 }}
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden="true">
        <path d={ALIGN_ICONS[k]} />
      </svg>
    </button>
  );
  return (
    <div role="toolbar" aria-label={tx(L.toolbar)} style={{ position: 'absolute', left: '50%', top: 12, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 4, padding: 4, background: 'var(--surface-page)', border: '1px solid var(--abi-green)', zIndex: 3 }}>
      <span style={{ padding: '0 8px', font: '400 12px var(--font-sans)', color: 'var(--text-secondary)' }}>{tx(L.selected, count)}</span>
      {(['left', 'hcenter', 'right'] as AlignMode[]).map((k) => btn(k))}
      <span style={{ width: 1, height: 22, background: 'var(--border-nav)' }} />
      {(['top', 'vcenter', 'bottom'] as AlignMode[]).map((k) => btn(k))}
      <span style={{ width: 1, height: 22, background: 'var(--border-nav)' }} />
      {btn('dh', count < 3)}
      {btn('dv', count < 3)}
      <span style={{ width: 1, height: 22, background: 'var(--border-nav)' }} />
      <button type="button" className="abi-btn" title={plain(tx(L.straightenTip))} onClick={onStraighten} style={{ height: 30, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-nav)', color: '#ddd', border: 'none', borderRadius: 3, cursor: 'pointer', font: '400 12px var(--font-sans)' }}>
        <Icon name="straighten" size={16} /> {tx(L.straighten)}
      </button>
    </div>
  );
}

/** Légende des sorties, compacte, dans le pied de la bibliothèque (ne masque pas le canevas). */
export function Legend() {
  const item = (key: string, stroke: string, label: string, dash?: string) => (
    <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 16 }}>
      <svg width={22} height={6} aria-hidden="true"><line x1={0} y1={3} x2={22} y2={3} stroke={stroke} strokeWidth={2} strokeDasharray={dash} /></svg>
      {label}
    </span>
  );
  return (
    <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-divider)', font: '400 11px var(--font-sans)', color: 'var(--pid-caption)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', font: '700 11px var(--font-sans)', textTransform: 'uppercase', color: '#fff', marginBottom: 4 }}>
        {tx(L.outputs)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {item('av', outputColor(1), tx(L.forwardLine))}
        {item('ar', outputColor(1), tx(L.reverseLine), '4 3')}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 16 }}>
          <span style={{ width: 22, font: '600 9px var(--font-tag)', color: 'var(--pid-caption)', textAlign: 'center' }}>1.2</span>
          {tx(L.tagMeaning)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 16 }}>
          <span style={{ width: 22, font: '600 10px var(--font-tag)', color: 'var(--pid-caption)', textAlign: 'center' }}>↺</span>
          {tx(L.loopMeaning)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 16 }}>
          <svg width={22} height={10} aria-hidden="true"><line x1={2} y1={5} x2={16} y2={5} stroke="var(--abi-orange-text)" strokeWidth={2.4} /><circle cx={17} cy={5} r={2.6} fill="var(--abi-orange-text)" /></svg>
          {tx(L.pendingMeaning)}
        </span>
      </div>
    </div>
  );
}

export function ReportPanel({ items, eqName, onPick, onClose }: { items: ReportItem[]; eqName: (id: string) => string; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <div style={{ position: 'absolute', left: 12, bottom: 12, width: 520, maxHeight: 260, display: 'flex', flexDirection: 'column', background: 'var(--surface-page)', border: '1px solid var(--abi-red)', zIndex: 3 }}>
      <PanelHead icon="triangle-alert" title={tx(L.reportTitle, items.length)} right={<Button variant="ghost" small icon="x" title={tx(L.clearReport)} onClick={onClose} />} />
      <div style={{ overflow: 'auto' }}>
        {items.map((it, i) => (
          <button
            key={i}
            type="button"
            className="abi-row"
            onClick={() => onPick(it.eq)}
            style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-divider)', cursor: 'pointer', font: '400 13px/1.35 var(--font-sans)' }}
          >
            <span className="mono" style={{ color: 'var(--pid-fault-stroke)', font: '600 12px var(--font-tag)', width: 48, flex: 'none' }}>{eqName(it.eq)}</span>
            {/* Message à marqueurs [HS] (io/files.ts) : terme technique en petit. */}
            <span>{rich(it.message)}</span>
          </button>
        ))}
      </div>
      <div style={{ padding: '6px 10px', font: '400 12px var(--font-sans)', color: 'var(--text-muted)' }}>
        {tx(L.reportHintA)}
        <Abbr>EQ</Abbr>
        {tx(L.reportHintB)}
      </div>
    </div>
  );
}

export function BaseSettingsDialog({ cat, base, onApply, onClose }: { cat: Catalogue; base: BaseSettings; onApply: (b: BaseSettings) => void; onClose: () => void }) {
  const [b, setB] = useState<BaseSettings>(structuredClone(base));
  const hsTypes = ['DRIV', 'SOFT', 'KM', 'KMIN', 'MRAS', 'QM', 'Q'].filter((t) => cat.hgTypes[t]);
  const sel = { ...inputStyle, appearance: 'auto' as const, padding: '0 4px' };
  return (
    <div role="dialog" aria-modal="true" aria-label={tx(L.baseTitle)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }} onPointerDown={onClose}>
      <div style={{ width: 560, background: 'var(--surface-page)', border: '1px solid var(--surface-panel-header)' }} onPointerDown={(e) => e.stopPropagation()}>
        <PanelHead icon="settings" title={tx(L.baseTitle)} right={<Button variant="ghost" icon="x" title={tx(L.close)} onClick={onClose} />} />
        <p style={{ margin: '12px 10px', font: '400 13px/1.45 var(--font-sans)', color: 'var(--text-secondary)' }}>
          {tx(L.intro1)}
          <strong style={{ color: '#fff' }}>{tx(L.introNew)}</strong> {tx(L.introEq)}
          <Abbr>EQ</Abbr> {tx(L.intro2)}
        </p>
        <Field
          label={tx(L.command)}
          hint={
            <span>
              {tx(L.commandHint)}
              <Abbr>HG</Abbr>.
            </span>
          }
        >
          <select aria-label={tx(L.command)} value={b.command} onChange={(e) => setB({ ...b, command: e.target.value as BaseSettings['command'] })} style={sel}>
            <option value="">{tx(L.commandStd)}</option>
            {(['DRIV', 'SOFT', 'KM', 'KMIN'] as const).map((t) => (
              <option key={t} value={t}>{t} — {hgLabel(cat.hgTypes[t])}</option>
            ))}
          </select>
        </Field>
        {/* Une seule mention HS / HG pour toute la liste ; chaque ligne porte le code HG (non traduit). */}
        {hsTypes.length > 0 && (
          <div style={{ margin: '12px 10px 4px', font: '700 13px var(--font-sans)', color: 'var(--text-secondary)' }}>
            {termWord('hs', true)}
            <Abbr>HS</Abbr>
            {tx(L.hsHead)}
            <Abbr>HG</Abbr>
          </div>
        )}
        {hsTypes.map((t) => (
          <Field key={t} label={t}>
            <select aria-label={plain(tx(L.hsAria, t))} value={b.hs[t] ?? ''} onChange={(e) => setB({ ...b, hs: { ...b.hs, [t]: e.target.value } })} style={sel}>
              {cat.hgTypes[t].hs.map((h) => (
                <option key={h.id} value={h.id}>{hsLabel(h)}</option>
              ))}
            </select>
          </Field>
        ))}
        <Field label={tx(L.cpu)}>
          <select aria-label={tx(L.cpu)} value={b.cpu} onChange={(e) => setB({ ...b, cpu: e.target.value as BaseSettings['cpu'] })} style={sel}>
            <option value="S7-1517">S7-1517</option>
            <option value="S7-1515F">S7-1515 F</option>
          </select>
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 10, marginTop: 8, borderTop: '1px solid var(--border-divider)' }}>
          <Button onClick={onClose}>{tx(L.cancel)}</Button>
          <Button variant="primary" icon="check" onClick={() => onApply(b)}>
            <span>
              {tx(L.applyNew)}
              <Abbr>EQ</Abbr>
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CatalogueBanner({ cat }: { cat: Catalogue }) {
  const date = fmtDate(cat.date);
  // Hauteur minimale seulement : le texte traduit peut demander un peu plus.
  return (
    <div role="note" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28, padding: '3px 12px', background: 'var(--abi-tint-brown)', color: '#f0c9a0', font: '400 13px var(--font-sans)', flex: 'none' }}>
      <Icon name="triangle-alert" size={16} color="var(--abi-orange-text)" />
      {cat.fictif ? (
        <span>
          <Term k="hg" plural />
          {tx(L.hgList)}
          <strong style={{ color: '#fff', fontWeight: 400 }}>{tx(L.real)}</strong>
          {tx(L.hgSource, date, cat.sources.hg.principaux)} ·{' '}
          <strong style={{ color: 'var(--abi-orange-text)' }}>
            <Term k="hs" plural />
            {tx(L.fictifEq)}
            <Abbr>EQ</Abbr>
            {tx(L.fictifEnd)}
          </strong>{' '}
          {tx(L.fictifNote)}
        </span>
      ) : (
        <span>{tx(L.catalogue, cat.version, date)}</span>
      )}
    </div>
  );
}
