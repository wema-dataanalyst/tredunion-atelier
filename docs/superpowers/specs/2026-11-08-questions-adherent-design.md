# Questions d'adhérent (niveau projet)

Date : 2026-11-08. Statut : conception à relire.

## Contexte

Les questions de la liste unique viennent de datasets, d'hypothèses, de contrôles et de fichiers non lus. Aucune ne porte sur l'adhérent lui-même : ses activités, ses KPI attendus, ses définitions de gestion (CA, résultat, masse salariale). Ces notions sont indépendantes des outils de l'adhérent (TMS, compta, paie) et ne doivent dépendre d'aucun dataset.

Le catalogue de mesures et le référentiel de catégories sont ceux d'un seul adhérent. Les adapter à chaque adhérent est découpé en cycles distincts :

1. **Questions d'adhérent** (ce document).
2. Activités et catégories propres à l'adhérent.
3. Libellés lisibles des catégories et des mesures.
4. KPI attendus et catalogue propre à l'adhérent.

Ce document ne couvre que le cycle 1 : un mécanisme générique, sans effet métier.

## Décision

Un bloc `questions:` dans `spec/projet.yml`, au même format que les questions de dataset.

```yaml
adherent: Euro Trans Chanet
societes: [...]
cases: []
questions:
  - id: q1
    text: "Activités à suivre séparément (regroupement des comptes 70x)"
    titre: "Quelles sont vos activités principales, à suivre séparément dans le tableau de bord ?"
    contexte: "Votre comptabilité distingue du transport, de l'affrètement, de la location…"
    reponse_type: libre
```

Ids : `q1`, `q2`… dans `projet.yml`. Dans la liste unique : `projet#q1`.

Approches écartées : un faux dataset « adherent » (contourne `check`, pollue le schéma) ; un fichier `spec/questions.yml` dédié (nouveau format pour un gain faible).

## Comportement

**Chargement.** `tools/espace.mjs` (construction de l'état) et `core/model.js` (normalisation) lisent `projet.questions`. Liste vide par défaut : un adhérent sans bloc ne change pas.

**Liste unique** (`core/questions.js`).
- Nouvelle source `projet`, lot `adherent`, id `projet#<id>`, `fichier: spec/projet.yml`.
- Le lot `adherent` passe en tête tant qu'il reste une question ouverte. Il ne débloque aucune mesure, le tri par impact le classerait sinon en dernier.
- Titre, contexte, `reponse_type`, `options`, `reponse_cible` : même traitement que les questions de dataset.

**Réponses.**
- Elles passent par `spec/reponses.yml` avec les opérations existantes (`noter`, `valider`, `definir`). Aucun effet métier nouveau.
- Une question est traitée dès qu'une réponse existe au registre pour son id. `done` et `answer` ne sont pas nécessaires dans le bloc.
- Le moteur n'écrit pas dans `projet.yml`.
- Une question disparue laisse sa réponse listée comme entrée « retirée » du registre, comme pour les datasets. `check` valide le bloc : id et texte présents, ids uniques.

**Hypothèses.** Pas de bloc `hypothese` sur une question d'adhérent dans ce cycle : il demanderait de modifier `core/hypotheses.js` et `porteurHypothese`. Les preuves mesurées vont dans `contexte`, en langage d'exploitant. Un cycle ultérieur pourra ajouter le bloc.

**Maquette.** Elle pourra écrire des questions d'adhérent. À vérifier au plan : le prompt de `server/agent` en dépend-il ?

**Viewer.** Libellé et pastille pour la source `projet`. Aucun autre changement attendu.

## Documentation

`AGENTS.md` (section Format de la spec) et `.cursor/rules/spec-format.mdc` décrivent le bloc. `.cursor/commands/seance.md` et `deploy/LISEZMOI.md` à vérifier.

## Tests

Dans `tests/` :
- chargement avec et sans bloc `questions:` ;
- ordre de la liste (lot `adherent` en tête, adhérent sans bloc inchangé) ;
- greffe d'une réponse et statut traitée ;
- réponse d'une question disparue listée comme retirée ;
- `check` : id manquant, texte manquant, id en double.

## Hors périmètre

Catégories propres à l'adhérent, libellés lisibles, KPI, modification de `core/` au-delà du chargement et de la liste, questions multi-société (la structure mono ou multi se lit dans la collecte SFTP).

## Premier usage

Écrire la question sur les activités d'Euro Trans Chanet dans `adherents/eurotranschanet/spec/projet.yml`, en mode `noter`.
