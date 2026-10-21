# Journal des décisions de cadrage

Décisions prises par Alex (ALH) au fil de trois sessions avec Claude, dans l'ordre chronologique. Quand une décision récente contredit une ancienne, **la plus récente l'emporte** (ex. le phasage « automate d'abord, Unified ensuite » du 6/10 est remplacé le 16/10 par une génération simultanée ; l'Excel d'entrée du 6/10 est remplacé par l'éditeur PID comme saisie unique).

## Session du 6 octobre 2026 — vision, modèle de données, structure du programme

- Besoin de départ : un assistant qui exécute TIA Openness, couplé à Claude, pour ne plus faire les copier-coller à la main dans TIA Portal (TIA V20 ou plus). Premier besoin : dupliquer / instancier en série (DB d'instance + appels d'un FB type EQ_FB_Main, multi-instances, copie de blocs avec renommage, idem côté WinCC Unified).
- Vision en 3 étages : (1) socle — les entrées génèrent 80-90 % du programme automate ; (2) génération du WinCC Unified à partir du même standard ; (3) les 10 % spécifiques, à partir d'une analyse fonctionnelle. Construire l'étage 1 d'abord et le faire marcher sur un cas réel.
- Validation stricte de l'entrée : on ne génère rien tant que l'entrée n'est pas nickel ; rapport en français clair, ligne par ligne, à renvoyer à la personne qui a fourni le document.
- Reprise : synchronisation intelligente sur re-génération — inchangé → rien ; nouveau → ajouté ; modifié → mis à jour et tracé. Un rapport distinct pour l'automaticien liste toutes les actions, équipement par équipement.
- Versioning : en fin de génération, résumé de tout ce qui a été instancié avec la version de chaque bloc (V01.00.00) ; état « sur tel site, tel bloc en telle version » collable dans la liste SharePoint.
- Nommage : le référentiel vit dans les listes SharePoint (liste des HG, liste des HS avec conventions). L'outil ne doit pas inventer le nommage.
- Architecture à 3 couches : EQ (ex. tapis « 24A ») → HG (hardware génériques : BELT, DRIV ou KM, SWDI, QM, LT…) → HS (hardware spécifique). Le HG est la couche standard, invariante, qui remonte en supervision ; le HS est le traducteur vers le matériel réel.
- Convention : EQ = « 24A » ; HG = `<EQ>_<TYPE><nn>`, TYPE 4 lettres max (DRIV, ESTO, QM) → `24A_DRIV01`, `24A_ESTO02` ; HS = `<HG>_<FabricantModèle>` camel case sans underscore → `24A_DRIV01_SiemensG120C`.
- Variables mappées sur le HS, préfixées par son nom (`24A_QM01_Ready`). Le jeu fonctionnel est défini par le type de HG ; la structure réelle dépend du HS (câblé TOR → vraie E/S ; Profinet → trame `24A_QM01_IOExchangeInput`, Ready devient un bit dedans).
- Choix du HS par listes déroulantes alimentées par le SharePoint, filtrées par type de HG : le chargé d'affaires ne peut pas inventer.
- Principe clé : l'interface HG↔HS est un contrat fixe, déjà géré dans les blocs d'Alex. Le HS lit les E/S réelles et alimente la structure normée du HG. Ce qui change d'un site à l'autre, c'est essentiellement le contenu des HS et leur mapping d'E/S.
- Le PID (diagramme de la ligne) apporte la topologie : formes = équipements (type via légende), flèches = flux matière amont → aval ; précieux pour la marche en cascade.
- Idée validée : un éditeur de PID basé sur le standard remplace le PowerPoint libre ; dessiner la ligne crée les données. Flux réel des chargés d'affaires : 3D → PID → Excel détaillé. Le point d'entrée du système est le PID, pas le 3D (lecture IA du SolidWorks écartée).
- Modèle le plus fin : un EQ a jusqu'à 3 canaux (CH) ; un canal = une voie de matière ; sortie 1 = négative, suivantes = positives ; un trait relie une sortie d'un canal à un canal d'un autre EQ (`24A_CH01` → `24B_CH01`). Un EQ porte trois choses : ses HG, ses HS, ses canaux + sorties.
- Le PID génère HG et HS d'un coup : matériel générique par défaut, HS précisable, repli propre sur le générique si inconnu.
- Repères : un EQ peut porter deux repères (Aktid et client). Commencer avec un seul ; le double viendra.
- L'éditeur PID devient la saisie unique et génère le bilan électrique Excel en sortie. En posant un EQ, l'outil propose les HG raccordables.
- UX prioritaire : défaut intelligent, mémoire du dernier choix + « dupliquer le précédent », saisie progressive avec réponse probable présélectionnée, feedback visuel immédiat, raccourcis clavier. Le standard est toujours le chemin le plus court.
- Gestes + / − sur l'objet, sans menu : + à l'intérieur ajoute un canal ; + vers l'aval crée l'EQ suivant déjà raccordé et pré-rempli.
- Routage du schéma : moteur de layout en couches (type Sugiyama) + contraintes métier + boucles de recyclage dessinées différemment + l'utilisateur peut déplacer et verrouiller. Outil cible : ELK / elkjs.
- Adressage à deux mondes : (A) physique câblé (TOR + safety) non généré — variables sans adresse, listes à l'électricien ; (B) réseau Profinet généré — règles de rangement d'Alex (ex. G120C à partir de %I/%Q 11000), contrôle des doublons, config matérielle.
- Notion HR : UDT de configuration pour les HS complexes (trieur optique, moteur MRS SWDRN). Hiérarchie HG → HS (FB) → HR (UDT).
- Pistes à cadrer : multi-automate sur un gros site ; export du bilan vers l'électricien / commande matériel.
- Vision bout-à-bout : entrée = page HTML où l'on dessine le PID ; sortie = programme automate + config matérielle + Unified, au standard. Formats intermédiaires invisibles. Éditeur web devant + moteur local Openness derrière (Windows avec TIA).
- Premier jet sur du Siemens complet ; tous les blocs versionnés en Global Library, instanciés via Openness.
- Rôles : la librairie TIA fait foi sur le contenu technique des blocs ; le SharePoint est le catalogue métier (quels HG/HS existent, visuels, règles d'adresses, version à aller chercher). Le SharePoint alimente aussi le visuel de l'éditeur.
- Structure du programme : dossiers Main, Function, Factory, Equipment (un sous-dossier par EQ avec un FC `<EQ>_Main`) + blocs standards. FC `<EQ>_Main` : réseau 1 = HS en série ; réseau 2 = HG (chaîne cinématique de puissance via UDT : disjoncteur → ElectricalValue → variateur → Hz → SWDI → MRAS → MechanicalValue tr/min → BELT) ; réseau 3 = channels ; réseau 4 = FB EQ (modes de marche, setpoints, synthèse des HG via pattes in-out jusqu'à 23) ; réseau 5 = FU.
- Lien HS↔HG : une patte in-out du HG vient chercher une variable statique du HS.
- Règle d'or : le HG0 est toujours le HG qui touche la matière ; il définit la nature de la consigne (BELT → m/min, FAN → tr/min, trieur → recette). Les FU héritent de cette unité.
- Point de départ : un template projet TIA (arborescence + squelette), soupape de liberté pour Alex ; blocs dans la Global Library.
- Vision long terme : un agent IA d'aide à la programmation.
- Accès SharePoint en 2 temps : export Excel déposé en entrée, puis connecteur.
- Architecture en 2 parties : éditeur PID web (chargé d'affaires) qui produit le pivot ; moteur Openness local (automaticien) qui génère. Pivot = JSON (EQ, HG/HS/HR, canaux, sorties, liens), interne.
- Pour l'autonomie de Claude Code : figer tôt le format pivot ; environnement Openness ; gestion des crashs techniques ; **kit d'exemples réels** (projet TIA, extrait SharePoint, PID type).

## Session du 16 octobre 2026 — éditeur, catalogue, pivot, périmètre V1

- Deux logiciels : éditeur synoptique HTML (chargé d'affaires, sans rien installer) ; logiciel local TIA Openness (génère le programme, exporte le catalogue depuis la librairie globale).
- Catalogue régénéré automatiquement dès que le référent publie. Pour démarrer : catalogue intégré dans le HTML (plusieurs Mo OK), pas de connecteur SharePoint ni Graph.
- L'éditeur affiche la date du catalogue et un rappel de vérifier la version ; le pivot enregistre la version utilisée, vérifiée à la génération.
- Pivot par équipement : repère client (nomme les blocs TIA) + repère Aktid ; « type » = descriptif libre, la nature vient du HG0 ; pile ordonnée de HG (jusqu'à 23) ; canaux + liens ; setpoints (jusqu'à 4).
- FU : se greffent sur un setpoint et peuvent en prendre la main (PID, régression linéaire, forçages, démarrage en bypassant les asservissements) ; cascade, parallèle, bloc combiné. Dans l'éditeur : une feuille par régulation, montage no-code ; entrées choisies dans les échanges SCADA des HG. Catalogue des échanges SCADA : aujourd'hui Excel, relève de la librairie.
- Tout le monde sur TIA V20 ; rétrofit ancien migré en V20.
- Erreurs : la génération continue sans s'arrêter ; liste finale pointant l'élément en cause dans le fichier du chargé d'affaires, surligné en rouge.
- Re-génération : inchangé/nouveau/modifié ; absent → jamais supprimé d'office, liste avec choix supprimer/conserver (oui/non pour tous, au cas par cas) ; patchs partiels possibles.
- Double détection : empreinte du pivot + empreinte des blocs TIA ; conflit → le logiciel pose la question, l'automaticien choisit.
- Objectif des sessions : un cahier des charges complet ; le kit d'exemples viendra plus tard.
- Périmètre V1 : génération simultanée automate + Unified ; un équipement est créé complet (EQ + HG + HS) et ses HG visibles sont affichés dans Unified. FU en 2e temps.
- Unified V1 : synoptique reprenant le diagramme ; clic → pop-up avec les HG ; listes de textes, alarmes, variables SCADA par équipement. Une seule vue 1920×1080 ; modifier dans l'éditeur puis recharger.
- Rétrofit d'un site généré : rouvrir le pivot, modifier, re-générer. Anciens sites faits à la main (3) : backlog.
- Bilan électrique dès la V1 (les 2/3 automatisme).
- Empilement des HG régi par la liste SharePoint des supérieurs ; chaînage par flux typés ElectricalValue → MechanicalValue → m/min.
- Le chargé d'affaires indique seulement type de moteur et variateur/démarreur ; les HG électriques (Q, QM, SWDI…) sont ajoutés selon la logique SharePoint.
- Réglages de base par projet (ex. tous les variateurs = G120C), puis cas par cas sur l'équipement.
- V1 génère aussi la configuration matérielle : appareils Profinet, IP par plages réservées, raccordement à la CPU (S7-1517 ou 1515 F), liste des réseaux. Plan réseau pré-renseigné (onglet Réseau de l'éditeur, par l'automaticien ; export Visio plus tard).
- Matrice de sécurité (Excel 2 feuilles aujourd'hui) = onglet de l'éditeur ; la V1 génère le programme safety.
- V1 génère : équipements, safety, configuration matérielle, listes d'E/S (déduites des HS).

## Session du 19 octobre 2026 — safety, channels, pilote, moyens, spécifiques

- Safety : un bloc safety avec FB Safety Input (instances par type d'entrée ESTO / SG / porte), FB Safety Loop (série ladder par boucle), FB Safety Output (synthèse des boucles par sortie).
- Matrice : feuille 1 entrées × boucles (400A AU générale, 400B accès trieur optique, 400C accès sous cabine) ; feuille 2 actionneurs × boucles. Le PL est une propriété de la boucle, sans effet sur la génération.
- Échange standard ↔ safety : FC pré-safety (→ DB Data to Safety) et FC post-safety, cyclique 100 ms.
- Sorties safety : bits %Q vers contacteurs de sécu (24 V / 400 V de sécu) ou PROFIsafe direct (variateurs).
- HG d'entrée de sécu : HS déporté côté safety. DRIV avec safety : HS non-safety (G120C) + HS safety (FBS). C'est le HS safety qui dit comment l'actionneur est coupé ; pas de colonne technique dans la matrice.
- Relais/contacteurs de sécu en sortie Q : HG rattachés à un EQ armoire « no action » (localisation, repère, alarmes). PROFIsafe : rattaché à l'équipement.
- Structure FC équipement : réseau 1 HS, réseau 2 HG, réseau 3 CH.
- Channels : 1 à 3 par EQ ; jusqu'à 6 sorties avant et 6 arrière par canal ; une sortie se connecte sur le canal d'un autre EQ ; c'est par ces liens que les asservissements sont gérés. Les CH échangent via des UDT channel standard déjà définis : le générateur ne fait que câbler.
- Dans l'éditeur, les « + » = sorties des canaux (avant / arrière) ; le « + » intérieur ajoute un canal.
- Représentation visuelle (cercles vs rectangles, flux qui remonte) et placement automatique : difficiles, non prioritaires. Alignement et espacement : primordiaux en V1.
- Cas pilote : site de test 100 % standard couvrant ~tous les HG et cas de figure. Critère : un clic → Unified et automate compilent et démarrent, cycle en simulation.
- Gain : un site standard = 2 à 3 mois d'automaticien, l'essentiel en préparation des entrées (bilan électrique, matrice safety mal faite, organigramme réseau) ; le code est du montage de Lego. Responsabilités : matrice = chargé d'affaires (pré-remplie), réseau = automaticien.
- Moyens : Alex seul, un mois (20 jours), standards figés.
- Pré-remplissage de la matrice : feuille 1 depuis les HG safety du PID, feuille 2 depuis les équipements du PID ; le chargé d'affaires crée les colonnes et coche.
- Forme des équipements : la géométrie ne porte aucune info ; chaque sortie est un objet nommé du pivot. First channel coché automatiquement si rien n'arrive dans le canal.
- Options EQ = pattes d'entrée du bloc EQ, listées depuis le catalogue : marche arrière autorisée, first channel, type bypass, bypass des asservissements au démarrage, etc.
- Nature métier choisie par le chargé d'affaires → HG0 + HG supérieurs par défaut (crible balistique → Q) ; HG de proximité ajoutables (AU, sonde).
- Spécifique : réseau FU du FC équipement (petites fonctions, jamais écrasé) ; smart régulations dans un OB dédié, un FC par régulation, en FBD/CFC (V2, vue montage des FU).
- Unified : tout existe (faceplates), tout est dynamique ; le travail = remplir les listes de textes avec les index SharePoint.
- Validation safety humaine obligatoire avant génération.
- Adressage : listing SharePoint des plages IP et %I/%Q par type de HG ; attribution + contrôle des recouvrements et réserves.
- Livrables : dossier business + cahier des charges technique (rédigés le 19/10, Word au thème Aktid le 19/10 après-midi).

## Session du 21 octobre 2026 — retours sur la maquette de l'éditeur

- Forme d'un EQ = HG principal posé en HG0 (liste HG, case « HG Principal ») ; chaque HG principal a un visuel distinct.
- Textes pour l'opérateur en français simple, terme technique en petit (Équipement EQ, Canal CH, Matériel générique HG, Matériel spécifique HS, Fonction FU) ; anglais préparé.
- Canaux : « + / − » regroupés dans un onglet posé sur l'équipement au survol, pour ne pas les confondre avec les sorties.
- « + » d'une sortie : petit menu, convoyeur par défaut, « autre » ouvre le choix de l'équipement.
- Les formes allongées suivent le sens du flux (un tapis qui descend est vertical).
- Infobulles compréhensibles par un non-technicien.
- Doublons contrôlés sur le repère client et sur le repère Aktid.
- Backlog : à terme, l'éditeur produit tous les documents de la phase REA. Il s'agit de la matrice de sécurité et du bilan électrique (vers le portail instrumentations contrôle commande), de l'AF, du schéma électrique, de l'organigramme réseau, du listing machine (ABI), de la liste des adresses IP et du manuel utilisateur.
