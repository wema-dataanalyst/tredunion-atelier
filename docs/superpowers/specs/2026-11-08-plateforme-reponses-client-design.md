# Plateforme : le client répond, la spec s'écrit

## Objectif

Traiter les questions en visio n'est pas réaliste : l'adhérent n'a pas toujours la réponse, doit souvent la chercher chez des collaborateurs, et réunir les bonnes personnes prend du temps. L'application devient publique : chaque adhérent se connecte, répond aux questions à son rythme et voit aussitôt l'effet de sa réponse sur son dashboard. Il comprend le travail qui reste et se projette.

Sans le savoir, le client écrit la spec : ses réponses produisent le projet dbt, le script Qlik et les contrats ODCS. Cursor ne sert plus qu'à développer la plateforme.

## Décisions de Michel

- La réponse du client fait foi : pas de validation par WeMa, pas d'état « en attente ». Le client peut modifier sa réponse à tout moment.
- Plus de séance : maquette (automatique) → réponses du client → build (automatique).
- Réponses guidées appliquées à l'instant ; texte libre interprété par un agent, dont l'interprétation est validée par le client avant d'être appliquée.
- Un seul compte par adhérent, partagé en interne ; tout le monde voit tout.
- Données personnelles en clair dans le navigateur de l'adhérent (ce sont ses données, lui seul y accède).
- Un serveur WeMa unique (VPS existant, hors AWS), un dossier par adhérent, 10 à 50 adhérents la première année. Pas de git dans les dossiers adhérents.
- LLM via AWS Bedrock.
- Maquette lancée à la création de l'adhérent, puis à chaque nouvel export déposé sur le SFTP.

## Parcours du client

- Connexion avec l'identifiant de l'adhérent. Vue client en deux onglets : **Questions** (par lot, ordonnées par impact, « N traitées sur M ») et **Dashboard** (feuilles recalculées). Jauge permanente « N mesures sur M alimentées ». Le schéma des datasets reste réservé à l'administrateur.
- Une question montre : le texte pour un exploitant, ce que montrent les données (valeurs fréquentes, % de vides), le formulaire de son type, un lien « Autre réponse » (texte libre), un champ facultatif « Répondu par ».
- À la validation : effet affiché (« +6 mesures alimentées · CA 2025 5,86 M€ → 5,41 M€ »), tuiles du dashboard modifiées en surbrillance.
- Une question traitée montre sa réponse, sa date, son auteur facultatif et l'historique de ses réponses ; le client peut répondre à nouveau.

### Types de réponse

L'agent attribue le type en maquette (champ `reponse_type` de la question) et pré-remplit le formulaire.

| Type | Le client voit | Opérations produites |
|---|---|---|
| `confirmer` | Oui / Non + précision | `valider` (valeur true) ; Non → `valider` (false) et texte confié à l'agent |
| `codes` | Tableau code → libellé pré-rempli, case « à exclure » | `codes`, et `exclure` pour les codes cochés |
| `choix` | Une valeur parmi 2 à 5 | `definir` sur le champ désigné par l'agent |
| `exclure` | Garder / exclure les lignes (condition affichée) | `exclure` |
| `fichier` | Traiter / ignorer un fichier non lu | `fichier` |
| `libre` | Texte | Opérations proposées par l'agent, validées par le client |

Texte libre : l'agent répond « J'ai compris : … » avec la liste lisible des opérations ; boutons « C'est bien ça » (application) et « Reformuler ». Rien n'est appliqué avant l'accord du client.

## Registre appliqué

`spec/reponses.yml` reste une liste à laquelle on ajoute, jamais réécrite. Il devient le calque appliqué par le moteur sur la spec YAML.

```yaml
- id: tms_akanea#q3
  question: "statut : 4 valeurs. Que signifie chacune ?"
  reponse: "L livrée, C chargée, R refusée, A annulée (à exclure)"
  par: "Service exploitation"        # facultatif
  origine: client                    # client | agent
  date: 2026-11-12T14:03:00
  modifs:
    - {op: codes, cible: tms_akanea.statut, valeur: {L: Livrée, C: Chargée, R: Refusée, A: Annulée}}
    - {op: exclure, cible: tms_akanea, sql: "statut <> 'A'"}
  effet: "+4 mesures alimentées ; CA 2025 5,86 M€ → 5,71 M€"
```

