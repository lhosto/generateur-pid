// Construit src/catalogue.json : liste réelle des HG (export SharePoint « Hardware Generic »)
// + compléments fictifs (HS, interface du bloc EQ, préfixes) en attendant la Global Library.
// Préfigure l'export du catalogue que fera le logiciel Openness.
//   node scripts/catalogue.mjs [chemin/vers/Hardware Generic.csv]
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const csvPath = resolve(process.argv[2] ?? resolve(root, '../kit/sharepoint/Hardware Generic.csv'));
const compPath = resolve(root, 'src/fictif/complements.fictif.json');
const outPath = resolve(root, 'src/catalogue.json');

/** CSV RFC 4180 (guillemets, virgules et retours ligne dans les champs). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const text = readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
const [header, ...lines] = parseCsv(text);
const col = (name) => {
  const i = header.findIndex((h) => h.trim().toLowerCase().startsWith(name.toLowerCase()));
  if (i < 0) throw new Error('Colonne absente du CSV : ' + name);
  return i;
};
const C = {
  code: col('Abreviation'), wincc: col('ID WinCC'), symbole: col('P&D - Symbole'), fr: col('Français'), en: col('English'),
  etat: col('Etat software'), principal: col('HG Principal'), saisir: col('A saisir'),
  sup: [1, 2, 3, 4, 5].map((n) => col('Superieur ' + n)), opt: [1, 2, 3, 4, 5, 6].map((n) => col('Option ' + n)),
};

const comp = JSON.parse(readFileSync(compPath, 'utf8'));
const roleOf = (code, principal) => {
  if (principal) return 'matiere';
  for (const [role, codes] of Object.entries(comp.roles)) if (codes.includes(code)) return role;
  return 'proximite';
};

const hgTypes = {};
for (const r of lines) {
  const code = r[C.code]?.trim();
  if (!code) continue;
  const principal = r[C.principal]?.trim().toLowerCase() === 'oui';
  const role = roleOf(code, principal);
  const uniq = (a) => [...new Set(a.map((x) => x?.trim()).filter(Boolean))];
  const def = {
    label: r[C.fr].trim(),
    labelEn: r[C.en].trim(),
    principal,
    idWinCC: r[C.wincc].trim() || null,
    symbole: r[C.symbole].trim() || null,
    etat: r[C.etat].trim() || null,
    aSaisir: /^(vrai|true)$/i.test(r[C.saisir].trim()),
    role,
    superiors: uniq(C.sup.map((i) => r[i])),
    options: uniq(C.opt.map((i) => r[i])),
    hs: role === 'securite' ? [] : (comp.hs[code] ?? [{ id: 'Std', label: 'HS à définir' }]),
  };
  if (role === 'securite') def.safetyHs = comp.safetyHs[code] ?? 'FB_SafetyInput';
  if (comp.setpoints[code]) def.setpoints = comp.setpoints[code];
  hgTypes[code] = def;
}

// Contrôle : chaque supérieur ou option cité doit exister dans la liste.
const missing = new Set();
for (const d of Object.values(hgTypes)) for (const x of [...d.superiors, ...d.options]) if (!hgTypes[x]) missing.add(x);
for (const x of missing) {
  hgTypes[x] = { label: x + ' (absent de la liste HG)', labelEn: x, principal: false, idWinCC: null, symbole: null, etat: null, aSaisir: false, role: roleOf(x, false), superiors: [], options: [], hs: [{ id: 'Std', label: 'HS à définir' }] };
}

const date = statSync(csvPath).mtime.toISOString().slice(0, 10);
const principaux = Object.values(hgTypes).filter((d) => d.principal).length;
const catalogue = {
  version: `HG-${date}+fictif`,
  date,
  fictif: true,
  sources: {
    hg: { fichier: relative(resolve(root, '..'), csvPath).replace(/\\/g, '/'), lignes: lines.length, principaux, date },
    complements: 'editeur/src/fictif/complements.fictif.json',
  },
  hgTypes,
  noAction: comp.noAction,
  prefixes: comp.prefixes,
  eqOptions: comp.eqOptions,
  baseDefaults: comp.baseDefaults,
};
writeFileSync(outPath, JSON.stringify(catalogue, null, 1) + '\n');
console.log(`catalogue.json : ${Object.keys(hgTypes).length} HG dont ${principaux} principaux (${date})` + (missing.size ? ` · cités mais absents : ${[...missing].join(', ')}` : ''));
