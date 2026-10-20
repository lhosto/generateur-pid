// Onglet Réseau — ESQUISSE non éditable : armoires et switchs, appareils Profinet déduits du PID.
// L'automaticien le renseignera avant la génération (remplace son Visio).
import type { Catalogue } from '../model/catalogue';
import type { Pivot } from '../model/pivot';
import { hgDef, hgName, hsName, isNoAction } from '../model/rules';
import { PanelHead } from '../ui/ui';
import { Sketch } from './SafetyTab';

export function NetworkTab({ cat, pivot }: { cat: Catalogue; pivot: Pivot }) {
  const cabinets = pivot.equipments.filter((e) => isNoAction(cat, e));
  const devices = pivot.equipments.flatMap((e) =>
    e.hg
      .map((h) => ({ e, h, hs: hgDef(cat, h.type).hs.find((x) => x.id === h.hs) }))
      .filter((x) => x.hs?.profinet),
  );
  const cell = { borderBottom: '1px solid #4a4a4a', padding: '6px 10px', textAlign: 'left' as const };
  const W = 560;
  const sw = Math.max(1, cabinets.length);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 12, gap: 12, overflow: 'hidden' }}>
      <Sketch text="Esquisse — l'automaticien renseigne armoires, switchs et sous-réseaux avant la génération. Les appareils viennent du PID ; IP et %I/%Q sont attribuées dans les plages réservées par type de HG." />
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `${W + 2}px 1fr`, gap: 12 }}>
        <section style={{ border: '1px solid var(--surface-panel-header)', display: 'flex', flexDirection: 'column' }}>
          <PanelHead icon="link" title="Plan réseau" />
          <svg viewBox={`0 0 ${W} 420`} style={{ width: '100%', flex: 1 }} role="img" aria-label="Plan réseau schématique">
            <rect x={W / 2 - 80} y={24} width={160} height={46} rx={3} fill="var(--pid-band)" stroke="var(--abi-green)" />
            <text x={W / 2} y={44} textAnchor="middle" style={{ font: '700 14px var(--font-sans)', fill: '#fff' }}>CPU {pivot.site.base.cpu}</text>
            <text x={W / 2} y={60} textAnchor="middle" style={{ font: '400 11px var(--font-tag)', fill: 'var(--text-muted)' }}>PN/IE_1 · 192.168.0.1 (fictif)</text>
            <path d={`M${W / 2} 70 V110 M40 110 H${W - 40}`} stroke="var(--pid-stroke-light)" strokeWidth={2} fill="none" />
            {cabinets.map((c, i) => {
              const x = 40 + ((W - 80) * (i + 0.5)) / sw;
              const mine = devices.filter((_, k) => k % sw === i);
              return (
                <g key={c.id}>
                  <path d={`M${x} 110 V150`} stroke="var(--pid-stroke-light)" strokeWidth={2} />
                  <rect x={x - 70} y={150} width={140} height={40} rx={3} fill="var(--pid-tile)" stroke="var(--pid-stroke)" />
                  <text x={x} y={168} textAnchor="middle" style={{ font: '600 12px var(--font-tag)', fill: '#fff' }}>{c.repere} · SW{String(i + 1).padStart(2, '0')}</text>
                  <text x={x} y={182} textAnchor="middle" style={{ font: '400 11px var(--font-sans)', fill: 'var(--text-muted)' }}>switch (fictif)</text>
                  <path d={`M${x} 190 V214`} stroke="var(--pid-stroke)" strokeDasharray="3 3" />
                  <text x={x} y={232} textAnchor="middle" style={{ font: '400 12px var(--font-sans)', fill: 'var(--pid-warn)' }}>{mine.length} appareils à rattacher</text>
                </g>
              );
            })}
            {cabinets.length === 0 && (
              <text x={W / 2} y={170} textAnchor="middle" style={{ font: '400 13px var(--font-sans)', fill: 'var(--text-muted)' }}>Poser une armoire électrique (no action) sur le PID</text>
            )}
          </svg>
        </section>
        <section style={{ border: '1px solid var(--surface-panel-header)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <PanelHead icon="monitor" title={`Appareils Profinet déduits du PID (${devices.length})`} />
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', font: '400 13px var(--font-sans)' }}>
              <thead>
                <tr style={{ background: '#444', position: 'sticky', top: 0 }}>
                  <th style={cell}>EQ</th>
                  <th style={cell}>HG</th>
                  <th style={cell}>HS (nom TIA)</th>
                  <th style={cell}>Armoire</th>
                  <th style={cell}>IP</th>
                  <th style={cell}>%I / %Q</th>
                </tr>
              </thead>
              <tbody>
                {devices.map(({ e, h, hs }) => (
                  <tr key={h.id}>
                    <td style={{ ...cell, font: '600 12px var(--font-tag)' }}>{e.repere}</td>
                    <td style={{ ...cell, font: '400 12px var(--font-tag)' }}>{hgName(e, h)}</td>
                    <td style={{ ...cell, font: '400 12px var(--font-tag)', color: 'var(--text-secondary)' }} title={hs?.label}>{hsName(e, h)}</td>
                    <td style={{ ...cell, color: 'var(--pid-warn)' }}>à rattacher</td>
                    <td style={{ ...cell, color: 'var(--text-muted)' }}>auto (plage {h.type})</td>
                    <td style={{ ...cell, color: 'var(--text-muted)' }}>auto</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
