# 3c : questions de suivi, mémoire pseudonymisée, apprentissage en un clic

Date : 2026-11-08. Suite de 3a et 3b. Décisions de Michel : le suivi est proposé par l'agent et validé par le client ; la mémoire commune stocke des identifiants pseudonymisés ; la mise à jour de la mémoire est proposée à l'admin et appliquée d'un clic.

## 1. Opération `question`

Registre `spec/reponses.yml` : nouvelle opération `{op:"question", cible:<dataset>, valeur:{text, reponse_type?, titre?, contexte?, reponse_cible?, options?, sql?}}`.
- Validation (`erreurModif`/`erreursModifs` dans le moteur) : dataset existant, `text` 5 à 300 caractères sans saut de ligne, `reponse_type` parmi `confirmer|codes|choix|exclure|fichier|libre` (défaut `libre`), `choix` exige `reponse_cible` et `options`, `exclure` exige `sql` valide (`parseCond`), au plus 3 questions de suivi ouvertes par dataset, texte sans valeur `pii`.
- Application (`appliquerCalque`) : ajoute une question au dataset, id `qN` suivant, `done:false`, marquée `suivi: true`. Idempotente : rejouer le registre ne crée pas de doublon (même `text` déjà présent → rien).
- Question de suivi dans une interprétation : l'agent de 3a la propose via `proposer` (opérations admises : ajout de `question`). « J'ai compris » affiche « Je vous poserai ensuite : … » ; elle n'est ajoutée qu'avec « C'est bien ça ». La maquette (3b) peut aussi l'utiliser via `ecrire_dataset`.
- Un dataset de la spec n'est jamais modifié à la main pour cela : tout passe par le registre.

## 2. Mémoire pseudonymisée

- `confirme_chez` et `contredit_chez` contiennent `HMAC-SHA256(sel, idSociete)` en hexadécimal tronqué à 16 caractères, préfixé `p:`.
- Le sel vient de `TREDUNION_SEL`, sinon du fichier `$TREDUNION_MEMOIRE/.sel` (droits 600, créé s'il manque, jamais dans un dépôt ni dans les vues).
- Lecture compatible : les anciennes valeurs en clair restent valables et sont comparées aux deux formes. Commande `npm run memoire -- --pseudonymiser` : migration unique, idempotente, qui réécrit les entrées en clair.
- Les vues anonymes (adhérent, agent) restent « un autre adhérent ». Le moteur compte les valeurs distinctes sans les afficher.
- `apprendre` écrit uniquement la forme pseudonymisée.

## 3. Apprentissage en un clic

- `espace.apercuApprentissage()` : exécute `apprendre` sans écrire et renvoie `{faits:[{type, cle, effet}]}` (ids pseudonymisés, jamais de société en clair).
- Vue admin : après un build réussi, « N hypothèses tranchées à apprendre » avec la liste ; bouton « Appliquer à la mémoire ».
- `POST /api/apprendre` : admin seul, contrôle d'origine, verrou unique serveur (un clic à la fois, 409 sinon), refuse s'il reste des erreurs de spec, écrit `comptes.yml` et `colonnes.yml`, journal `.atelier/apprentissage.jsonl` (date, nombre de faits), renvoie les faits.
- Une hypothèse démentie est apprise avant correction de la spec ; le bouton reste actif tant que le démenti est lisible.

## 4. Retrait de `/seance`

`AGENTS.md` et `README.md` : la plateforme (réponses, interprétation, maquette, apprentissage) est le parcours principal. Les commandes `/seance` et `/apprendre` restent pour le mode local, décrites comme secondaires. Aucun fichier de commande supprimé.

## 5. Tests

Opération `question` (validation, application, idempotence, pii, plafond), pseudonymisation (sel, migration, lecture compatible, vues), `/api/apprendre` (droits, aperçu sans écriture, double clic, origine, erreurs de spec), vue admin, interprétation avec question de suivi.

## Hors périmètre

Sonde SFTP automatique, droits différenciés entre admins.
