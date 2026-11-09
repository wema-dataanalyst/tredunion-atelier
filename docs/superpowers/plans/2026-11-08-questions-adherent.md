# Questions d'adhérent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un bloc `questions:` dans `spec/projet.yml` alimente la liste unique des questions, répondable comme toute autre question.

**Architecture:** `tools/espace.mjs` lit `projet.questions` dans l'état ; `core/model.js` le normalise ; `core/questions.js` ajoute la source `projet` (id `projet#<id>`, lot `adherent`, classé en tête tant qu'il reste une question ouverte) ; `core/check.js` valide le bloc. Les réponses passent par le registre et l'opération `noter`, sans effet métier.

**Tech Stack:** Node (ESM, `node:test`), moteur `core/*.js` exécuté dans un contexte `vm`, YAML.

## Global Constraints

- Conception : `docs/superpowers/specs/2026-11-08-questions-adherent-design.md`.
- Un adhérent sans bloc `questions:` doit se comporter exactement comme avant (les tests existants restent verts, `npm test`).
- Le moteur n'écrit jamais dans `projet.yml` : le statut « traitée » vient du registre `spec/reponses.yml`.
- Pas de bloc `hypothese` sur une question d'adhérent dans ce cycle.
- Dossier sans git : pas de commit ; chaque tâche se termine par `npm test`.
- `data/` et `generated/` ne sont jamais écrits à la main.

## File Structure

- Modifier `core/model.js` : `hydrate` normalise `st.questions`.
- Modifier `core/questions.js` : source `projet`, lot `adherent`, tri en tête.
- Modifier `core/check.js` : validation du bloc.
- Modifier `tools/espace.mjs` : lecture de `projet.questions`.
- Modifier `tools/gabarit.mjs` : un projet vide écrit `questions: []`.
- Modifier `viewer/ui.js` : libellé de la source.
- Modifier `AGENTS.md`, `.cursor/rules/spec-format.mdc` : format documenté.
- Créer `tests/questions-adherent.test.mjs`.

---

### Task 1: Liste unique avec la source `projet`

**Files:**
- Modify: `core/model.js:46`
- Modify: `core/questions.js:SRC_RANG, listeQuestions`
- Test: `tests/questions-adherent.test.mjs`

**Interfaces:**
- Produces : `st.questions` = tableau de `{id, text, titre, contexte, reponse_type, reponse_cible, options, sql, done, answer}` ; entrée de `listeQuestions()` avec `id:"projet#<id>"`, `source:"projet"`, `lot:"adherent"`, `fichier:"spec/projet.yml"`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/questions-adherent.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, etatCaTotal } from "./aide/moteur.mjs";

const QA = { id: "q1", text: "Activités à suivre séparément", titre: "Quelles sont vos activités principales ?", contexte: "Votre comptabilité distingue du transport et de l'affrètement." };
const etat = (extra = {}) => etatCaTotal(undefined, { questions: [QA], ...extra });
const liste = s => chargerMoteur(s).run("listeQuestions()");
const par = (l, id) => l.find(q => q.id === id);

test("une question d'adhérent est listée avec la source projet et le lot adherent", () => {
  const q = par(liste(etat()), "projet#q1");
  assert.deepEqual([q.source, q.lot, q.fichier, q.statut, q.type], ["projet", "adherent", "spec/projet.yml", "ouverte", "libre"]);
  assert.equal(q.titre, "Quelles sont vos activités principales ?");
  assert.equal(q.intro, "Votre comptabilité distingue du transport et de l'affrètement.");
  assert.deepEqual(q.mesures, []);
});

test("le lot adherent passe en tête tant qu'il reste une question ouverte", () => {
  const s = etat();
  s.datasets[0].questions = [{ id: "q1", text: "montant : valeurs négatives, avoirs ?", done: false }];
  assert.equal(liste(s)[0].id, "projet#q1");
});

