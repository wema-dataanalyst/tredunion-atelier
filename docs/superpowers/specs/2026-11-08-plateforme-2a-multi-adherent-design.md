# Sous-projet 2a : serveur multi-adhérent, connexion, isolation

Suite de `2026-11-08-plateforme-reponses-client-design.md` (section Plateforme). 2a livre ce qui est démontrable en local avec deux adhérents A et B. 2b (file au-delà de l'ordre simple, build automatique, vue admin avec avancement, surbrillance des tuiles, VPS et Caddy) viendra ensuite.

## Dossiers et comptes

- Racine `adherents/<id>/` (variable `ADHERENTS_ROOT`) : `spec/`, `data/`, `generated/`, comme aujourd'hui.
- `comptes.json` hors des dossiers adhérents (variable `COMPTES_FILE`) : liste de `{id, role: adherent|admin, nom, mdp}`, mot de passe haché en scrypt avec sel. Pour un adhérent, `id` est l'identifiant du dossier.
- `npm run compte -- --adherent <id>` crée ou remplace le compte, génère un mot de passe aléatoire et l'affiche une seule fois. `--admin <nom>` crée un compte administrateur.
- `npm run exemple -- --multi` crée deux adhérents fictifs A et B (copies de l'exemple, noms distincts) et leurs comptes.

## Code

- Nouveau module `tools/espace.mjs` : `ouvrirEspace(racine)` renvoie `{loadState, evaluate, repondre, ajouterAuRegistre, viewerHtml}` liés à cette racine. Il remplace les constantes globales `P`/`A` de `tools/atelier.mjs` pour ces fonctions.
- La CLI et `npm run serve` utilisent `ouvrirEspace(ROOT)` : comportement inchangé, sans connexion.
- `server/` :
  - `auth.mjs` : hachage scrypt, comparaison à temps constant, sessions en mémoire (jeton aléatoire de 32 octets, expiration 12 h), limitation des tentatives (5 échecs par identifiant et par IP sur 10 min, puis 429).
  - `adherents.mjs` : `adherentsConnus()` lit `ADHERENTS_ROOT` ; `racineDe(id)` refuse tout id absent de la liste ou non conforme à `^[a-z0-9_-]{1,40}$`.
  - `app.mjs` : routes HTTP, un espace par adhérent mis en cache, temps réel filtré par adhérent. Lancé par `npm run serveur` (variables `PORT`, `COOKIE_SECURE=1`, `TRUST_PROXY=1` derrière un proxy : l'IP cliente est alors lue dans `X-Forwarded-For`).

## Routes

| Route | Accès | Rôle |
|---|---|---|
| `GET /connexion`, `POST /api/connexion` | public | page et envoi identifiant + mot de passe ; cookie de session |
| `POST /api/deconnexion` | session | ferme la session |
| `GET /` | session | vue de l'espace de l'adhérent (admin : `?adherent=<id>`, sélecteur) |
| `GET /api/state`, `GET /events` | session | état et flux temps réel de l'adhérent de la session |
| `POST /api/reponse` | session adhérent ou admin | comme en local, sur l'espace de la session |
| autres écritures du viewer (disposition du schéma…) | admin | refusées (403) aux adhérents |

Sans session : `/` redirige vers `/connexion`, `/api/*` répond 401.

## Sécurité

- L'adhérent vient de la session ; aucun paramètre d'adresse ou de corps ne le choisit (sauf `?adherent=` pour l'admin, validé par `racineDe`).
- Cookie `HttpOnly`, `SameSite=Strict`, `Secure` si `COOKIE_SECURE=1` (derrière HTTPS).
- Les POST exigent un en-tête `Origin` absent ou égal à l'hôte de la requête (refus 403 sinon).
- Le registre s'écrit de façon atomique (fichier temporaire puis renommage). `repondre` est synchrone : dans un processus unique, les écritures d'un même adhérent sont déjà sérialisées.
- Messages de connexion identiques pour identifiant inconnu et mot de passe faux.

## Vue

- Page de connexion aux couleurs WeMa.
- Vue adhérent : onglets Questions et Dashboard seulement ; barre latérale avec le nom de l'adhérent à la place du titre de la spec ; pas de schéma, de fichiers générés, de journal ni de chips de sociétés techniques.
- Vue admin : tous les onglets et un sélecteur d'adhérent.
- Le rôle et le nom sont fournis au navigateur par `/api/state` (`vue: {role, nom, adherents}`).

## Tests (`node:test`)

- hachage et vérification ; sessions et expiration ;
- limitation des tentatives (429 au 6e échec) ;
- sans session : 401 / redirection ;
- isolation : A ne lit ni n'écrit chez B, même avec `?adherent=B` ou un id de chemin (`../`) ;
- adhérent refusé sur les écritures admin ;
- POST d'une autre origine refusé ;
- deux réponses simultanées d'un même adhérent : deux entrées intactes au registre ;
- effet d'une réponse identique à celui du serveur local.

## Hors périmètre 2a

Build automatique, vue admin avec avancement, surbrillance des tuiles, déploiement VPS/Caddy, agent.
