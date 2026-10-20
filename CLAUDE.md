# Générateur de programme TIA Portal depuis le PID — contexte projet

Ce fichier est lu automatiquement par Claude Code. Il condense trois sessions de cadrage (6, 16 et 19 octobre 2026) entre Alex (ALH, automaticien référent du standard chez Aktid) et Claude. Les documents complets sont dans `docs/`. **Avant de coder quoi que ce soit, lis `docs/01-cahier-des-charges-technique.md` en entier.**

## Le projet en une phrase

Le chargé d'affaires dessine le PID d'une ligne de tri dans un éditeur HTML, clique sur « générer », et obtient un projet TIA Portal V20 complet au standard Aktid qui compile et démarre : programme automate, programme safety, supervision WinCC Unified, configuration matérielle, listes d'E/S, bilan électrique.

## Qui fait quoi

- **Alex (ALH)** : référent standard et automaticien. Développe seul avec Claude Code, **20 jours de travail sur un mois**. Ses standards sont figés ; il sait exactement où il va. Il fournit les exemples réels et valide en fin de journée ; **il ne code pas, Claude Code code.**
- **Chargé d'affaires** : dessine le PID dans l'éditeur HTML. Pas automaticien, pas électricien : il parle métier (trieur optique, tapis, crible balistique), choisit le type de moteur et de variateur, coche la matrice de sécurité.
- **Référent standard** : publie la librairie globale TIA ; le catalogue se régénère sans action manuelle.
- **Automaticien** : complète le plan réseau, valide la safety, lance la génération, arbitre les conflits, code le spécifique.

## Architecture (deux logiciels, un pivot, un catalogue)

