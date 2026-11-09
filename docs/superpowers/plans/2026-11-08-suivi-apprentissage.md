# Plan 3c : suivi, mémoire pseudonymisée, apprentissage

Spec : `docs/superpowers/specs/2026-11-08-suivi-apprentissage-design.md`. Node ≥ 22, `node:test`, `yaml`, pas de nouvelle dépendance. TDD ; `npm test` vert et `npm run check` 0 erreur à chaque tâche.

## Contraintes globales

- Ne jamais lire `.env`. Aucune valeur pii ni id de société en clair dans les vues, journaux, rapports.
- Moteur `core/*.js` : scripts vm partagés ; plus petit changement possible ; commentaires YAML conservés.
- Réutiliser `server/app.mjs`, `tools/espace.mjs`, `tools/apprendre.mjs`, `tools/memoire.mjs`, `server/agent/*`.

### Task 1 : opération `question` (moteur et agent)

`core/calque.js` (et validation partagée dans le moteur) : opération `question` selon la spec §1 ; validation dans `erreurModif`/`erreursModifs` ; application idempotente dans `appliquerCalque` (id `qN` suivant, `suivi: true`) ; `entreeReponse` accepte l'opération dans une saisie `interpretation` ; garde pii existante (`piiFuites`) étendue au texte de la question. `server/agent/outils.mjs` : `PARAM_OPS` et `decrire` acceptent `question` (« Je vous poserai ensuite : … ») ; `SYSTEME` de `interpreter.mjs` mentionne que `question` n'est admise que pour un doute que la réponse ouvre vraiment. `server/agent/maquette-outils.mjs` : rien à changer si `ecrire_dataset` couvre déjà les questions. Tests : `tests/question-suivi.test.mjs` (validation, application, idempotence, plafond de 3, pii, rejeu du registre, interprétation de bout en bout avec faux LLM, effet affiché).

### Task 2 : mémoire pseudonymisée

`tools/memoire.mjs` : `pseudonyme(sel, societe)`, lecture du sel (`TREDUNION_SEL` puis `<memoire>/.sel` créé en 600 s'il manque), comparaisons compatibles clair/pseudonyme, comptage de valeurs distinctes. `tools/apprendre.mjs` : n'écrit que la forme `p:`. `tools/atelier.mjs` : `npm run memoire -- --pseudonymiser` (migration unique idempotente) ; ajouter le script dans `package.json`. Les vues (`anonymiser` de `server/app.mjs`, `memoireColonne`, `memoireComptes`) continuent d'afficher des comptes anonymes ; vérifier qu'aucun chemin d'affichage ne montre un hash ni un id de société à un adhérent ; le moteur (`core/hypotheses.js`, confiance calculée) doit continuer à fonctionner avec les deux formes. Tests : `tests/memoire-pseudo.test.mjs` (déterminisme, sel absent → créé, migration idempotente, lecture compatible, confiance inchangée, anonymisation des vues, droits du fichier `.sel`).

### Task 3 : aperçu et application de l'apprentissage (serveur)

`tools/espace.mjs` : `apercuApprentissage()` (appelle `apprendre` sans écrire, renvoie les faits sans société en clair) et `appliquerApprentissage()` (refuse s'il reste des erreurs de spec ; écrit `comptes.yml` et `colonnes.yml` via `ecrireMemoire`). `server/app.mjs` : `POST /api/apprendre` (admin seul, origine, 409 si un clic est en cours sur le serveur, 400 si erreurs de spec, journal `.atelier/apprentissage.jsonl` sans contenu de données), et `vue.apprentissage` (admin : `{faits:[…]}` aperçu, calculé à la demande avec cache court) dans `/api/state`. Événement SSE `apprentissage` à la fin. Tests : `tests/serveur-apprendre.test.mjs` (modèle `tests/serveur-maquette.test.mjs`, `tests/aide/multi.mjs`) : droits, aperçu sans écriture, application, double clic, origine, erreurs de spec, mémoire temporaire via `TREDUNION_MEMOIRE`.

### Task 4 : vue admin et documentation

`viewer/ui.js`, `viewer/style.css`, `viewer/boot.js` si besoin : bloc « Mémoire commune » dans l'onglet admin avec « N hypothèses tranchées à apprendre », liste, bouton « Appliquer à la mémoire », résultat ; rendu de « Je vous poserai ensuite : … » dans `.qcomp` ; texte serveur via `esc()`. `AGENTS.md`, `README.md`, `deploy/LISEZMOI.md` : la plateforme est le parcours principal ; `/seance` et `/apprendre` restent en mode local ; opération `question` ; sel et pseudonymisation (sauvegarder `.sel` avec la mémoire, ne jamais le versionner) ; `npm run memoire -- --pseudonymiser`. Tests : `tests/vue-apprentissage.test.mjs`, `tests/deploy.test.mjs`. Vérification à l'écran au navigateur Cursor : adhérents de démonstration (`ADHERENTS_ROOT=/tmp/adh-demo COMPTES_FILE=/tmp/adh-demo/comptes.json node tools/atelier.mjs exemple --multi`), mémoire temporaire, faux LLM avec une proposition de `question` ; vérifier suivi proposé puis ajouté après « C'est bien ça », bloc d'apprentissage, clic, console sans violation CSP ; 1440 px puis `Emulation.clearDeviceMetricsOverride` ; tout arrêter et supprimer les dossiers temporaires.

## Auto-revue

- Couverture de la spec : §1 (T1), §2 (T2), §3 (T3, T4), §4 (T4), §5 (tests de chaque tâche).
- Ordre : T1 → T2 → T3 → T4 ; T1 et T2 sont indépendantes (parallélisables).
- Revues : sécurité sur T2 et T3 (pseudonymisation, droits, écriture de la mémoire commune), puis revue finale.
