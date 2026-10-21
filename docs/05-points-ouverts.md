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
| Étiquette des sorties | Toujours « canal.sortie » (1.1, 2.1…), sauf un seul canal avec une seule sortie → rien. « AR » ajouté en marche arrière | Décidé | 21/10/2026 |
| Taille du convoyeur | Réduite de 56×28 à 48×24 (32×48 à la verticale) | | |
| Type d'une sortie unique | Seule sortie du canal dans ce sens : « sortie principale » (ni négative ni positive) ; dès 2 sorties : S1 négative, suivantes positives | Décidé | 21/10/2026 |
| Repère de l'équipement suivant (même type) | Prolonge le repère de départ : 04a → 04b ; 10 → 11 ; si l'amont donne un pas (10, 20), il est conservé (30, 40). Autre type : préfixe par HG0 | Décidé | 21/10/2026 |
| Départs de plusieurs sorties sur un canal | Groupe centré sur l'axe du canal, réparti dans la bande du canal (S1 à gauche / en haut, S2… à droite / en dessous) ; sorties en attente comprises. Étiquettes 1.1, 1.2 dès 2 sorties sur un canal | Décidé | 21/10/2026 |
| Taille selon les canaux | Plus de canaux = forme plus épaisse, jamais plus longue | Décidé | 21/10/2026 |
| Traits parallèles | Deux traits vers des équipements différents restent à 8 px au moins l'un de l'autre ; vers le même point d'arrivée, ils se rejoignent | Décidé | 21/10/2026 |
| Réorganiser (ELK) | Essai sur la branche essai/routage-libavoid-elk : bouton « Réorganiser » (tout, ou la sélection dès 2 EQ) ; ELK place les EQ en colonnes dans le sens du flux, les traits restent ceux de l'utilisateur et sont redessinés par le routage maison ; goulottes rangées à part ; annulable. +1,5 Mo dans le HTML. Prévu V2 au cahier des charges : à garder en V1 ? | | |
| Ajout d'une sortie | « + » nouvelle sortie (PID et fiche) proposé seulement quand toutes les sorties du canal dans ce sens sont raccordées. Mettre un trait sur le numéro d'une sortie en attente supprime cette sortie vide | Décidé | 21/10/2026 |
| Fiche équipement | Matériel principal (HG0) choisi en tête de la pile, mis en avant ; pile en grille HG / HS alignée ; consignes retirées de la fiche (toujours dans le pivot, valeurs par défaut du catalogue) ; textes d'aide réduits | Décidé | 21/10/2026 |
| Standards de formes | « Standard Aktid » fixe (référence) ; autres standards créés par duplication, qui ne changent que la forme de base par HG principal (le pictogramme reste). Choix et édition dans la planche des symboles ; standard affiché dans la barre d'état. Stockés dans le pivot du site : à partager entre sites (liste SharePoint, catalogue) ? | | |
| Convoyeur dans le menu « + » | Deux choix : départ direct (KM) et avec variateur (DRIV) ; celui des réglages de base en tête, « par défaut » | Décidé | 21/10/2026 |
| Coudes des sorties d'un même départ | Coude commun à toutes les sorties d'un même canal : 20 px avant l'arrivée la plus proche | Décidé | 21/10/2026 |
| Réorganiser : espacement | Écarts essayés du plus aéré (50 px dans une colonne, 90 px entre colonnes) au plus serré (30 / 60) ; le premier qui tient dans 1920 × 1080 est gardé ; jamais moins de 30 px entre deux objets | Décidé | 21/10/2026 |
| Marche arrière d'office | Convoyeur (BELT) créé sur variateur (DRIV) : option « Autoriser la marche arrière » cochée d'office ; en départ direct (KM) : non | Décidé | 21/10/2026 |
| Arrivée par le milieu | Seulement si l'équipement cible a une sortie marche arrière déclarée ; marche arrière simplement autorisée → arrivée par l'arrière (affine la règle du 21/10) | À valider | 21/10/2026 |
| Ordre des départs | Flux horizontal : 1.1 (−) en bas, 1.2 (+), 1.3 (++)… au-dessus ; flux vertical : 1.2 à droite de 1.1. Croisements imposés par cet ordre acceptés (renuméroter pour les éviter), jamais deux traits superposés | Décidé | 21/10/2026 |
| Boucle par la marche arrière | Un circuit qui passe par une sortie AR (088 AR → 091 → 092 → 086) est une boucle : ↺ sur le lien de retour, et gros ↺ là où il rejoint son arrivée. Le lien de retour reste plein (le pointillé est réservé à l'AR) | Proposé | 21/10/2026 |
| Choix du canal en tirant un trait | Libellé « Canal n » affiché seulement si la cible a plusieurs canaux | Décidé | 21/10/2026 |
| Étiquette des sorties (remplace la précédente) | 2 ou 3 sorties sur un canal : − (S1), + (S2), ++ (S3), précédé du canal si plusieurs canaux (1−, 1+, 1++) ; une seule : rien ou le numéro du canal ; dès 4 sorties : 1.1, 1.2, 1.3, 1.4… ; « AR » en marche arrière | Décidé | 21/10/2026 |
| Départ des canaux à plusieurs sorties | 28 px de ligne droite avant tout coude ou croisement (place des étiquettes) | Décidé | 21/10/2026 |
| Repère de boucle | Un seul ↺, même taille partout, au milieu de l'avant-dernier segment du trait de retour, décalé sur le côté (la flèche reste visible) | Décidé | 21/10/2026 |
| Étiquettes (compléments) | Signes − / + en gras ; dès 4 sorties, la négative est marquée 1.1(−) ; étiquettes dessinées par-dessus les traits | Décidé | 21/10/2026 |
| Bande des canaux | Équipement multicanal : écart entre axes de canaux = 10 px par sortie (20 px minimum), la forme s'épaissit d'autant | Décidé | 21/10/2026 |
| Départ droit sous les étiquettes | 28 px pour un départ horizontal, 16 px pour un départ vertical (étiquette à côté du trait) | Décidé | 21/10/2026 |
| Espacement des départs | Place d'une étiquette entre deux départs : 12 px en flux horizontal (étiquettes empilées), 20 px en flux vertical (côte à côte) ; la forme s'épaissit d'autant ; toutes les étiquettes sur une rangée, dans l'ordre des départs | Décidé | 21/10/2026 |
| Double-clic sur un équipement | Fiche fermée : l'ouvre ; fiche ouverte : renomme le repère client sur place (Entrée valide, Échap annule) | Décidé | 21/10/2026 |
| Équipements proches face à face | Départ droit et approche se partagent la place ; jamais de trait en diagonale | Décidé | 21/10/2026 |
| Largeur des canaux | Chaque canal a la place de ses propres départs (un canal à 3 sorties s'élargit, son voisin à 1 sortie non) ; cas courant inchangé (axes tous les 20 px) | Décidé | 21/10/2026 |
| Canal 1 | Toujours à gauche dans le sens du flux : en haut (flux →), à droite (flux ↓), en bas (flux ←), à gauche (flux ↑) | Décidé | 21/10/2026 |
| Forme « carte » (machines) | Réduite de 64×32 à 56×24 : même épaisseur que le convoyeur | Décidé | 21/10/2026 |
| « + » de sortie | Même taille et même distance pour tous, symétriques d'un canal à l'autre | Décidé | 21/10/2026 |
| Sorties sœurs | Jamais de croisement à moins de 28 px de l'équipement (zone des étiquettes) | Décidé | 21/10/2026 |
| Boucle | Calculée par canal : boucle si la matière revient dans un canal où elle est déjà passée ; revenir dans un autre canal du même équipement n'en est pas une | Décidé | 21/10/2026 |
| Retour de boucle (remplace le repère précédent) | Trait en pointillé rond (style A), ↺ dans l'étiquette de départ comme « AR » ; plus de gros ↺ au milieu du trait | Décidé | 21/10/2026 |
| Familles du matériel générique | 5 familles : Convoyage, Séparation, Dosage, Broyage/divers, Stockage. Répartition PROVISOIRE (écluse rotative et alimentateur en Convoyage, ouvreuse de sac en Dosage, air / analyse / électrique en Broyage/divers) : à reprendre depuis une colonne de la liste HG | À fournir (liste HG) | 21/10/2026 |
| Sorties − / + | Réservées aux machines de Séparation. Ailleurs (convoyeur…) toutes les sorties sont principales (deux tapis en sortie coupent le flux en deux) : numérotées 1, 2… (1.2 en multicanal), sans − / + ni « 1.4 » | Décidé | 21/10/2026 |
| Étiquette marche arrière | Même étiquette qu'en marche avant (1, 2… ou − / +) ; « AR » écrit à part sur le trait pointillé, au milieu de son plus long segment | Décidé | 21/10/2026 |
