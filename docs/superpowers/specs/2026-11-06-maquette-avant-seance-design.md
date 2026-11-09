# Maquette d'avant-séance : conception

Date : 2026-11-06 · Premier cas : Euro Trans Chanet (`eurotranschanet`)

## Objectif

Produire, sans le client, une maquette du dashboard Tredunion pour un nouvel adhérent : FAITS, dimensions et mesures du catalogue alimentées à partir de ses exports. Chaque chiffre affiché remonte à une hypothèse tracée (preuves, confiance calculée). La séance avec l'adhérent ne sert plus qu'à valider les hypothèses douteuses.

La règle « aucun sens métier inventé » devient « aucune hypothèse cachée » : une déduction est permise si elle est écrite dans la spec avec ses preuves et son statut de validation ; l'outil en calcule la confiance.

## Contexte

- L'outil calcule déjà silver, FAITS, dimensions et mesures à partir de la spec (`core/`), affiche le dashboard (`viewer/`) et génère dbt, Qlik et ODCS (`npm run build`).
- Ce qui coûte : écrire la spec (sens des colonnes, correspondance colonne ou compte vers `%COD_CATEGORIE`).
- Entrée commune aux adhérents : un SFTP rangé par domaine (Carburant, Comptabilité, Énergie, Entretien, Paie, Péage, TMS, Télématique_embarquée). Les fichiers de chaque dossier sont libres : Excel, CSV, éditions Sage avec en-têtes de page, exports de logiciels différents.
- Aucune correspondance compte → catégorie n'existe chez Tredunion : la mémoire se construit à partir de ce premier cas.
- La télématique manque chez Euro Trans Chanet : kilomètres et consommation viennent des compteurs relevés aux pleins.

## Étapes du process

Une seule commande enchaîne les étapes pour un adhérent.

| Étape | Qui | Rôle |
|---|---|---|
| 1. Collecte | code | `npm run collecte -- --societe <id>` télécharge le SFTP dans `data/raw/<societe>/<domaine>/`. Identifiants dans un `.env` hors git. |
| 2. Normalisation | code | Un lecteur par format produit un CSV propre dans `data/bronze/<societe>/`, plus un fichier de métadonnées (période, date de tirage, logiciel). Un fichier non reconnu est signalé, jamais deviné. |
| 3. Profil | code (existe) | Types, valeurs fréquentes, vides. Le dossier SFTP donne le domaine. |
| 4. Déduction | agent + mémoire | La mémoire s'applique d'abord. L'agent déduit le reste et écrit chaque déduction comme hypothèse dans la spec. |
| 5. Contrôles croisés | code | Confronte les sources et fixe la confiance des hypothèses. |
| 6. Maquette | code (existe en partie) | Dashboard avec badges de confiance, et `generated/fiche_seance.md`. |
| 7. Apprentissage | agent, après séance | Les hypothèses confirmées entrent dans la mémoire ; les corrections deviennent des règles. |

### Lecteurs du premier périmètre

- Tableau Excel simple : ligne d'en-tête détectée (première ligne entièrement textuelle suivie de lignes de données).
- Classeur à plusieurs feuilles : un CSV par feuille (ex. `Akanea donnees.xlsx` : Articles, Activités ventes, Activités achats, Tiers).
- Édition Sage 100 (balance des comptes, balance des tiers, plan comptable, plan des tiers) : en-têtes sur plusieurs lignes, colonnes décalées, lignes de total et de pied de page retirées, période lue dans l'en-tête.
- Contournement des styles Excel non standard (attribut `biltinId` refusé par openpyxl) au moment de la lecture.

### Contrôles croisés du premier périmètre

| Id | Contrôle | Exemple Euro Trans Chanet |
|---|---|---|
| c1 | CA du TMS contre comptes 70 | Akanea `montant` 5,86 M€ contre Sage 70 12,13 M€ en 2025 : écart à expliquer |
| c2 | Litres achetés contre compte gazole | COFI contre comptes 6061 |
| c3 | Coût de paie contre comptes 641 et 645 | Silae `cout_global` contre Sage |
| c4 | Immatriculations retrouvées entre sources | carburant, entretien, TMS (`plaque_moteur`) |
| c5 | Granularité mensuelle disponible | balance Sage annuelle (01/01/2025 au 31/12/2025) : FAITS mensuelle impossible depuis cette source |

## Format des hypothèses dans la spec

