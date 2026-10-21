# L'éditeur PID peut-il remplacer WinCC Unified ?

Analyse du 21/10/2026 — à relire avec Alex. Les faits sur Unified sont ceux de la gamme Siemens connue à ce jour ; à recouper avec la documentation V20 et les contrats clients avant toute décision.

## En bref

**Non, pas en V1, et sans doute pas comme remplacement complet.** L'éditeur dessine déjà ce que montrerait un synoptique (formes, sens du flux, sorties, machines posées sur les tapis), mais un SCADA de production, c'est surtout tout ce qu'on ne voit pas : la liaison temps réel avec l'automate, les alarmes, l'historique, les droits, la sécurité, la tenue dans le temps et la garantie. Unified apporte tout cela, certifié et supporté par Siemens, et le standard Aktid y a déjà ses faceplates.

**La bonne cible** : garder l'éditeur comme *outil de conception* qui génère Unified (c'est le projet), et étudier plus tard un **visualiseur web léger, en lecture seule**, à partir du même dessin (suivi de ligne, démo, maintenance à distance), sans prétendre piloter l'installation.

## Ce que l'éditeur sait déjà faire

- Dessiner le synoptique au standard : familles, marqueurs de technologie, canaux, sorties, machines posées sur les tapis, à l'échelle de l'écran Unified (1920 × 1080).
- Porter la structure du site dans le pivot : équipements, piles HG / HS, liens canal → canal, options.
- Tourner dans un simple navigateur, en un seul fichier HTML, hors ligne.

C'est l'équivalent de l'*éditeur graphique* d'un SCADA. Il manque tout le *runtime*.

## Ce qu'il faudrait construire pour remplacer Unified

| Fonction | Unified (aujourd'hui) | À construire dans l'éditeur | Ampleur |
|---|---|---|---|
| Liaison temps réel avec la S7-1500 | Connexion native (S7 / OPC UA), cycles, qualité des valeurs | Serveur passerelle (OPC UA client sur la CPU), abonnement aux variables, reconnexion, diagnostic | Lourde |
| Animation des faceplates (états, défauts, modes) | Faceplates de la librairie Aktid, déjà faites | Réécrire chaque faceplate en web, à l'identique du standard | Lourde, et à refaire à chaque évolution du standard |
| Commandes opérateur (marche, arrêt, consignes, acquittement) | Natives, avec confirmations et droits | Écriture sécurisée vers l'automate, confirmations, verrous, traçabilité | Lourde, sensible |
| Alarmes (apparition, acquittement, historique, classes) | Gestion d'alarmes complète, alarmes automate (ProDiag / Program_Alarm) | Moteur d'alarmes, persistance, horodatage, filtres | Lourde |
| Historique, courbes (tag logging) | Archivage intégré, courbes | Base de données temporelle, rétention, export | Moyenne à lourde |
| Utilisateurs, rôles, audit | Gestion des utilisateurs Siemens, audit (option) | Authentification, rôles, journal d'audit | Moyenne |
| Sécurité (réseau usine, IEC 62443) | Produit durci, correctifs Siemens | Durcissement, mises à jour, tests d'intrusion, responsabilité Aktid | Lourde, continue |
| Disponibilité (redondance, reprise) | Options de redondance | Architecture redondante à concevoir | Lourde |
| Pupitres de terrain (Unified Comfort Panels) | Runtime embarqué sur les pupitres | Impossible tel quel : il faudrait un navigateur sur le pupitre, ou un autre matériel | Bloquant pour les pupitres |
| Support, garantie, acceptation client | Siemens, connu des clients et des intégrateurs | Aktid seul responsable, à faire accepter client par client | Risque commercial |

## Les vrais arguments pour (à ne pas balayer)

- **Licences** : Unified se paie (runtime, PowerTags, clients) ; un visualiseur maison n'a pas de coût par variable.
- **Maîtrise** : on fait évoluer l'outil à notre rythme, sans attendre une version Siemens.
- **Cohérence** : le même dessin sert à la conception, à la génération et à l'exploitation ; aucune ressaisie.
- **Accès** : un navigateur suffit pour voir la ligne (bureau, téléphone, à distance).

## Les arguments contre (décisifs aujourd'hui)

1. **Ampleur** : remplacer le runtime, c'est un produit à part entière (plusieurs personnes pendant des années). Les 20 jours du projet couvrent à peine l'éditeur et la génération.
2. **Responsabilité** : piloter une installation depuis un logiciel maison engage Aktid sur la sûreté de fonctionnement et la cybersécurité, sans l'appui d'un éditeur reconnu.
3. **Standard Aktid** : les faceplates, alarmes et index Unified sont le standard livré aux clients ; les dupliquer en web crée deux standards à maintenir.
4. **Clients** : beaucoup imposent Siemens de bout en bout ; un SCADA maison serait un frein à la vente.
5. **Pupitres** : les Comfort Panels exécutent Unified, pas une page web maison.

## Ce que je recommande

1. **Maintenant (V1)** : l'éditeur reste l'outil de conception ; la génération produit le projet Unified (synoptique, listes de textes, alarmes, pop-ups). C'est déjà le critère de réussite du cas pilote.
2. **V2, à étudier** : un **visualiseur web en lecture seule**, branché en OPC UA sur la CPU (ou sur Unified), qui réutilise le dessin de l'éditeur pour afficher les états (marche, défaut, bourrage) sans aucune commande. Utile pour la démo commerciale, le suivi à distance, la maintenance. Risque faible, valeur visible.
3. **À ne pas faire sans étude dédiée** : commandes opérateur, alarmes de production, historique réglementaire hors Unified.

## Questions à trancher avec Alex

- Le besoin derrière « remplacer Unified » : coût des licences, liberté graphique, accès à distance, autre ?
- Les clients accepteraient-ils un visualiseur Aktid à côté d'Unified ? Et à la place ?
- Unified garde-t-il la main sur tout ce qui commande, alarme et archive (recommandé) ?
- Si un visualiseur V2 est retenu : OPC UA sur la CPU ou via Unified, et quel hébergement (poste client, serveur Aktid) ?
