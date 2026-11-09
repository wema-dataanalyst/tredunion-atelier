# Nouvel adhérent depuis l'admin

Date : 2026-11-08. Décision de Michel : l'admin crée un adhérent de A à Z depuis la plateforme, sans commande ; les identifiants SFTP existent déjà et sont saisis à la création ; rien de plus après la création (ni régénération de mot de passe, ni modification du SFTP, ni désactivation).

## Formulaire (onglet Adhérents, admin)

Bouton « Nouvel adhérent ». Champs : nom de l'adhérent ; identifiant (proposé depuis le nom, `^[a-z0-9_-]{1,40}$`, modifiable, refusé s'il existe) ; sociétés (au moins une, par défaut `{id: identifiant, name: nom}` ; chacune : `id` `^[a-z0-9_-]{1,40}$` unique, `name`, `source` facultatif) ; SFTP facultatif (serveur, port 22 par défaut, utilisateur, mot de passe, dossier distant) ; case « Lancer la maquette après la création ».

## Serveur

`POST /api/adherents` (admin seul, contrôle d'origine, limiteur par session, corps 64 ko au plus) :
1. Valide tous les champs (voir sécurité).
2. Construit `adherents/<id>/` dans un dossier temporaire voisin (`.nouveau-<id>-<alea>`, ignoré par `adherentsConnus`), puis le renomme : création tout ou rien.
   - `spec/` : gabarit vide produit par la même logique que `npm run reset` (catalogue, dimensions sans alimentation, référentiel repris du dépôt ; `projet.yml` avec adhérent et sociétés saisis ; datasets, flux, relations, journal, contrôles vides).
   - `.env` (droits 600) avec `SFTP_HOST`, `SFTP_PORT`, `SFTP_USER`, `SFTP_PASSWORD`, `SFTP_DIR`, seulement si le SFTP est renseigné.
   - `data/raw/<société>/` et `data/bronze/<société>/` vides, `.atelier/`.
3. Crée le compte adhérent (`creerCompte`, mot de passe aléatoire). Si l'écriture de `comptes.json` échoue, le dossier est supprimé.
4. Répond 201 `{id, mdp, maquette: "lancee"|"indisponible"|"non-demandee"}`. Le mot de passe n'est dans aucune autre réponse ni aucun journal.
5. Si la case est cochée et que la passerelle LLM est configurée, démarre la maquette par le même mécanisme que `POST /api/maquette` (mêmes verrous). Sinon la création réussit et la réponse l'indique.
Erreurs : 400 (champ invalide, avec le nom du champ), 403, 409 (identifiant déjà pris), 429, 500 générique. Le message d'erreur ne contient jamais un secret.

## Sécurité

- Le mot de passe SFTP n'est jamais renvoyé, journalisé, ni exposé par `/api/state`, `/api/adherents` ou une erreur ; le processus enfant de la maquette le lit via `.env` (déjà isolé en 3b).
- Les valeurs SFTP finissent en arguments de la commande `sftp` ou dans son script : serveur `^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$` ; port entier 1 à 65535 ; utilisateur `^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$` ; dossier sans guillemet, retour à la ligne ni caractère de contrôle, 200 caractères au plus ; mot de passe sans retour à la ligne ni caractère de contrôle, 1 à 200 caractères. Dans le `.env`, chaque valeur est écrite entre guillemets avec échappement, sans interprétation de `$`.
- Identifiants (adhérent et sociétés) : liste blanche stricte, pas de nom réservé (`.`, `..`, `admin…`, `exemple`), aucune traversée de chemin.
- Aucun nouveau secret dans `comptes.json` : seuls les hachages existants.

## Tests

Création complète (dossier, `spec/` valide, `npm run check` à 0 erreur sur l'adhérent créé, `.env` en 600, compte utilisable pour se connecter, mot de passe affiché une fois), rollback si le compte échoue, doublon 409, non-admin 403, origine refusée, valeurs hostiles refusées, `.env` sans interprétation de `$` ni de guillemets, secret absent des réponses et journaux, maquette `indisponible` sans LLM, vue du formulaire.

## Hors périmètre

Régénération de mot de passe, modification du SFTP, désactivation, suppression, test de connexion SFTP.
