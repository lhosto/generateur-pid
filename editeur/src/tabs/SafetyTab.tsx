// Onglet Matrice de sécurité — ESQUISSE. Purement fonctionnel : lignes pré-remplies depuis le PID,
// colonnes = boucles créées par le chargé d'affaires, croix = coupe / met en sécurité.
import { useState } from 'react';
import type { Catalogue } from '../model/catalogue';
import { uid, type Pivot, type Safety } from '../model/pivot';
import { hgDef, hgName, isNoAction } from '../model/rules';
import { Button, inputStyle, PanelHead } from '../ui/ui';

interface Row {
  key: string;
  tag: string;
  label: string;
  how?: string;
}

export function SafetyTab({ cat, pivot, commit }: { cat: Catalogue; pivot: Pivot; commit: (p: Pivot) => void }) {
  const [sheet, setSheet] = useState<1 | 2>(1);
  const s = pivot.safety;
  const write = (next: Safety) => commit({ ...pivot, safety: next });

  const inputs: Row[] = pivot.equipments.flatMap((e) =>
    e.hg.filter((h) => hgDef(cat, h.type).role === 'securite').map((h) => ({ key: e.id + '/' + h.id, tag: hgName(e, h), label: `${hgDef(cat, h.type).label} — ${e.descriptif}` })),
  );
  const actuators: Row[] = pivot.equipments
    .filter((e) => !isNoAction(cat, e) && e.hg.some((h) => ['commande', 'protection'].includes(hgDef(cat, h.type).role)))
    .map((e) => {
      const twin = e.hg.map((h) => hgDef(cat, h.type).hs.find((x) => x.id === h.hs)?.safetyTwin).find(Boolean);
      return { key: e.id, tag: e.repere, label: e.descriptif, how: twin ? `PROFIsafe (${twin})` : 'Sortie %Q → contacteur de sécu' };
    });
  const rows = sheet === 1 ? inputs : actuators;
  const map = sheet === 1 ? s.inputs : s.actuators;

  const toggle = (key: string, loop: string) => {
    const cur = map[key] ?? [];
    const nextList = cur.includes(loop) ? cur.filter((x) => x !== loop) : [...cur, loop];
    const nextMap = { ...map, [key]: nextList };
    write({ ...s, ...(sheet === 1 ? { inputs: nextMap } : { actuators: nextMap }), validated: null });
  };
  const addLoop = () => {
    const last = s.loops[s.loops.length - 1]?.name ?? '400@';
    const m = /^(\d+)([A-Z])$/.exec(last);
    const name = m ? m[1] + String.fromCharCode(m[2].charCodeAt(0) + 1) : 'Boucle ' + (s.loops.length + 1);
    write({ ...s, loops: [...s.loops, { id: uid('loop'), name, pl: 'PL d' }], validated: null });
  };
  const rename = (id: string, patch: { name?: string; pl?: string }) => write({ ...s, loops: s.loops.map((l) => (l.id === id ? { ...l, ...patch } : l)), validated: null });

  const cell = { borderBottom: '1px solid #4a4a4a', borderRight: '1px solid #4a4a4a', padding: '6px 10px' } as const;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 12, gap: 12, overflow: 'hidden' }}>
      <Sketch text="Esquisse — onglet complété en semaine 2. Les lignes viennent du PID : pas d'équipement, pas d'actionneur." />
      <section style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: '1px solid var(--surface-panel-header)' }}>
        <PanelHead
          icon="octagon-x"
          title="Matrice de sécurité"
          right={
            <>
              <Button small active={sheet === 1} onClick={() => setSheet(1)}>Feuille 1 — entrées × boucles</Button>
              <Button small active={sheet === 2} onClick={() => setSheet(2)}>Feuille 2 — actionneurs × boucles</Button>
            </>
          }
        />
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ borderCollapse: 'collapse', font: '400 13px var(--font-sans)', minWidth: '100%' }}>
            <thead>
              <tr style={{ background: '#444', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ ...cell, textAlign: 'left', width: 170 }}>{sheet === 1 ? 'Entrée de sécu' : 'Actionneur'}</th>
                <th style={{ ...cell, textAlign: 'left' }}>Descriptif</th>
                {sheet === 2 && <th style={{ ...cell, textAlign: 'left', width: 230 }}>Coupure (déduite des HS)</th>}
                {s.loops.map((l) => (
                  <th key={l.id} style={{ ...cell, width: 96 }}>
                    <input aria-label="Nom de la boucle" value={l.name} onChange={(e) => rename(l.id, { name: e.target.value })} style={{ ...inputStyle, height: 24, textAlign: 'center', fontFamily: 'var(--font-tag)', fontWeight: 600 }} />
                    <input aria-label="PL de la boucle (informatif)" value={l.pl} onChange={(e) => rename(l.id, { pl: e.target.value })} style={{ ...inputStyle, height: 20, marginTop: 3, border: 'none', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }} />
                  </th>
                ))}
                <th style={{ ...cell, width: 110 }}>
                  <Button small icon="plus" onClick={addLoop}>Boucle</Button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="abi-tr">
                  <td style={{ ...cell, font: '600 12px var(--font-tag)' }}>{r.tag}</td>
                  <td style={{ ...cell, color: 'var(--text-secondary)' }}>{r.label}</td>
                  {sheet === 2 && <td style={{ ...cell, color: 'var(--text-secondary)', fontSize: 12 }}>{r.how}</td>}
                  {s.loops.map((l) => {
                    const on = (map[r.key] ?? []).includes(l.id);
                    return (
                      <td key={l.id} style={{ ...cell, textAlign: 'center', padding: 0 }}>
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={`${r.tag} × ${l.name}`}
                          onClick={() => toggle(r.key, l.id)}
                          style={{ width: '100%', height: 32, background: on ? 'var(--abi-tint-red)' : 'transparent', border: 'none', cursor: 'pointer', font: '700 16px var(--font-sans)', color: on ? '#ffb3ab' : 'transparent' }}
                        >
                          ×
                        </button>
                      </td>
                    );
                  })}
                  <td style={cell} />
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4 + s.loops.length} style={{ ...cell, color: 'var(--text-muted)' }}>
                    {sheet === 1 ? 'Aucune entrée de sécu sur le PID : ajouter un ESTO ou un SG dans la fiche d’un équipement.' : 'Aucun actionneur sur le PID.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderTop: '1px solid var(--border-divider)' }}>
          <span style={{ font: '700 13px var(--font-sans)', color: s.validated ? 'var(--abi-green)' : 'var(--abi-orange-text)' }}>
            Validation humaine : {s.validated ? `validée par ${s.validated.by} le ${new Date(s.validated.at).toLocaleString('fr-FR')}` : 'non validée — le générateur refusera la safety'}
          </span>
          <span style={{ font: '400 12px var(--font-sans)', color: 'var(--text-muted)' }}>Le PL est informatif. Toute modification annule la validation.</span>
          <Button variant={s.validated ? 'neutral' : 'reset'} icon="check" style={{ marginLeft: 'auto' }} onClick={() => write({ ...s, validated: s.validated ? null : { by: 'ALH (maquette)', at: new Date().toISOString() } })}>
            {s.validated ? 'Retirer la validation' : 'Valider la matrice'}
          </Button>
        </footer>
      </section>
    </div>
  );
}

export function Sketch({ text }: { text: string }) {
  return (
    <div role="note" style={{ padding: '8px 12px', background: 'var(--abi-tint-blue)', color: '#cfe0ef', font: '400 13px var(--font-sans)', flex: 'none' }}>
      {text}
    </div>
  );
}
