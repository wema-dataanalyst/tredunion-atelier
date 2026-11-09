# Plan : nouvel adhérent depuis l'admin

Spec : `docs/superpowers/specs/2026-11-08-nouvel-adherent-design.md`. Node ≥ 22, `node:test`, `yaml`, pas de dépendance nouvelle. TDD ; `npm test` vert et `npm run check` 0 erreur à chaque tâche.

## Contraintes globales

- Ne jamais lire `.env` ni `.env.exemple`. Aucun secret (mot de passe SFTP, mot de passe de compte) dans les journaux, rapports, erreurs, `/api/state`.
- Réutiliser `server/adherents.mjs` (`creerCompte`, `adherentsConnus`), la logique de `cmdReset` dans `tools/atelier.mjs` (à extraire en fonction partagée sans changer son comportement), `server/app.mjs` (route maquette, limiteurs, `corps`), `tests/aide/multi.mjs`.
- Plus petit changement possible sur l'existant.

### Task 1 : création d'un adhérent (module et route)

- `server/nouvel-adherent.mjs` : `validerNouvelAdherent(entree)` → `{ok, valeur}|{erreurs:[{champ,msg}]}` (règles de la spec, noms réservés interdits) ; `creerAdherent({racine, comptes, entree, gabarit})` : construction dans un dossier temporaire `.nouveau-<id>-<alea>` puis renommage, rollback si une étape échoue (dossier supprimé, `comptes.json` inchangé), `.env` en 600 avec valeurs entre guillemets échappées, renvoie `{id, mdp}`.
- Gabarit : extraire de `cmdReset` (`tools/atelier.mjs`) la production d'une `spec/` vide dans une fonction réutilisable (p. ex. `tools/gabarit.mjs`), `cmdReset` l'appelle ; le gabarit reprend catalogue, dimensions sans alimentation et référentiel du dépôt. `adherentsConnus` ignore les dossiers commençant par un point (déjà le cas par la regex : le vérifier).
- Route `POST /api/adherents` dans `server/app.mjs` (admin, origine, limiteur par session 10 par heure, corps 64 ko) : 201 `{id, mdp, maquette}`, 400 `{erreurs:[…]}`, 409, 429, 500 générique ; case maquette : réutiliser le démarrage de run de `/api/maquette` (extraire en fonction interne), `maquette: "lancee"|"indisponible"|"non-demandee"`. Invalider le cache d'aperçus et envoyer l'événement SSE `adherents`.
Tests (`tests/nouvel-adherent.test.mjs`, `tests/serveur-nouvel-adherent.test.mjs` avec `monter`) : voir la spec ; en particulier `check` à 0 erreur sur l'adhérent créé, connexion avec le compte créé, `.env` en 600 et valeurs avec `$`, `"`, `'`, `#` lues à l'identique par `process.loadEnvFile`, secret absent de toute réponse, journaux et `/api/state`, hostiles (`-oProxyCommand=…`, `a b`, `x\ny`, `../x`) refusés.

### Task 2 : formulaire et documentation

`viewer/ui.js`, `viewer/style.css`, `viewer/boot.js` : bouton « Nouvel adhérent » dans l'onglet Adhérents (admin seul), formulaire (identifiant proposé depuis le nom, sociétés ajoutables, bloc SFTP replié par défaut avec champ mot de passe de type `password`, case maquette), erreurs par champ, écran de résultat avec le mot de passe affiché une fois et bouton « Copier » (avertissement « il ne sera plus affiché »), liste des adhérents rafraîchie. Texte serveur via `esc()`. `deploy/LISEZMOI.md`, `README.md`, `AGENTS.md` : création depuis l'admin ; les commandes restent. Tests : `tests/vue-nouvel-adherent.test.mjs`. Vérification à l'écran avec le navigateur Cursor (GetDynamicTools namespace cursor-ide-browser) sur des dossiers temporaires (`ADHERENTS_ROOT`, `COMPTES_FILE` en /tmp), 1440 px puis `Emulation.clearDeviceMetricsOverride`, console sans violation CSP, connexion avec le compte créé, tout arrêter et supprimer.

## Auto-revue

Couverture : formulaire, création atomique, SFTP validé, compte, maquette optionnelle, docs. Ordre T1 → T2, revue sécurité après T2.
