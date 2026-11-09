# Mesures et catégories propres à l'adhérent

Date : 2026-11-08. Statut : conception à relire. Cycle 4 de la feuille de route (cycles 1 à 3 livrés : questions d'adhérent, périmètre des mesures, libellés des catégories).

## Contexte

Le dashboard pré-établi vient d'un adhérent : ses codes (`CA AFF`, `CA LOG`) et ses mesures (93 dans le catalogue). Un autre adhérent peut avoir du CA froid ou vrac que rien ne mesure. Le cycle 2 retire ce qui ne s'applique pas ; ce cycle ajoute ce qui manque : des codes catégorie nouveaux et les mesures qui les utilisent.

Contraintes : le catalogue de base est partagé et ne se modifie que sur demande explicite. Le catalogue est un texte (nom en ligne non indentée, formule indentée de 4 espaces) et `DASH_EXTRA` (`viewer/dash.js`) y ajoute déjà des mesures à l'affichage : les mesures propres à un adhérent suivent le même mécanisme.

## Décisions

- **Stockage :** `spec/mesures.yml`, catalogue d'extension par adhérent, ajouté au catalogue de base à l'affichage et dans l'export Qlik de cet adhérent.
- **Naissance :** l'agent propose d'après les réponses sur les activités et les KPI attendus ; l'adhérent peut en demander d'autres en texte libre.
- **Formules :** gabarits fermés (`somme`, `ratio`, `ecart`), jamais de formule libre.
- **Codes nouveaux :** l'adhérent les valide, avec la mesure qui les utilise, en une question.
- **Règle d'`AGENTS.md` :** « ajoute un code seulement si Michel le valide » devient « seul l'adhérent valide un code nouveau ; Michel garde la main sur le catalogue de base et sur l'apprentissage vers la mémoire commune ».

## Le fichier `spec/mesures.yml`

```yaml
# Mesures et codes catégorie propres à cet adhérent, par proposition
propositions:
  - id: p1
    titre: "Souhaitez-vous suivre séparément le chiffre d'affaires du froid ?"
    contexte: "Votre comptabilité distingue une activité transport sous température dirigée."
    codes: [{cod: CA FROID, lib: "Chiffre d'affaires froid"}]
    mesures:
      - gabarit: somme
        nom: CA froid
        categories: [CA FROID]
        periodes: [reel, m1, n1, budget]
      - gabarit: ratio
        nom: "% froid du CA"
        num: CA froid
        den: CA Réel
    feuille: "Mes indicateurs"
    hypothese: {source: agent, preuves: ["..."], question: "...", valide: false, refuse: false}
```

**Gabarits** (le texte généré suit la syntaxe du catalogue de base, relue sur « CA Réel », « CA Réel M-1 », « CA Réel N-1 ») :

- `somme` : `categories` (codes du référentiel ou de la proposition), `periodes` parmi `reel` (nom `<nom>`, formule à trois niveaux mois/année/année max avec `$(vSET_M)`, `$(vMaxAnneeVar)`, `$(vMaxAnnee)`, champ `MontantReel`), `m1` (`<nom> M-1`, `$(vSET_M-1)`), `n1` (`<nom> N-1`, `vSET_N-1`, `vMaxAnneeVar-1`, `vMaxAnnee-1`), `budget` (`Budget <nom>`, champ `BudgetNextN`, mêmes variables que `n1`, convention budget de l'année N portée par N-1). Le filtre est `[%COD_CATEGORIE] = {'A','B'}`.
- `ratio` : `num` et `den`, noms de mesures (de base, ou de la proposition) ; formule `([num] / [den])`.
- `ecart` : `a` et `b`, noms de mesures ; formule `([a] - [b])`.

Un nom de mesure ne doit pas exister déjà (base ou autre proposition). `feuille` : nom de la feuille du dashboard où poser une tuile par mesure ; absent, « Mes indicateurs ».

**États d'une proposition**

- **Proposée :** rien ne change (ni catégories, ni catalogue, ni dashboard).
- **Validée (`valide: true`) :** les codes entrent dans `st.categories` (avec `lib` et marqueur `ajoute: true`), les mesures générées s'ajoutent au catalogue affiché et à l'export Qlik de l'adhérent, la feuille apparaît dans le dashboard.
- **Refusée :** comme proposée.
- **Réponse :** opération `valider` existante, cible `mesures:<id>` (comme `perimetre:g1`).
- **Question de l'adhérent :** `titre` et `contexte` en langage d'exploitant ; une seule question pour codes, flux et mesures.

## Flux et codes

Un code nouveau n'a de lignes dans FAITS que si un flux l'alimente. Le flux est écrit normalement (`spec/flux/*.yml`, avec son hypothèse) par la maquette. Pour que `check` n'alerte pas sur un code absent du référentiel, les codes d'une proposition (quel que soit son état) sont comptés comme admis par `check` ; en revanche ni les mesures ni le dashboard n'en dépendent tant que la proposition n'est pas validée. Un flux dont le code vient d'une proposition non validée est signalé dans la fiche de séance (« en attente de validation de p1 »).

## D'où viennent les propositions

**Maquette** (`server/agent/maquette-agent.mjs`) : une boucle après les libellés. L'agent lit les réponses de l'adhérent sur les activités (`projet#q1`) et les KPI attendus ; sans réponse, il ne propose rien. Outil `ecrire_proposition` (`maquette-outils.mjs`, `specs.mjs`), garde-fous :

- gabarit connu, noms de mesures uniques, références à des mesures ou catégories existantes ou de la proposition ;
- code nouveau : majuscules, chiffres, espaces, 3 à 20 caractères, absent du référentiel ;
- au plus 8 mesures et 3 codes par proposition, au plus 5 propositions ouvertes ;
- preuves obligatoires, `valide: false` et `refuse: false` forcés, jamais de réécriture d'une proposition tranchée ;
- aucune valeur pii.

Sans LLM : rien n'est écrit. Relance : une proposition tranchée n'est pas touchée.

**Texte libre de l'adhérent** (`server/agent/interpreter.mjs`) : l'agent d'interprétation peut produire une opération `mesure` avec la même structure (`valeur` = une proposition). Elle va au registre `spec/reponses.yml` et n'est appliquée qu'avec « C'est bien ça » ; le moteur applique alors la proposition comme validée par l'adhérent (`origine: client`). Le moteur fusionne propositions du fichier et du registre, la dernière entrée d'un même id l'emportant.

## Le moteur

- `tools/espace.mjs` charge `spec/mesures.yml` (absent : liste vide, aucun changement).
- `core/model.js` : `st.mesuresAdherent` ; génération du texte du catalogue d'extension (une fonction pure par gabarit) ; `CAT()` ajoute ce texte au catalogue de base pour les propositions validées ; couverture et mesures hors périmètre s'appliquent aux nouvelles mesures comme aux autres.
- `core/hypotheses.js`, `core/calque.js`, `core/questions.js` : cible `mesures:<id>`, lot `adherent`.
- `core/check.js` : gabarit inconnu, nom en double, référence inconnue, code déjà au référentiel, texte généré refusé par l'analyseur.
- `viewer/dash.js` : feuille de l'adhérent générée depuis les mesures validées (une tuile par mesure, `reel` en grand, `m1`/`n1`/`budget` en comparaison).
- Export Qlik (`core/model.js`) : le fichier de mesures de l'adhérent contient base + extension ; le catalogue de base n'est pas modifié.

## Tests

- Gabarits : chaque gabarit génère un texte que `analyseCatalogue` accepte ; `somme` reproduit à l'identique la structure de « CA Réel », « M-1 », « N-1 » (avec un autre code).
- États : proposée ou refusée sans effet ; validée ajoute codes, mesures, feuille ; couverture recalculée.
- `ecrire_proposition` : refuse code existant, gabarit inconnu, nom en double, référence inconnue, sans preuves ; force `valide: false`.
- Sans LLM : aucune proposition. Relance idempotente.
- Réponse de bout en bout : « oui » écrit `valider` sur `mesures:p1`.
- Texte libre : l'opération `mesure` du registre est appliquée comme validée.
- `check` : code nouveau admis, flux en attente signalé.
- Un adhérent sans `mesures.yml` se comporte exactement comme avant.

## Documentation

`AGENTS.md` (format de `mesures.yml`, cible `mesures:<id>`, opération `mesure`, règle des codes nouveaux), `.cursor/rules/spec-format.mdc`, prompt de la maquette, `deploy/LISEZMOI.md` si l'étape y figure.

## Hors périmètre

Formules libres, modification du catalogue de base, renommage des mesures de base selon les activités (cycle 5), question « KPI attendus » détaillée (sujets CA, résultat, masse salariale, parc, carburant, budget : cycle de questions d'adhérent à suivre).
