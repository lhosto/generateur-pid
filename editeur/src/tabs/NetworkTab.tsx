// Onglet Réseau — ESQUISSE non éditable : armoires et switchs, appareils Profinet déduits du PID.
// L'automaticien le renseignera avant la génération (remplace son Visio).
import { Abbr, hgLabel, Term, tx } from '../i18n';
import type { Catalogue } from '../model/catalogue';
import type { Pivot } from '../model/pivot';
import { hgDef, hgName, hsLabel, hsName, isNoAction } from '../model/rules';
import { PanelHead } from '../ui/ui';
import { Sketch } from './SafetyTab';

// Textes de l'onglet : français pour l'opérateur, anglais préparé.
const L = {
  sketch: {
    fr: "Esquisse — l'automaticien renseigne armoires, switchs et sous-réseaux avant la génération. Les appareils viennent du PID ; IP et %I/%Q sont attribuées dans les plages réservées à chaque type de matériel générique",
    en: 'Draft — the automation engineer fills in cabinets, switches and subnets before generation. Devices come from the P&ID; IP and %I/%Q addresses are assigned from the ranges reserved for each type of Hardware Generic',
  },
  plan: { fr: 'Plan réseau', en: 'Network diagram' },
  planAria: { fr: 'Plan réseau schématique', en: 'Schematic network diagram' },
  dummy: { fr: 'fictif', en: 'mock' },
  toAssign: { fr: (n: number) => `${n} appareil${n > 1 ? 's' : ''} à rattacher`, en: (n: number) => `${n} device${n === 1 ? '' : 's'} to assign` },
  noCabinet: { fr: 'Poser une armoire électrique sur le PID', en: 'Place an electrical cabinet on the P&ID' },
  devices: { fr: (n: number) => `Appareils Profinet déduits du PID (${n})`, en: (n: number) => `Profinet devices from the P&ID (${n})` },
  tiaName: { fr: '(nom TIA)', en: '(TIA name)' },
  cabinet: { fr: 'Armoire', en: 'Cabinet' },
  pending: { fr: 'à rattacher', en: 'to assign' },
  range: { fr: (t: string) => `auto (plage ${t})`, en: (t: string) => `auto (${t} range)` },
};

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
      <Sketch
        text={
          <>
            {tx(L.sketch)}
            <Abbr>HG</Abbr>.
          </>
        }
      />
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `${W + 2}px 1fr`, gap: 12 }}>
        <section style={{ border: '1px solid var(--surface-panel-header)', display: 'flex', flexDirection: 'column' }}>
          <PanelHead icon="link" title={tx(L.plan)} />
          <svg viewBox={`0 0 ${W} 420`} style={{ width: '100%', flex: 1 }} role="img" aria-label={tx(L.planAria)}>
            <rect x={W / 2 - 80} y={24} width={160} height={46} rx={3} fill="var(--pid-band)" stroke="var(--abi-green)" />
            <text x={W / 2} y={44} textAnchor="middle" style={{ font: '700 14px var(--font-sans)', fill: '#fff' }}>CPU {pivot.site.base.cpu}</text>
            <text x={W / 2} y={60} textAnchor="middle" style={{ font: '400 11px var(--font-tag)', fill: 'var(--text-muted)' }}>PN/IE_1 · 192.168.0.1 ({tx(L.dummy)})</text>
            <path d={`M${W / 2} 70 V110 M40 110 H${W - 40}`} stroke="var(--pid-stroke-light)" strokeWidth={2} fill="none" />
            {cabinets.map((c, i) => {
              const x = 40 + ((W - 80) * (i + 0.5)) / sw;
              const mine = devices.filter((_, k) => k % sw === i);
              return (
                <g key={c.id}>
                  <path d={`M${x} 110 V150`} stroke="var(--pid-stroke-light)" strokeWidth={2} />
                  <rect x={x - 70} y={150} width={140} height={40} rx={3} fill="var(--pid-tile)" stroke="var(--pid-stroke)" />
                  <text x={x} y={168} textAnchor="middle" style={{ font: '600 12px var(--font-tag)', fill: '#fff' }}>{c.repere} · SW{String(i + 1).padStart(2, '0')}</text>
                  <text x={x} y={182} textAnchor="middle" style={{ font: '400 11px var(--font-sans)', fill: 'var(--text-muted)' }}>switch ({tx(L.dummy)})</text>
                  <path d={`M${x} 190 V214`} stroke="var(--pid-stroke)" strokeDasharray="3 3" />
                  <text x={x} y={232} textAnchor="middle" style={{ font: '400 12px var(--font-sans)', fill: 'var(--pid-warn)' }}>{tx(L.toAssign, mine.length)}</text>
                </g>
              );
            })}
            {cabinets.length === 0 && (
              <text x={W / 2} y={170} textAnchor="middle" style={{ font: '400 13px var(--font-sans)', fill: 'var(--text-muted)' }}>{tx(L.noCabinet)}</text>
            )}
          </svg>
        </section>
        <section style={{ border: '1px solid var(--surface-panel-header)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <PanelHead icon="monitor" title={tx(L.devices, devices.length)} />
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', font: '400 13px var(--font-sans)' }}>
              <thead>
                <tr style={{ background: '#444', position: 'sticky', top: 0 }}>
                  <th style={cell}><Term k="eq" /></th>
                  <th style={cell}><Term k="hg" /></th>
                  {/* Mot simple, terme en petit, puis le complément : « Matériel spécifique HS (nom TIA) ». */}
                  <th style={cell}><Term k="hs" /> {tx(L.tiaName)}</th>
                  <th style={cell}>{tx(L.cabinet)}</th>
                  <th style={cell}>IP</th>
                  <th style={cell}>%I / %Q</th>
                </tr>
              </thead>
              <tbody>
                {devices.map(({ e, h, hs }) => (
                  <tr key={h.id}>
                    <td style={{ ...cell, font: '600 12px var(--font-tag)' }}>{e.repere}</td>
                    <td style={{ ...cell, font: '400 12px var(--font-tag)' }} title={hgLabel(hgDef(cat, h.type))}>{hgName(e, h)}</td>
                    <td style={{ ...cell, font: '400 12px var(--font-tag)', color: 'var(--text-secondary)' }} title={hs ? hsLabel(hs) : undefined}>{hsName(e, h)}</td>
                    <td style={{ ...cell, color: 'var(--pid-warn)' }}>{tx(L.pending)}</td>
                    <td style={{ ...cell, color: 'var(--text-muted)' }}>{tx(L.range, h.type)}</td>
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
