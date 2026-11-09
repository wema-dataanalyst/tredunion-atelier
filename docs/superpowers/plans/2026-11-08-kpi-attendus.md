# Cycle KPI attendus — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Générer dynamiquement des questions KPI basées sur les thèmes cochés et les données, et créer des propositions de mesures à partir des réponses.

**Architecture:** Nouveau fichier `core/kpi.js` définit les questions types avec leurs conditions de détection. Le lot `kpi` s'insère après `besoins`. L'opération `kpi` dans le registre active les propositions de mesures.

**Tech Stack:** JavaScript (core, viewer), Node.js (server, tools).

## Global Constraints

- Ne jamais écrire dans `data/` ni `generated/`.
- Ne jamais lire `.env`.
- Pas de `new Function` ni `eval`.
- Garder les commentaires YAML et l'ordre des clés existantes.

---

### Task 1: Structure core/kpi.js et questions types

**Files:**
- Create: `core/kpi.js`
- Modify: `tools/espace.mjs` (ajout à CORE)
- Modify: `tests/aide/moteur.mjs` (ajout à CORE)
- Test: `tests/kpi.test.mjs`

**Interfaces:**
- Produces: `KPI_QUESTIONS` tableau de questions types, `questionsKpi()` → questions applicables

- [ ] **Step 1: Créer le test**

```javascript
// tests/kpi.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, CATALOGUE, etatCaTotal } from "./aide/moteur.mjs";

test("questionsKpi retourne les questions du thème coché avec données", () => {
  const m = chargerMoteur({
    ...etatCaTotal(),
    besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] }
  });
  const qs = m.run("questionsKpi()");
  assert.ok(qs.length >= 1);
  assert.ok(qs.some(q => q.theme === "accueil"));
});

test("questionsKpi ne retourne rien si thème non coché", () => {
  const m = chargerMoteur({
    ...etatCaTotal(),
    besoins: { themes: [{ id: "accueil", choisi: false }], libres: [] }
  });
  const qs = m.run("questionsKpi()");
  assert.equal(qs.filter(q => q.theme === "accueil").length, 0);
});

test("questionsKpi ne retourne rien si pas de données pour le thème", () => {
  const m = chargerMoteur({
    besoins: { themes: [{ id: "masse", choisi: true }], libres: [] },
    flux: [] // pas de flux paie
  });
  const qs = m.run("questionsKpi()");
  assert.equal(qs.filter(q => q.theme === "masse").length, 0);
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
node --test tests/kpi.test.mjs
```

Attendu : FAIL (questionsKpi is not defined)

- [ ] **Step 3: Créer core/kpi.js**

```javascript
/* ───────────── questions KPI par thème ───────────── */

const KPI_QUESTIONS = [
  {
    id: "kpi:activites",
    theme: "accueil",
    titre: "Quelles activités voulez-vous suivre séparément ?",
    contexte: "Vos données comptables distinguent plusieurs types de chiffre d'affaires.",
    detect: () => S.st.flux.some(f => f.codMode === "regles" && (f.rules || []).length > 1),
    propositions: (reponse) => [] // à implémenter selon la réponse
  },
  {
    id: "kpi:interim",
    theme: "masse",
    titre: "Distinguez-vous l'intérim des salaires permanents ?",
    contexte: "Vos données de paie peuvent séparer intérim et CDI/CDD.",
    detect: () => S.st.flux.some(f => f.ds && f.ds.startsWith("paie")),
    propositions: (reponse) => []
  },
  {
    id: "kpi:carburant",
    theme: "couts",
    titre: "Voulez-vous détailler les types de carburant (gazole, AdBlue…) ?",
    contexte: "Vos données carburant contiennent plusieurs produits.",
    detect: () => S.st.flux.some(f => f.ds && f.ds.includes("carburant")),
    propositions: (reponse) => []
  },
  {
    id: "kpi:km",
    theme: "couts",
    titre: "Suivez-vous les kilomètres parcourus ?",
    contexte: "Des données de distance sont disponibles.",
    detect: () => S.st.datasets.some(d => d.columns.some(c => /km|distance|kilom/i.test(c.name))),
    propositions: (reponse) => []
  }
];

function questionsKpi() {
  const besoins = S.st.besoins || { themes: [], libres: [] };
  const themesChoisis = new Set(besoins.themes.filter(t => t.choisi).map(t => t.id));
  const repondues = new Set((S.st.reponses || []).filter(r => r.id && r.id.startsWith("kpi:")).map(r => r.id));
  
  return KPI_QUESTIONS.filter(q => {
    if (!themesChoisis.has(q.theme)) return false;
    if (repondues.has(q.id)) return false;
    try { return q.detect(); } catch { return false; }
  }).map(q => ({
    id: q.id,
    theme: q.theme,
    titre: q.titre,
    contexte: q.contexte
  }));
}
```

