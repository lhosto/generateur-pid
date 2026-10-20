# Kit d'entrée — à fournir avant le jour 1

Sans ces exemples réels le premier jour, Claude Code devine les règles au lieu de les apprendre, et tout glisse. Déposer chaque artefact dans `kit/` (dossier à créer à la racine du projet) et cocher ici.

## Automate

- [ ] Un vrai projet TIA V20 exporté (`.zap20` ou projet complet), avec au moins un équipement de chaque nature métier, un équipement multicanal, une armoire « no action » et le programme safety complet (FC pré et post, DB Data to Safety, les trois FB).
- [ ] La Global Library, ou son export : HG, HS, HS safety jumeaux, UDT (channel, ElectricalValue, MechanicalValue, HR), interface du bloc EQ, listes d'IO, échanges SCADA.
- [ ] Le template projet TIA (arborescence + squelette) dont part la génération.
- [ ] Un vrai FC `<EQ>_Main` commenté, pour apprendre l'enchaînement exact des 5 réseaux.

## Référentiel SharePoint (export Excel)

- [x] Liste des HG — `kit/sharepoint/Hardware Generic.csv` (export du 20/10/2026 : 140 HG, 48 principaux, ID WinCC, options).
- [ ] Liste des HS, avec conventions de nommage et versions des blocs.
- [x] Règles des HG supérieurs — colonnes « Superieur 1 (défaut) » à « Superieur 5 » de la liste HG.
- [ ] Natures métier (trieur optique, tapis transitique, tapis bypass, crible balistique…) et leur HG0.
- [ ] Plages d'adresses IP et %I / %Q réservées par type de HG.
- [ ] Index Unified des listes de textes.
- [ ] Liste SharePoint des versions de blocs (format à alimenter en fin de génération).

## Chargé d'affaires

- [ ] Un PID type d'une ligne récente, dans la forme produite aujourd'hui.
- [ ] Une matrice de sécurité Excel réelle, avec ses deux feuilles.
- [ ] La liste des formes d'équipements utilisées par les clients (cercles, rectangles), avec un exemple de chaque.

## Automaticien / électricien

- [ ] Le Visio du plan réseau d'un site (armoires, switchs, sous-réseaux).
- [ ] Un bilan électrique et une liste d'E/S d'un site, comme modèles de mise en page.
- [ ] L'Excel actuel des échanges SCADA par HG.

## Supervision

- [ ] Le projet WinCC Unified correspondant au projet TIA exemple (faceplates, listes de textes, pop-ups).

## Environnement

- [ ] Version exacte de TIA Portal V20 et de l'API Openness installées sur le poste de génération ; droits et machine.
