# Questions de séance : liste unique, réponses conservées

## Objectif

Pendant la visio avec l'adhérent, traiter toutes les questions depuis un seul endroit. Elles sont aujourd'hui dispersées : questions des datasets, questions des hypothèses (flux, colonnes, règles, dimensions), contrôles en écart, fichiers non lus, valeurs hors recette. Une question traitée reste visible avec sa réponse : les réponses de l'adhérent sont la valeur de la séance et ne doivent jamais disparaître.

## Décisions de Michel

- Les réponses se donnent dans le chat Cursor : l'agent pose une question à la fois et applique.
- Toutes les questions sont listées, classées par impact : d'abord celles qui touchent un chiffre du dashboard, le reste en fin de lot.
- Relance (`check`, `build`, effet mesuré) par lot.
- Les questions sont dans un onglet de la prévisualisation ; les réponses s'y greffent quand elles sont traitées, sans jamais disparaître.

## Liste unique

`listeQuestions()` (nouveau `core/questions.js`, script classique) rassemble, sans rien recopier :

| Source | Identifiant | Ouverte tant que | Réponse lue dans |
|---|---|---|---|
| profil (questions des datasets) | `<dataset>#<qN>` | `done` faux | `answer` |
| hypothèse | sa cible (`flux:f5`, `tms_akanea.montant`, `flux:f1#7061`…) | ni `valide` ni `refuse` et confiance non haute | `reponse` (nouveau champ du bloc `hypothese`) |
| contrôle | `controle:<id>` | statut différent de ok et pas de `reponse` | `reponse` (nouveau champ du contrôle) |
| fichier non lu | `non_lu:<fichier>` | absent du registre | registre |
| valeurs hors recette | `hors_recette:<dataset>` | absent du registre | registre |

Chaque question porte : `id`, `source`, `lot`, `element` (dataset.colonne, flux, contrôle…), `fichier`, `question`, `mesures` (mesures du catalogue qui en dépendent), `statut` (ouverte ou traitée), `reponse`, `date`, `effet`.

- **Lot** : le domaine du dataset concerné (préfixe de l'id : `tms`, `comptabilite`, `carburant`, `paie`, `entretien`…), `dimensions` pour les dimensions, `fichiers` pour les non lus.
- **Impact** : nombre de mesures du catalogue dont les cibles (calculées comme pour les badges) contiennent l'élément. Une question de profil vise la colonne nommée en tête de son texte (`colonne : …`), sinon le dataset entier.
- **Ordre** : lots par impact ouvert décroissant ; dans un lot, les ouvertes d'abord (impact décroissant, puis hypothèse, contrôle, profil, hors recette, non lu), puis les traitées (les plus récentes d'abord).

## Registre des réponses

`spec/reponses.yml`, liste ajoutée au fil de l'eau par l'agent, jamais réécrite :

```yaml
- id: flux:f5
  question: "Tous vos pleins passent-ils par ces cartes ?"
  element: flux:f5
  reponse: "Oui, sauf les pleins de dépannage payés en carte bancaire, environ 2 000 € par an."
  date: 2026-11-07T10:42:00
  effet: "flux f5 confirmé (valide: true) ; question ajoutée pour les pleins CB"
```

Une question est traitée si sa source le dit **ou** si le registre contient son id. Une entrée du registre dont la question n'existe plus dans la spec (hypothèse remplacée, flux réécrit) reste listée comme traitée, avec la mention « retirée de la spec ». Le registre est la mémoire de séance de l'adhérent.

## Vues

- **Onglet « Questions »** : par lot, avec « N traitées sur M ». Filtre À traiter, Traitées, Toutes (À traiter par défaut). Chaque question montre son id, sa source, son nombre de mesures, son élément et son fichier. Une question traitée montre sa réponse, sa date et son effet, greffés sous elle.
- **`npm run questions`** : même liste, ouvertes par défaut, `--toutes`, `--lot <lot>`, `--suivante` (détail du profil pour une question de dataset).
- La fiche de séance (`generated/fiche_seance.md`) ne change pas dans ce chantier.

## Procédure `/seance`

1. `npm run questions` : choisir le lot ouvert de plus fort impact (ou celui que Michel demande).
2. Une question à la fois, en 4 lignes au plus : question, données, hypothèse, effet de la réponse. Attendre la réponse.
3. Écrire la réponse à sa source (`answer` et `done: true`, ou `valide`/`refuse` et `reponse`, ou `reponse` du contrôle), modifier la spec en conséquence, puis ajouter l'entrée au registre (`effet` = ce qui a changé).
4. Fin du lot : `npm run check`, `npm run build`, une entrée de journal pour le lot, effet en deux lignes (lignes FAITS, mesures alimentées avant → après). Lot suivant.

## Données personnelles

Les textes de questions de profil recopient des valeurs fréquentes, y compris pour des colonnes marquées `pii` après le profilage. La garde de `check` s'étend aux textes et réponses des questions de datasets, aux `reponse` des hypothèses et des contrôles, et au registre. Les questions existantes qui citent des valeurs personnelles sont réécrites en nombres de valeurs.

## Contrôles et tests

- `check` : erreur si `spec/reponses.yml` n'est pas une liste ; alerte pour une entrée sans `id` ou sans `reponse`.
- Tests `node:test` de `listeQuestions` : sources et identifiants, statut via la source et via le registre, entrée orpheline conservée, lot, impact, ordre ; garde pii étendue.

## Hors périmètre

Feuille de réponses à remplir, refonte de la fiche de séance, apprentissage depuis le registre.
