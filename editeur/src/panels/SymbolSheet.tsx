// Planche des symboles : un visuel distinct par HG principal de la liste HG. Sert à valider la
// proposition puis à remplir la colonne « P&D - Symbole » de la liste SharePoint.
import { principals, type Catalogue } from '../model/catalogue';
import { boxAt, sizeOf } from '../model/geometry';
import { GROUP_ORDER, symbolOf } from '../model/symbols';
import { haloOf, labelPos, Shape, Tag } from '../canvas/symbols';
import { Button, PanelHead } from '../ui/ui';

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
    <div role="dialog" aria-modal="true" aria-label="Planche des symboles" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }} onPointerDown={onClose}>
      <div style={{ width: 'min(1500px, 94vw)', height: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-page)', border: '1px solid var(--surface-panel-header)' }} onPointerDown={(e) => e.stopPropagation()}>
        <PanelHead icon="grid" title={`Planche des symboles — ${codes.length} HG principaux`} right={<Button variant="ghost" icon="x" title="Fermer" onClick={onClose} />} />
        <p style={{ margin: 0, padding: '10px 12px', font: '400 13px/1.45 var(--font-sans)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-divider)' }}>
          Chaque HG principal de la liste HG ({cat.sources.hg.fichier}, {cat.sources.hg.date}) a un visuel distinct : c'est lui qui s'affiche quand il est posé en HG0 sur un EQ.
          Formes de base du synoptique SCADA 2026, pictogrammes proposés : <strong style={{ color: 'var(--abi-orange-text)', fontWeight: 400 }}>à valider</strong>, puis à reporter dans la colonne « P&amp;D - Symbole » (vide aujourd'hui).
          Clic sur une carte : HG0 des gestes « + ».
        </p>
        <div style={{ overflow: 'auto', flex: 1, padding: '4px 12px 16px' }}>
          {groups.map((g) => (
            <section key={g}>
              <h3 style={{ margin: '16px 0 8px', font: '700 12px var(--font-sans)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{g}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 8 }}>
                {codes.filter((k) => symbolOf(k).group === g).map((k) => {
                  const d = cat.hgTypes[k];
                  return (
                    <button key={k} type="button" className="abi-row" onClick={() => onPick(k)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 6, background: 'var(--surface-nav)', border: '1px solid var(--border-nav)', textAlign: 'left', cursor: 'pointer' }}>
                      <Big hg0={k} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                        <span style={{ font: '600 14px var(--font-tag)', color: '#fff' }}>{k}</span>
                        <span style={{ font: '400 13px/1.25 var(--font-sans)', color: '#fff' }}>{d.label}</span>
                        <span style={{ font: '400 12px var(--font-sans)', color: 'var(--text-muted)' }}>{d.labelEn}</span>
                        <span style={{ font: '400 11px var(--font-sans)', color: 'var(--text-muted)' }}>
                          {symbolOf(k).base} · ID WinCC {d.idWinCC ?? '—'} · {d.etat ?? 'état —'}
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
