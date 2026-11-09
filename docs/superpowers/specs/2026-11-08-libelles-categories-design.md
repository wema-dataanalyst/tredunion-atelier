# Libellés lisibles des catégories

Date : 2026-11-08. Statut : conception à relire. Cycle 3 de la feuille de route (cycles 1 et 2 livrés : questions d'adhérent, périmètre des mesures).

## Contexte

Les codes `%COD_CATEGORIE` (`CA AFF`, `ENTR`, `PR EXEP`…) ont été créés par un data analyst : abrégés, peu lisibles pour un exploitant. Ils apparaissent dans les questions, la couverture, les éléments principaux, le dashboard et FAITS.

Contrainte relevée dans le code : `%COD_CATEGORIE` et `LIB_Categorie` sont un contrat avec Qlik. Le catalogue (97 lignes) filtre sur leurs valeurs exactes. Les modifier casserait les mesures. Le libellé lisible va donc dans un champ à part.

## Décisions

- **Où :** dans la plateforme et dans FAITS (champ visible dans Qlik). Les codes, `LIB_Categorie` et le catalogue ne changent pas.
- **Qui écrit :** la maquette propose (hypothèse), l'adhérent corrige s'il le souhaite.
- **Nouveau champ FAITS `LIB_LISIBLE`**, texte, valeur = libellé lisible du code, ou le code lui-même si aucun libellé n'est défini.

Approches écartées : libellé hors FAITS (invisible dans Qlik) ; renommer `LIB_Categorie` et réécrire le catalogue (partagé, modifié seulement sur demande explicite de Michel).

## Les données

`spec/referentiel.yml` : un code peut porter un libellé et une hypothèse.

```yaml
codes:
  - cod: CA AFF
    lib: "Chiffre d'affaires affrètement"
    hypothese:
      source: agent
      preuves: ["Flux f2 : ordres d'affrètement, 2025 : 1,2 M€"]
      question: "« CA AFF » correspond-il bien au chiffre d'affaires d'affrètement ?"
      valide: false
      refuse: false
  - cod: AFFR          # forme actuelle, toujours valide : pas de libellé
```

- `lib` absent : l'affichage retombe sur le code. Aucun changement pour l'existant.
- Hypothèse proposée ou refusée : le libellé proposé s'affiche quand même (il aide à lire), marqué « proposé ». Validé : affiché sans réserve. Corrigé par l'adhérent : voir « Réponses ».
- Le moteur charge `lib` et `hypothese` dans `st.categories` (`{cod, note, lib, hypothese}`).

## Effets

**FAITS.** Nouveau champ `LIB_LISIBLE` dans `FAITS_FIELDS`, dans le script SQL des flux (après `LIB_Categorie`) et dans le contrat ODCS. Valeur : `case "%COD_CATEGORIE" when '<cod>' then '<lib>' … else "%COD_CATEGORIE" end`, calculée à l'union des flux, donc valable pour les flux à code fixe, par règles ou par colonne. Seuls les codes ayant un `lib` apparaissent dans le `case`.

**Plateforme.** Un helper unique de `core/` (`libelleCat(cod)`) renvoie le libellé ou le code. Utilisé par : liste de questions et fiche de séance (cible d'un flux), couverture (catégories manquantes), onglet Catégories, éléments principaux (« Manque dans FAITS », « Utilise »), objets du dashboard qui nomment une catégorie. Le code reste visible en petit à côté.

**Catalogue Qlik.** Inchangé. Le champ `LIB_LISIBLE` est disponible pour les axes et libellés des feuilles Qlik, pas pour les formules existantes.

## La maquette propose les libellés

- Après les flux : une boucle agent, `proposerLibelles` (`server/agent/maquette-agent.mjs`), pour les codes **utilisés par un flux** et sans libellé.
- Outil `ecrire_libelles` (`maquette-outils.mjs`, `specs.mjs`) : liste `[{cod, lib, hypothese}]`, avec garde-fous : code du référentiel uniquement, libellé non vide de 60 caractères au plus, preuves obligatoires, `valide: false` forcé, jamais de valeur pii, jamais de réécriture d'un libellé déjà tranché (validé ou refusé).
- Le libellé est en langage d'exploitant, sans abréviation, sans nom de colonne.
- Sans LLM : aucun libellé (la maquette ne démarre pas). Relance : un libellé tranché n'est pas touché ; un libellé seulement proposé peut être remplacé.

## Réponses de l'adhérent

- Hypothèse de code `categorie:<cod>` : comme `flux:f1` et `perimetre:g1`, listée par `listeHypotheses`, lot `adherent`, opération `valider` existante (`core/calque.js`, `porteurHypothese`).
- Pour corriger le libellé : la question propose une réponse `choix` « Oui / Non, le bon libellé est : » ; la correction passe par l'opération `definir` sur `categorie:<cod>.lib` (cible de réponse `categorie:<cod>.lib`), appliquée au chargement. Texte libre du client : l'agent d'interprétation le traduit en `definir`.
- Une question par code utilisé, regroupées dans l'onglet Questions sous le lot « Catégories » ; l'adhérent peut valider d'un coup les libellés confiants.

## Moteur

- `tools/espace.mjs` : chargement de `lib` et `hypothese` des codes ; la commande de réponse `definir` accepte `categorie:<cod>.lib`.
- `core/model.js` : `libelleCat`, champ FAITS, SQL du `case`, contrat ODCS ; `core/hypotheses.js`, `core/calque.js`, `core/questions.js` : cible `categorie:<cod>`, lot `catégories`.
- `core/check.js` : code inconnu du référentiel dans une réponse, libellé vide ou trop long, deux codes avec le même libellé (alerte).
- `viewer/` : utilisation de `libelleCat` aux endroits listés.

## Tests

- Chargement du référentiel avec et sans `lib` (forme chaîne, forme objet).
- `libelleCat` : avec libellé, sans libellé, code inconnu.
- FAITS : le champ existe, le `case` n'a que les codes libellés, `else` retombe sur le code ; valeurs de `LIB_Categorie` et `%COD_CATEGORIE` inchangées.
- Contrat ODCS : le champ est déclaré.
- `ecrire_libelles` : refuse code hors référentiel, libellé vide ou trop long, sans preuves ; force `valide: false` ; ne réécrit pas un libellé tranché.
- Maquette : une boucle libellés après les flux ; sans code utilisé, aucun appel LLM ; relance idempotente.
- Réponse de bout en bout : « Non, le bon libellé est… » met à jour le libellé affiché et le `case` FAITS.
- Un adhérent sans aucun `lib` : suite existante verte, affichage identique.

## Documentation

`AGENTS.md` (format de `referentiel.yml`, champ `LIB_LISIBLE`, cible `categorie:<cod>`), `.cursor/rules/spec-format.mdc`, prompt de la maquette, `deploy/LISEZMOI.md` si l'étape y figure.

## Hors périmètre

Créer de nouveaux codes `%COD_CATEGORIE` (CA froid, CA vrac…) : traité avec le cycle KPI, car un code nouveau n'a d'effet sur le dashboard que relié à une mesure. Le référentiel reste donc fermé dans ce cycle (règle d'`AGENTS.md` inchangée). Renommer les codes ou `LIB_Categorie`, modifier le catalogue Qlik, noms lisibles des mesures du catalogue, KPI ajoutés, renommage selon les activités (cycles suivants).
