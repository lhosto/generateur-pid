# Éditeur PID — maquette cliquable

Éditeur synoptique HTML du chargé d'affaires : il dessine le PID et produit le fichier pivot (JSON).
Livrable : **un seul fichier** `dist/editeur-pid.html`, ouvert depuis SharePoint dans le navigateur. Il n'y a rien à installer et il fonctionne hors ligne.

## Commandes

```bash
npm install          # une fois
npm run dev          # http://localhost:5173 (rechargement à chaud)
npm run catalogue    # régénère src/catalogue.json depuis la liste HG
npm test             # règles du standard, alignement, site de test
npm run build        # catalogue + contrôle des types + dist/editeur-pid.html
```

## Données : réel ou fictif

| Donnée | Source | Statut |
|---|---|---|
| Liste des HG (principaux, supérieurs, options, ID WinCC, état) | `../kit/sharepoint/Hardware Generic.csv` | réelle (export du 20/10/2026) |
| Symbole PID de chaque HG principal | `src/model/symbols.ts` | proposition à valider, à reporter dans la colonne « P&D - Symbole » |
| HS, options du bloc EQ, préfixes de repère, consignes | `src/fictif/complements.fictif.json` | fictif, en attendant la Global Library |
| Site de test (~45 EQ) | `src/fictif/siteTest.fictif.ts` | fictif |

`scripts/catalogue.mjs` assemble les deux sources dans `src/catalogue.json`. Vite l'injecte ensuite dans le bloc `<script id="catalogue">` de la page. Plus tard, le logiciel Openness réécrira ce même bloc avec l'export de la librairie.

## Structure

- `src/model/` : logique pure, sans React.
  - `pivot.ts` : format pivot provisoire.
  - `rules.ts` : piles HG, limites, nommage, first channel, marche arrière.
  - `ops.ts` : opérations sur le pivot, qui permettent l'annulation.
  - `route.ts` : tracé des liens.
  - `align.ts` : alignement.
  - `symbols.ts` : visuel de chaque HG principal.
- `src/canvas/` : canevas SVG 1920×1080, symboles, poignées « + ».
- `src/panels/` : bibliothèque des HG principaux, fiche équipement, planche des symboles, réglages de base, rapport.
- `src/tabs/` : onglets Réseau et Sécurité (esquisses).
- `src/theme/tokens.css` : tokens ABI (AbiDesign) pour l'habillage, tokens du synoptique SCADA 2026 pour le canevas.
