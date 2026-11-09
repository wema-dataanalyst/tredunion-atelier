# Périmètre des mesures par adhérent

Date : 2026-11-08. Statut : conception à relire.

## Contexte

La plateforme adapte un dashboard pré-établi (catalogue de mesures Qlik, feuilles de `viewer/dash.js`) aux données reçues de l'adhérent. Les sources sont tranchées avant la plateforme : ce qui est dans le SFTP est ce qu'on a. Une donnée absente n'est pas un manque à signaler à l'adhérent, c'est une contrainte sur le dashboard. Exemple : sans télématique, les mesures de kilomètres et de consommation par chauffeur n'ont pas lieu d'être.

Aujourd'hui la couverture classe une mesure en alimentée, partielle, non alimentée ou à corriger, sans jamais dire « non applicable à cet adhérent ». Le dashboard affiche tout, vide ou non.

Ce document est le cycle 2 de la feuille de route (le cycle 1 : questions d'adhérent, livré). Hors périmètre : noms lisibles des catégories, KPI ajoutés, renommage selon les activités, script Qlik généré.

## Décisions

- **Qui décide :** la maquette propose, l'adhérent valide dans l'onglet Questions. Rien ne disparaît sans trace.
- **Échelle :** une question par cause, pas par mesure.
- **Affichage :** une mesure écartée disparaît du dashboard. L'historique de ce qui a été retiré et pourquoi reste dans l'onglet Questions.
- **Stockage :** `spec/perimetre.yml`, un bloc `hypothese` par groupe. Le mécanisme d'hypothèses existant porte confiance, preuves et réponse.

Approches écartées : annoter le catalogue Qlik (partagé, non modifiable sans demande) ; calculer les groupes à la volée sans fichier (déduction sans bloc `hypothese`).

## Le fichier `spec/perimetre.yml`

```yaml
# Mesures du dashboard de référence écartées chez cet adhérent, groupées par cause
groupes:
  - id: g1
    cause: "Aucune donnée de suivi des véhicules (kilomètres, consommation par chauffeur)"
    mesures: [KM Réel, KM Réel année, Charges VS KM, KM / Moteur]
    titre: "Faut-il retirer de votre tableau de bord les indicateurs liés aux kilomètres ?"
    contexte: "Vos exports ne contiennent pas de kilomètres exploitables…"
    hypothese:
      source: agent
      preuves: ["4 mesures sans aucune donnée : catégories Km et Nbre de kms parcourus absentes de FAITS"]
      question: "Ces indicateurs ne s'appliquent-ils pas à votre exploitation ?"
      valide: false
      refuse: false
```

Sens d'un groupe :

- **Proposé** (ni validé ni refusé) : rien ne disparaît. Les mesures restent dans la couverture et le dashboard, comptées « applicables, à finaliser ».
- **Validé (`valide: true`) :** les mesures du groupe sont hors périmètre. Elles sortent du dashboard et du total de la couverture.
- **Refusé (`refuse: true`) :** elles restent, à finaliser.
- **Réponse :** registre `spec/reponses.yml`, opération `valider` existante, cible `perimetre:<id>` (comme `flux:f1`).
- **Question de l'adhérent :** `titre` et `contexte` en langage d'exploitant, jamais le nom d'un fichier ou d'une colonne.

## Effets

**Mesures hors périmètre.** Ensemble des noms de mesures listés dans les groupes validés. Une mesure qui référence une mesure écartée l'est aussi (dépendance transitive), sinon elle s'afficherait vide. Le calcul vit dans `core/` pour que couverture, dashboard et fiche de séance partagent la même liste.

**Couverture.** Nouveau statut `hors` à côté de `ok / part / none / err`. Les mesures `hors` sortent du total : « 26 sur 93 » devient « 26 sur N ».

**Dashboard (`viewer/dash.js`).**
- Une mesure hors périmètre disparaît de l'objet qui la cite.
- Un objet dont toutes les mesures disparaissent est retiré. Un objet qui en garde une partie reste, avec les autres.
- Une feuille sans objet est retirée de la barre d'onglets ; si la feuille active disparaît, on retombe sur la première.
- Le filtrage se fait à l'affichage : `SHEETS` et le catalogue ne sont pas modifiés. Pas de seuil minimal de mesures par objet.

**Script Qlik généré.** Inchangé dans ce cycle : les mesures écartées y restent.

## La maquette écrit les groupes

Constat mesuré sur Euro Trans Chanet : 57 mesures sans aucune donnée, réparties en 26 ensembles de catégories manquantes, dont plusieurs ne sont pas absents mais simplement non branchés (entretien, consommation, budget). Le code seul ne distingue pas « la donnée n'existe pas » de « on ne l'a pas encore branchée ». Le groupement ne peut donc pas être déterministe de bout en bout.

- **Le code produit les candidats :** les mesures au statut `none` (jamais `part`, `ok` ou `err`), avec leurs catégories manquantes. Il n'écrit aucun groupe lui-même.
- **L'agent décide**, après avoir lu les exports de l'adhérent : pour chaque ensemble de candidats, soit « la donnée existe, c'est un branchement à faire » (aucun groupe écrit), soit « aucune donnée ne le permet » (groupe écrit, à valider par l'adhérent).
- **L'agent peut regrouper** plusieurs ensembles de catégories sous une même cause (par exemple « suivi des véhicules » pour kilomètres et consommation) et rédige `cause`, `titre` et `contexte`.
- **Outil `ecrire_perimetre`** (`server/agent/maquette-outils.mjs`, `specs.mjs`), avec garde-fous :
  - il refuse toute mesure qui n'est pas un candidat ;
  - il exige des preuves : quels exports ont été lus et pourquoi ils ne portent pas la donnée ;
  - il force `valide: false` et `refuse: false`, comme pour les autres outils d'écriture.
