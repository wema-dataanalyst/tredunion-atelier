# Atelier silver → gold · Tredunion

Un dépôt par adhérent. Pendant la visio, l'agent de Cursor complète la spec question par question (`spec/*.yml`). La prévisualisation se recharge à chaque modification de fichier : schéma des datasets, couverture des mesures du dashboard, feuilles du dashboard recalculées sur les données de l'adhérent. En fin de séance, `npm run build` produit le projet dbt, le script de chargement Qlik et les contrats ODCS.

## Installation (une fois)

Node 20 ou plus.

```bash
npm install
npm run exemple      # installe l'adhérent fictif Kessler-Rhin pour s'entraîner
npm run serve        # http://localhost:4321
npm run exemple -- --multi   # deux adhérents fictifs (alpha, beta) sous adherents/, avec comptes
npm run serveur      # plateforme avec connexion, http://localhost:4400
```

Dans Cursor, pour garder la prévisualisation à côté du chat : `Ctrl+Shift+P` → **Simple Browser: Show** → `http://localhost:4321`.

## Parcours principal : la plateforme

`npm run serveur` : l'adhérent répond dans l'onglet Questions (avec interprétation), l'admin lance la maquette et applique l'apprentissage à la mémoire commune d'un clic (bloc « Mémoire commune »). Les commandes `/seance` et `/apprendre` ci-dessous restent pour le mode local, secondaire.

La mémoire commune stocke des identifiants de société pseudonymisés (`p:` + HMAC). Le sel est `TREDUNION_SEL` ou `$TREDUNION_MEMOIRE/.sel` : le sauvegarder avec la mémoire, ne jamais le versionner. Migration des anciennes entrées : `npm run memoire -- --pseudonymiser`.

## Pour un adhérent réel (mode local)

1. Copier ce dépôt sous `tredunion-<adherent>`. Lancer `npm run reset -- --force` (garde le référentiel, le catalogue et les dimensions).
2. Renseigner l'adhérent et ses filiales dans `spec/projet.yml`.
3. Déposer les exports dans `data/raw/<societe>/` (ou les récupérer avec `npm run collecte` : avec plusieurs sociétés, un sous-dossier du dossier SFTP par identifiant de société), puis `npm run normaliser` les écrit en CSV dans `data/bronze/<societe>/` (dossiers exclus de git).
4. Dans le chat Cursor : `/nouveau-dataset data/bronze/<societe>/<fichier>.csv` pour chaque export, avant la séance.
5. En séance : `/seance`, lot par lot (ou `/question-suivante` pour une question isolée). Utiliser `/alimenter` quand les datasets sont compris, et `/couverture` pour faire le point.
6. En fin de séance : `/livrer`.

## Maquette d'avant-séance

Sans l'adhérent, l'agent produit une première version du dashboard. Chaque déduction est une hypothèse tracée, et la séance ne sert plus qu'à valider la fiche `generated/fiche_seance.md`.

1. Créer `.env` depuis `.env.exemple` (identifiants SFTP de l'adhérent, chemin de la mémoire commune).
2. Déclarer la société dans `spec/projet.yml`.
3. Dans le chat Cursor : `/maquette <societe>`.
4. En séance : valider la fiche, point par point.
5. Après la séance : `/apprendre`.

## Commandes de l'agent (`.cursor/commands`)

| Commande | Usage |
|---|---|
| `/question-suivante [dataset#id]` | Choisit la question qui débloque le plus de mesures, la présente, attend la réponse, met la spec à jour |
| `/nouveau-dataset <csv>` | Profile un export et prépare ses questions |
| `/alimenter` | Propose les flux vers FAITS qui débloquent le plus de mesures |
| `/couverture` | Point d'étape : contrôle, mesures, questions |
| `/livrer` | Contrôle, build, questions restantes pour l'adhérent |
| `/maquette <societe>` | Maquette d'avant-séance : collecte, lecture, hypothèses, flux, contrôles, fiche |
| `/seance` | Mode local : traite la liste unique des questions avec l'adhérent ; les réponses restent dans l'onglet « Questions » |
| `/apprendre` | Mode local : fait entrer les réponses de la séance dans la mémoire commune |

Le bouton « Copier » d'une question, dans la prévisualisation, copie la commande `/question-suivante dataset#id` à coller dans le chat.

## Organisation

```
AGENTS.md            rôle de l'agent, boucle de séance, format de la spec
.cursor/rules        règles chargées par Cursor
.cursor/commands     commandes / du chat
spec/                la spec de l'adhérent (seul dossier modifié en séance)
data/bronze/         exports de l'adhérent (hors git)
generated/           sortie de npm run build (ne pas modifier)
core/                moteur commun à la CLI et à la prévisualisation
viewer/              prévisualisation (lecture seule)
tools/atelier.mjs    CLI et serveur local
server/              plateforme multi-adhérent : connexion, sessions, un dossier par adhérent (adherents/<id>/)
adherents/, comptes.json   données et comptes de la plateforme (hors git ; `npm run compte` crée un compte)
exemple/             adhérent fictif
```

## Déploiement

Nouvel adhérent : sur la plateforme, l'admin le crée depuis l'onglet Adhérents (bouton « Nouvel adhérent » : spec vide, compte, SFTP facultatif ; mot de passe affiché une seule fois). `npm run reset` et `npm run compte` restent disponibles.

Installation sur un serveur (systemd, Caddy en HTTPS, sauvegarde quotidienne) : voir [`deploy/LISEZMOI.md`](deploy/LISEZMOI.md). Configuration de l'agent (passerelle LLM) : même guide, section « Agent (passerelle LLM) ». Maquette automatique avant séance : même guide, section « Maquette automatique » (bouton admin, SFTP dans `adherents/<id>/.env`).

## Ce que la prévisualisation calcule, et ses limites

- Le silver, les lignes FAITS et les dimensions sont calculés dans le navigateur à partir des CSV, avec les mêmes règles que le SQL généré.
- Les conditions SQL complexes, et les expressions de dimension qui joignent plusieurs datasets, ne s'appliquent qu'en SQL. `npm run check` les signale.
- Les mesures sont évaluées à partir des expressions du catalogue Qlik, sur un sous-ensemble de la syntaxe : `Sum`, `Count`, `Avg`, `If`, `GetSelectedCount`, ensembles `{<…>}`, variables de période.
- Ne sont pas reproduits :
  - `WildMatch` (mesures Logidis) ;
  - les boutons « Sélection activité » ;
  - la carte.
- Les indicateurs de feuille absents du catalogue sont reconstitués et marqués comme tels.
