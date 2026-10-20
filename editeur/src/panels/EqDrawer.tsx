// Fiche équipement (tiroir ABI) : identité, pile HG/HS, HG de proximité, options du bloc EQ,
// setpoints, canaux et sorties.
import type { ReactNode } from 'react';
import { principals, type Catalogue } from '../model/catalogue';
import { hg0Of } from '../model/geometry';
import {
  addChannel, addOutput, addProximity, changeHg0, findEq, removeChannel, removeHg, removeOutput, setChainType, setHs, updateEq,
} from '../model/ops';
import type { Dir, Eq, Flow, Pivot } from '../model/pivot';
import { outputColor } from '../model/route';
import {
  alternativesAt, canAddChannel, canAddOutput, chainOf, hgDef, hgName, hsName, incompleteReasons, isFirstChannel, isNoAction, MAX,
  outputsOf, pad2, polarity, proximityChoices, proximityOf, reverseBlocked,
} from '../model/rules';
import { Button, Field, Icon, inputStyle, SectionHead, Toggle } from '../ui/ui';
import { Glyph } from './Palette';

interface Props {
  cat: Catalogue;
  pivot: Pivot;
  eqId: string;
  commit: (p: Pivot) => void;
  fault?: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const FLOWS: { f: Flow; label: string; arrow: string }[] = [
  { f: 'E', label: 'Vers la droite', arrow: '→' },
  { f: 'S', label: 'Vers le bas', arrow: '↓' },
  { f: 'W', label: 'Vers la gauche', arrow: '←' },
  { f: 'N', label: 'Vers le haut', arrow: '↑' },
];

const selectStyle = { ...inputStyle, appearance: 'auto' as const, padding: '0 4px' };

function Row({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '1px solid #4a4a4a', opacity: muted ? 0.7 : 1 }}>{children}</div>;
}

