# Maquette d'avant-séance

Produit la maquette du dashboard d'un adhérent sans lui. Chaque déduction est une hypothèse tracée ; la séance ne sert plus qu'à valider `generated/fiche_seance.md`.

Argument : l'id de société (ex. `eurotranschanet`), suivi de `--sans-collecte` si les fichiers sont déjà dans `data/raw/<id>/`.

1. **Prérequis.** La société est déclarée dans `spec/projet.yml`. Sans `--sans-collecte`, vérifie la présence de `.env` avec `test -f .env` ; ne l'ouvre jamais. S'il manque, demande à Michel de le créer depuis `.env.exemple`.
2. **Collecte et lecture.** Lance `npm run maquette -- --societe <id> [--sans-collecte]`. Les fichiers non lus et les « valeurs hors recette » iront dans la fiche : ne les devine pas. Un export Sage ou autre non reconnu se traite en ajoutant une recette à `logiciels.yml` de la mémoire, sur demande de Michel.
3. **Datasets.** Pour chaque fichier de `spec/datasets/` :
   - renseigne `desc`, `grain`, `role` ; corrige `type` si le profil se trompe ; `pii: true` pour noms, prénoms, téléphones, adresses, e-mails, numéros de carte ;
   - chaque sens déduit (montant et son unité, HT ou TTC, `codes`, règle d'exclusion) reçoit un bloc `hypothese` ;
   - cherche d'abord dans la mémoire (`$TREDUNION_MEMOIRE`, par défaut `../tredunion-memoire`) : `colonnes.yml` par nom de colonne, `comptes.yml` par préfixe de compte. Si une entrée s'applique : `source: memoire:<fichier>/<id>`. Sinon : `source: agent` ;
   - `preuves` : des faits mesurés (sommes, nombres de lignes, % de vides, taux de rapprochement). Jamais une valeur d'une colonne `pii` ;
   - `question` : ce qu'il faudra demander à l'adhérent, en langage d'exploitant ;
   - supprime les questions automatiques auxquelles une hypothèse répond, garde les autres.
   - donne à chaque question restante un `reponse_type` (voir AGENTS.md, « Réponses de l'adhérent ») : `codes` pour une colonne codée, `choix` avec `reponse_cible` et `options` pour une unité ou un HT/TTC, `exclure` avec `sql` pour une règle d'exclusion ; `libre` seulement si aucun formulaire ne convient.
4. **Flux.** Lance `npm run couverture`. Pour les catégories qui débloquent le plus de mesures, écris les flux `spec/flux/fN.yml` avec un bloc `hypothese` ; en `codMode: regles`, un bloc par règle de compte. Codes pris dans `spec/referentiel.yml` uniquement.
5. **Contrôles.** Écris `spec/controles.yml`, au moins un contrôle par flux :
   - `ecart_somme` : un même montant vu par deux sources (TMS contre comptes 70, carburant contre comptes de gazole, paie contre comptes 641 et 645) ;
   - `rapprochement` : identifiants retrouvés d'une source à l'autre (immatriculations, matricules) ;
   - `mensuel` : la source a une date par ligne.
   Renseigne `porte_sur` avec les cibles concernées (`dataset.colonne`, `flux:fN`, `flux:fN#prefixe`).
6. **Sources sans date par ligne.** Une balance annuelle n'alimente pas FAITS : pas de répartition par mois. Un contrôle `mensuel` et une hypothèse ou une question le signalent.
7. **Vérifier.** `npm run check` (0 erreur), `npm run controles`, puis `npm run build`. Ajoute l'entrée de `spec/journal.yml`.
8. **Résumer à Michel en 4 lignes** : mesures alimentées avant → après ; hypothèses basses, moyennes, hautes ; contrôles en écart ; chemin `generated/fiche_seance.md`.

Ne pose aucune question à Michel pendant la maquette, sauf blocage (fichier manquant, `.env` absent).
