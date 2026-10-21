// Fiche équipement (tiroir ABI) : identité, pile HG/HS, HG de proximité, options du bloc EQ,
// setpoints, canaux et sorties.
import type { ReactNode } from 'react';
import { Abbr, getLang, hgLabel, plain, rich, Term, tx, type Entry } from '../i18n';
import { etatLabel, principals, type Catalogue } from '../model/catalogue';
import { hg0Of } from '../model/geometry';
import {
  addChannel, addOutput, addProximity, changeHg0, findEq, removeChannel, removeHg, removeOutput, setChainType, setHs, setLinkTarget, updateEq,
} from '../model/ops';
import type { Dir, Eq, Flow, Pivot } from '../model/pivot';
import { outputColor } from '../model/route';
import {
  alternativesAt, canAddChannel, canAddOutput, chainOf, hgDef, hgName, hsLabel, hsName, incompleteReasons, isFirstChannel, isNoAction, MAX,
  optionLabel, outputsOf, pad2, polarity, proximityChoices, proximityOf, repereUsers, reverseBlocked,
} from '../model/rules';
import { Button, Field, Icon, inputStyle, SectionHead, Toggle } from '../ui/ui';
import { Glyph } from './Palette';

// Textes de la fiche (français / anglais). Les noms TIA (08Aa_Main, 08Aa_CH01), codes HG, repères,
// numéros de sortie (S1), unités et noms de consignes sont des données : jamais traduits.
// « [HS] » = terme technique en petit (rich) ; dans un title ou un aria-label, plain l'écrit entre parenthèses.
const L = {
  sheet: { fr: (r: string) => 'Fiche équipement ' + r, en: (r: string) => 'Equipment details ' + r },
  // Ligne d'en-tête : bloc TIA de l'EQ (FC en petit), état, nombre de matériels de la pile.
  fc: { fr: 'Bloc TIA', en: 'TIA block' },
  active: { fr: 'actif', en: 'active' },
  // « no action » : terme du standard (catalogue.noAction), affiché en petit après la traduction.
  noAction: { fr: 'sans action', en: 'no action' },
  hgCount: { fr: (n: number, max: number) => `${n}/${max} matériels`, en: (n: number, max: number) => `${n}/${max} hardware items` },
  close: { fr: 'Fermer la fiche', en: 'Close details' },
  generation: { fr: (f: string) => 'Génération : ' + f, en: (f: string) => 'Generation: ' + f },
  // Identité
  identity: { fr: 'Identité', en: 'Identification' },
  repere: { fr: 'Repère client', en: 'Customer tag' },
  dupUsed: {
    fr: (who: string, n: number) => `Déjà utilisé par ${n > 1 ? `${n} équipements` : 'l’équipement'} ${who}`,
    en: (who: string, n: number) => `Already used by ${n > 1 ? `${n} Equipment items` : 'Equipment item'} ${who}`,
  },
  repereHint: { fr: 'Nomme les blocs TIA', en: 'Names the TIA blocks' },
  aktid: { fr: 'Repère Aktid', en: 'Aktid tag' },
  descriptif: { fr: 'Descriptif', en: 'Description' },
  // Libellé + HG0 en petit : sans espace avant le terme, il ne se coupe qu'après « Matériel ».
  hg0: { fr: 'Matériel principal', en: 'Main Hardware Generic' },
  hg0Aria: { fr: 'Matériel principal HG0', en: 'Main Hardware Generic HG0' },
  hg0Hint: {
    fr: (id: string, etat: string) => `Fixe la forme sur le PID. ID WinCC ${id} · état ${etat}`,
    en: (id: string, etat: string) => `Sets the shape on the P&ID. WinCC ID ${id} · status ${etat}`,
  },
  flow: { fr: 'Sens du flux', en: 'Flow direction' },
  right: { fr: 'Vers la droite', en: 'To the right' },
  down: { fr: 'Vers le bas', en: 'Downwards' },
  left: { fr: 'Vers la gauche', en: 'To the left' },
  up: { fr: 'Vers le haut', en: 'Upwards' },
  // Pile de matériels génériques
  stack: { fr: 'Pile de matériels génériques', en: 'Hardware Generic stack' },
  stackNote: {
    fr: (u: string) => `Le niveau 0, matériel principal [HG0], agit sur la matière${u ? ' (consigne en ' + u + ')' : ''} ; les niveaux au-dessus suivent la liste des matériels génériques.`,
    en: (u: string) => `Level 0, the main Hardware Generic [HG0], acts on the material${u ? ' (setpoint in ' + u + ')' : ''}; upper levels follow the Hardware Generic list.`,
  },
  levelType: { fr: (i: number) => 'Type du matériel générique, niveau ' + i, en: (i: number) => 'Hardware Generic type, level ' + i },
  hsOf: { fr: (n: string) => 'Matériel spécifique [HS] de ' + n, en: (n: string) => 'Hardware Specific [HS] for ' + n },
  choose: { fr: '— choisir —', en: '— select —' },
  safetyTwin: {
    fr: (t: string) => `Jumeau sécurité du matériel spécifique [HS] : ${t} (PROFIsafe)`,
    en: (t: string) => `Safety twin of the Hardware Specific [HS]: ${t} (PROFIsafe)`,
  },
  // Matériels de proximité
  prox: { fr: 'Matériels de proximité', en: 'Proximity hardware' },
  proxRight: { fr: 'options de la liste des matériels génériques', en: 'options from the Hardware Generic list' },
  add: { fr: (label: string, on: string) => `Ajouter ${label} (option de ${on})`, en: (label: string, on: string) => `Add ${label} (option of ${on})` },
  noProx: { fr: 'Aucun matériel de proximité prévu pour cette pile', en: 'No proximity hardware available for this stack' },
  safetySide: { fr: 'Côté sécurité', en: 'Safety side' },
  safetySideTitle: {
    fr: 'Entrée de sécurité : son matériel spécifique [HS] est géré dans la partie sécurité',
    en: 'Safety input: its Hardware Specific [HS] is handled in the safety part',
  },
  remove: { fr: (n: string) => 'Retirer ' + n, en: (n: string) => 'Remove ' + n },
  // Options du bloc équipement
  eqOptions: { fr: 'Options du bloc équipement', en: 'Equipment block options' },
  eqOptionsRight: { fr: 'entrées du bloc TIA', en: 'TIA block inputs' },
  kmBlocked: { fr: 'Commande par contacteur (KM) : marche arrière impossible', en: 'Contactor control (KM): reverse not possible' },
  kmGrey: { fr: ' — bloqué (contacteur KM)', en: ' — blocked (KM contactor)' },
  // Consignes
  setpoints: { fr: 'Consignes', en: 'Setpoints' },
  setpointsFrom: { fr: (n: number, max: number) => `${n}/${max} · selon les matériels`, en: (n: number, max: number) => `${n}/${max} · from the hardware` },
  noSetpoint: { fr: 'Aucune consigne', en: 'No setpoint' },
  defaultOf: { fr: (n: string) => 'Valeur par défaut de ' + n, en: (n: string) => 'Default value of ' + n },
  // Canaux et sorties
  channels: { fr: 'Canaux et sorties', en: 'Channels and outputs' },
  channel: { fr: 'Canal', en: 'Channel' },
  addChannel: { fr: 'Ajouter un canal · CH', en: 'Add a Channel · CH' },
  firstChannel: { fr: '✓ début de flux (auto)', en: '✓ start of flow (auto)' },
  firstTitle: {
    fr: "Coché automatiquement si aucune sortie n'arrive dans le canal (first channel)",
    en: 'Set automatically when no output feeds this Channel (first channel)',
  },
  inputs: {
    fr: (n: number, from: string) => `${n} entrée${n > 1 ? 's' : ''} : ${from}`,
    en: (n: number, from: string) => `${n} input${n > 1 ? 's' : ''}: ${from}`,
  },
  removeChannelTitle: {
    fr: (n: string) => `Retirer ${n} : ses sorties et les liens qui y arrivent sont supprimés (Ctrl+Z pour annuler)`,
    en: (n: string) => `Remove ${n}: its outputs and incoming links are deleted (Ctrl+Z to undo)`,
  },
  removeChannel: { fr: 'Retirer le canal', en: 'Remove Channel' },
  forward: { fr: 'avant', en: 'forward' },
  reverse: { fr: 'arrière', en: 'reverse' },
  openTarget: { fr: "Ouvrir la fiche de l'équipement d'arrivée · EQ", en: 'Open the details of the destination Equipment item · EQ' },
  targetChannel: { fr: (s: string) => "Canal d'arrivée de " + s, en: (s: string) => 'Destination Channel of ' + s },
  unlinked: { fr: 'non reliée', en: 'not connected' },
  deleteOutput: { fr: (s: string) => 'Supprimer la sortie ' + s, en: (s: string) => 'Delete output ' + s },
  addForward: { fr: 'Sortie avant', en: 'Forward output' },
  addReverse: { fr: 'Sortie arrière', en: 'Reverse output' },
  // Pied de fiche
  duplicate: { fr: 'Dupliquer', en: 'Duplicate' },
  delete: { fr: 'Supprimer', en: 'Delete' },
  stored: { fr: 'enregistré dans le pivot', en: 'stored in the pivot' },
};

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