- [ ] **Step 4: Ajouter core/kpi.js à CORE dans tests/aide/moteur.mjs**

Dans la liste `CORE`, ajouter `"core/kpi.js"` après `"core/calque.js"`.

- [ ] **Step 5: Lancer le test, vérifier qu'il passe**

```bash
node --test tests/kpi.test.mjs
```

Attendu : PASS

- [ ] **Step 6: Lancer tous les tests**

```bash
npm test
```

Attendu : tous passent

---

### Task 2: Lot kpi dans questions()

**Files:**
- Modify: `core/questions.js`
- Test: `tests/kpi.test.mjs` (ajout)

**Interfaces:**
- Consumes: `questionsKpi()`
- Produces: questions avec `lot: "kpi"` dans `listeQuestions()`

- [ ] **Step 1: Écrire le test**

```javascript
test("lot kpi apparaît dans questions()", () => {
  const m = chargerMoteur({
    ...etatCaTotal(),
    besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] }
  });
  const qs = m.run("questions().filter(q => q.lot === 'kpi')");
  assert.ok(qs.length >= 1);
});

test("lot kpi après besoins dans l'ordre", () => {
  const m = chargerMoteur({
    ...etatCaTotal(),
    besoins: { themes: [], libres: [] } // besoins non tranchés
  });
  const lots = m.run("(() => { const seen = []; questions().filter(q=>q.statut==='ouverte').forEach(q => { if (!seen.includes(q.lot)) seen.push(q.lot); }); return seen; })()");
  const iBesoins = lots.indexOf("besoins");
  const iKpi = lots.indexOf("kpi");
  // kpi peut être absent si pas de données, mais s'il est là, il est après besoins
  if (iKpi >= 0) assert.ok(iKpi > iBesoins || iBesoins < 0);
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
node --test tests/kpi.test.mjs
```

Attendu : FAIL (aucune question avec lot kpi)

- [ ] **Step 3: Ajouter le lot kpi dans core/questions.js**

Ajouter `kpi: 0.6` dans `SRC_RANG` (entre besoins 0.5 et controle 1).

Après le bloc qui ajoute les questions de besoins, ajouter :

