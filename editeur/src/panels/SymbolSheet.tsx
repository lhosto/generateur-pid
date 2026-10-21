// Planche des symboles : un visuel distinct par HG principal de la liste HG. Sert à valider la
// proposition puis à remplir la colonne « P&D - Symbole » de la liste SharePoint.
import { useState } from 'react';
import { etatLabel, principals, type Catalogue } from '../model/catalogue';
import { boxAt, sizeOf } from '../model/geometry';
import { aktidSymbolOf, AKTID_STANDARD, BASES, GROUP_ORDER, groupLabel, symbolOf, type Base } from '../model/symbols';
import { activeStandard, deleteStandard, duplicateStandard, renameStandard, setActiveStandard, setStandardBase, shapeStandards } from '../model/ops';
import type { Pivot } from '../model/pivot';
import { haloOf, labelPos, Shape, Tag } from '../canvas/symbols';
import { Abbr, getLang, hgLabel, tx, type Entry } from '../i18n';
import { Button, Icon, inputStyle, PanelHead } from '../ui/ui';

const L = {
  sheet: { fr: 'Planche des symboles', en: 'Symbol chart' },
  // Titre découpé autour du terme technique, placé juste après « équipement ».
  pickTitle: { fr: 'Choisir l’équipement', en: 'Choose the Equipment item' },
  pickTitleEnd: { fr: 'à ajouter', en: 'to add' },
  pickIntro: {
    fr: 'Clic sur une carte : l’équipement est posé et relié à la sortie. Le type est donné par son matériel générique principal',
    en: 'Click a card: the Equipment item is placed and linked to the output. Its type comes from its main Hardware Generic',
  },
  title: {
    fr: (n: number) => `Planche des symboles — ${n} matériels génériques principaux`,
    en: (n: number) => `Symbol chart — ${n} main Hardware Generic`,
  },
  close: { fr: 'Fermer', en: 'Close' },
  // Texte d'introduction découpé autour des termes techniques en petit (HG, EQ).
  each: { fr: 'Chaque matériel générique principal', en: 'Each main Hardware Generic' },
  source: {
    fr: (f: string, d: string) => `de la liste (${f}, ${d}) a son propre visuel : il donne sa forme à l'équipement`,
    en: (f: string, d: string) => `in the list (${f}, ${d}) has its own visual: it gives its shape to the Equipment item`,
  },
  sourceEnd: { fr: 'dont il est le matériel principal.', en: 'of which it is the main Hardware Generic.' },
  shapes: { fr: 'Formes de base du synoptique SCADA 2026, pictogrammes proposés :', en: 'Base shapes from the 2026 SCADA overview, proposed pictograms:' },
  toValidate: { fr: 'à valider', en: 'to be validated' },
  report: {
    fr: ', puis à reporter dans la colonne « P&D - Symbole » (vide aujourd\'hui).',
    en: ', then to be entered in the “P&D - Symbole” column (empty today).',
  },
  pick: {
    fr: 'Clic sur une carte : ce matériel sera proposé dans le menu des « + » des équipements, après le convoyeur.',
    en: 'Click a card: this hardware will be offered in the “+” menu of Equipment items, after the conveyor.',
  },
  wincc: { fr: 'ID WinCC', en: 'WinCC ID' },
  standard: { fr: 'Standard des formes', en: 'Shape standard' },
  duplicateStd: { fr: 'Nouveau standard', en: 'New standard' },
  duplicateStdTitle: { fr: 'Copie du standard affiché, pour en changer les formes', en: 'Copy of the displayed standard, to change its shapes' },
  copyOf: { fr: (n: string) => 'Copie de ' + n, en: (n: string) => 'Copy of ' + n },
  stdName: { fr: 'Nom du standard', en: 'Standard name' },
  deleteStd: { fr: 'Supprimer ce standard', en: 'Delete this standard' },
  aktidFixed: { fr: 'Référence fixe : dupliquer pour changer des formes.', en: 'Fixed reference: duplicate it to change shapes.' },
  customHint: { fr: 'Changer la forme sous chaque carte ; le pictogramme reste.', en: 'Change the shape under each card; the pictogram stays.' },
  shape: { fr: 'Forme', en: 'Shape' },
  changed: { fr: 'modifiée', en: 'changed' },
  noEtat: { fr: 'état —', en: 'status —' },
  search: { fr: 'Chercher : code, nom, famille… (Entrée = premier résultat)', en: 'Search: code, name, family… (Enter = first result)' },
  none: { fr: (q: string) => `Aucun matériel ne correspond à « ${q} ».`, en: (q: string) => `No hardware matches “${q}”.` },
  count: { fr: (n: number) => `${n} résultat${n > 1 ? 's' : ''}`, en: (n: number) => `${n} result${n > 1 ? 's' : ''}` },
};