- **Sans agent (pas de LLM) :** aucun groupe n'est écrit. Mieux vaut ne rien proposer que proposer à tort. Le dashboard est alors identique à celui d'aujourd'hui.
- **Relance de la maquette :** un groupe déjà validé ou refusé n'est pas touché ; seuls les nouveaux groupes sont ajoutés, et une mesure déjà dans un groupe n'est pas reproposée.
- Tout reste proposé, jamais actif tant que l'adhérent n'a pas validé.

## Le moteur

- `tools/espace.mjs` charge `spec/perimetre.yml` dans l'état (`perimetre`). Fichier absent : liste vide, aucun changement pour les adhérents existants.
- `core/hypotheses.js` liste les groupes comme porteurs d'hypothèse, cible `perimetre:<id>`. `core/calque.js` (`porteurHypothese`) accepte cette cible pour l'opération `valider`.
- `check` signale : une mesure inconnue du catalogue, un id en double, une cause vide.

## Tests

- Chargement de `perimetre.yml`, présent et absent.
- Candidats : seules les mesures `none` ; une mesure partielle, alimentée ou à corriger n'est jamais candidate.
- `ecrire_perimetre` : refuse une mesure non candidate, exige des preuves, force `valide: false`.
- Sans agent : aucun groupe écrit.
- Groupe proposé : rien ne change. Validé : les mesures sortent. Refusé : elles restent, à finaliser.
- Dépendances : une mesure qui s'appuie sur une mesure écartée l'est aussi.
- Dashboard : objet vide retiré, objet partiel conservé, feuille vide retirée, feuille active repliée sur la première.
- Couverture : total recalculé après validation.
- Réponse de bout en bout : « oui » à un groupe écrit au registre une entrée `valider` sur `perimetre:g1`.
- `check` : mesure inconnue, id en double, cause vide.
- Un adhérent sans `perimetre.yml` se comporte exactement comme avant (suite existante verte).

## Documentation

`AGENTS.md` (format de `perimetre.yml`, cible `perimetre:<id>`), `.cursor/rules/spec-format.mdc`, prompt de `server/agent/maquette-agent.mjs`, `.cursor/commands/seance.md` et `deploy/LISEZMOI.md` à vérifier.

## Hors périmètre

Noms lisibles des catégories, KPI ajoutés, renommage selon les activités, script Qlik généré, seuil minimal de mesures par objet.
