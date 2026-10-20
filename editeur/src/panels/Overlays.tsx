// Éléments posés sur le canevas : barre d'alignement, légende des sorties, rapport de génération,
// fenêtre des réglages de base.
import { useState } from 'react';
import type { AlignMode, Axis } from '../model/align';
import type { BaseSettings, Catalogue } from '../model/catalogue';
import { outputColor } from '../model/route';
import { Button, Field, Icon, inputStyle, PanelHead } from '../ui/ui';
import type { ReportItem } from '../io/files';

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

const ALIGN_LABELS: Record<AlignMode | 'dh' | 'dv', string> = {
  left: 'Aligner à gauche',
  hcenter: 'Centrer horizontalement',
  right: 'Aligner à droite',
  top: 'Aligner en haut',
  vcenter: 'Centrer verticalement',
  bottom: 'Aligner en bas',
  dh: 'Répartir horizontalement',
  dv: 'Répartir verticalement',
};

export function AlignBar({ count, onAlign, onDistribute }: { count: number; onAlign: (m: AlignMode) => void; onDistribute: (a: Axis) => void }) {
  const btn = (k: AlignMode | 'dh' | 'dv', disabled = false) => (
    <button
      key={k}
      type="button"
      title={ALIGN_LABELS[k] + (disabled ? ' (3 objets minimum)' : '')}
      aria-label={ALIGN_LABELS[k]}
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
    <div role="toolbar" aria-label="Alignement" style={{ position: 'absolute', left: '50%', top: 12, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 4, padding: 4, background: 'var(--surface-page)', border: '1px solid var(--abi-green)', zIndex: 3 }}>
      <span style={{ padding: '0 8px', font: '400 12px var(--font-sans)', color: 'var(--text-secondary)' }}>{count} sélectionnés</span>
      {(['left', 'hcenter', 'right'] as AlignMode[]).map((k) => btn(k))}
      <span style={{ width: 1, height: 22, background: 'var(--border-nav)' }} />
      {(['top', 'vcenter', 'bottom'] as AlignMode[]).map((k) => btn(k))}
      <span style={{ width: 1, height: 22, background: 'var(--border-nav)' }} />
      {btn('dh', count < 3)}
      {btn('dv', count < 3)}
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
        Sorties <span style={{ color: 'var(--pid-warn)', textTransform: 'none', fontWeight: 400 }}>couleurs à valider</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 8 }}>
        {[1, 2, 3, 4, 5, 6].map((n) => item(String(n), outputColor(n), `S${n} ${n === 1 ? 'négative' : 'positive'}`))}
        {item('ar', 'var(--pid-stroke-light)', 'marche arrière', '4 3')}
      </div>
    </div>
  );
}

export function ReportPanel({ items, eqName, onPick, onClose }: { items: ReportItem[]; eqName: (id: string) => string; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <div style={{ position: 'absolute', left: 12, bottom: 12, width: 520, maxHeight: 260, display: 'flex', flexDirection: 'column', background: 'var(--surface-page)', border: '1px solid var(--abi-red)', zIndex: 3 }}>
      <PanelHead icon="triangle-alert" title={`Rapport de génération (fictif) — ${items.length} erreur${items.length > 1 ? 's' : ''}`} right={<Button variant="ghost" small icon="x" title="Effacer le rapport" onClick={onClose} />} />
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
            <span>{it.message}</span>
          </button>
        ))}
      </div>
      <div style={{ padding: '6px 10px', font: '400 12px var(--font-sans)', color: 'var(--text-muted)' }}>Clic sur une ligne : centrer l'équipement en cause.</div>
    </div>
  );
}

export function BaseSettingsDialog({ cat, base, onApply, onClose }: { cat: Catalogue; base: BaseSettings; onApply: (b: BaseSettings) => void; onClose: () => void }) {
  const [b, setB] = useState<BaseSettings>(structuredClone(base));
  const hsTypes = ['DRIV', 'SOFT', 'KM', 'KMIN', 'MRAS', 'QM', 'Q'].filter((t) => cat.hgTypes[t]);
  const sel = { ...inputStyle, appearance: 'auto' as const, padding: '0 4px' };
  return (
    <div role="dialog" aria-modal="true" aria-label="Réglages de base du projet" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }} onPointerDown={onClose}>
      <div style={{ width: 560, background: 'var(--surface-page)', border: '1px solid var(--surface-panel-header)' }} onPointerDown={(e) => e.stopPropagation()}>
        <PanelHead icon="settings" title="Réglages de base du projet" right={<Button variant="ghost" icon="x" title="Fermer" onClick={onClose} />} />
        <p style={{ margin: '12px 10px', font: '400 13px/1.45 var(--font-sans)', color: 'var(--text-secondary)' }}>
          Partent des standards Aktid. Chaque <strong style={{ color: '#fff' }}>nouvel</strong> équipement les prend ; les équipements déjà posés se modifient au cas par cas dans leur fiche.
        </p>
        <Field label="Commande par défaut" hint="Remplace le « Superieur 1 (défaut) » de la liste HG au niveau commande">
          <select aria-label="Commande par défaut" value={b.command} onChange={(e) => setB({ ...b, command: e.target.value as BaseSettings['command'] })} style={sel}>
            <option value="">Défaut de la liste HG</option>
            {(['DRIV', 'SOFT', 'KM', 'KMIN'] as const).map((t) => (
              <option key={t} value={t}>{t} — {cat.hgTypes[t].label}</option>
            ))}
          </select>
        </Field>
        {hsTypes.map((t) => (
          <Field key={t} label={`HS ${t}`}>
            <select aria-label={'HS par défaut ' + t} value={b.hs[t] ?? ''} onChange={(e) => setB({ ...b, hs: { ...b.hs, [t]: e.target.value } })} style={sel}>
              {cat.hgTypes[t].hs.map((h) => (
                <option key={h.id} value={h.id}>{h.label}</option>
              ))}
            </select>
          </Field>
        ))}
        <Field label="CPU">
          <select aria-label="CPU" value={b.cpu} onChange={(e) => setB({ ...b, cpu: e.target.value as BaseSettings['cpu'] })} style={sel}>
            <option value="S7-1517">S7-1517</option>
            <option value="S7-1515F">S7-1515 F</option>
          </select>
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 10, marginTop: 8, borderTop: '1px solid var(--border-divider)' }}>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" icon="check" onClick={() => onApply(b)}>Appliquer aux nouveaux EQ</Button>
        </div>
      </div>
    </div>
  );
}

export function CatalogueBanner({ cat }: { cat: Catalogue }) {
  const date = new Date(cat.date).toLocaleDateString('fr-FR');
  return (
    <div role="note" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 28, padding: '0 12px', background: 'var(--abi-tint-brown)', color: '#f0c9a0', font: '400 13px var(--font-sans)', flex: 'none' }}>
      <Icon name="triangle-alert" size={16} color="var(--abi-orange-text)" />
      {cat.fictif ? (
        <span>
          Liste HG <strong style={{ color: '#fff', fontWeight: 400 }}>réelle</strong> (export SharePoint du {date}, {cat.sources.hg.principaux} HG principaux) ·{' '}
          <strong style={{ color: 'var(--abi-orange-text)' }}>HS, options du bloc EQ et préfixes FICTIFS</strong> en attendant la Global Library — maquette, ne pas utiliser sur une affaire.
        </span>
      ) : (
        <span>Catalogue {cat.version} du {date} — vérifier qu'il s'agit de la dernière version (ouvrir toujours depuis le même dossier SharePoint).</span>
      )}
    </div>
  );
}
