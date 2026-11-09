# Cycle 5 : besoins et classement

## Contexte

Le process actuel pose des questions sur les données brutes, écrit les flux via la maquette, puis propose des mesures à retirer (périmètre) ou à ajouter (mesures adhérent). Il manque :

- Une étape où l'adhérent exprime ses besoins (quels KPI veut-il suivre).
- Un classement explicite des données dans les codes catégorie (pas seulement valider une hypothèse).
- Des éléments principaux déduits des besoins, pas proposés au fil de l'eau.

## Décisions

| Choix | Décision |
|---|---|
| Périmètre | Catalogue complet, groupé par thème, pré-coché selon les données |
| Ordre | Données d'abord, puis « quels KPI parmi ceux possibles ? » |
| Classement | Hypothèses avec correction facile (liste de codes, création) |

## Section 1 : l'étape Besoins

- **Source des thèmes.** Les thèmes sont les feuilles du dashboard (Accueil, Général, Résultat, Masse salariale, Activités, Coûts d'exploitation). Une mesure appartient au thème correspondant à sa feuille. La liste des thèmes et leur contenu viennent de `SHEETS` et `filtrerFeuilles` dans `core/model.js`.
- **Quand.** Après les questions de données brutes (profil, hypothèses de flux), avant le dashboard.
- **Ce que voit l'adhérent.** Une page avec les thèmes du catalogue. Chaque thème liste ses mesures. Les thèmes que les données semblent couvrir sont pré-cochés.
- **Ce qu'il fait.** Il coche les thèmes qu'il veut suivre. Il peut décocher un thème pré-coché. Il peut ajouter un besoin en texte libre.
- **Effet.** Les mesures des thèmes non cochés passent en statut `hors`. Les besoins libres sont enregistrés pour la suite (proposition de mesure adhérent).
- **Format.** Nouveau fichier `spec/besoins.yml` :

```yaml
themes:
  - id: ca
    choisi: true
  - id: marge
    choisi: false
  # ...
libres:
  - text: "taux de sinistralité"
```

## Section 2 : correction facile des hypothèses de classement

- **Ce qui existe.** Une hypothèse de flux dit « ce compte va dans CA TPS ». L'adhérent répond « oui » ou « non ». S'il dit non, il doit expliquer en texte libre.
- **Ce qui change.** Sur « non », l'interface propose :
  1. Une liste des codes existants (base + déjà créés par cet adhérent).
  2. Un bouton « Créer un code » qui ouvre le formulaire du cycle 4.
  3. Un champ pour le libellé.
- **Effet sur la spec.** La réponse modifie la règle du flux (`cod`, `lib`) ou crée une proposition de code dans `mesures.yml`.
- **Format de la réponse.** Nouvelle opération `classer` dans le registre :

```yaml
- cible: flux:f1.rules[0]   # ou flux:f1 si codMode fixe
  op: classer
  valeur:
    cod: CA LOC             # code choisi ou créé
    lib: "CA location"      # libellé
    nouveau: false          # true si création de code
```

- **Interface.** L'aperçu de question retourne la liste des codes possibles. Le formulaire de réponse affiche un select + un input libellé + un lien « Créer un code ».

## Section 3 : intégration dans le process existant

- **Ordre des lots de questions.**
  1. `profil` : questions de données brutes (codes, formats, HT/TTC…)
  2. `hypothese` : hypothèses de flux avec correction facile
  3. `besoins` : choix des thèmes de KPI — **nouveau**
  4. `categories` : libellés lisibles des codes utilisés
  5. `mesures` : propositions de mesures adhérent

- **Pré-cochage des thèmes.** La maquette calcule quels thèmes sont couverts par les flux écrits. Un thème est pré-coché si au moins une de ses mesures est alimentée ou partiellement alimentée.

- **Filtrage des questions suivantes.** Les questions de lot `categories` et `mesures` ne portent que sur les thèmes cochés. Un code utilisé par un thème décoché n'a pas besoin de libellé lisible.

- **Périmètre (cycle 2) absorbé.** Le fichier `perimetre.yml` devient redondant : les mesures hors thèmes cochés sont automatiquement `hors`. Il reste pour compatibilité (un adhérent peut avoir exclu une mesure d'un thème coché), mais la question de périmètre n'est plus posée.

- **Besoins libres.** Les besoins en texte libre sont transmis à l'étape `mesures`. L'agent propose une mesure adhérent s'il peut la construire avec les gabarits. Sinon, il la marque « non réalisable avec les données actuelles ».

## Section 4 : interface utilisateur

- **Page Besoins.** Nouvel onglet ou écran dans le parcours, après les questions de données.
  - Affiche les thèmes du catalogue en blocs.
  - Chaque bloc a une case à cocher et liste ses mesures en dessous (repliable).
  - Les thèmes pré-cochés ont un badge « Données disponibles ».
  - Un champ texte libre en bas : « Autre indicateur que vous souhaitez suivre ».
  - Bouton « Valider mes choix ».

- **Formulaire de classement amélioré.** Sur une question d'hypothèse de flux :
  - Bouton « Oui » (valide l'hypothèse).
  - Bouton « Non, autre code » qui affiche :
    - Un select avec les codes existants (groupés : base, puis créés).
    - Un input pour le libellé.
    - Un lien « Créer un nouveau code » qui ouvre le formulaire cycle 4 en modal.
  - Bouton « Exclure ces lignes » (si l'adhérent ne veut pas de ces données).

- **Jauge et progression.** La jauge actuelle (26/98) devient « X mesures choisies, Y alimentées ». Elle reflète les thèmes cochés, pas le catalogue complet.

- **Dashboard filtré.** Les feuilles et tuiles du dashboard ne montrent que les mesures des thèmes cochés. Les feuilles vides sont masquées.

## Section 5 : garde-fous et validation

- **`check` sur les besoins.**
  - Erreur si un thème coché n'a aucune mesure alimentée ni partiellement alimentée.
  - Alerte si un besoin libre n'a pas de proposition de mesure associée.

- **`check` sur le classement.**
  - Erreur si un flux utilise un code qui n'existe ni dans la base ni dans les propositions validées.
  - Erreur si deux règles d'un même flux produisent le même couple (cod, lib) avec des préfixes différents.
  - Alerte si un flux a des lignes sans catégorie et que le thème concerné est coché.

- **`check` sur la cohérence besoins/données.**
  - Alerte si un thème est pré-coché mais l'adhérent l'a décoché.
  - Info si un thème n'est pas pré-coché mais l'adhérent l'a coché.

- **Maquette.** Elle pré-coche les thèmes couverts et écrit `spec/besoins.yml` avec `choisi: true` pour ceux-là.

## Fichiers impactés

| Fichier | Modification |
|---|---|
| `spec/besoins.yml` | Nouveau fichier |
| `core/model.js` | Lecture de `besoins.yml`, calcul du statut `hors` par thème |
| `core/check.js` | Validations besoins et classement |
| `core/calque.js` | Opération `classer` |
| `core/questions.js` | Lot `besoins`, filtrage par thème |
| `tools/espace.mjs` | Lecture/écriture `besoins.yml`, liste des thèmes couverts |
| `viewer/ui.js` | Page Besoins, formulaire de classement amélioré, jauge |
| `viewer/dash.js` | Filtrage des feuilles et tuiles par thème |
| `server/agent/maquette-outils.mjs` | Outil `ecrire_besoins` |
| `server/agent/maquette-agent.mjs` | Étape besoins dans la maquette |
| `server/maquette.mjs` | Étape `besoins` |
| `AGENTS.md` | Documentation du format `besoins.yml` et de l'opération `classer` |

## Hors périmètre

- Suppression de `perimetre.yml` (gardé pour compatibilité).
- Modification des gabarits de mesures adhérent (cycle 4 inchangé).
- Nouveaux types de gabarits pour les besoins libres complexes.
