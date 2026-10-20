// Bibliothèque : HG principaux de la liste HG (ce sont eux qui, posés en HG0, donnent la forme de l'EQ).
// Glisser = poser ; clic = HG0 utilisé par les gestes « + » (mémoire du dernier choix).
import { useState } from 'react';
import { Shape, ChuteShape } from '../canvas/symbols';
import { principals, type Catalogue } from '../model/catalogue';
import { boxAt, sizeOf } from '../model/geometry';
import { GROUP_ORDER, symbolOf } from '../model/symbols';
import { Icon, inputStyle, PanelHead } from '../ui/ui';
import { Legend } from './Overlays';

export function Glyph({ hg0, width = 72, height = 44 }: { hg0: string; width?: number; height?: number }) {
  const { w, h } = sizeOf(symbolOf(hg0).base, 1, 'E');
  return (
    <svg width={width} height={height} viewBox={`${-width / 2} ${-height / 2} ${width} ${height}`} aria-hidden="true" style={{ flex: 'none' }}>
      <Shape hg0={hg0} box={boxAt(0, 0, w, h)} flow="E" channels={1} />
    </svg>
  );
}

const ETAT_TONE: Record<string, string> = { 'FAT ok': 'var(--abi-green)', 'SAT ok': 'var(--abi-green)', 'A coder': 'var(--abi-orange-text)' };

export function Palette({ cat, current, onCurrent, onPlace, onSymbols }: { cat: Catalogue; current: string; onCurrent: (code: string) => void; onPlace: (code: string) => void; onSymbols: () => void }) {
  const [q, setQ] = useState('');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const codes = principals(cat).filter((k) => !q || norm(k + ' ' + cat.hgTypes[k].label + ' ' + cat.hgTypes[k].labelEn).includes(norm(q)));
  const groups = GROUP_ORDER.filter((g) => codes.some((k) => symbolOf(k).group === g));
  return (
    <aside style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--surface-panel-header)', background: 'var(--surface-page)' }}>
      <PanelHead icon="layers" title="HG principaux" right={<button type="button" title="Planche des symboles" aria-label="Planche des symboles" onClick={onSymbols} className="abi-btn" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex' }}><Icon name="grid" size={20} /></button>} />
      <div style={{ padding: 8, borderBottom: '1px solid var(--border-divider)' }}>
        <div style={{ position: 'relative' }}>
          <input aria-label="Chercher un HG principal" placeholder="Chercher (code, libellé)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, paddingLeft: 30 }} />
          <Icon name="search" size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 8, top: 7 }} />
        </div>
      </div>
      <div style={{ overflow: 'auto', flex: 1, paddingBottom: 12 }}>
        {groups.map((g) => (
          <section key={g}>
            <div style={{ padding: '10px 10px 4px', font: '700 11px var(--font-sans)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{g}</div>
            {codes.filter((k) => symbolOf(k).group === g).map((k) => {
              const d = cat.hgTypes[k];
              const on = k === current;
              return (
                <div
                  key={k}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/x-hg0', k);
                    e.dataTransfer.effectAllowed = 'copy';
                    onCurrent(k);
                  }}
                  onClick={() => onCurrent(k)}
                  onDoubleClick={() => onPlace(k)}
                  title={`${d.label} — ${d.labelEn}\nÉtat software : ${d.etat ?? '—'} · ID WinCC : ${d.idWinCC ?? '—'}\nGlisser sur le PID pour poser · clic : HG0 des gestes « + » · double-clic : poser au centre`}
                  className="abi-row"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, margin: '0 6px 2px', padding: '1px 6px 1px 0',
                    background: on ? 'var(--surface-nav-active)' : 'var(--surface-nav)',
                    border: on ? '1px solid var(--abi-green)' : '1px solid transparent', cursor: 'grab',
                  }}
                >
                  <Glyph hg0={k} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ font: '400 13px/1.2 var(--font-sans)', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</div>
                    <div style={{ font: '400 11px var(--font-tag)', color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#ddd' }}>{k}</span>
                      <span style={{ color: ETAT_TONE[d.etat ?? ''] ?? 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>{d.etat ?? ''}</span>
                    </div>
                  </div>
                  {on && <Icon name="plus" size={16} color="var(--abi-green)" />}
                </div>
              );
            })}
          </section>
        ))}
        <div style={{ padding: '14px 10px 4px', font: '700 11px var(--font-sans)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Dessin</div>
        <div
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/x-chute', '1')}
          title="Goulotte de tri — objet de dessin (statut dans le pivot à confirmer)"
          className="abi-row"
          style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '0 6px', padding: '1px 6px 1px 0', background: 'var(--surface-nav)', border: '1px solid transparent', cursor: 'grab' }}
        >
          <svg width={72} height={44} viewBox="-36 -22 72 44" aria-hidden="true">
            <g transform="scale(0.4)">
              <ChuteShape x={0} y={0} label="Goulotte" />
            </g>
          </svg>
          <div style={{ font: '400 13px var(--font-sans)' }}>Goulotte de tri</div>
        </div>
      </div>
      <Legend />
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-divider)', font: '400 12px/1.4 var(--font-sans)', color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--abi-green)' }}>+</span> sur un EQ pose : <strong style={{ color: '#fff', fontWeight: 400 }}>{current} — {cat.hgTypes[current]?.label}</strong>
      </div>
    </aside>
  );
}
