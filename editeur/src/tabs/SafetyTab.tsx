// Onglet Matrice de sécurité — ESQUISSE. Purement fonctionnel : lignes pré-remplies depuis le PID,
// colonnes = boucles créées par le chargé d'affaires, croix = coupe / met en sécurité.
import { useState, type ReactNode } from 'react';
import { Abbr, hgLabel, locale, rich, Term, tx } from '../i18n';
import type { Catalogue } from '../model/catalogue';
import { uid, type Pivot, type Safety } from '../model/pivot';
import { hgDef, hgName, isNoAction } from '../model/rules';
import { Button, inputStyle, PanelHead } from '../ui/ui';

// Textes de l'onglet : français pour l'opérateur, anglais préparé.
const L = {
  // « [EQ] » : terme technique en petit (i18n.rich).
  sketch: {
    fr: 'Esquisse — les lignes viennent du PID : équipements [EQ] et actionneurs ne se saisissent pas ici.',
    en: 'Draft — rows come from the P&ID: Equipment items [EQ] and actuators are not entered here.',
  },
  title: { fr: 'Matrice de sécurité', en: 'Safety matrix' },
  sheet1: { fr: 'Feuille 1 — entrées de sécurité × boucles', en: 'Sheet 1 — safety inputs × loops' },
  sheet2: { fr: 'Feuille 2 — actionneurs × boucles', en: 'Sheet 2 — actuators × loops' },
  input: { fr: 'Entrée de sécurité', en: 'Safety input' },
  actuator: { fr: 'Actionneur', en: 'Actuator' },
  descr: { fr: 'Descriptif', en: 'Description' },
  cutoff: { fr: 'Coupure déduite des', en: 'Cut-off derived from' },
  viaQ: { fr: 'Sortie %Q → contacteur de sécurité', en: '%Q output → safety contactor' },
  loopName: { fr: 'Nom de la boucle', en: 'Loop name' },
  loopPl: { fr: 'Niveau de performance (PL) de la boucle, informatif', en: 'Loop performance level (PL), for information only' },
  addLoop: { fr: 'Boucle', en: 'Loop' },
  noInput: {
    fr: "Aucune entrée de sécurité sur le PID : dans la fiche d'un équipement, ajouter un arrêt d'urgence (ESTO) ou une gâche de sécurité (SG).",
    en: 'No safety input on the P&ID: in the details of an Equipment item, add an emergency stop (ESTO) or a safety gate (SG).',
  },
  noActuator: { fr: 'Aucun actionneur sur le PID.', en: 'No actuator on the P&ID.' },
  status: { fr: (st: string) => 'Validation humaine : ' + st, en: (st: string) => 'Human validation: ' + st },
  validatedBy: { fr: (by: string, at: string) => `validée par ${by} le ${at}`, en: (by: string, at: string) => `validated by ${by} on ${at}` },
  notValidated: { fr: 'non validée — le générateur refusera de produire le programme de sécurité', en: 'not validated — the generator will refuse to produce the safety program' },
  plNote: { fr: 'Le niveau de performance (PL) est informatif. Toute modification annule la validation.', en: 'The performance level (PL) is for information only. Any change cancels the validation.' },
  unvalidate: { fr: 'Retirer la validation', en: 'Withdraw validation' },
  validate: { fr: 'Valider la matrice', en: 'Validate matrix' },
};

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
    e.hg.filter((h) => hgDef(cat, h.type).role === 'securite').map((h) => ({ key: e.id + '/' + h.id, tag: hgName(e, h), label: `${hgLabel(hgDef(cat, h.type))} — ${e.descriptif}` })),
  );
  const actuators: Row[] = pivot.equipments
    .filter((e) => !isNoAction(cat, e) && e.hg.some((h) => ['commande', 'protection'].includes(hgDef(cat, h.type).role)))
    .map((e) => {
      const twin = e.hg.map((h) => hgDef(cat, h.type).hs.find((x) => x.id === h.hs)?.safetyTwin).find(Boolean);
      return { key: e.id, tag: e.repere, label: e.descriptif, how: twin ? `PROFIsafe (${twin})` : tx(L.viaQ) };
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
    // Nom enregistré dans le pivot (lu par le générateur) : indépendant de la langue de l'interface.
    const name = m ? m[1] + String.fromCharCode(m[2].charCodeAt(0) + 1) : 'Boucle ' + (s.loops.length + 1);
    write({ ...s, loops: [...s.loops, { id: uid('loop'), name, pl: 'PL d' }], validated: null });
  };
  const rename = (id: string, patch: { name?: string; pl?: string }) => write({ ...s, loops: s.loops.map((l) => (l.id === id ? { ...l, ...patch } : l)), validated: null });

  const cell = { borderBottom: '1px solid #4a4a4a', borderRight: '1px solid #4a4a4a', padding: '6px 10px' } as const;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 12, gap: 12, overflow: 'hidden' }}>
      <Sketch text={rich(tx(L.sketch))} />
      <section style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: '1px solid var(--surface-panel-header)' }}>
        <PanelHead
          icon="octagon-x"
          title={tx(L.title)}
          right={
            <>
              <Button small active={sheet === 1} onClick={() => setSheet(1)}>{tx(L.sheet1)}</Button>
              <Button small active={sheet === 2} onClick={() => setSheet(2)}>{tx(L.sheet2)}</Button>
            </>
          }
        />
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ borderCollapse: 'collapse', font: '400 13px var(--font-sans)', minWidth: '100%' }}>
            <thead>
              <tr style={{ background: '#444', position: 'sticky', top: 0, zIndex: 1 }}>
                {/* Lignes de la feuille 1 = matériels génériques de sécurité ; feuille 2 = équipements. */}
                <th style={{ ...cell, textAlign: 'left', width: 170 }}>
                  {sheet === 1 ? (
                    <>
                      {tx(L.input)}
                      <Abbr>HG</Abbr>
                    </>
                  ) : (
                    <>
                      {tx(L.actuator)}
                      <Abbr>EQ</Abbr>
                    </>
                  )}
                </th>
                <th style={{ ...cell, textAlign: 'left' }}>{tx(L.descr)}</th>
                {sheet === 2 && (
                  <th style={{ ...cell, textAlign: 'left', width: 230 }}>
                    <Term k="hs" plural before={tx(L.cutoff)} />
                  </th>
                )}
                {s.loops.map((l) => (
                  <th key={l.id} style={{ ...cell, width: 96 }}>
                    <input aria-label={tx(L.loopName)} value={l.name} onChange={(e) => rename(l.id, { name: e.target.value })} style={{ ...inputStyle, height: 24, textAlign: 'center', fontFamily: 'var(--font-tag)', fontWeight: 600 }} />
                    <input aria-label={tx(L.loopPl)} value={l.pl} onChange={(e) => rename(l.id, { pl: e.target.value })} style={{ ...inputStyle, height: 20, marginTop: 3, border: 'none', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }} />
                  </th>
                ))}
                <th style={{ ...cell, width: 110 }}>
                  <Button small icon="plus" onClick={addLoop}>{tx(L.addLoop)}</Button>
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
                    {sheet === 1 ? tx(L.noInput) : tx(L.noActuator)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderTop: '1px solid var(--border-divider)' }}>
          <span style={{ font: '700 13px var(--font-sans)', color: s.validated ? 'var(--abi-green)' : 'var(--abi-orange-text)' }}>
            {tx(L.status, s.validated ? tx(L.validatedBy, s.validated.by, new Date(s.validated.at).toLocaleString(locale())) : tx(L.notValidated))}
          </span>
          <span style={{ font: '400 12px var(--font-sans)', color: 'var(--text-muted)' }}>{tx(L.plNote)}</span>
          <Button variant={s.validated ? 'neutral' : 'reset'} icon="check" style={{ marginLeft: 'auto' }} onClick={() => write({ ...s, validated: s.validated ? null : { by: 'ALH (maquette)', at: new Date().toISOString() } })}>
            {s.validated ? tx(L.unvalidate) : tx(L.validate)}
          </Button>
        </footer>
      </section>
    </div>
  );
}

/** Bandeau d'esquisse (texte simple, ou libellé avec terme technique en petit). */
export function Sketch({ text }: { text: ReactNode }) {
  return (
    <div role="note" style={{ padding: '8px 12px', background: 'var(--abi-tint-blue)', color: '#cfe0ef', font: '400 13px var(--font-sans)', flex: 'none' }}>
      {text}
    </div>
  );
}
