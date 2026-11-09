# 3b : maquette automatique déclenchée par l'admin

Date : 2026-11-08. Suite de 3a (agent d'interprétation). Décisions de Michel : déclenchement par un bouton admin, maquette complète, écriture directe dans `spec/` avec copie préalable et restauration si `check` échoue.

## But

Quand un adhérent a déposé ses exports sur le SFTP, l'admin clique « Lancer la maquette » dans la vue admin. La plateforme collecte, normalise, profile, puis un agent documente les datasets, écrit flux et contrôles (chaque déduction en bloc `hypothese`), vérifie, construit. Résultat : l'adhérent trouve à sa connexion une spec pré-remplie et des questions de validation, au lieu de la séance en visio. C'est l'équivalent serveur de `.cursor/commands/maquette.md`.

## Parcours

1. Admin, vue adhérent : bouton « Lancer la maquette » (désactivé pendant un run, ou si l'agent est indisponible).
2. `POST /api/maquette?adherent=<id>` (admin seulement, contrôle d'origine, 429 si un run est déjà en cours pour cet adhérent, 503 sans passerelle LLM) répond 202 `{ok:true}`.
3. Le run avance en tâche de fond ; l'état est écrit dans `<adherent>/.atelier/maquette.json` et diffusé par SSE (`event: maquette`). `/api/state` expose `vue.maquette` (admin) : `{etape, debut, fin, ok, erreurs, resume}`.
4. À la fin, l'admin voit le résumé : mesures alimentées avant → après, hypothèses par confiance, contrôles en écart, chemin de la fiche.

## Étapes

| # | Étape | Mécanisme |
|---|---|---|
| 1 | Copie de sécurité | `spec/` → `.atelier/spec-avant/` (remplace la précédente) |
| 2 | Collecte, normalisation, profil | Processus enfant `node tools/atelier.mjs maquette --societe <s>` pour chaque société de `spec/projet.yml`, avec `ATELIER_ROOT=<dossier adhérent>`. `--sans-collecte` sauf si `<dossier adhérent>/.env` existe (identifiants SFTP de l'adhérent, jamais lus par l'agent ni par Michel). Délai 15 min, sortie tronquée gardée en cas d'erreur sans les secrets. |
| 3 | Documentation des datasets | Agent, une boucle d'outils par dataset créé ou sans `desc` |
| 4 | Flux et contrôles | Agent, une boucle par catégorie à débloquer (ordre de `npm run couverture`, au plus 8 flux) puis une boucle contrôles |
| 5 | Vérification | `check` ; si erreurs : restauration de `spec/` depuis la copie, `ok:false`, erreurs dans le statut |
| 6 | Construction | `construire()` existant, entrée de `spec/journal.yml` (effet avant → après), `apprendre` non lancé (3c) |

`tools/atelier.mjs` charge aussi `<ATELIER_ROOT>/.env` s'il existe, en plus de `<app>/.env` (changement minimal, `.env` jamais lu par l'agent).

## Agent d'écriture

Réutilise `server/agent/llm.mjs` et `boucle.mjs`. Budgets propres à la maquette : 12 tours par boucle, 60 s par boucle, plafond de 400 000 jetons par run, un seul run à la fois par adhérent et au plus 2 sur le serveur.

Prompt système : les règles de `.cursor/commands/maquette.md` et d'AGENTS.md (aucune déduction sans bloc `hypothese` avec `source`, `preuves` mesurées, `question` en langage d'exploitant ; codes de catégorie pris dans `referentiel.yml` ; jamais de valeur `pii` ; mémoire commune d'abord, `source: memoire:<fichier>/<id>`).

Outils (tous limités à l'espace de l'adhérent, validation avant écriture, résultat d'écriture = `{ok}` ou `{erreurs}`) :

- `lire_dataset(id)` : profil sans valeurs `pii`, relations, flux liés, questions automatiques.
- `lire_memoire(colonne)` et `lire_comptes(prefixe)` : entrées anonymisées.
- `lire_couverture()` : catégories manquantes classées par mesures débloquées, catégories du référentiel.
- `ecrire_dataset({id, desc, grain, colonnes[], regles[], questions[]})` : fusionne dans `spec/datasets/<id>.yml` (colonnes : `desc`, `role`, `type`, `pii`, `codes`, `format`, `decimalComma`, `hypothese`). Garde commentaires et ordre des clés (API `Document` de `yaml`). Les questions de profil auxquelles une hypothèse répond sont retirées ; les autres reçoivent `reponse_type`.
- `ecrire_flux({id, ...})`, `ecrire_controle({id, ...})`, `ecrire_relation({id, ...})` : un fichier ou une entrée, schéma de AGENTS.md ; `cod` refusé s'il n'est pas dans le référentiel.
- `terminer({resume})`.

Garde-fous communs aux écritures : id sûr (`^[a-z0-9_]+$`), écriture seulement sous `spec/`, aucun chemin fourni par le modèle, taille maximale par écriture (20 ko), refus si un texte contient une valeur d'une colonne `pii` du dataset concerné (comparaison sur les valeurs distinctes), `hypothese.valide` et `hypothese.refuse` forcés à `false` (seul l'adhérent valide).

## Sécurité et robustesse

- Route réservée à l'admin ; l'adhérent n'a aucun moyen de déclencher ni de lire le statut détaillé.
- Les données de l'adhérent sont des données, pas des instructions (rappelé dans le prompt) ; les écritures passent toutes par la validation, et `check` global clôt le run avec restauration en cas d'erreur.
- Le journal `.atelier/maquette.jsonl` consigne date, étape, tours, jetons, issue, sans contenu de données.
- Les erreurs du processus enfant et de la passerelle sont nettoyées des secrets (`Bearer …`, mot de passe SFTP) avant d'être stockées ou affichées.
- Redémarrage du serveur pendant un run : au démarrage, un statut `en cours` périmé est marqué `interrompu` et `spec/` est restaurée depuis la copie.

## Vue admin

Dans `viewer/ui.js` (onglet admin existant) : bouton, étape courante (« Collecte… », « Lecture des exports… », « Documentation des datasets 3/9… », « Flux et contrôles… », « Vérification… »), résultat (succès : résumé ; échec : erreurs, spec restaurée). Mise à jour par l'événement SSE `maquette`.

## Tests

- Faux LLM scénarisé de bout en bout sur une copie de l'adhérent d'exemple (datasets déjà là, `--sans-collecte`).
- Écritures : commentaires et ordre conservés, pii refusée, code hors référentiel refusé, `valide` forcé à `false`, id et chemin malveillants refusés.
- Run : succès (statut, journal, build), `check` en échec → restauration à l'identique, double lancement → 429, non-admin → 403, sans LLM → 503, plafond de jetons → échec propre, redémarrage → `interrompu`.
- Processus enfant : variables d'environnement et sortie sans secret.

## Hors périmètre

Sonde automatique du SFTP, relance de questions et `apprendre` automatique (3c), retrait de `/seance`.