// Nom affiché des formes de base (la clé reste l'identifiant interne de symbols.ts).
const BASE_LABELS: Record<Base, Entry> = {
  pill: { fr: 'rouleau (convoyage)', en: 'roller (conveying)' },
  flare: { fr: 'évasée (séparation)', en: 'flared (separation)' },
  heap: { fr: 'trémie et tas (dosage)', en: 'hopper and heap (dosing)' },
  crusher: { fr: 'trémie (broyage)', en: 'hopper (shredding)' },
  frame: { fr: 'cadre pointillé (divers)', en: 'dashed frame (misc.)' },
  card: { fr: 'rectangle', en: 'rectangle' },
  screen: { fr: 'crible', en: 'screen' },
  grid: { fr: 'grille', en: 'grid' },
  diamond: { fr: 'losange', en: 'diamond' },
  para: { fr: 'parallélogramme', en: 'parallelogram' },
  circle: { fr: 'cercle', en: 'circle' },
  silo: { fr: 'silo', en: 'silo' },
  hopper: { fr: 'trémie', en: 'hopper' },
  cabinet: { fr: 'armoire', en: 'cabinet' },
  desk: { fr: 'pupitre', en: 'desk' },
  unknown: { fr: 'symbole à définir', en: 'symbol to be defined' },
};

function Big({ hg0 }: { hg0: string }) {
  const { w, h } = sizeOf(symbolOf(hg0).base, 1, 'E');
  const box = boxAt(0, 0, w, h);
  const lp = labelPos(hg0, box);
  return (
    <svg width={150} height={84} viewBox="-50 -28 100 56" aria-hidden="true" style={{ background: 'var(--pid-bg)', flex: 'none' }}>
      <Shape hg0={hg0} box={box} flow="E" channels={1} />
      <Tag text="08Aa" x={lp.x} y={lp.y} outside={lp.outside} halo={haloOf(hg0)} />
    </svg>
  );
}