test("sans question d'adhérent, aucune entrée projet et l'ordre existant est conservé", () => {
  const s = etatCaTotal(undefined, {});
  s.datasets[0].questions = [{ id: "q1", text: "montant : valeurs négatives, avoirs ?", done: false }];
  const l = liste(s);
  assert.ok(!l.some(q => q.source === "projet"));
  assert.equal(l[0].id, "tms#q1");
});

test("une réponse du registre se greffe : question traitée", () => {
  const q = par(liste(etat({ reponses: [{ id: "projet#q1", reponse: "Transport, affrètement", date: "2026-11-08T17:00:00", modifs: [{ op: "noter" }] }] })), "projet#q1");
  assert.deepEqual([q.statut, q.reponse], ["traitee", "Transport, affrètement"]);
});

test("la réponse d'une question disparue reste listée comme retirée", () => {
  const l = liste(etatCaTotal(undefined, { reponses: [{ id: "projet#q1", question: "Activités à suivre séparément", reponse: "X", date: "2026-11-08" }] }));
  const o = par(l, "projet#q1");
  assert.deepEqual([o.source, o.retiree, o.statut], ["registre", true, "traitee"]);
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `node --test tests/questions-adherent.test.mjs`
Expected: FAIL (`projet#q1` introuvable ; `st.questions` non normalisé).

- [ ] **Step 3: Normaliser dans `core/model.js`**

Dans `hydrate`, ligne 46, après `st.cases=st.cases||[];` ajouter `st.questions=st.questions||[];` :

```js
  st.relations=st.relations||[]; st.flux=st.flux||[]; st.categories=st.categories||[]; st.cases=st.cases||[]; st.questions=st.questions||[]; st.log=st.log||[]; st.catalogue=st.catalogue||"";
```

- [ ] **Step 4: Lister dans `core/questions.js`**

Remplacer la première ligne `SRC_RANG` par :

```js
const SRC_RANG={projet:-1,hypothese:0,controle:1,profil:2,hors_recette:3,non_lu:4,registre:5};
```

Dans `listeQuestions`, juste avant `S.st.datasets.forEach(d=>d.questions.forEach(q=>{`, ajouter :

```js
  (S.st.questions||[]).forEach(q=>add({id:`projet#${q.id}`,source:"projet",lot:"adherent",element:"",elements:[],fichier:"spec/projet.yml",question:q.text,traitee:!!q.done,reponse:q.answer,form:q}));
```

Remplacer le calcul de `lots` par :

```js
  const ouvAdh=out.some(q=>q.source==="projet"&&q.statut==="ouverte"), rang=l=>l==="adherent"&&ouvAdh?0:1;
  const lots=[...new Set(out.map(q=>q.lot))].sort((a,b)=>rang(a)-rang(b)||imp(b)-imp(a)||a.localeCompare(b));
```

- [ ] **Step 5: Vérifier**

Run: `node --test tests/questions-adherent.test.mjs && npm test`
Expected: PASS partout (les tests existants de `questions.test.mjs` restent verts).

---

### Task 2: Lecture de `projet.yml`, validation et réponse de bout en bout

**Files:**
- Modify: `tools/espace.mjs:58, 89`
- Modify: `core/check.js` (après la boucle `st.datasets.forEach`)
- Modify: `tools/gabarit.mjs:15`
- Test: `tests/questions-adherent.test.mjs`

**Interfaces:**
- Consumes : `st.questions` (Task 1) ; `racineExemple()` (`tests/aide/racine.mjs`), `ouvrirEspace(racine)` avec `loadState(makeCtx())` et `repondre({id, saisie, par})`.
- Produces : `loadState(...).state.questions` ; constats `check` sur `spec/projet.yml`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `tests/questions-adherent.test.mjs`, avec ces imports en tête du fichier :

```js
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";
```

```js
const constats = s => chargerMoteur(s).run("checkSpec()").filter(c => c.fichier === "spec/projet.yml");

test("check : id manquant, texte manquant, id en double", () => {
  const c = constats(etat({ questions: [{ id: "", text: "A" }, { id: "q2", text: "" }, { id: "q3", text: "B" }, { id: "q3", text: "C" }] }));
  assert.deepEqual(c.map(x => x.niv), ["erreur", "erreur", "erreur"]);
  assert.match(c[0].msg, /id manquant/);
  assert.match(c[1].msg, /q2.*texte manquant/);
  assert.match(c[2].msg, /q3.*en double/);
  assert.deepEqual(constats(etat()), []);
});

test("de bout en bout : projet.yml, liste, réponse au registre", () => {
  const racine = racineExemple(), f = path.join(racine, "spec/projet.yml");
  const projet = YAML.parse(fs.readFileSync(f, "utf8"));
  projet.questions = [QA];
  fs.writeFileSync(f, YAML.stringify(projet));
  const e = ouvrirEspace(racine);
  assert.equal(e.loadState(e.makeCtx()).state.questions[0].titre, QA.titre);
  const r = e.repondre({ id: "projet#q1", saisie: { texte: "Transport et affrètement" }, par: "Dirigeant" });
  assert.ok(!r.erreurs, JSON.stringify(r));
  const reg = YAML.parse(fs.readFileSync(path.join(racine, "spec/reponses.yml"), "utf8"));
  assert.deepEqual([reg.at(-1).id, reg.at(-1).reponse], ["projet#q1", "Transport et affrètement"]);
  assert.equal(YAML.parse(fs.readFileSync(f, "utf8")).questions.length, 1, "projet.yml n'est pas modifié");
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `node --test tests/questions-adherent.test.mjs`
Expected: FAIL (`state.questions` indéfini, aucun constat `check`).

- [ ] **Step 3: Lire `projet.questions` dans `tools/espace.mjs`**

Ligne 58, extraire la normalisation d'une question dans une fonction définie juste au-dessus de `function loadState(ctx) {` :

```js
  const normQuestion = q => ({ id: q.id || "", text: q.text || "", done: !!q.done, answer: q.answer || "", reponse_type: q.reponse_type || "", reponse_cible: q.reponse_cible || "", options: Array.isArray(q.options) ? q.options : [], sql: q.sql || "", titre: q.titre || "", contexte: q.contexte || "" });
```

Ligne 58 devient :

```js
      d.questions = (d.questions || []).map(normQuestion);
```

Ligne 89, dans l'objet `state`, après `cases: (projet.cases || []).map(...)` ajouter `questions: (Array.isArray(projet.questions) ? projet.questions : []).map(normQuestion),` (la valeur de `cases` reste inchangée).

- [ ] **Step 4: Valider dans `core/check.js`**

Après la fermeture de `st.datasets.forEach(d=>{ ... });`, ajouter :

```js
  const idsProjet=new Set();
  (st.questions||[]).forEach(q=>{
    const f="spec/projet.yml";
    if(!q.id) return add("erreur",f,"question d'adhérent : id manquant");
    if(!String(q.text||"").trim()) add("erreur",f,`question ${q.id} : texte manquant`);
    if(idsProjet.has(q.id)) add("erreur",f,`question ${q.id} : id en double`); idsProjet.add(q.id);
  });
```

- [ ] **Step 5: `tools/gabarit.mjs` ligne 15**

Un nouvel adhérent écrit `questions: []` :

```js
  fs.writeFileSync(path.join(spec, "projet.yml"), ENTETE_PROJET + YAML.stringify({ adherent: projet.adherent, societes: projet.societes, cases: [], questions: [] }, { lineWidth: 0 }));
```

Si un test existant compare ce fichier au caractère près, mettre son attendu à jour.

- [ ] **Step 6: Vérifier**

Run: `node --test tests/questions-adherent.test.mjs && npm test`
Expected: PASS partout.

---

### Task 3: Viewer, documentation et premier usage

**Files:**
- Modify: `viewer/ui.js:258`
- Modify: `AGENTS.md` (section « spec/projet.yml » et tableau des types)
- Modify: `.cursor/rules/spec-format.mdc`
- Modify: `adherents/eurotranschanet/spec/projet.yml`

- [ ] **Step 1: Libellé de la source dans le viewer**

`viewer/ui.js:258` :

```js
const SRC_LIB={projet:"Adhérent",hypothese:"Hypothèse",controle:"Contrôle",profil:"Profil",hors_recette:"Hors recette",non_lu:"Non lu",registre:"Registre"};
```

- [ ] **Step 2: Documenter dans `AGENTS.md`**

Dans « Format de la spec », bloc `spec/projet.yml`, ajouter sous `cases:` :

```yaml
questions: # questions sur l'adhérent lui-même, indépendantes des outils
 - id: q1
 text: "Activités à suivre séparément"
 titre: "Quelles sont vos activités principales ?" # facultatif : la question telle que le dirigeant la lit
 contexte: "Votre comptabilité distingue du transport et de l'affrètement." # facultatif : preuves mesurées, en langage d'exploitant
 reponse_type: libre # comme une question de dataset
```

Ajouter une phrase : « Id dans la liste : `projet#q1`, lot `adherent`, classé en tête. La réponse va au registre ; `projet.yml` n'est pas modifié. »

- [ ] **Step 3: Même ajout dans `.cursor/rules/spec-format.mdc`**

Ajouter la ligne : `- Questions d'adhérent : bloc `questions:` de `projet.yml` (id, text, titre, contexte, reponse_type) ; ids uniques ; pas de bloc `hypothese`.`

- [ ] **Step 4: Premier usage, Euro Trans Chanet**

Dans `adherents/eurotranschanet/spec/projet.yml`, remplacer `cases: []` par :

```yaml
cases: []
questions:
  - id: q1
    text: "Activités à suivre séparément (regroupement des comptes 70x)"
    titre: "Quelles sont vos activités principales, à suivre séparément dans le tableau de bord ?"
    contexte: "Votre comptabilité distingue du transport (national, international), de l'affrètement, de la location, du stockage et des ventes de matériaux de carrières, plus des refacturations, surtaxes, cessions, litiges et formations. Faut-il en regrouper, en retirer ou en ajouter ?"
    reponse_type: libre
```

- [ ] **Step 5: Vérifier**

Run: `npm test && cd adherents/eurotranschanet && node ../../tools/atelier.mjs questions --lot adherent`
Expected: tests verts ; la liste affiche `projet#q1` sous « adherent ». Si la commande ne lit pas l'espace de l'adhérent, la vérifier avec `ADHERENTS_ROOT` dans `npm run serveur` et noter l'écart.

- [ ] **Step 6: Journal de l'adhérent**

Ajouter à `adherents/eurotranschanet/spec/journal.yml` :

```yaml
- date: 2026-11-08T18:00:00
  question: projet#q1 activités à suivre
  decision: "Première question d'adhérent posée (activités principales à suivre séparément). Mécanisme générique : bloc questions de projet.yml, source projet, lot adherent en tête."
  fichiers: [spec/projet.yml]
```

---

## Self-review

- **Couverture de la conception :** chargement (Task 2), liste et tri (Task 1), réponses et registre (Tasks 1 et 2), `check` (Task 2), viewer (Task 3), documentation (Task 3), tests (Tasks 1 et 2), premier usage (Task 3). Le prompt de `server/agent` et `/seance` ne sont pas traités : à vérifier après la livraison, aucun besoin identifié dans ce cycle.
- **Cohérence des noms :** `st.questions`, `projet#<id>`, `normQuestion`, lot `adherent`, source `projet`.
- **Limite connue :** un dataset nommé `adherent_…` partage le lot `adherent` ; le tri en tête est piloté par la source `projet`, sans effet fâcheux.
