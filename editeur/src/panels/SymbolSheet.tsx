// Planche des symboles : un visuel distinct par HG principal de la liste HG. Sert à valider la
// proposition puis à remplir la colonne « P&D - Symbole » de la liste SharePoint.
import { etatLabel, principals, type Catalogue } from '../model/catalogue';
import { boxAt, sizeOf } from '../model/geometry';
import { GROUP_ORDER, groupLabel, symbolOf, type Base } from '../model/symbols';
import { haloOf, labelPos, Shape, Tag } from '../canvas/symbols';
import { Abbr, getLang, hgLabel, tx, type Entry } from '../i18n';
import { Button, PanelHead } from '../ui/ui';

const L = {
  sheet: { fr: 'Planche des symboles', en: 'Symbol chart' },
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
  pick: { fr: 'Clic sur une carte : ce matériel sera posé par les « + » des équipements.', en: 'Click a card: the “+” handles of Equipment items will place this hardware.' },
  wincc: { fr: 'ID WinCC', en: 'WinCC ID' },
  noEtat: { fr: 'état —', en: 'status —' },
};

// Nom affiché des formes de base (la clé reste l'identifiant interne de symbols.ts).
const BASE_LABELS: Record<Base, Entry> = {
  pill: { fr: 'oblong', en: 'pill' },
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

export function SymbolSheet({ cat, onClose, onPick }: { cat: Catalogue; onClose: () => void; onPick: (code: string) => void }) {
  const codes = principals(cat);
  const groups = GROUP_ORDER.filter((g) => codes.some((k) => symbolOf(k).group === g));
  return (
    <div role="dialog" aria-modal="true" aria-label={tx(L.sheet)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }} onPointerDown={onClose}>
      <div style={{ width: 'min(1500px, 94vw)', height: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-page)', border: '1px solid var(--surface-panel-header)' }} onPointerDown={(e) => e.stopPropagation()}>
        <PanelHead icon="grid" title={<>{tx(L.title, codes.length)}<Abbr>HG</Abbr></>} right={<Button variant="ghost" icon="x" title={tx(L.close)} onClick={onClose} />} />
        <p style={{ margin: 0, padding: '10px 12px', font: '400 13px/1.45 var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-divider)' }}>
          {tx(L.each)}
          <Abbr>HG</Abbr> {tx(L.source, cat.sources.hg.fichier, cat.sources.hg.date)}
          <Abbr>EQ</Abbr> {tx(L.sourceEnd)}{' '}
          {tx(L.shapes)} <strong style={{ color: 'var(--abi-orange-text)', fontWeight: 400 }}>{tx(L.toValidate)}</strong>
          {tx(L.report)} {tx(L.pick)}
        </p>
        <div style={{ overflow: 'auto', flex: 1, padding: '4px 12px 16px' }}>
          {groups.map((g) => (
            <section key={g}>
              <h3 style={{ margin: '16px 0 8px', font: '700 12px var(--font-sans)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{groupLabel(g)}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 8 }}>
                {codes.filter((k) => symbolOf(k).group === g).map((k) => {
                  const d = cat.hgTypes[k];
                  const name = hgLabel(d);
                  // Second nom : celui de l'autre langue de la liste HG, s'il diffère.
                  const alt = getLang() === 'en' ? d.label : d.labelEn;
                  return (
                    <button key={k} type="button" className="abi-row" onClick={() => onPick(k)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 6, background: 'var(--surface-nav)', border: '1px solid var(--border-nav)', textAlign: 'left', cursor: 'pointer' }}>
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