export function SymbolSheet({ cat, pivot, commit, mode = 'browse', onClose, onPick }: { cat: Catalogue; pivot: Pivot; commit: (p: Pivot) => void; mode?: 'browse' | 'pick'; onClose: () => void; onPick: (code: string) => void }) {
  const [q, setQ] = useState('');
  const std = activeStandard(pivot);
  const editable = mode === 'browse' && std.id !== AKTID_STANDARD.id;
  // Recherche sans accents ni casse, sur le code, les libellés FR / EN et la famille ; tous les mots doivent figurer.
  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const words = norm(q).split(/\s+/).filter(Boolean);
  const all = principals(cat);
  const codes = all.filter((k) => {
    const d = cat.hgTypes[k];
    const hay = norm([k, d.label, d.labelEn, groupLabel(symbolOf(k).group)].join(' '));
    return words.every((w) => hay.includes(w));
  });
  const groups = GROUP_ORDER.filter((g) => codes.some((k) => symbolOf(k).group === g));
  const ordered = groups.flatMap((g) => codes.filter((k) => symbolOf(k).group === g));
  return (
    <div role="dialog" aria-modal="true" aria-label={tx(L.sheet)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }} onPointerDown={onClose}>
      <div style={{ width: 'min(1500px, 94vw)', height: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-page)', border: '1px solid var(--surface-panel-header)' }} onPointerDown={(e) => e.stopPropagation()}>
        <PanelHead icon="grid" title={mode === 'pick' ? <>{tx(L.pickTitle)}<Abbr>EQ</Abbr> {tx(L.pickTitleEnd)}</> : <>{tx(L.title, all.length)}<Abbr>HG</Abbr></>} right={<Button variant="ghost" icon="x" title={tx(L.close)} onClick={onClose} />} />
        {mode === 'pick' ? (
          <p style={{ margin: 0, padding: '10px 12px', font: '400 13px/1.45 var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-divider)' }}>
            {tx(L.pickIntro)}
            <Abbr>HG</Abbr>.
          </p>
        ) : (
          <p style={{ margin: 0, padding: '10px 12px', font: '400 13px/1.45 var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-divider)' }}>
            {tx(L.each)}
            <Abbr>HG</Abbr> {tx(L.source, cat.sources.hg.fichier, cat.sources.hg.date)}
            <Abbr>EQ</Abbr> {tx(L.sourceEnd)}{' '}
            {tx(L.shapes)} <strong style={{ color: 'var(--abi-orange-text)', fontWeight: 400 }}>{tx(L.toValidate)}</strong>
            {tx(L.report)} {tx(L.pick)}
          </p>
        )}
        {mode === 'browse' && (
          // Standard des formes : Aktid (fixe) ou standard créé pour ce site, dont seules les formes changent.
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border-divider)', flexWrap: 'wrap' }}>
            <span style={{ font: '600 13px var(--font-sans)' }}>{tx(L.standard)}</span>
            <select aria-label={tx(L.standard)} value={std.id} onChange={(e) => commit(setActiveStandard(pivot, e.target.value))} style={{ ...inputStyle, appearance: 'auto', width: 220, height: 30 }}>
              {shapeStandards(pivot).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {editable && (
              <input key={std.id} aria-label={tx(L.stdName)} defaultValue={std.name} onBlur={(e) => commit(renameStandard(pivot, std.id, e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} style={{ ...inputStyle, width: 200, height: 30 }} />
            )}
            <Button small icon="copy" title={tx(L.duplicateStdTitle)} onClick={() => commit(duplicateStandard(pivot, std.id, tx(L.copyOf, std.name)).p)}>{tx(L.duplicateStd)}</Button>
            {editable && <Button small variant="stop" icon="trash" title={tx(L.deleteStd)} onClick={() => commit(deleteStandard(pivot, std.id))} />}
            <span style={{ font: '400 12px var(--font-sans)', color: 'var(--text-muted)' }}>{tx(editable ? L.customHint : L.aktidFixed)}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border-divider)' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 520 }}>
            <input
              autoFocus
              aria-label={tx(L.search)}
              placeholder={tx(L.search)}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && ordered[0]) onPick(ordered[0]);
                if (e.key === 'Escape') (q ? setQ('') : onClose());
                e.stopPropagation();
              }}
              style={{ ...inputStyle, height: 34, paddingLeft: 32, fontSize: 15 }}
            />
            <Icon name="search" size={18} color="var(--text-muted)" style={{ position: 'absolute', left: 8, top: 8 }} />
          </div>
          {q && <span style={{ font: '400 12px var(--font-sans)', color: 'var(--text-muted)' }}>{tx(L.count, codes.length)}</span>}
        </div>
        <div style={{ overflow: 'auto', flex: 1, padding: '4px 12px 16px' }}>
          {q && !codes.length && <p style={{ margin: '16px 0', font: '400 14px var(--font-sans)', color: 'var(--text-muted)' }}>{tx(L.none, q)}</p>}
          {groups.map((g) => (
            <section key={g}>
              <h3 style={{ margin: '16px 0 8px', font: '700 12px var(--font-sans)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{groupLabel(g)}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 8 }}>
                {codes.filter((k) => symbolOf(k).group === g).map((k) => {
                  const d = cat.hgTypes[k];
                  const name = hgLabel(d);
                  // Second nom : celui de l'autre langue de la liste HG, s'il diffère.
                  const alt = getLang() === 'en' ? d.label : d.labelEn;
                  const changed = std.bases[k] !== undefined;
                  return (
                    <div key={k} style={{ display: 'flex', flexDirection: 'column' }}>
                    <button type="button" className="abi-row" onClick={() => onPick(k)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 6, background: 'var(--surface-nav)', border: '1px solid var(--border-nav)', textAlign: 'left', cursor: 'pointer' }}>
                      <Big hg0={k} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                        {/* Libellé d'abord, code HG (BELT…) en petit. */}
                        <span style={{ font: '600 14px/1.25 var(--font-sans)', color: '#fff' }}>
                          {name}
                          <Abbr>{k}</Abbr>
                        </span>
                        <span style={{ font: '400 12px var(--font-sans)', color: 'var(--text-muted)' }}>{alt && alt !== name ? alt : ''}</span>
                        <span style={{ font: '400 11px var(--font-sans)', color: 'var(--text-muted)' }}>
                          {tx(BASE_LABELS[symbolOf(k).base])} · {tx(L.wincc)} {d.idWinCC ?? '—'} · {d.etat ? etatLabel(d.etat) : tx(L.noEtat)}
                        </span>
                      </span>
                    </button>
                    {editable && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', background: 'var(--surface-nav)', borderTop: '1px solid var(--border-divider)', font: '400 12px var(--font-sans)', color: 'var(--text-secondary)' }}>
                        {tx(L.shape)}
                        <select aria-label={`${tx(L.shape)} ${k}`} value={symbolOf(k).base} onChange={(e) => commit(setStandardBase(pivot, std.id, k, e.target.value as Base))} style={{ ...inputStyle, appearance: 'auto', height: 26, width: 170 }}>
                          {BASES.map((b) => (
                            <option key={b} value={b}>{tx(BASE_LABELS[b])}{b === aktidSymbolOf(k).base ? ' (Aktid)' : ''}</option>
                          ))}
                        </select>
                        {changed && <span style={{ color: 'var(--abi-orange-text)' }}>{tx(L.changed)}</span>}
                      </label>
                    )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