- `origine: client` : réponse guidée ou interprétation validée par le client. `origine: agent` : écriture de l'agent hors réponse (questions de suivi).
- Opérations admises, et aucune autre :

| Op | Cible | Effet |
|---|---|---|
| `valider` | cible d'hypothèse (`flux:f5`, `ds.col`, `flux:f1#7061`…) | `valide: true` ou `refuse: true` |
| `codes` | `ds.col` | remplace `codes` de la colonne |
| `exclure` | `ds` | ajoute une règle silver (`sql` = condition des lignes gardées, comme les règles existantes ; `text`) |
| `definir` | `flux:<id>.<champ>` ou `ds.col.<champ>` | champs de flux : `valeur`, `unite`, `champ`, `filtre` ; champs de colonne : `format`, `decimalComma`, `role` |
| `fichier` | `non_lu:<fichier>` | `traiter` ou `ignorer` ; `traiter` signale le fichier dans la vue administrateur |
| `noter` | — | aucun : la réponse est enregistrée, la question est traitée |
| `question` | `ds` | ajoute une question au dataset (id suivant), avec son `reponse_type` |

- Au chargement, le moteur (`core/`) lit la spec YAML puis applique, pour chaque `id`, les `modifs` de la dernière entrée. Le navigateur, `check`, `build` et `questions` voient la même spec : l'effet affiché au client est celui que produit le build.
- Répondre à nouveau = nouvelle entrée sur le même `id` ; la plus récente l'emporte.
- Une question est traitée si sa source le dit ou si le registre contient son id (inchangé).
- Cible introuvable (flux réécrit, colonne supprimée) : alerte `check` « réponse orpheline » ; la question reste listée comme traitée avec cette mention.
- La garde pii existante s'applique au registre : les opérations ne recopient pas de valeur de colonne `pii: true`.

## Plateforme

- **Backend** : un service Node dédié, nouveau dossier `server/`, distinct de la CLI. Il sert la vue client et la vue administrateur, l'API, l'authentification, la file par adhérent, l'agent et le build automatique. Il réutilise `core/` (moteur) et les fonctions de `tools/` (collecte, normalisation, check, build) comme bibliothèques. Découpage :

| Module | Rôle |
|---|---|
| `server/app.mjs` | démarrage, routes HTTP, événements temps réel par adhérent |
| `server/auth.mjs` | comptes, hachage, sessions, limitation des tentatives |
| `server/adherents.mjs` | liste des adhérents, résolution du dossier depuis la session |
| `server/reponses.mjs` | validation des opérations, ajout au registre |
| `server/file.mjs` | file d'écritures par adhérent |
| `server/taches.mjs` | surveillance SFTP, maquette, check et build automatiques |
| `server/agent/` | boucle d'agent sur Bedrock et outils de l'agent |

  Le backend écoute derrière un proxy HTTPS (Caddy). `npm run serve` reste le serveur local de développement.
- **Stockage** : fichiers, pas de base de données. Un dossier par adhérent `/srv/tredunion/adherents/<id>/` (`spec/`, `data/`, `generated/`), même structure que le dépôt actuel. `core/`, `viewer/`, `tools/`, `server/` dans un seul dépôt git déployé sur le serveur. Sauvegarde quotidienne de `adherents/`.
- **Comptes** : `npm run compte -- --adherent <id>` crée le compte et génère le mot de passe. Fichier de comptes hors des dossiers adhérents, mots de passe hachés (scrypt). Session par cookie `HttpOnly`, `Secure`, `SameSite=Strict`. Connexion limitée en tentatives. Un compte administrateur WeMa voit tous les adhérents et la vue complète.
- **Isolation** : l'adhérent est déduit de la session, jamais de l'adresse. Un chemin de dossier n'est construit qu'à partir d'un identifiant de la liste des adhérents.
- **Écritures client** : `POST /api/reponse` (le serveur revérifie les opérations, ajoute l'entrée au registre, notifie les navigateurs de l'adhérent) et `POST /api/interpreter` (texte libre vers l'agent, renvoie les opérations proposées). Toute autre écriture (disposition du schéma…) est réservée à l'administrateur.
- **File par adhérent** : les écritures d'un même adhérent (réponses, maquette, build) passent l'une après l'autre.
- **Build automatique** : après chaque réponse, `check` puis `build` s'il n'y a pas d'erreur. Sinon les derniers livrables valides sont conservés et la vue administrateur signale l'erreur.
- **Vue administrateur** : liste des adhérents avec avancement (questions traitées, mesures alimentées), réponses non interprétées, fichiers à traiter, erreurs de `check`, téléchargement des livrables.
- **Rôle de Michel** : créer l'adhérent (compte, accès SFTP), suivre l'avancement, récupérer les livrables, reprendre à la main une réponse coincée.

## Agent serveur

Programme qui tourne sur le serveur et appelle un modèle d'IA, avec les règles d'`AGENTS.md` et le droit d'écrire seulement par les opérations admises (plus, en maquette, la création des fichiers de `spec/` comme aujourd'hui).