1. **Éditeur synoptique HTML** — un seul fichier, ouvert depuis SharePoint dans le navigateur, rien à installer. Catalogue intégré dans le HTML (plusieurs Mo, OK). Trois onglets sur le même pivot : PID, Réseau, Matrice de sécurité. Produit le **fichier pivot (JSON)**.
2. **Logiciel local Openness** — sur le poste automaticien, TIA Portal V20 + TIA Openness. Deux fonctions : exporter le catalogue depuis la librairie globale (et régénérer le HTML), générer le projet à partir d'un pivot.
3. **Catalogue** — export de la librairie TIA (source de vérité du contenu des blocs) + des listes SharePoint (catalogue métier : HG/HS existants, règles des HG supérieurs, plages d'adresses, index Unified). Daté et versionné ; le pivot mémorise la version utilisée ; écart signalé à la génération.
4. **Template projet TIA** — la génération part toujours d'un projet gabarit (arborescence, squelette) qu'Alex maîtrise ; les blocs vivent dans la **Global Library**.

Pas de connecteur SharePoint ni Microsoft Graph en V1. Tout le monde sur TIA V20 ; un rétrofit ancien migre en V20.

## Modèle de données du standard (à respecter à la lettre)

- **EQ** (équipement) : un FC par équipement, nommé par le **repère client** (ex. `24A`). Porte aussi un repère Aktid et un descriptif libre. Les armoires électriques sont des EQ « no action » (localisation, repère, alarmes).
- **HG** (hardware générique) : brique fonctionnelle invariante — BELT, OPSO, MRS, DRIV, SOFT, KM, Q, QM, SWDI, ESTO, SG, LT, WT, FAN… Pile ordonnée par EQ, **jusqu'à 23**. Code TYPE **4 lettres max**. Nommage `<EQ>_<TYPE><nn>` : `24A_DRIV01`, `24A_ESTO02`.
- **Règle d'or : le HG0 est toujours celui qui touche la matière** (BELT, FAN, crible…), jamais un DRIV ou un QM. Le HG0 fixe la nature et l'unité de la consigne (BELT → m/min, FAN → tr/min, trieur optique → recette).
- **HS** (hardware spécifique) : le bloc constructeur derrière un HG (G120C, SEW DFC, GV2…). Un HS par HG. Nommage `<HG>_<FabricantModèle>` en camel case sans underscore : `24A_DRIV01_SiemensG120C`. Variables préfixées par le HS : `24A_QM01_Ready`. Le HS absorbe toute la variété matérielle ; l'interface HG↔HS est un **contrat fixe** déjà géré dans les blocs d'Alex (pas le sujet de l'outil). Le HS porte sa liste d'IO.
- **HS safety jumeau** : un équipement avec échanges PROFIsafe a un HS non-safety (G120C) + un HS safety (FBS) appelé dans la safety. Un HG d'entrée de sécu (ESTO, SG) n'a de HS que côté safety.
- **HR** : UDT de configuration pour les HS complexes (options, puissance moteur, rapport de réduction…). HG → HS (FB) → HR (UDT).
- **CH** (canal) : un endroit où la matière vit. 1 canal par défaut, 2 si rive centrale, **3 max** (trieur optique tricanal). Chaque canal : **jusqu'à 6 sorties marche avant et 6 marche arrière** ; sortie 1 = négative, suivantes = positives. Une sortie se connecte sur le canal d'un autre EQ. Nommage `24A_CH01`. Les CH échangent via des **UDT channel standard** déjà définis : le générateur ne fait que les câbler.
- **Setpoints** : jusqu'à 4 par EQ, découlent des HG.
- **Options EQ** = pattes d'entrée du bloc EQ, listées depuis le catalogue : autorisation marche arrière (grisée si KM), first channel (coché auto si rien n'arrive dans le canal), type bypass (sens choisi en recette), bypass des asservissements au démarrage, etc.
- **FU** (fonctions) : se greffent sur un setpoint (PID, régression linéaire, forçages, combinés). **V2.** Seules les fonctions natives sont instanciées en V1.

Empilement des HG régi par la liste SharePoint des « supérieurs » (ex. BELT → MRS → DRIV/SOFT/KM → Q/QM ; SWDI possible entre KM et MRS). Chaînage par flux typés : Q/KM/DRIV → ElectricalValue (400 V, Hz) → MRS → MechanicalValue (tr/min) → BELT → m/min. Le chargé d'affaires choisit une **nature métier** ; l'éditeur pose le HG0 et les HG supérieurs par défaut.

## Structure d'un FC équipement (`<EQ>_Main`), toujours identique

1. **Réseau 1** : tous les HS (jusqu'à ~24), instanciés depuis la librairie dans la version du catalogue.
2. **Réseau 2** : tous les HG, un par HS, dans l'ordre de la pile (chaîne cinématique de puissance via UDT). Lien HS→HG : une patte in-out du HG vient chercher une variable statique du HS.
3. **Réseau 3** : les CH, avec les UDT channel câblés selon les liens du pivot (c'est là que vivent les asservissements, déjà codés dans le standard).
4. **Réseau 4** : le bloc EQ (chef d'orchestre : modes de marche, setpoints, synthèse des HG via ses pattes in-out) avec ses options renseignées.
5. **Réseau 5, dit réseau FU** : fonctions natives pilotant les setpoints. **Créé à la première génération, jamais retouché ensuite** : c'est là que l'automaticien code les petites fonctions spécifiques.

Arborescence projet : Main, Function, Factory, Equipment (un sous-dossier par EQ), + blocs standards.

## Zones que le générateur ne touche JAMAIS

- Le réseau FU de chaque FC équipement (après sa création).
- L'OB de régulations (smart régulations : un FC par régulation, en FBD/CFC) — hors V1, correspondra à la vue « montage des FU » en V2.
- Tout bloc ou réseau qu'il n'a pas créé. Les empreintes de détection de conflit ne portent que sur les réseaux 1 à 4.

## Safety

- Matrice à 2 feuilles, onglet de l'éditeur, **purement fonctionnelle** (pas de technique dedans). Feuille 1 : une ligne par entrée de sécu (`04A-8 ESTO01`, `24A-8 SG01`), une colonne par boucle (`400A` AU générale, `400B` accès trieur optique, `400C` accès sous cabine), croix = coupe. Feuille 2 : mêmes colonnes, une ligne par actionneur, croix = mis en sécurité. Lignes **pré-remplies depuis le PID** ; le chargé d'affaires crée les colonnes et coche. Le PL est une propriété de la boucle, informatif, sans effet sur la génération.
- **Validation humaine obligatoire** avant génération (lien avec l'analyse de risque) ; statut porté par le pivot.
- Code : un bloc safety cyclique (100 ms) avec **FB Safety Input** (une instance de bloc standard par entrée, selon type ESTO/SG/porte), **FB Safety Loop** (par boucle, série ladder des entrées cochées), **FB Safety Output** (par sortie, synthèse des boucles qui la coupent). Autour : **FC pré-safety** (standard → DB « Data to Safety ») et **FC post-safety** (safety → standard), bonnes pratiques Siemens.
- Comment un actionneur est coupé : déduit des HS. HS safety jumeau → PROFIsafe direct, rattaché à l'EQ. Sinon → sortie %Q vers un contacteur de sécurité (ex. Schneider CAD), HG rattaché à l'EQ armoire « no action ».

## WinCC Unified (généré dans la même passe que l'automate)

Tout existe déjà dans la librairie, faceplates comprises, tout est dynamique. Par équipement : **liste de textes** (listing des HG avec les index SharePoint — c'est le vrai travail du générateur), alarmes, variables SCADA. Synoptique : **une seule vue 1920×1080** qui respecte la disposition de l'éditeur ; clic sur un EQ → pop-up de pilotage avec ses HG. On modifie dans l'éditeur puis on régénère, pas dans Unified. La logique exacte des index sera expliquée par Alex avec le projet exemple.

## Configuration matérielle, réseau, adressage

- CPU S7-1517 ou S7-1515 F (réglages de base du projet). Appareils Profinet déclarés et raccordés selon l'onglet Réseau (armoires, switchs, sous-réseaux — renseigné **avant** la génération par l'automaticien ; remplace son Visio ; export Visio en V2).
- IP et %I/%Q attribués dans les **plages réservées par type de HG** du listing SharePoint (ex. variateurs .50 à .100 ; G120C à partir de %I/%Q 11000), avec contrôle des recouvrements et des réserves.
- Adressage physique câblé (E/S TOR + safety) : **pas généré** — variables créées sans adresse, listes données à l'électricien.
- Listes d'E/S : concaténation des IO des HS. Bilan électrique : les 2/3 « automatisme » (EQ en lignes, HG en colonnes, HS) ; le 1/3 électrique reste à l'électricien. Sortie Excel, mise en page des documents actuels.

## Erreurs, re-génération, conflits

- La génération **ne s'arrête jamais** sur une erreur individuelle : rapport final qui renvoie à l'élément en cause dans le fichier du chargé d'affaires, surligné en rouge.
- Re-génération : inchangé → rien ; nouveau → créé ; modifié → mis à jour et tracé. Absent du nouveau pivot → **jamais supprimé d'office** : liste en fin de génération, choix supprimer/conserver (oui pour tous / non pour tous / au cas par cas).
- Double empreinte : données du pivot (changements chargé d'affaires) + blocs TIA relevés à la génération (retouches automaticien). Les deux ont bougé sur le même EQ → le logiciel pose la question, l'automaticien choisit.
- Plantage technique TIA/Openness : distinct de la logique métier ; à trancher semaine 1 (le plus simple : rejouer la génération complète, idempotente par construction).
- Rapport de fin : tout ce qui a été instancié avec la version de chaque bloc (format V01.00.00), collable dans la liste SharePoint des versions.

## Éditeur HTML — UX (condition de succès : saisie par des non-spécialistes)

- Défaut intelligent : poser un EQ met la config la plus courante, utilisable telle quelle. Mémoire du dernier choix, « dupliquer le précédent ». Réglages de base par projet (ex. tous les variateurs en G120C) puis cas par cas en cliquant sur l'EQ.
- Gestes **+ / −** sur l'objet, sans menu : + à l'intérieur = ajoute un canal ; + en bord avant/arrière = une sortie du canal, cliquer crée l'EQ suivant déjà raccordé. Chaque sortie est un **objet nommé du pivot** (canal, numéro, sens) : la géométrie dessinée (rond, rectangle selon le client) ne porte aucune information ; étiquette au survol.
- **Alignement et espacement en V1** (sélection multiple, aligner, répartir) : primordial, les cercles sont toujours mal alignés. Réorganisation automatique (ELK/elkjs retenu si on le fait) : V2.
- Affiche la date du catalogue et un rappel de vérifier la version. Toujours ouvrir depuis le même dossier SharePoint.

## Cas pilote et critère de réussite (binaire)

Site de test 100 % standard, sans spécifique, couvrant ~tous les HG : équipements à plusieurs sondes et à une seule, quelques AU, une porte d'accès, asservissements, plusieurs entrées de ligne (first channel), plusieurs sorties, boucles qui rebouclent, un multicanal, une marche arrière. Réussi si : depuis le PID, un clic « générer » donne un projet TIA V20 sans intervention ; Unified compile et démarre ; l'automate compile et démarre ; en simulation, un cycle de ligne se lance en activant le bit de simulation. **Tant que ce n'est pas coché, l'outil ne sert pas sur une affaire réelle.**

## Planning (20 jours) — chaque lot a une porte

0. **Semaine 0, collecte** : kit d'entrée (`docs/04-kit-entree.md`). Sans lui, rien ne démarre.
1. **Semaine 1, socle** : figer le format pivot, export du catalogue depuis la librairie + régénération du HTML, squelette du générateur Openness sur le projet exemple. Porte : pivot figé.
2. **Semaine 2, éditeur HTML** : onglets PID / Réseau / Safety, options, alignement. Porte : un pivot complet produit sur le site de test.
3. **Semaine 3, génération automate** : FC EQ, UDT channel, bloc EQ, safety, config HW, adressage, E/S, bilan, rapport, re-génération. Porte : le programme compile.
4. **Semaine 4, Unified + pilote** : listes de textes, synoptique, pop-ups, alarmes, puis le site de test jusqu'aux quatre cases cochées.

## Règles de travail pour Claude Code

- **N'invente jamais une convention** (nommage, structure de bloc, index Unified, plages d'adresses) : elle vient de la librairie, du SharePoint ou du projet exemple. Si l'information manque, demande-la ou note-la dans `docs/05-points-ouverts.md`, ne devine pas.
- Apprends les règles sur les **exemples réels** du kit (projet TIA, listes SharePoint, PID type, matrice Excel), pas sur des suppositions.
- Le standard est toujours le chemin par défaut ; dévier demande un geste en plus.
- Code SCL généré, conventions d'Alex : entrées/sorties avec accès externe désactivé (`ExternalAccessible` / `ExternalVisible` à False) ; chaque commentaire de variable commence par l'unité entre crochets — `[ms]`, `[mm]`, `[x]` si inconnue, `[n]` pour un index ; pour un Bool, le commentaire commence par `true = ` suivi de ce que fait le bit ; boucles `FOR` uniquement (pas de REPEAT/WHILE).
- Documentation d'un bloc (à réutiliser pour chaque bloc expliqué) : encart de suivi des versions en tête (version, date, auteur, détail), résumé d'en-tête en anglais, mapping des entrées/sorties, exemples chiffrés, instanciation. Versions en majeur.mineur.correctif (V01.00.00).
- Livrables **complets et prêts à l'emploi**, pas des extraits. Alex préfère une maquette visuelle avant le code pour tout ce qui est interface.
- Langue : français, ton direct, concis.

## Points ouverts (à trancher avec les exemples en main)

Ordre d'appel des FC EQ dans l'OB ; comportement sur plantage technique ; options visibles par le chargé d'affaires vs réservées à l'automaticien ; nommage des boucles de sécurité (libre ou 400A, 400B…) ; représentation des sorties sur un EQ rond (à valider sur maquette) ; logique exacte des index Unified ; gestion multi-automate sur un gros site.

## Backlog (hors V1)

Vue de montage des FU et smart régulations ; réorganisation automatique du diagramme ; export Visio ; connecteur SharePoint/Graph ; import des 3 anciens sites faits à la main (« prise en charge », pas sûr d'être développé) ; double repère client/Aktid étendu ; agent IA d'aide à la programmation (vision long terme).

## Fichiers

- `docs/01-cahier-des-charges-technique.md` — cahier des charges complet, 19 sections, schémas dans `docs/img/`.
- `docs/02-dossier-business.md` — dossier de décision (gain : ~50 → ~10 jours par site).
- `docs/03-journal-des-decisions.md` — toutes les décisions brutes des trois sessions, dans l'ordre.
- `docs/04-kit-entree.md` — checklist des artefacts réels à fournir avant le jour 1.
- `docs/word/` — les deux documents Word au thème Aktid (versions de référence à relire).
- `editeur/` — éditeur PID (maquette cliquable V1, Vite + React + TS → un seul HTML) ; voir `editeur/README.md`. Captures dans `docs/maquette-editeur/`.
- `kit/` — artefacts réels du kit d'entrée (ex. `kit/sharepoint/Hardware Generic.csv`).
