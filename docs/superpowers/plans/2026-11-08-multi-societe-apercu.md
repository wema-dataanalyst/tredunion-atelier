# Plan : multi-société et aperçu des questions

Spec : `docs/superpowers/specs/2026-11-08-multi-societe-apercu-design.md`. TDD ; `npm test` vert et `npm run check` 0 erreur à chaque tâche.

## Contraintes globales

- Ne jamais lire `.env` ni `.env.exemple`. Aucune valeur de colonne `pii` hors serveur, ni dans les réponses, journaux, rapports.
- Plus petit changement possible ; réutiliser `tools/collecte.mjs`, `tools/espace.mjs`, `server/app.mjs`, `viewer/ui.js`, `tests/aide/multi.mjs`. Tests sur dossiers temporaires nettoyés (`t.after`).

### Task 1 : collecte par société (sous-dossiers)

`tools/collecte.mjs` et `cmdCollecte` dans `tools/atelier.mjs` selon la spec A (le script `sftp` reste testable avec un faux exécutable via une injection de commande ou une variable, sans réseau). Texte d'aide du formulaire dans `viewer/ui.js` (une ligne, seulement quand il y a plus d'une société) ; docs. Tests : `tests/collecte-multi.test.mjs` (une société → dossier tel quel ; plusieurs → sous-dossier ; sous-dossier absent → erreur claire sans secret ; id de société hostile refusé).

### Task 2 : aperçu de question (serveur et mode local)

`espace.apercuQuestion(id)` dans `tools/espace.mjs` (dataset(s) concernés, colonnes concernées, 10 lignes, masquage `pii` côté serveur, troncature) ; route `GET /api/apercu-question` dans `server/app.mjs` (session, 404 question inconnue, `no-store`) et équivalent dans `cmdServe` de `tools/atelier.mjs`. Tests : `tests/apercu-question.test.mjs`, `tests/serveur-apercu-question.test.mjs` (pii absente de la réponse, droits, 404, flux, contrôle, fichier non lu, tailles).

### Task 3 : panneau à droite et vérification à l'écran

`viewer/ui.js`, `viewer/style.css`, `viewer/boot.js` si besoin : deux colonnes au-dessus de 1100 px, panneau sticky « Données concernées » (titre dataset · société · lignes, colonnes concernées surlignées), repli en dessous sur écran étroit ; états chargement / aucun aperçu / erreur ; `esc()` partout. Tests : `tests/vue-apercu-question.test.mjs`. Vérification à l'écran avec le navigateur Cursor (GetDynamicTools namespace cursor-ide-browser), 1440 px puis `Emulation.clearDeviceMetricsOverride`, console sans violation CSP, dossiers temporaires supprimés ; vérifier qu'une colonne pii apparaît masquée.

## Auto-revue

Couverture : A (T1), B serveur (T2), B vue (T3). Ordre T1 → T2 → T3, revue sécurité après T3.