export function EqDrawer({ cat, pivot, eqId, commit, fault, onClose, onSelect, onDuplicate, onDelete }: Props) {
  const eq = findEq(pivot, eqId);
  if (!eq) return null;
  const hg0 = hg0Of(eq);
  const d0 = hgDef(cat, hg0);
  const set = (patch: Partial<Eq>) => commit(updateEq(pivot, eq.id, patch));
  const chain = chainOf(cat, eq);
  const prox = proximityOf(cat, eq);
  const issues = incompleteReasons(cat, pivot, eq);
  const blocked = reverseBlocked(eq);
  const isCab = isNoAction(cat, eq);
  const unit = d0.setpoints?.[0]?.unit;
  const eqName = (id: string) => findEq(pivot, id)?.repere ?? '?';

  return (
    <aside
      aria-label={'Fiche ' + eq.repere}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 480, background: 'var(--surface-page)', borderLeft: '8px solid #4a4a4a', boxShadow: 'var(--shadow-drawer)', display: 'flex', flexDirection: 'column', zIndex: 6 }}
    >
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 10px 10px 14px', borderBottom: '1px solid var(--border-divider)' }}>
        <Glyph hg0={hg0} width={80} height={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '700 20px var(--font-tag)' }}>{eq.repere || '?'}</div>
          <div style={{ font: '700 14px var(--font-sans)', textTransform: 'uppercase', marginTop: 2 }}>{hg0} — {d0.label}</div>
          <div style={{ font: '400 13px var(--font-sans)', color: 'var(--text-muted)', marginTop: 2 }}>
            FC <span className="mono">{(eq.repere || '?') + '_Main'}</span> · {isCab ? 'no action' : 'actif'} · {eq.hg.length}/{MAX.hg} HG
          </div>
        </div>
        <Button variant="ghost" icon="x" title="Fermer la fiche" onClick={onClose} />
      </header>

      <div style={{ overflow: 'auto', flex: 1, paddingBottom: 16 }}>
        {(fault || issues.length > 0) && (
          <div style={{ margin: '10px 10px 0', padding: '8px 10px', background: fault ? 'var(--abi-tint-red)' : 'var(--abi-tint-brown)', font: '400 13px/1.45 var(--font-sans)' }}>
            {fault && <div style={{ color: '#ffd7d3' }}>Génération : {fault}</div>}
            {issues.map((i) => (
              <div key={i} style={{ color: '#f0c9a0' }}>{i}</div>
            ))}
          </div>
        )}

        <SectionHead title="Identité" />
        <Field label="Repère client" hint="Nomme les blocs TIA">
          <input aria-label="Repère client" value={eq.repere} onChange={(e) => set({ repere: e.target.value.trim() })} style={{ ...inputStyle, fontFamily: 'var(--font-tag)' }} />
        </Field>
        <Field label="Repère Aktid">
          <input aria-label="Repère Aktid" value={eq.repereAktid} onChange={(e) => set({ repereAktid: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="Descriptif">
          <input aria-label="Descriptif" value={eq.descriptif} onChange={(e) => set({ descriptif: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="HG0 (principal)" hint={`Fixe la forme sur le PID. ID WinCC ${d0.idWinCC ?? '—'} · état ${d0.etat ?? '—'}`}>
          <select aria-label="HG0" value={hg0} onChange={(e) => commit(changeHg0(cat, pivot, eq.id, e.target.value))} style={selectStyle}>
            {principals(cat).map((k) => (
              <option key={k} value={k}>{k} — {cat.hgTypes[k].label}</option>
            ))}
          </select>
        </Field>
        <Field label="Sens du flux">
          <span style={{ display: 'flex', gap: 4 }}>
            {FLOWS.map((x) => (
              <Button key={x.f} small active={eq.flow === x.f} title={x.label} onClick={() => set({ flow: x.f })} style={{ width: 36, fontSize: 16 }}>
                {x.arrow}
              </Button>
            ))}
          </span>
        </Field>

        <SectionHead title="Pile HG" right={<span>HG0 = matière{unit ? ' · consigne en ' + unit : ''} · supérieurs : liste HG</span>} />
        {chain.map((h, i) => {
          const d = hgDef(cat, h.type);
          const alts = alternativesAt(cat, eq, i);
          const hsDef = d.hs.find((x) => x.id === h.hs);
          return (
            <Row key={h.id}>
              <span style={{ width: 24, font: '600 12px var(--font-tag)', color: i === 0 ? 'var(--abi-green)' : 'var(--text-muted)' }}>{i === 0 ? 'HG0' : i}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {alts.length > 1 ? (
                    <select aria-label={'Type du HG ' + i} value={h.type} onChange={(e) => commit(setChainType(cat, pivot, eq.id, i, e.target.value))} style={{ ...selectStyle, width: '100%', height: 26 }}>
                      {alts.map((t) => (
                        <option key={t} value={t}>{t} — {hgDef(cat, t).label}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ font: '400 13px var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.type} — {d.label}</span>
                  )}
                </div>
                <div className="mono" style={{ font: '400 11px var(--font-tag)', color: 'var(--text-muted)', marginTop: 2 }}>{hsName(eq, h) ?? hgName(eq, h)}</div>
              </div>
              {d.hs.length > 0 && (
                <select aria-label={'HS de ' + hgName(eq, h)} value={h.hs ?? ''} onChange={(e) => commit(setHs(pivot, eq.id, h.id, e.target.value))} style={{ ...selectStyle, width: 150, flex: 'none', height: 26 }}>
                  {!h.hs && <option value="">— choisir —</option>}
                  {d.hs.map((x) => (
                    <option key={x.id} value={x.id}>{x.label}</option>
                  ))}
                </select>
              )}
              {hsDef?.safetyTwin && <span title={'HS safety jumeau : ' + hsDef.safetyTwin + ' (PROFIsafe)'} style={{ font: '700 10px var(--font-sans)', color: '#cfe', background: 'var(--abi-tint-blue)', padding: '3px 5px' }}>F</span>}
            </Row>
          );
        })}

        <SectionHead
          title="HG de proximité"
          right={<span>options de la liste HG</span>}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 10px 6px' }}>
          {proximityChoices(cat, eq).map((c) => (
            <Button key={c.type} small title={`Ajouter ${hgDef(cat, c.type).label} (option de ${c.on})`} disabled={eq.hg.length >= MAX.hg} onClick={() => commit(addProximity(cat, pivot, eq.id, c.type))} style={{ padding: '0 6px', height: 24 }}>
              + {c.type}
            </Button>
          ))}
          {proximityChoices(cat, eq).length === 0 && <span style={{ color: 'var(--text-muted)', font: '400 13px var(--font-sans)' }}>Aucune option dans la liste HG pour cette pile</span>}
        </div>
        {prox.map((h) => {
          const d = hgDef(cat, h.type);
          return (
            <Row key={h.id}>
              <span className="mono" style={{ font: '600 12px var(--font-tag)', width: 120 }}>{hgName(eq, h)}</span>
              <span style={{ flex: 1, font: '400 13px var(--font-sans)' }}>{d.label}</span>
              {d.hs.length > 0 ? (
                <select aria-label={'HS de ' + hgName(eq, h)} value={h.hs ?? ''} onChange={(e) => commit(setHs(pivot, eq.id, h.id, e.target.value))} style={{ ...selectStyle, width: 130, height: 26 }}>
                  {d.hs.map((x) => (
                    <option key={x.id} value={x.id}>{x.label}</option>
                  ))}
                </select>
              ) : (
                <span title="Entrée de sécu : HS déporté dans la partie safety" style={{ font: '400 12px var(--font-sans)', color: 'var(--text-muted)' }}>HS côté safety</span>
              )}
              <Button variant="ghost" small icon="trash" title={'Retirer ' + hgName(eq, h)} onClick={() => commit(removeHg(pivot, eq.id, h.id))} />
            </Row>
          );
        })}

        {!isCab && (
          <>
            <SectionHead title="Options du bloc EQ" right={<span>pattes d'entrée</span>} />
            {cat.eqOptions.map((o) => {
              const disabled = o.rule === 'reverse' && eq.hg.some((h) => h.type === 'KM');
              const v = eq.options[o.id] ?? o.default;
              return (
                <Row key={o.id} muted={disabled}>
                  <span style={{ flex: 1, font: '400 13px var(--font-sans)' }} title={disabled ? 'Commande par KM : marche arrière impossible' : undefined}>
                    {o.label}
                    {disabled && <span style={{ color: 'var(--text-muted)' }}> — grisé (KM)</span>}
                  </span>
                  {o.type === 'bool' ? (
                    <Toggle label={o.label} checked={!!v && !disabled} disabled={disabled} onChange={(x) => set({ options: { ...eq.options, [o.id]: x } })} />
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input aria-label={o.label} type="number" value={Number(v)} onChange={(e) => set({ options: { ...eq.options, [o.id]: Number(e.target.value) } })} style={{ ...inputStyle, width: 70, height: 26 }} />
                      <span style={{ color: 'var(--text-muted)', font: '400 12px var(--font-sans)' }}>[{o.unit}]</span>
                    </span>
                  )}
                </Row>
              );
            })}

            <SectionHead title="Setpoints" right={<span>{eq.setpoints.length}/{MAX.setpoints} · découlent des HG</span>} />
            {eq.setpoints.length === 0 && <div style={{ padding: '2px 10px', color: 'var(--text-muted)', font: '400 13px var(--font-sans)' }}>Aucun</div>}
            {eq.setpoints.map((s, i) => (
              <Row key={i}>
                <span style={{ flex: 1, font: '400 13px var(--font-sans)' }}>{s.name}</span>
                <input
                  aria-label={'Valeur par défaut de ' + s.name}
                  type="number"
                  value={s.value}
                  onChange={(e) => set({ setpoints: eq.setpoints.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)) })}
                  style={{ ...inputStyle, width: 90, height: 26 }}
                />
                <span style={{ width: 54, color: 'var(--text-muted)', font: '400 12px var(--font-sans)' }}>[{s.unit}]</span>
              </Row>
            ))}

            <SectionHead
              title="Canaux et sorties"
              right={<Button small icon="plus" disabled={!canAddChannel(eq)} onClick={() => commit(addChannel(pivot, eq.id))} style={{ height: 24 }}>Canal</Button>}
            />
            {eq.channels.map((_, ci) => {
              const ch = ci + 1;
              const first = isFirstChannel(pivot, eq.id, ch);
              const inputs = pivot.links.filter((l) => l.to.eq === eq.id && l.to.ch === ch);
              return (
                <div key={ci} style={{ margin: '0 10px 10px', border: '1px solid var(--border-divider)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#444' }}>
                    <span className="mono" style={{ font: '600 13px var(--font-tag)' }}>{eq.repere}_CH{pad2(ch)}</span>
                    <span style={{ font: '400 12px var(--font-sans)', color: first ? 'var(--abi-green)' : 'var(--text-muted)' }} title="Coché automatiquement si aucune sortie n'arrive dans le canal">
                      {first ? '✓ first channel (auto)' : `${inputs.length} entrée${inputs.length > 1 ? 's' : ''} : ${inputs.map((l) => eqName(l.from.eq)).join(', ')}`}
                    </span>
                    {eq.channels.length > 1 && <Button variant="ghost" small icon="trash" title={'Retirer le canal ' + ch} onClick={() => commit(removeChannel(pivot, eq.id, ch))} style={{ marginLeft: 'auto' }} />}
                  </div>
                  {(['avant', 'arriere'] as Dir[]).map((dir) => {
                    const outs = outputsOf(eq, ch, dir);
                    const can = canAddOutput(eq, ch, dir);
                    return (
                      <div key={dir}>
                        {outs.map((o) => {
                          const l = pivot.links.find((x) => x.from.eq === eq.id && x.from.ch === ch && x.from.dir === dir && x.from.num === o.num);
                          return (
                            <div key={o.num} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', font: '400 13px var(--font-sans)' }}>
                              <svg width={22} height={8} aria-hidden="true">
                                <line x1={0} y1={4} x2={22} y2={4} stroke={outputColor(o.num)} strokeWidth={2} strokeDasharray={dir === 'arriere' ? '4 3' : undefined} />
                              </svg>
                              <span className="mono" style={{ width: 30, font: '600 12px var(--font-tag)' }}>S{o.num}</span>
                              <span style={{ width: 120, color: 'var(--text-secondary)' }}>{dir === 'avant' ? 'avant' : 'arrière'} · {polarity(o.num)}</span>
                              {l ? (
                                <button type="button" onClick={() => onSelect(l.to.eq)} className="abi-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--abi-green)', font: '600 12px var(--font-tag)' }}>
                                  → {eqName(l.to.eq)}_CH{pad2(l.to.ch)}
                                </button>
                              ) : (
                                <span style={{ color: 'var(--pid-warn)' }}>libre</span>
                              )}
                              <Button variant="ghost" small icon="x" title={'Supprimer la sortie S' + o.num} onClick={() => commit(removeOutput(pivot, { eq: eq.id, ch, dir, num: o.num }))} style={{ marginLeft: 'auto' }} />
                            </div>
                          );
                        })}
                        <div style={{ padding: '2px 8px 6px' }}>
                          <Button small icon="plus" disabled={!can} title={dir === 'arriere' && blocked ? blocked : undefined} onClick={() => commit(addOutput(pivot, eq.id, ch, dir).p)} style={{ height: 24 }}>
                            Sortie {dir === 'avant' ? 'avant' : 'arrière'}
                          </Button>
                          {dir === 'arriere' && blocked && <span style={{ marginLeft: 8, font: '400 12px var(--font-sans)', color: 'var(--text-muted)' }}>{blocked}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </div>

      <footer style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--border-divider)' }}>
        <Button variant="rearm" icon="copy" onClick={onDuplicate}>Dupliquer</Button>
        <Button variant="stop" icon="trash" onClick={onDelete}>Supprimer</Button>
        <span style={{ marginLeft: 'auto', alignSelf: 'center', font: '400 12px var(--font-sans)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="check" size={14} /> enregistré dans le pivot
        </span>
      </footer>
    </aside>
  );
}