| Tâche | Déclencheur |
|---|---|
| Collecte SFTP, normalisation, maquette (profil, hypothèses, flux, contrôles, questions typées) | création de l'adhérent, nouvel export sur le SFTP (nouveaux fichiers seulement ; les réponses ne sont jamais touchées) |
| Interprétation d'un texte libre | `POST /api/interpreter` |
| Question de suivi quand une réponse ouvre un doute | après une réponse, opération `question` |
| Mémoire commune (`apprendre`) | hypothèse tranchée |

**LLM : AWS Bedrock.** L'agent est une boucle d'outils écrite par nous sur l'API Converse de Bedrock (appel d'outils natif), sans SDK Cursor. Les outils de l'agent sont des fonctions du backend : lire le profil d'un dataset, lire la mémoire commune, lancer `check`, proposer des opérations, créer les fichiers de `spec/` en maquette. L'agent n'a ni shell ni accès libre aux fichiers. Les extraits de données envoyés au modèle (profils de colonnes, valeurs fréquentes) restent dans le compte AWS de WeMa ; région européenne. Le modèle et la région sont des paramètres de configuration. Le backend est hébergé hors AWS (VPS WeMa) : il appelle Bedrock avec des clés IAM dédiées, limitées à `bedrock:InvokeModel` sur les modèles retenus, stockées dans l'environnement du service et jamais dans les dossiers adhérents.

## Erreurs

- Opération invalide (cible inconnue, champ hors liste) : refusée par le serveur, motif affiché dans le formulaire, rien au registre.
- Texte libre non interprétable : entrée `noter` ; le client voit « Réponse reçue, WeMa reprend la main » ; la vue administrateur la liste.
- Deux réponses à la même question : les deux restent au registre, la plus récente l'emporte, l'historique est visible.

## Découpage

1. **Registre appliqué et formulaires, en local** : opérations et application dans `core/`, `reponse_type`, six formulaires, effet affiché (message), réponses orphelines dans `check`, onglet Questions qui répond via `POST /api/reponse` sur le serveur local, dossier de données séparé du code (`ATELIER_ROOT`). Le texte libre est enregistré (`noter`) en attendant l'agent. Démontrable sur le poste de Michel.
2. **Plateforme** : backend `server/`, comptes, isolation, file par adhérent, build automatique, vue administrateur, vue client sans schéma, tuiles du dashboard modifiées en surbrillance.
3. **Agent serveur** : maquette automatique sur nouveaux exports, interprétation validée par le client, opération `question` (questions de suivi), apprentissage automatique.

La procédure `/seance` et la boucle de séance d'`AGENTS.md` sont retirées au sous-projet 3, quand l'agent serveur les remplace.

## Tests

`node:test` :
- application des opérations, priorité de la plus récente, réponse orpheline ;
- refus des opérations hors liste et des champs hors liste de `definir` ;
- garde pii sur les opérations ;
- isolation : une session de A ne lit ni n'écrit chez B ;
- limitation des tentatives de connexion ;
- agent : boucle d'outils testée avec un client Bedrock simulé ; un outil appelé hors liste ou une opération invalide est refusé ;
- même spec et même registre : mesures du navigateur = sortie du build.

## Hors périmètre

Comptes nominatifs, droits par lot, dépôt d'exports par le client, facturation.
