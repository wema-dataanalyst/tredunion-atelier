# Sous-projet 2b : build automatique, vue admin, surbrillance, déploiement

Suite de `2026-11-08-plateforme-2a-multi-adherent-design.md`. 2b fait vivre la plateforme : les livrables se régénèrent seuls, Michel suit l'avancement des adhérents, l'adhérent voit son tableau de bord bouger, et les fichiers de déploiement sont prêts.

## 1. Build automatique

- `espace.construire()` : `check` puis, sans erreur, `buildFiles()`. Les fichiers sont écrits dans `generated.tmp-<pid>/`, puis échangés avec `generated/` par renommage (l'ancien dossier est supprimé après). En cas d'erreur de `check`, `generated/` n'est pas touché.
- `adherents/<id>/.atelier/statut.json` (écriture atomique, fusionné avec l'existant) : `tentative` (date), `ok`, `dernierBuild` (date du dernier succès, conservée en cas d'échec), `fichiers`, `nbErreurs`, `erreurs` (20 au plus : `{fichier, msg}`).
- `npm run build` utilise `construire()` : même résultat, affichage inchangé.
- Après une réponse enregistrée, le serveur déclenche `construire()` en tâche de fond ; la réponse HTTP ne l'attend pas. À la fin, il envoie l'événement temps réel `statut`.

## 2. File par adhérent

`server/file.mjs` : `creerFile()` renvoie `{declencher(cle, tache), attendre(cle)}`.
- Les tâches d'une même clé (l'adhérent) s'exécutent l'une après l'autre.
- Regroupement : si une tâche est en cours, un nouveau déclenchement n'en planifie qu'une seule de plus, quel que soit leur nombre.
- Une tâche qui échoue est journalisée et n'arrête pas la file.
- Clés différentes : indépendantes. Les tâches du sous-projet 3 (maquette, agent) s'y brancheront.

## 3. Vue admin

- `espace.apercu()` : `{nom, questions: {traitees, total}, mesures: {ok, total}, erreurs, dernierBuild, buildOk, libres, nonLus}`. `libres` = questions dont la dernière réponse du client n'a produit que `noter` avec un texte (en attente d'interprétation) ; `nonLus` = fichiers non lus.
- `espace.livrables()` → `[{path, taille}]` de `generated/` ; `espace.lireLivrable(path)` → contenu ou `null` si le chemin n'est pas dans cette liste.
- Routes (admin seulement, 403 sinon) :
  - `GET /api/adherents` : `[{id, ...apercu}]` pour tous les adhérents.
  - `GET /api/livrables?adherent=<id>` : liste des fichiers.
  - `GET /api/livrable?adherent=<id>&f=<chemin>` : téléchargement (`content-disposition: attachment`, `text/plain; charset=utf-8`), 404 si le chemin n'est pas dans la liste.
- Onglet « Adhérents » (admin seulement) : une ligne par adhérent (questions traitées sur total, mesures alimentées sur total avec barre, erreurs, dernier build, réponses libres à reprendre, fichiers non lus), lien « Ouvrir » (`/?adherent=<id>`), liste des livrables téléchargeables un par un. Rechargé à l'événement `statut`.

## 4. Surbrillance des tuiles du dashboard

- Chaque tuile (`kcell`) porte `data-k="<feuille>|<libellé>"`.
- Au rendu du dashboard, le navigateur compare les valeurs affichées à celles du rendu précédent pour les mêmes filtres (feuille, année, mois, filiale, véhicule, chauffeur). Les tuiles dont la valeur change reçoivent la classe `flash` (anneau doré, 3 s).
- Le dashboard est rendu à chaque rechargement de l'état, même si l'onglet n'est pas ouvert, pour avoir une base de comparaison. Si l'adhérent n'est pas sur l'onglet, les clés changées sont mémorisées 60 s et la surbrillance s'applique à l'ouverture de l'onglet.
- `prefers-reduced-motion` : pas d'animation (règle `.flash` existante).

## 5. Déploiement (fichiers seulement, rien n'est exécuté)

`deploy/` : `Caddyfile` (proxy HTTPS vers 127.0.0.1:4400), `tredunion.service` (systemd : `ADHERENTS_ROOT`, `COMPTES_FILE`, `PORT`, `COOKIE_SECURE=1`, `TRUST_PROXY=1`, utilisateur dédié, droits d'écriture limités à `/srv/tredunion`), `sauvegarde.sh` (archive quotidienne de `adherents/` et `comptes.json`, 14 jours conservés), `LISEZMOI.md` (installation pas à pas, création des comptes, mise à jour, restauration).

## Tests (`node:test`)

- `construire` : succès (fichiers, statut, aucun résidu `.tmp`/`.old`) ; échec de `check` : `generated/` intact, statut `ok: false` avec `dernierBuild` conservé.
- `apercu`, `livrables`, `lireLivrable` (refuse `../` et les chemins hors liste).
- File : ordre, regroupement, échec sans blocage, clés indépendantes.
- Serveur : build lancé après `POST /api/reponse` chez le bon adhérent seulement ; `/api/adherents`, `/api/livrables`, `/api/livrable` refusés à un adhérent (403) et sans session (401) ; téléchargement hors liste 404.
- Vue : tests statiques (onglet admin masqué pour un adhérent, `data-k` présent, route d'événement `statut`) et vérification à l'écran.

## Hors périmètre

SFTP, maquette automatique, agent et interprétation du texte libre (sous-projet 3). Révocation des sessions à la rotation d'un compte. Verrou entre la CLI et le serveur sur un même dossier.
