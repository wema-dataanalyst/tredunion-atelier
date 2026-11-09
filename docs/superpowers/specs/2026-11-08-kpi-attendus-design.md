# Cycle KPI attendus

## Contexte

L'adhérent a coché les thèmes qu'il veut suivre (cycle 5). L'agent doit maintenant lui poser des questions spécifiques pour affiner ses besoins, basées sur les données disponibles pour ces thèmes.

## Décision

L'agent génère dynamiquement les questions après que l'adhérent a coché les thèmes. Les questions dépendent des données disponibles. Les réponses créent des propositions de mesures (gabarits du cycle 4).

## Section 1 : questions types par thème

Chaque thème du dashboard a des questions types qui s'affichent quand il est coché. Les questions sont conditionnées par les données disponibles.

| Thème | Questions types | Condition |
|---|---|---|
| CA (Accueil, Général) | « Quelles activités suivre séparément ? » | Données comptables 70x présentes |
| CA (Accueil, Général) | « Quels clients ou familles de clients distinguer ? » | Colonne client dans les flux CA |
| Résultat | « Voulez-vous suivre le résultat exceptionnel à part ? » | Comptes 77/67 présents |
| Masse salariale | « Distinguez-vous intérim et CDI/CDD ? » | Données paie présentes |
| Masse salariale | « Suivez-vous les heures travaillées ? » | Colonne heures dans les données |
| Activités | « Quelles activités différenciez-vous (transport, affrètement, location…) ? » | Plusieurs codes 70x ou colonne type |
| Coûts | « Quels postes de coûts détailler (carburant, entretien, péage, assurance…) ? » | Données charges présentes |
| Coûts | « Suivez-vous les kilomètres ? » | Données télématique ou carburant avec km |

**Format.** Les questions types sont dans `core/kpi.js` (statique, pas dans spec/). Elles utilisent des fonctions de détection pour savoir si elles s'appliquent. Les conditions du tableau sont des exemples ; chaque question définit sa propre fonction de détection basée sur les flux, colonnes et codes présents.

## Section 2 : effet des réponses

Quand l'adhérent répond à une question KPI, cela déclenche des actions automatiques.

| Réponse | Effet |
|---|---|
| « Transport et affrètement séparés » | Crée deux propositions de mesures (CA transport, CA affrètement) avec leurs familles (M-1, N-1, budget) |
| « Intérim à part » | Crée les mesures Masse intérim, % intérim vs masse |
| « Carburant détaillé » | Crée les mesures Gazole, AdBlue, Coût carburant/km |
| « Oui aux kilomètres » | Active les mesures KM du catalogue (déjà présentes, mais marquées comme souhaitées) |

**Mécanique.** Chaque question KPI a un champ `propositions` qui liste les mesures à créer si la réponse est positive. Ces propositions utilisent les gabarits du cycle 4 (somme, ratio, écart). Le code n'est pas fixe : il est déduit des données (par exemple, le préfixe de compte ou la valeur d'une colonne).

**Registre.** La réponse va dans `spec/reponses.yml` avec une opération `kpi` qui active les propositions. Le moteur génère les entrées `spec/mesures.yml` correspondantes.

## Section 3 : intégration dans le parcours

- **Lot `kpi`.** Les questions KPI forment un nouveau lot, après `besoins` et avant `categories`.

- **Ordre des lots mis à jour :**
  1. `adherent` (projet#q1 : activités)
  2. `profil` / `hypothese` (par dataset)
  3. `besoins` (thèmes à cocher)
  4. `kpi` (questions types par thème coché) — **nouveau**
  5. `categories` (libellés)
  6. `mesures` (propositions adhérent)

- **Affichage.** Les questions KPI apparaissent dans l'onglet Questions, regroupées sous « Vos indicateurs ». Chaque question montre le thème concerné et les données qui la déclenchent.

- **Dépendance aux thèmes.** Une question KPI n'apparaît que si le thème correspondant est coché. Si l'adhérent décoche un thème, les questions KPI de ce thème disparaissent (et les propositions créées sont désactivées).

## Section 4 : garde-fous et validation

- **`check` sur les questions KPI.**
  - Info si une question KPI n'a pas de réponse et que le thème est coché depuis plus de 24h.
  - Alerte si une proposition créée par une réponse KPI n'a pas de flux qui l'alimente.

- **Cohérence thème/KPI.**
  - Si un thème est décoché, les réponses KPI de ce thème restent dans le registre mais les propositions générées passent en `refuse: true`.
  - Si le thème est recoché, les propositions reviennent.

- **Pas de doublon.**
  - Une question KPI déjà répondue ne réapparaît pas.
  - Si les données changent (nouveau flux, nouvelle colonne), une nouvelle question peut apparaître pour le même thème.

## Fichiers impactés

| Fichier | Modification |
|---|---|
| `core/kpi.js` | Nouveau fichier : questions types, conditions, propositions |
| `core/questions.js` | Lot `kpi`, génération dynamique des questions |
| `core/calque.js` | Opération `kpi` dans le registre |
| `core/check.js` | Validations KPI |
| `viewer/ui.js` | Affichage des questions KPI |
| `AGENTS.md` | Documentation du lot `kpi` et de l'opération |

## Hors périmètre

- Questions KPI écrites manuellement dans `spec/` (tout est généré depuis `core/kpi.js`).
- Nouveaux gabarits de mesures (on réutilise somme, ratio, écart du cycle 4).