const FLOWS: { f: Flow; label: Entry; arrow: string }[] = [
  { f: 'E', label: L.right, arrow: '→' },
  { f: 'S', label: L.down, arrow: '↓' },
  { f: 'W', label: L.left, arrow: '←' },
  { f: 'N', label: L.up, arrow: '↑' },
];

const DUP_INPUT = { borderColor: 'var(--pid-warn)', boxShadow: '0 0 0 1px var(--pid-warn) inset' };

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
  // Doublons de repère (client ou Aktid) : signalés dès la saisie, sous le champ.
  const dupHint = (kind: 'client' | 'aktid', value: string) => {
    const users = repereUsers(pivot, eq.id, kind, value);
    if (!users.length) return undefined;
    const who = users.map((u) => `${u.repere || '?'}${u.descriptif ? ` (${u.descriptif})` : ''}`).join(', ');
    return <span style={{ color: 'var(--pid-warn)' }}>{tx(L.dupUsed, who, users.length)}</span>;
  };
  const unit = d0.setpoints?.[0]?.unit;
  const eqName = (id: string) => findEq(pivot, id)?.repere ?? '?';

  return (
    <aside
      aria-label={tx(L.sheet, eq.repere)}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 480, background: 'var(--surface-page)', borderLeft: '8px solid #4a4a4a', boxShadow: 'var(--shadow-drawer)', display: 'flex', flexDirection: 'column', zIndex: 6 }}
    >
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 10px 10px 14px', borderBottom: '1px solid var(--border-divider)' }}>
        <Glyph hg0={hg0} width={80} height={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '700 20px var(--font-tag)' }}>{eq.repere || '?'}</div>
          {/* Libellé puis code HG en petit (hors des listes déroulantes, qui n'acceptent que du texte). */}
          <div style={{ font: '700 14px var(--font-sans)', textTransform: 'uppercase', marginTop: 2 }}>
            {hgLabel(d0)}
            <Abbr>{hg0}</Abbr>
          </div>
          <div style={{ font: '400 13px var(--font-sans)', color: 'var(--text-muted)', marginTop: 2 }}>
            {tx(L.fc)}
            <Abbr>FC</Abbr> <span className="mono">{(eq.repere || '?') + '_Main'}</span> ·{' '}
            {isCab ? (
              <>
                {tx(L.noAction)}
                {getLang() !== 'en' && <Abbr>no action</Abbr>}
              </>
            ) : (
              tx(L.active)
            )}{' '}
            · {tx(L.hgCount, eq.hg.length, MAX.hg)}
          </div>
        </div>
        <Button variant="ghost" icon="x" title={tx(L.close)} onClick={onClose} />
      </header>

      <div style={{ overflow: 'auto', flex: 1, paddingBottom: 16 }}>
        {(fault || issues.length > 0) && (
          <div style={{ margin: '10px 10px 0', padding: '8px 10px', background: fault ? 'var(--abi-tint-red)' : 'var(--abi-tint-brown)', font: '400 13px/1.45 var(--font-sans)' }}>
            {/* Messages à marqueurs [HS] (files.ts, rules.ts) : terme technique en petit. */}
            {fault && <div style={{ color: '#ffd7d3' }}>{rich(tx(L.generation, fault))}</div>}
            {issues.map((i) => (
              <div key={i} style={{ color: '#f0c9a0' }}>{rich(i)}</div>
            ))}
          </div>
        )}

        <SectionHead title={tx(L.identity)} />
        <Field label={tx(L.repere)} hint={dupHint('client', eq.repere) ?? tx(L.repereHint)}>
          <input aria-label={tx(L.repere)} aria-invalid={!!dupHint('client', eq.repere)} value={eq.repere} onChange={(e) => set({ repere: e.target.value.trim() })} style={{ ...inputStyle, fontFamily: 'var(--font-tag)', ...(dupHint('client', eq.repere) ? DUP_INPUT : {}) }} />
        </Field>
        <Field label={tx(L.aktid)} hint={dupHint('aktid', eq.repereAktid)}>
          <input aria-label={tx(L.aktid)} aria-invalid={!!dupHint('aktid', eq.repereAktid)} value={eq.repereAktid} onChange={(e) => set({ repereAktid: e.target.value })} style={{ ...inputStyle, ...(dupHint('aktid', eq.repereAktid) ? DUP_INPUT : {}) }} />
        </Field>
        <Field label={tx(L.descriptif)}>
          <input aria-label={tx(L.descriptif)} value={eq.descriptif} onChange={(e) => set({ descriptif: e.target.value })} style={inputStyle} />
        </Field>
        <Field label={<>{tx(L.hg0)}<Abbr>HG0</Abbr></>} hint={tx(L.hg0Hint, d0.idWinCC ?? '—', etatLabel(d0.etat) || '—')}>
          <select aria-label={tx(L.hg0Aria)} value={hg0} onChange={(e) => commit(changeHg0(cat, pivot, eq.id, e.target.value))} style={selectStyle}>
            {principals(cat).map((k) => (
              <option key={k} value={k}>{k} — {hgLabel(cat.hgTypes[k])}</option>
            ))}
          </select>
        </Field>
        <Field label={tx(L.flow)}>
          <span style={{ display: 'flex', gap: 4 }}>
            {FLOWS.map((x) => (
              <Button key={x.f} small active={eq.flow === x.f} title={tx(x.label)} onClick={() => set({ flow: x.f })} style={{ width: 36, fontSize: 16 }}>
                {x.arrow}
              </Button>
            ))}
          </span>
        </Field>

        {/* À droite de l'en-tête : en-tête de la colonne des sélecteurs HS. */}
        <SectionHead title={<>{tx(L.stack)}<Abbr>HG</Abbr></>} right={<Term k="hs" />} />
        <div style={{ padding: '0 10px 6px', color: 'var(--text-muted)', font: '400 12px/1.4 var(--font-sans)' }}>{rich(tx(L.stackNote, unit ?? ''))}</div>
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
                    <select aria-label={tx(L.levelType, i)} value={h.type} onChange={(e) => commit(setChainType(cat, pivot, eq.id, i, e.target.value))} style={{ ...selectStyle, width: '100%', height: 26 }}>
                      {alts.map((t) => (
                        <option key={t} value={t}>{t} — {hgLabel(hgDef(cat, t))}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ font: '400 13px var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.type} — {hgLabel(d)}</span>
                  )}
                </div>
                <div className="mono" style={{ font: '400 11px var(--font-tag)', color: 'var(--text-muted)', marginTop: 2 }}>{hsName(eq, h) ?? hgName(eq, h)}</div>
              </div>
              {d.hs.length > 0 && (
                <select aria-label={plain(tx(L.hsOf, hgName(eq, h)))} value={h.hs ?? ''} onChange={(e) => commit(setHs(pivot, eq.id, h.id, e.target.value))} style={{ ...selectStyle, width: 150, flex: 'none', height: 26 }}>
                  {!h.hs && <option value="">{tx(L.choose)}</option>}
                  {d.hs.map((x) => (
                    <option key={x.id} value={x.id}>{hsLabel(x)}</option>
                  ))}
                </select>
              )}
              {hsDef?.safetyTwin && <span title={plain(tx(L.safetyTwin, hsDef.safetyTwin))} style={{ font: '700 10px var(--font-sans)', color: '#cfe', background: 'var(--abi-tint-blue)', padding: '3px 5px' }}>F</span>}
            </Row>
          );
        })}

        <SectionHead
          title={<>{tx(L.prox)}<Abbr>HG</Abbr></>}
          right={<span>{tx(L.proxRight)}</span>}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 10px 6px' }}>
          {proximityChoices(cat, eq).map((c) => (
            <Button key={c.type} small title={tx(L.add, hgLabel(hgDef(cat, c.type)), c.on)} disabled={eq.hg.length >= MAX.hg} onClick={() => commit(addProximity(cat, pivot, eq.id, c.type))} style={{ padding: '0 6px', height: 24 }}>
              + {c.type}
            </Button>
          ))}
          {proximityChoices(cat, eq).length === 0 && <span style={{ color: 'var(--text-muted)', font: '400 13px var(--font-sans)' }}>{tx(L.noProx)}</span>}
        </div>
        {prox.map((h) => {
          const d = hgDef(cat, h.type);
          return (
            <Row key={h.id}>
              <span className="mono" style={{ font: '600 12px var(--font-tag)', width: 120 }}>{hgName(eq, h)}</span>
              <span style={{ flex: 1, font: '400 13px var(--font-sans)' }}>{hgLabel(d)}</span>
              {d.hs.length > 0 ? (
                <select aria-label={plain(tx(L.hsOf, hgName(eq, h)))} value={h.hs ?? ''} onChange={(e) => commit(setHs(pivot, eq.id, h.id, e.target.value))} style={{ ...selectStyle, width: 130, height: 26 }}>
                  {d.hs.map((x) => (
                    <option key={x.id} value={x.id}>{hsLabel(x)}</option>
                  ))}
                </select>
              ) : (
                <span title={plain(tx(L.safetySideTitle))} style={{ font: '400 12px var(--font-sans)', color: 'var(--text-muted)' }}>
                  {tx(L.safetySide)}
                  <Abbr>HS</Abbr>
                </span>
              )}
              <Button variant="ghost" small icon="trash" title={tx(L.remove, hgName(eq, h))} onClick={() => commit(removeHg(pivot, eq.id, h.id))} />
            </Row>
          );
        })}

        {!isCab && (
          <>
            <SectionHead title={<>{tx(L.eqOptions)}<Abbr>EQ</Abbr></>} right={<span>{tx(L.eqOptionsRight)}</span>} />
            {cat.eqOptions.map((o) => {
              const disabled = o.rule === 'reverse' && eq.hg.some((h) => h.type === 'KM');
              const v = eq.options[o.id] ?? o.default;
              return (
                <Row key={o.id} muted={disabled}>
                  <span style={{ flex: 1, font: '400 13px var(--font-sans)' }} title={disabled ? tx(L.kmBlocked) : undefined}>
                    {optionLabel(o)}
                    {disabled && <span style={{ color: 'var(--text-muted)' }}>{tx(L.kmGrey)}</span>}
                  </span>
                  {o.type === 'bool' ? (
                    <Toggle label={optionLabel(o)} checked={!!v && !disabled} disabled={disabled} onChange={(x) => set({ options: { ...eq.options, [o.id]: x } })} />
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input aria-label={optionLabel(o)} type="number" value={Number(v)} onChange={(e) => set({ options: { ...eq.options, [o.id]: Number(e.target.value) } })} style={{ ...inputStyle, width: 70, height: 26 }} />
                      <span style={{ color: 'var(--text-muted)', font: '400 12px var(--font-sans)' }}>[{o.unit}]</span>
                    </span>
                  )}
                </Row>
              );
            })}

            {/* Une seule mention HG par section : la pile la porte déjà, pas ici. */}
            <SectionHead title={tx(L.setpoints)} right={<span>{tx(L.setpointsFrom, eq.setpoints.length, MAX.setpoints)}</span>} />
            {eq.setpoints.length === 0 && <div style={{ padding: '2px 10px', color: 'var(--text-muted)', font: '400 13px var(--font-sans)' }}>{tx(L.noSetpoint)}</div>}
            {eq.setpoints.map((s, i) => (
              <Row key={i}>
                <span style={{ flex: 1, font: '400 13px var(--font-sans)' }}>{s.name}</span>
                <input
                  aria-label={tx(L.defaultOf, s.name)}
                  type="number"
                  value={s.value}
                  onChange={(e) => set({ setpoints: eq.setpoints.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)) })}
                  style={{ ...inputStyle, width: 90, height: 26 }}
                />
                <span style={{ width: 54, color: 'var(--text-muted)', font: '400 12px var(--font-sans)' }}>[{s.unit}]</span>
              </Row>
            ))}

            <SectionHead
              title={<>{tx(L.channels)}<Abbr>CH</Abbr></>}
              right={<Button small icon="plus" title={tx(L.addChannel)} disabled={!canAddChannel(eq)} onClick={() => commit(addChannel(pivot, eq.id))} style={{ height: 24 }}>{tx(L.channel)}</Button>}
            />
            {eq.channels.map((_, ci) => {
              const ch = ci + 1;
              const first = isFirstChannel(pivot, eq.id, ch);
              const inputs = pivot.links.filter((l) => l.to.eq === eq.id && l.to.ch === ch);
              return (
                <div key={ci} style={{ margin: '0 10px 10px', border: '1px solid var(--border-divider)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#444' }}>
                    <span className="mono" style={{ font: '600 13px var(--font-tag)' }}>{eq.repere}_CH{pad2(ch)}</span>
                    <span style={{ font: '400 12px var(--font-sans)', color: first ? 'var(--abi-green)' : 'var(--text-muted)' }} title={tx(L.firstTitle)}>
                      {first ? (
                        <>
                          {tx(L.firstChannel)}
                          <Abbr>first channel</Abbr>
                        </>
                      ) : (
                        tx(L.inputs, inputs.length, inputs.map((l) => eqName(l.from.eq)).join(', '))
                      )}
                    </span>
                    {eq.channels.length > 1 && (
                      <Button variant="stop" small icon="trash" title={tx(L.removeChannelTitle, `${eq.repere}_CH${pad2(ch)}`)} onClick={() => commit(removeChannel(pivot, eq.id, ch))} style={{ marginLeft: 'auto', height: 24 }}>
                        {tx(L.removeChannel)}
                      </Button>
                    )}
                  </div>
                  {(['avant', 'arriere'] as Dir[]).map((dir) => {
                    const outs = outputsOf(eq, ch, dir);
                    const can = canAddOutput(eq, ch, dir);
                    return (
                      <div key={dir}>
                        {outs.map((o) => {
                          const l = pivot.links.find((x) => x.from.eq === eq.id && x.from.ch === ch && x.from.dir === dir && x.from.num === o.num);
                          const out = 'S' + o.num; // numéro de sortie du PID, comme la légende et outputLabel
                          return (
                            <div key={o.num} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', font: '400 13px var(--font-sans)' }}>
                              <svg width={22} height={8} aria-hidden="true">
                                <line x1={0} y1={4} x2={22} y2={4} stroke={outputColor(o.num)} strokeWidth={2} strokeDasharray={dir === 'arriere' ? '4 3' : undefined} />
                              </svg>
                              <span className="mono" style={{ width: 30, font: '600 12px var(--font-tag)' }}>{out}</span>
                              <span style={{ width: 120, color: 'var(--text-secondary)' }}>{tx(dir === 'avant' ? L.forward : L.reverse)} · {polarity(o.num)}</span>
                              {l ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <button type="button" onClick={() => onSelect(l.to.eq)} className="abi-link" title={tx(L.openTarget)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--abi-green)', font: '600 12px var(--font-tag)' }}>
                                    → {eqName(l.to.eq)}
                                  </button>
                                  <select
                                    aria-label={tx(L.targetChannel, out)}
                                    value={l.to.ch}
                                    onChange={(e) => commit(setLinkTarget(pivot, l.id, { eq: l.to.eq, ch: Number(e.target.value) }))}
                                    style={{ ...selectStyle, width: 'auto', height: 22, fontFamily: 'var(--font-tag)', fontSize: 12 }}
                                  >
                                    {(findEq(pivot, l.to.eq)?.channels ?? []).map((_, k) => (
                                      <option key={k} value={k + 1}>CH{pad2(k + 1)}</option>
                                    ))}
                                  </select>
                                </span>
                              ) : (
                                <span style={{ color: 'var(--pid-warn)' }}>{tx(L.unlinked)}</span>
                              )}
                              <Button variant="ghost" small icon="x" title={tx(L.deleteOutput, out)} onClick={() => commit(removeOutput(pivot, { eq: eq.id, ch, dir, num: o.num }))} style={{ marginLeft: 'auto' }} />
                            </div>
                          );
                        })}
                        <div style={{ padding: '2px 8px 6px' }}>
                          <Button small icon="plus" disabled={!can} title={dir === 'arriere' && blocked ? plain(blocked) : undefined} onClick={() => commit(addOutput(pivot, eq.id, ch, dir).p)} style={{ height: 24 }}>
                            {tx(dir === 'avant' ? L.addForward : L.addReverse)}
                          </Button>
                          {dir === 'arriere' && blocked && <span style={{ marginLeft: 8, font: '400 12px var(--font-sans)', color: 'var(--text-muted)' }}>{rich(blocked)}</span>}
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
        <Button variant="rearm" icon="copy" onClick={onDuplicate}>{tx(L.duplicate)}</Button>
        <Button variant="stop" icon="trash" onClick={onDelete}>{tx(L.delete)}</Button>
        <span style={{ marginLeft: 'auto', alignSelf: 'center', font: '400 12px var(--font-sans)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="check" size={14} /> {tx(L.stored)}
        </span>
      </footer>
    </aside>
  );
}