Le format existant ne change pas. Un bloc `hypothese` optionnel s'ajoute sur une colonne, une règle silver, un flux, une règle de compte d'un flux ou une expression de dimension :

```yaml
hypothese:
  source: agent              # agent | memoire:<fichier>/<id> (ex. memoire:comptes/706)
  preuves:                   # faits mesurés, jamais de valeur pii
    - "Somme 2025 : 5,86 M€ sur 10 596 ordres"
  question: "Le montant d'un ordre Akanea est-il hors taxe ?"
  valide: false              # true : confirmé par l'adhérent
  refuse: false              # true : démenti par l'adhérent
```

La confiance n'est pas écrite dans la spec : l'outil la calcule.

Règle de confiance (calculée, pas jugée) :

- **haute** : mémoire et contrôle croisé concordent ;
- **moyenne** : mémoire seule, ou contrôle seul ;
- **basse** : déduction de l'agent seule, ou conflit entre sources.

Seules les hypothèses basses ou en conflit génèrent une question dans le dataset. `valide: true` vaut confirmation, quelle que soit la confiance.

## Mémoire commune

Dossier séparé (sans git pour l'instant) `tredunion-memoire`, lu par chaque dépôt adhérent (chemin dans la configuration locale).

Les entrées de `comptes.yml` ont pour `id` le préfixe de compte, celles de `colonnes.yml` le nom de colonne en snake_case.

| Fichier | Contenu |
|---|---|
| `logiciels.yml` | Signature d'un export (titre, feuilles, en-têtes), lecteur à utiliser, sens de ses colonnes |
| `comptes.yml` | Préfixe de compte → `%COD_CATEGORIE` |
| `colonnes.yml` | Synonymes de colonnes, avec unité et HT/TTC |

Chaque entrée porte `confirme_chez: [<adherent>]` et `contredit_chez: [<adherent>]`. Une entrée contredite au moins une fois tombe en confiance moyenne et affiche les cas.

## Maquette

- Badge par mesure dans la prévisualisation : vert (confirmé ou confiance haute), orange (au moins une hypothèse moyenne), rouge (au moins une hypothèse basse ou un conflit). Le clic montre hypothèses et preuves.
- `generated/fiche_seance.md` : points à valider, classés par nombre de mesures concernées puis par confiance, formulés pour un exploitant.

## Gestion des erreurs

- Fichier non reconnu : listé dans la fiche, pas lu.
- Conflit entre sources : hypothèse basse et question.
- Granularité manquante : signalée, jamais compensée (pas de répartition par douze).
- Seules les erreurs de structure de spec bloquent, comme aujourd'hui (`npm run check`).
- Données personnelles : colonnes `pii: true` jamais affichées en clair, ni dans la fiche ni dans le chat.

## Tests

- Kessler-Rhin sert de corrigé : le process tourne avec une mémoire vide, on mesure la part des flux et des décodages retrouvés.
- Lecteurs testés sur des extraits fabriqués qui imitent la structure des exports Euro Trans Chanet, sans donnée réelle.
- Contrôles croisés testés sur des jeux de données fabriqués, cas concordant et cas en conflit.

## Périmètre

Inclus : lecteurs ci-dessus, trois fichiers de mémoire remplis avec Euro Trans Chanet, bloc `hypothese` dans `core/check.js` et la prévisualisation, contrôles c1 à c5, fiche de séance, commande de collecte.

Exclus pour l'instant : télématique, mesures Logidis, collecte planifiée, autres logiciels que ceux d'Euro Trans Chanet.

## Critères de réussite

- Euro Trans Chanet : maquette produite sans intervention du client ; chaque chiffre affiché remonte à une hypothèse tracée ; fiche de séance sur une page.
- Kessler-Rhin : la majorité des flux de l'exemple retrouvés sans aide, mémoire vide.

## Changements de règles à faire

- `AGENTS.md` et `.cursor/rules/data-builder.mdc` : remplacer « aucun sens métier inventé » par « aucune hypothèse cachée », et décrire la boucle maquette.
- `core/`, `tools/`, `viewer/` deviennent modifiables pour ce chantier (demande explicite de Michel du 2026-11-06).

## Écart à régulariser

Les exports d'Euro Trans Chanet ont été copiés à la main dans `data/bronze/eurotranschanet/` (Excel bruts et CSV convertis). Avec le process, les Excel iront dans `data/raw/` et les CSV seront produits par les lecteurs.