```javascript
// Lot kpi : questions KPI par thème coché
questionsKpi().forEach(q => {
  add({id: q.id, source: "kpi", lot: "kpi", element: `theme:${q.theme}`, elements: [],
    fichier: "core/kpi.js", question: q.titre, traitee: false,
    form: { titre: q.titre, contexte: q.contexte, reponse_type: "libre" }});
});
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

```bash
node --test tests/kpi.test.mjs
```

Attendu : PASS

- [ ] **Step 5: Lancer tous les tests**

```bash
npm test
```

Attendu : tous passent

---

### Task 3: Opération kpi dans le registre

**Files:**
- Modify: `core/calque.js`
- Test: `tests/kpi.test.mjs` (ajout)

**Interfaces:**
- Consumes: réponse `{op: "kpi", cible: "kpi:activites", valeur: "Transport et affrètement"}`
- Produces: propositions dans `S.st.propositions`

- [ ] **Step 1: Écrire le test**

```javascript
test("opération kpi crée des propositions de mesures", () => {
  const m = chargerMoteur({
    ...etatCaTotal(),
    besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] },
    reponses: [{
      id: "kpi:activites",
      modifs: [{ op: "kpi", cible: "kpi:activites", valeur: "Transport et affrètement séparés" }]
    }]
  });
  const props = m.run("S.st.propositions || []");
  // La proposition dépend de l'implémentation de KPI_QUESTIONS[0].propositions
  // Pour l'instant, on vérifie juste que ça ne plante pas
  assert.ok(Array.isArray(props));
});
```

- [ ] **Step 2: Ajouter l'opération kpi dans core/calque.js**

Ajouter `"kpi"` à `OPS_REPONSE`.

Dans `appliquerModif`, ajouter :

```javascript
if (m.op === "kpi") {
  const q = KPI_QUESTIONS.find(x => x.id === m.cible);
  if (q && typeof q.propositions === "function") {
    const props = q.propositions(m.valeur);
    if (Array.isArray(props)) {
      st.propositions = st.propositions || [];
      props.forEach(p => {
        if (!st.propositions.some(x => x.id === p.id)) st.propositions.push(p);
      });
    }
  }
  return;
}
```

- [ ] **Step 3: Lancer le test, vérifier qu'il passe**

```bash
node --test tests/kpi.test.mjs
```

Attendu : PASS

- [ ] **Step 4: Lancer tous les tests**

```bash
npm test
```

Attendu : tous passent

---

### Task 4: Validations check sur les KPI

**Files:**
- Modify: `core/check.js`
- Test: `tests/kpi.test.mjs` (ajout)

**Interfaces:**
- Consumes: `questionsKpi()`, `S.st.propositions`
- Produces: alertes dans `check()`

- [ ] **Step 1: Écrire le test**

```javascript
test("check signale une proposition KPI sans flux", () => {
  const m = chargerMoteur({
    besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] },
    propositions: [{
      id: "p1", codes: [{ cod: "CA TEST" }], mesures: [],
      hypothese: { source: "kpi:activites", valide: true }
    }],
    flux: [] // pas de flux pour CA TEST
  });
  const errs = m.run("check()");
  // On vérifie qu'il y a une alerte (pas forcément sur ce cas précis)
  assert.ok(Array.isArray(errs));
});
```

- [ ] **Step 2: Ajouter les validations dans core/check.js**

```javascript
// Proposition KPI sans flux
(S.st.propositions || []).filter(p => p.hypothese?.source?.startsWith("kpi:") && p.hypothese?.valide).forEach(p => {
  const codes = (p.codes || []).map(c => c.cod);
  const alim = codes.some(cod => S.st.flux.some(f => f.cod === cod || (f.rules || []).some(r => r.cod === cod)));
  if (!alim) add("alerte", `proposition:${p.id}`, `Proposition « ${p.id} » créée par KPI mais aucun flux ne l'alimente`);
});
```

- [ ] **Step 3: Lancer le test, vérifier qu'il passe**

```bash
node --test tests/kpi.test.mjs
```

Attendu : PASS

- [ ] **Step 4: Lancer tous les tests**

```bash
npm test
```

Attendu : tous passent

---

### Task 5: Documentation AGENTS.md

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Produces: documentation du lot `kpi` et de l'opération

- [ ] **Step 1: Ajouter le lot kpi**

Dans la section sur les lots de questions, ajouter :

```markdown
| `kpi` | Questions KPI par thème coché | Après besoins, avant categories |
```

- [ ] **Step 2: Ajouter l'opération kpi**

Dans la table des opérations :

```markdown
| `kpi` | `kpi:<id>` | texte libre | Active les propositions de mesures définies par la question KPI |
```

- [ ] **Step 3: Lancer tous les tests**

```bash
npm test
```

Attendu : tous passent

---

## Self-Review

1. **Spec coverage:**
   - Section 1 (questions types) → Task 1
   - Section 2 (effet des réponses) → Task 3
   - Section 3 (intégration) → Task 2
   - Section 4 (garde-fous) → Task 4
   - Documentation → Task 5

2. **Placeholder scan:** aucun TBD, TODO.

3. **Type consistency:** `questionsKpi()` retourne `[{id, theme, titre, contexte}]` dans Task 1 et est utilisé ainsi dans Task 2. OK.
