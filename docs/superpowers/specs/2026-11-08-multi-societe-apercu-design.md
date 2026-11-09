# Multi-société (collecte SFTP) et aperçu des données dans chaque question

Date : 2026-11-08. Décisions de Michel : un seul accès SFTP par adhérent, un sous-dossier par société quand il y en a plusieurs ; aperçu masqué des colonnes personnelles pour l'adhérent comme pour l'admin.

## A. Collecte SFTP par société

- Une société : `SFTP_DIR` téléchargé tel quel (comportement actuel).
- Plusieurs sociétés dans `spec/projet.yml` : pour la société `s`, la collecte télécharge `SFTP_DIR/<id de s>` vers `data/raw/<s>/`. Sous-dossier absent : erreur claire « sous-dossier <s> introuvable dans <dossier> » ; la maquette s'arrête sur cette société (comportement d'échec existant).
- `tools/atelier.mjs` (`cmdCollecte`) lit `projet.yml` pour décider ; `tools/collecte.mjs` reçoit le dossier distant résolu (pas de concaténation libre : l'id de société est déjà validé `^[a-z0-9_-]+$`).
- Formulaire « Nouvel adhérent » : texte d'aide sous « Dossier distant » dès qu'il y a plus d'une société (« un sous-dossier par identifiant de société »). Docs : `deploy/LISEZMOI.md`, `README.md`, `AGENTS.md`.

## B. Aperçu des données à droite de chaque question

- `GET /api/apercu-question?id=<dataset>#<qN>` (adhérent de la session, ou admin avec `?adherent=`) renvoie `{dataset, societe, total, colonnes:[{name, pii, concerne}], lignes:[[…]]}` : 10 lignes au plus. Les valeurs des colonnes `pii: true` sont remplacées par « ••• » côté serveur ; aucune valeur personnelle ne sort. Valeurs tronquées à 80 caractères.
- Dataset de la question : celui de la question de dataset ; le dataset du flux pour une hypothèse de flux ; les deux datasets d'un contrôle (liste de `{dataset…}`) ; aucun pour un fichier non lu (`{aucun:true, raison}`). Colonnes concernées : celles de l'élément de la question (`dataset.colonne`, `flux:<id>`, contrôle `a/b`), placées en premier et surlignées ; 8 colonnes affichées au plus, défilement horizontal.
- Identifiant de question validé (existe dans la liste des questions de l'espace), sinon 404 ; réponse en JSON `no-store`.
- Mise en page (`viewer/ui.js`, `viewer/style.css`) : au-dessus de 1100 px, la carte de question est en deux colonnes, formulaire à gauche et panneau « Données concernées » à droite (sticky) ; en dessous, panneau replié sous la carte. Chargement à l'ouverture de la carte, cache par question, texte serveur via `esc()`. Mode local (`npm run serve`) : route équivalente.

## Tests et vérification

Collecte avec faux `sftp` (une société, plusieurs sociétés, sous-dossier absent). Aperçu : pii masquée dans la réponse, dataset introuvable, question inconnue 404, droits (adhérent vs autre adhérent), tailles, flux et contrôles. Vue : structure à deux colonnes. Vérification à l'écran en 1440 px.

## Hors périmètre

SFTP différent par société, aperçu du silver ou du gold, édition des données.
