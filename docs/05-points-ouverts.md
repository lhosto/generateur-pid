# Points ouverts

À compléter par Claude Code au fil du développement : une ligne par question, avec la décision quand elle tombe.

| Point | Proposition | Décision (Alex) | Date |
| --- | --- | --- | --- |
| Ordre d'appel des FC équipements dans l'OB | Ordre du pivot, des repères, ou du flux matière | | |
| Plantage technique TIA/Openness en cours de génération | Rejouer la génération complète (idempotente) | | |
| Options visibles par le chargé d'affaires vs réservées à l'automaticien | Liste par patte du bloc EQ | | |
| Nommage des boucles de sécurité | Libre, ou imposé 400A, 400B… | | |
| Représentation des sorties sur un équipement rond | Points sur le pourtour + étiquette au survol, à valider sur maquette | | |
| Logique exacte des index Unified | À documenter à partir du projet exemple | | |
| Multi-automate sur un gros site | Quel EQ sur quelle CPU dans le pivot | | |
| Forme d'un EQ sur le PID | Forme = HG principal posé en HG0 (liste HG, case « HG Principal ») ; remplace la liste de natures métier du cahier des charges | Décidé : chaque HG principal a un visuel distinct, c'est celui du HG0 qui s'affiche | 20/10/2026 |
| Symbole de chacun des 48 HG principaux | Planche proposée dans l'éditeur (bouton grille de la bibliothèque) : forme du synoptique SCADA 2026 + pictogramme ; à reporter dans la colonne « P&D - Symbole », vide aujourd'hui | | |
| Couleur des liens selon le type de sortie | Retirée pour le moment (21/10) : trait neutre, étiquette « canal.sortie » (1.2 = canal 1, sortie 2) sur chaque trait | Couleurs retirées | 21/10/2026 |
| Marche arrière vs matière qui boucle | Marche arrière = donnée (sortie côté arrière) : pointillé + « AR ». Boucle (recirculation) = lien avant qui revient en amont : trait plein, repéré automatiquement par « ↺ » sur son étiquette (lien qui ferme la boucle) | Décidé | 21/10/2026 |
| Plusieurs sorties sur un même canal | Un point de départ par sortie : S1 sur l'axe du canal, les autres décalées de part et d'autre (selon la position de leur cible) ; étiquette « canal.sortie » collée au départ. Numéro réglable sur le trait sélectionné (les autres se décalent) ; supprimer un trait supprime sa sortie et renumérote | Décidé | 21/10/2026 |
| Côtés de départ et d'arrivée | Départ imposé par le sens du flux : sorties avant côté aval, arrière côté amont ; S1 sur l'axe du canal, S2, S3… toujours à droite (côté horizontal) ou en dessous (côté vertical). Arrivée : par l'arrière (amont, sur l'axe du canal) si l'équipement n'a pas de marche arrière programmée, sinon par le milieu (dessus / dessous) jusqu'à l'axe du canal | Décidé | 21/10/2026 |
| Commande par défaut au-dessus du moteur | La liste HG donne KM en « Superieur 1 (défaut) » sous MRAS ; un réglage de base du projet peut imposer DRIV, SOFT ou KMIN | | |
| Préfixe du repère client proposé | Proposition : préfixe par HG0 (08 BELT, 13 OPSO, 63 TROM…) + zone du dernier EQ + lettre libre (08Aa, 08Ab…) | | |
| Goulotte de tri | Simple objet de dessin, ou EQ du pivot ? | | |
| Police des repères sur le PID | IBM Plex Mono (design SCADA 2026) ou police réelle d'Unified | | |
| Colonne « A saisir » de la liste HG | Sens à préciser (non utilisée par l'éditeur) | | |
| Textes de l'éditeur pour l'opérateur | Français en mots simples, suivi en petit du terme technique (Équipement EQ, Canal CH, Matériel générique HG, Matériel spécifique HS, Fonction FU) ; anglais prêt (bascule FR/EN). | Décidé | 20/10/2026 |
| Vocabulaire opérateur à valider | « Matériel principal » pour HG0 ; « début de flux » pour first channel ; « sans action » pour no action ; « Sortie non reliée » ; « Automate (CPU) » ; « pivot » encore visible (« Enregistrer le pivot ») ; « À coder » accentué alors que la liste dit « A coder » | | |
| Vocabulaire anglais à valider | P&ID (et non PID) ; Customer tag ; Equipment item(s) ; Main Hardware Generic ; Unconnected output ; Start of flow ; Sorting chute ; Draft (esquisse) ; placeholder (fictif) | | |
| Libellés anglais du catalogue | Les HS, noms de consignes et options du bloc EQ n'ont pas de champ anglais dans les sources ; l'éditeur garde une petite table anglaise provisoire pour les 4 options | | |
| Onglet des canaux « − n canaux + » | Au survol : au-dessus de l'équipement en flux horizontal ; à droite en flux vertical (le haut et le bas portent alors les sorties et les arrivées) | | |
| Menu du « + » d'une sortie | Convoyeur en tête par défaut, puis le dernier choix, puis « Autre équipement… » (planche complète) | | |
| Doublons de repère | Repère client et repère Aktid contrôlés sans tenir compte des majuscules ni des espaces (08aa = 08Aa) ; « Dupliquer » vide le repère Aktid de la copie | | |
| Sortie en attente de raccordement | Tout nouvel équipement (sauf « sans action ») et tout nouveau canal arrive avec sa sortie 1 marche avant déclarée, libre, en orange ; clic dessus (« + » au survol) = choisir l'équipement à raccorder ; Suppr = la supprimer | Décidé | 21/10/2026 |
| Étiquette courte des sorties | Un canal, une sortie → rien ; un canal, plusieurs sorties → « 2 » ; une sortie par canal → numéro de canal ; sinon « 1.2 ». « AR » ajouté en marche arrière | Décidé | 21/10/2026 |
| Taille du convoyeur | Réduite de 56×28 à 48×24 (32×48 à la verticale) | | |
