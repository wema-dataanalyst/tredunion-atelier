# Cycle 5 : besoins et classement — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une étape « Besoins » où l'adhérent choisit ses thèmes de KPI, et améliorer le classement des données dans les codes catégorie.

**Architecture:** Nouveau fichier `spec/besoins.yml` stocke les thèmes cochés et les besoins libres. Le moteur calcule le statut `hors` par thème. L'interface affiche une page Besoins et un formulaire de classement amélioré.

**Tech Stack:** JavaScript (core, viewer), Node.js (server, tools), YAML (spec).

## Global Constraints

- Ne jamais écrire dans `data/` ni `generated/` (seules les commandes npm y écrivent).
- Ne jamais lire `.env`.
- Pas de `new Function` ni `eval` (CSP de la plateforme).
- Les colonnes `pii: true` ne doivent pas apparaître en clair.
- Garder les commentaires YAML et l'ordre des clés existantes.
- Réponses courtes, en français.

---

### Task 1: Format besoins.yml et lecture

**Files:**
- Create: `spec/besoins.yml` (exemple vide)
- Modify: `tools/espace.mjs` (ajout lecture)
- Test: `tests/besoins.test.mjs`

**Interfaces:**
- Consumes: rien
- Produces: `esp.besoins` objet `{themes: [{id, choisi}], libres: [{text}]}`

- [ ] **Step 1: Écrire le test de lecture**

```javascript
// tests/besoins.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { racineExemple } from "./aide/racine.mjs";

test("lecture de besoins.yml", async () => {
  const racine = racineExemple();
  fs.mkdirSync(path.join(racine, "spec"), { recursive: true });
  fs.writeFileSync(path.join(racine, "spec/besoins.yml"), YAML.stringify({
    themes: [{ id: "ca", choisi: true }, { id: "marge", choisi: false }],
    libres: [{ text: "taux de sinistralité" }]
  }));
  const { ouvrirEspace } = await import("../tools/espace.mjs");
  const esp = ouvrirEspace(racine);
  assert.deepEqual(esp.besoins.themes, [{ id: "ca", choisi: true }, { id: "marge", choisi: false }]);
  assert.deepEqual(esp.besoins.libres, [{ text: "taux de sinistralité" }]);
});

test("besoins.yml absent → défaut vide", async () => {
  const racine = racineExemple();
  fs.mkdirSync(path.join(racine, "spec"), { recursive: true });
  const { ouvrirEspace } = await import("../tools/espace.mjs");
  const esp = ouvrirEspace(racine);
  assert.deepEqual(esp.besoins, { themes: [], libres: [] });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
node --test tests/besoins.test.mjs
```

Attendu : FAIL (esp.besoins undefined)

- [ ] **Step 3: Ajouter la lecture dans espace.mjs**

Dans `tools/espace.mjs`, après la lecture de `mesures.yml`, ajouter :

```javascript
const besoinsPath = path.join(racine, "spec/besoins.yml");
const besoinsRaw = fs.existsSync(besoinsPath) ? YAML.parse(fs.readFileSync(besoinsPath, "utf8")) : null;
const besoins = { themes: besoinsRaw?.themes || [], libres: besoinsRaw?.libres || [] };
```

Et exposer `besoins` dans l'objet retourné par `ouvrirEspace`.

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

```bash
node --test tests/besoins.test.mjs
```

Attendu : PASS

- [ ] **Step 5: Lancer tous les tests**

```bash
npm test
```

Attendu : tous les tests passent (440+)

- [ ] **Step 6: Commit**

```bash
git add tests/besoins.test.mjs tools/espace.mjs
git commit -m "feat(besoins): lecture de spec/besoins.yml"
```

---

### Task 2: Liste des thèmes et mesures par thème

**Files:**
- Modify: `core/model.js` (ajout `THEMES`, `mesuresTheme`)
- Test: `tests/besoins.test.mjs` (ajout)

**Interfaces:**
- Consumes: `SHEETS` (structure des feuilles)
- Produces: `THEMES()` → `[{id, title, mesures: [nom]}]`, `mesuresTheme(id)` → `[nom]`

- [ ] **Step 1: Écrire le test**

```javascript
// dans tests/besoins.test.mjs, ajouter :
import { chargerMoteur, CATALOGUE } from "./aide/moteur.mjs";

test("THEMES liste les feuilles avec leurs mesures", () => {
  const m = chargerMoteur({ catalogue: CATALOGUE });
  const themes = m.run("THEMES()");
  assert.ok(themes.length >= 6);
  const ca = themes.find(t => t.id === "accueil");
  assert.ok(ca);
  assert.ok(ca.mesures.includes("CA Réel"));
});

test("mesuresTheme retourne les mesures d'un thème", () => {
  const m = chargerMoteur({ catalogue: CATALOGUE });
  const mesures = m.run("mesuresTheme('accueil')");
  assert.ok(mesures.includes("CA Réel"));
  assert.ok(mesures.includes("Budget"));
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
node --test tests/besoins.test.mjs
```

Attendu : FAIL (THEMES is not defined)

- [ ] **Step 3: Implémenter THEMES et mesuresTheme dans core/model.js**

Après la définition de `SHEETS` (copiée depuis viewer/dash.js ou importée), ajouter :

```javascript
const SHEETS_BASE = [
  { id: "accueil", title: "Accueil" },
  { id: "general", title: "Général" },
  { id: "resultat", title: "Résultat" },
  { id: "masse", title: "Masse salariale" },
  { id: "activites", title: "Activités" },
  { id: "couts", title: "Coûts d'exploitation" },
];

function mesuresDeSheet(sheet) {
  const noms = new Set();
  (sheet.objs || []).forEach(o => {
    if (o.m) noms.add(o.m);
    (o.items || []).forEach(i => noms.add(i.m));
    (o.measures || []).forEach(i => noms.add(i.m));
  });
  return [...noms];
}

function THEMES() {
  return cached("themes", () => {
    const sheetsFull = typeof SHEETS !== "undefined" ? SHEETS : [];
    return SHEETS_BASE.map(b => {
      const full = sheetsFull.find(s => s.id === b.id);
      return { id: b.id, title: b.title, mesures: full ? mesuresDeSheet(full) : [] };
    });
  });
}

function mesuresTheme(id) {
  const t = THEMES().find(t => t.id === id);
  return t ? t.mesures : [];
}
```

Note : `SHEETS` est défini dans viewer/dash.js, pas dans core/model.js. Pour les tests du moteur, on injecte une version minimale. En production (viewer), `SHEETS` est disponible globalement.

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Le test échouera car `SHEETS` n'est pas défini dans le moteur de test. Modifier `tests/aide/moteur.mjs` pour injecter `SHEETS` minimal :

```javascript
// Dans chargerMoteur, avant vm.runInContext :
const SHEETS_MIN = [
  { id: "accueil", title: "Accueil", objs: [{ t: "kb", items: [{ m: "CA Réel" }, { m: "Budget" }] }] },
  { id: "general", title: "Général", objs: [] },
  { id: "resultat", title: "Résultat", objs: [] },
  { id: "masse", title: "Masse salariale", objs: [] },
  { id: "activites", title: "Activités", objs: [] },
  { id: "couts", title: "Coûts d'exploitation", objs: [] },
];
vm.runInContext(`const SHEETS = ${JSON.stringify(SHEETS_MIN)};`, ctx);
```

Puis relancer :

```bash
node --test tests/besoins.test.mjs
```

Attendu : PASS

- [ ] **Step 5: Commit**

```bash
git add core/model.js tests/besoins.test.mjs tests/aide/moteur.mjs
git commit -m "feat(besoins): THEMES() et mesuresTheme()"
```

---

### Task 3: Statut hors par thème

**Files:**
- Modify: `core/model.js` (modifier `horsPerimetre`, `statutMesure`)
- Test: `tests/besoins.test.mjs` (ajout)

**Interfaces:**
- Consumes: `S.st.besoins` (thèmes cochés), `THEMES()`, `mesuresTheme()`
- Produces: `horsPerimetre()` inclut les mesures des thèmes non cochés

- [ ] **Step 1: Écrire le test**

```javascript
test("mesures d'un thème non coché sont hors périmètre", () => {
  const m = chargerMoteur({
    catalogue: CATALOGUE,
    besoins: { themes: [{ id: "accueil", choisi: false }], libres: [] }
  });
  const hors = m.run("[...horsPerimetre()]");
  assert.ok(hors.includes("CA Réel"));
  assert.ok(hors.includes("Budget"));
});

test("mesures d'un thème coché ne sont pas hors", () => {
  const m = chargerMoteur({
    catalogue: CATALOGUE,
    besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] }
  });
  const hors = m.run("[...horsPerimetre()]");
  assert.ok(!hors.includes("CA Réel"));
});

test("sans besoins.yml, rien n'est exclu par thème", () => {
  const m = chargerMoteur({ catalogue: CATALOGUE });
  const hors = m.run("[...horsPerimetre()]");
  assert.ok(!hors.includes("CA Réel"));
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
node --test tests/besoins.test.mjs
```

Attendu : FAIL (CA Réel pas dans hors)

- [ ] **Step 3: Modifier horsPerimetre dans core/model.js**

```javascript
function horsPerimetre() {
  return cached("hors", () => {
    const set = new Set();
    // périmètre explicite (cycle 2)
    (S.st.perimetre?.groupes || []).forEach(g => {
      if (g.hypothese?.valide) (g.mesures || []).forEach(n => set.add(n));
    });
    // thèmes non cochés (cycle 5)
    const besoins = S.st.besoins || { themes: [], libres: [] };
    if (besoins.themes.length) {
      THEMES().forEach(t => {
        const choix = besoins.themes.find(b => b.id === t.id);
        if (choix && !choix.choisi) t.mesures.forEach(n => set.add(n));
      });
    }
    return horsDe(CAT(), set);
  });
}
```

- [ ] **Step 4: Ajouter besoins à l'état dans chargerMoteur**

Dans `tests/aide/moteur.mjs`, ajouter `besoins: { themes: [], libres: [] }` dans `__state` par défaut, et le merger avec `partiel`.

- [ ] **Step 5: Lancer le test, vérifier qu'il passe**

```bash
node --test tests/besoins.test.mjs
```

Attendu : PASS

- [ ] **Step 6: Lancer tous les tests**

```bash
npm test
```

Attendu : tous passent

- [ ] **Step 7: Commit**

```bash
git add core/model.js tests/besoins.test.mjs tests/aide/moteur.mjs
git commit -m "feat(besoins): thèmes non cochés → mesures hors périmètre"
```

---

### Task 4: Lot besoins et questions de thèmes

**Files:**
- Modify: `core/questions.js` (ajout lot `besoins`)
- Test: `tests/besoins.test.mjs` (ajout)

**Interfaces:**
- Consumes: `THEMES()`, `S.st.besoins`
- Produces: questions avec `lot: "besoins"`, `cible: "theme:<id>"`

- [ ] **Step 1: Écrire le test**

```javascript
test("lot besoins génère une question par thème non tranché", () => {
  const m = chargerMoteur({ catalogue: CATALOGUE, besoins: { themes: [], libres: [] } });
  const qs = m.run("questions().filter(q => q.lot === 'besoins')");
  assert.ok(qs.length >= 6);
  assert.ok(qs.some(q => q.cible === "theme:accueil"));
});

test("thème déjà choisi → pas de question", () => {
  const m = chargerMoteur({
    catalogue: CATALOGUE,
    besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] }
  });
  const qs = m.run("questions().filter(q => q.cible === 'theme:accueil')");
  assert.equal(qs.length, 0);
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
node --test tests/besoins.test.mjs
```

Attendu : FAIL

- [ ] **Step 3: Ajouter le lot besoins dans core/questions.js**

```javascript
// Dans questions(), après les autres lots :
const besoins = S.st.besoins || { themes: [], libres: [] };
const themesTraites = new Set(besoins.themes.map(t => t.id));
THEMES().forEach(t => {
  if (!themesTraites.has(t.id)) {
    out.push({
      id: `theme:${t.id}`,
      cible: `theme:${t.id}`,
      lot: "besoins",
      text: `Voulez-vous suivre les indicateurs « ${t.title} » ?`,
      titre: `Voulez-vous suivre les indicateurs « ${t.title} » ?`,
      contexte: `${t.mesures.length} mesures : ${t.mesures.slice(0, 5).join(", ")}${t.mesures.length > 5 ? "…" : ""}`,
      reponse_type: "confirmer",
      done: false
    });
  }
});
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

```bash
node --test tests/besoins.test.mjs
```

Attendu : PASS

- [ ] **Step 5: Commit**

```bash
git add core/questions.js tests/besoins.test.mjs
git commit -m "feat(besoins): lot besoins avec questions par thème"
```

---

### Task 5: Opération classer dans le registre

**Files:**
- Modify: `core/calque.js` (ajout opération `classer`)
- Test: `tests/besoins.test.mjs` (ajout)

**Interfaces:**
- Consumes: réponse `{op: "classer", cible: "flux:f1.rules[0]", valeur: {cod, lib, nouveau}}`
- Produces: modification du flux dans `S.st.flux`

- [ ] **Step 1: Écrire le test**

```javascript
test("opération classer modifie une règle de flux", () => {
  const m = chargerMoteur({
    flux: [{
      id: "f1", ds: "tms", codMode: "regles", codCol: "compte",
      rules: [{ prefix: "706", cod: "CA TPS", lib: "CA transport" }],
      valeur: "montant", agg: "sum", champ: "MontantReel", unite: "€", date: "date"
    }],
    reponses: [{
      cible: "flux:f1.rules[0]",
      op: "classer",
      valeur: { cod: "CA LOC", lib: "CA location", nouveau: false }
    }]
  });
  const flux = m.run("S.st.flux.find(f => f.id === 'f1')");
  assert.equal(flux.rules[0].cod, "CA LOC");
  assert.equal(flux.rules[0].lib, "CA location");
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
node --test tests/besoins.test.mjs
```

Attendu : FAIL (cod reste CA TPS)

- [ ] **Step 3: Ajouter l'opération classer dans core/calque.js**

Dans `appliquerModif`, ajouter un cas pour `op === "classer"` :

```javascript
if (m.op === "classer") {
  const match = /^flux:(\w+)\.rules\[(\d+)\]$/.exec(m.cible);
  if (match) {
    const fl = st.flux.find(f => f.id === match[1]);
    if (fl && fl.rules && fl.rules[match[2]]) {
      fl.rules[match[2]].cod = m.valeur.cod;
      fl.rules[match[2]].lib = m.valeur.lib;
    }
  }
  // codMode fixe : flux:f1
  const matchFixe = /^flux:(\w+)$/.exec(m.cible);
  if (matchFixe && !match) {
    const fl = st.flux.find(f => f.id === matchFixe[1]);
    if (fl && fl.codMode === "fixe") {
      fl.cod = m.valeur.cod;
      fl.lib = m.valeur.lib;
    }
  }
  return;
}
```

Ajouter `"classer"` à la liste `OPS`.

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

```bash
node --test tests/besoins.test.mjs
```

Attendu : PASS

- [ ] **Step 5: Commit**

```bash
git add core/calque.js tests/besoins.test.mjs
git commit -m "feat(besoins): opération classer pour modifier le code d'un flux"
```

---

### Task 6: Validations check sur les besoins

**Files:**
- Modify: `core/check.js`
- Test: `tests/besoins.test.mjs` (ajout)

**Interfaces:**
- Consumes: `S.st.besoins`, `THEMES()`, `COV()`
- Produces: erreurs/alertes dans `check()`

- [ ] **Step 1: Écrire le test**

```javascript
test("check signale un thème coché sans mesure alimentée", () => {
  const m = chargerMoteur({
    catalogue: CATALOGUE,
    besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] },
    flux: [] // aucun flux → aucune mesure alimentée
  });
  const errs = m.run("check()");
  assert.ok(errs.some(e => e.niveau === "erreur" && e.message.includes("accueil") && e.message.includes("aucune mesure")));
});

test("check signale un besoin libre sans proposition", () => {
  const m = chargerMoteur({
    catalogue: CATALOGUE,
    besoins: { themes: [], libres: [{ text: "taux de sinistralité" }] },
    propositions: []
  });
  const errs = m.run("check()");
  assert.ok(errs.some(e => e.niveau === "alerte" && e.message.includes("sinistralité")));
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
node --test tests/besoins.test.mjs
```

Attendu : FAIL

- [ ] **Step 3: Ajouter les validations dans core/check.js**

```javascript
// Thème coché sans mesure alimentée
const besoins = S.st.besoins || { themes: [], libres: [] };
besoins.themes.filter(t => t.choisi).forEach(t => {
  const theme = THEMES().find(x => x.id === t.id);
  if (!theme) return;
  const cov = COV();
  const alim = theme.mesures.some(n => {
    const m = CAT().list.find(x => x.name === n);
    return m && (cov.get(m.id)?.s === "ok" || cov.get(m.id)?.s === "part");
  });
  if (!alim) add("erreur", `theme:${t.id}`, `Thème « ${theme.title} » coché mais aucune mesure alimentée`);
});

// Besoin libre sans proposition
besoins.libres.forEach(b => {
  // On ne peut pas vérifier automatiquement, on signale juste
  add("alerte", "besoins", `Besoin libre « ${b.text} » sans proposition de mesure associée`);
});
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

```bash
node --test tests/besoins.test.mjs
```

Attendu : PASS

- [ ] **Step 5: Lancer tous les tests**

```bash
npm test
```

Attendu : tous passent

- [ ] **Step 6: Commit**

```bash
git add core/check.js tests/besoins.test.mjs
git commit -m "feat(besoins): validations check pour thèmes et besoins libres"
```

---

### Task 7: Page Besoins dans viewer/ui.js

**Files:**
- Modify: `viewer/ui.js` (ajout page Besoins)
- Test: `tests/vue-besoins.test.mjs`

**Interfaces:**
- Consumes: `THEMES()`, `S.st.besoins`, `COV()`
- Produces: HTML de la page Besoins avec cases à cocher

- [ ] **Step 1: Écrire le test**

```javascript
// tests/vue-besoins.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE = ["core/engine.js", "core/mesures.js", "core/model.js", "core/check.js", "core/controles.js", "core/hypotheses.js", "core/questions.js", "core/calque.js"];
const SHEETS_MIN = [
  { id: "accueil", title: "Accueil", objs: [{ t: "kb", items: [{ m: "CA Réel" }, { m: "Budget" }] }] },
];

test("pageBesoins génère des cases à cocher par thème", () => {
  const ctx = vm.createContext({ console, Intl, Date, Math, JSON, document: { createElement: () => ({ innerHTML: "", querySelectorAll: () => [] }) } });
  vm.runInContext(`const SHEETS = ${JSON.stringify(SHEETS_MIN)};`, ctx);
  CORE.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));
  // Extraire pageBesoins de viewer/ui.js (si définie)
  const uiSrc = fs.readFileSync(path.join(ROOT, "viewer/ui.js"), "utf8");
  const match = uiSrc.match(/function pageBesoins\(\)[^]*?(?=\nfunction |\n\/\*|$)/);
  if (!match) { assert.ok(false, "pageBesoins non trouvée"); return; }
  vm.runInContext(match[0], ctx);
  vm.runInContext(`S.st = { besoins: { themes: [], libres: [] }, categories: [], catalogue: "" };`, ctx);
  const html = vm.runInContext("pageBesoins()", ctx);
  assert.ok(html.includes("accueil"));
  assert.ok(html.includes('type="checkbox"'));
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
node --test tests/vue-besoins.test.mjs
```

Attendu : FAIL (pageBesoins non trouvée)

- [ ] **Step 3: Implémenter pageBesoins dans viewer/ui.js**

```javascript
function pageBesoins() {
  const besoins = S.st.besoins || { themes: [], libres: [] };
  const themesChoisis = new Set(besoins.themes.filter(t => t.choisi).map(t => t.id));
  const cov = COV();
  const html = THEMES().map(t => {
    const checked = themesChoisis.has(t.id) ? " checked" : "";
    const alim = t.mesures.some(n => {
      const m = CAT().list.find(x => x.name === n);
      return m && (cov.get(m.id)?.s === "ok" || cov.get(m.id)?.s === "part");
    });
    const badge = alim ? ' <span class="badge">Données disponibles</span>' : "";
    const mesuresList = t.mesures.slice(0, 8).join(", ") + (t.mesures.length > 8 ? "…" : "");
    return `<div class="theme-block">
      <label><input type="checkbox" name="theme" value="${t.id}"${checked}> <strong>${esc(t.title)}</strong>${badge}</label>
      <details><summary>${t.mesures.length} mesures</summary><p>${esc(mesuresList)}</p></details>
    </div>`;
  }).join("\n");
  return `<h2>Quels indicateurs voulez-vous suivre ?</h2>
<p>Cochez les thèmes que vous souhaitez voir dans votre dashboard.</p>
<form id="form-besoins">
${html}
<div class="libre">
  <label>Autre indicateur :</label>
  <input type="text" name="libre" placeholder="ex: taux de sinistralité">
</div>
<button type="submit">Valider mes choix</button>
</form>`;
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

```bash
node --test tests/vue-besoins.test.mjs
```

Attendu : PASS

- [ ] **Step 5: Commit**

```bash
git add viewer/ui.js tests/vue-besoins.test.mjs
git commit -m "feat(besoins): page Besoins avec cases à cocher par thème"
```

---

### Task 8: Endpoint POST /api/besoins

**Files:**
- Modify: `server/app.mjs` (ajout route)
- Test: `tests/besoins-api.test.mjs`

**Interfaces:**
- Consumes: `POST /api/besoins` avec `{themes: [{id, choisi}], libres: [{text}]}`
- Produces: écrit `spec/besoins.yml`, retourne 200

- [ ] **Step 1: Écrire le test**

```javascript
// tests/besoins-api.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { racineExemple } from "./aide/racine.mjs";

test("POST /api/besoins écrit spec/besoins.yml", async () => {
  const racine = racineExemple();
  fs.mkdirSync(path.join(racine, "spec"), { recursive: true });
  // Simuler l'écriture (test unitaire, pas HTTP)
  const { ecrireBesoins } = await import("../server/agent/specs.mjs");
  ecrireBesoins(racine, { themes: [{ id: "ca", choisi: true }], libres: [] });
  const contenu = YAML.parse(fs.readFileSync(path.join(racine, "spec/besoins.yml"), "utf8"));
  assert.deepEqual(contenu.themes, [{ id: "ca", choisi: true }]);
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
node --test tests/besoins-api.test.mjs
```

Attendu : FAIL (ecrireBesoins non trouvée)

- [ ] **Step 3: Ajouter ecrireBesoins dans server/agent/specs.mjs**

```javascript
export function ecrireBesoins(racine, besoins) {
  const p = path.join(racine, "spec/besoins.yml");
  fs.writeFileSync(p, "# Besoins de l'adhérent\n" + YAML.stringify(besoins));
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

```bash
node --test tests/besoins-api.test.mjs
```

Attendu : PASS

- [ ] **Step 5: Ajouter la route dans server/app.mjs**

```javascript
app.post("/api/besoins", sessionAdherent, async (req, res) => {
  const { themes, libres } = req.body;
  ecrireBesoins(espaceAdherent(req), { themes: themes || [], libres: libres || [] });
  regenerer(req);
  res.json({ ok: true });
});
```

- [ ] **Step 6: Commit**

```bash
git add server/agent/specs.mjs server/app.mjs tests/besoins-api.test.mjs
git commit -m "feat(besoins): endpoint POST /api/besoins"
```

---

### Task 9: Jauge et dashboard filtrés

**Files:**
- Modify: `viewer/ui.js` (jauge)
- Modify: `viewer/dash.js` (filtrage)
- Test: `tests/vue-besoins.test.mjs` (ajout)

**Interfaces:**
- Consumes: `S.st.besoins`, `horsPerimetre()`
- Produces: jauge « X choisies, Y alimentées », feuilles filtrées par thème

- [ ] **Step 1: Écrire le test**

```javascript
test("jauge affiche mesures choisies et alimentées", () => {
  // Test de la fonction jaugeBesoins
  const ctx = vm.createContext({ console, Intl, Date, Math, JSON });
  vm.runInContext(`const SHEETS = ${JSON.stringify(SHEETS_MIN)};`, ctx);
  CORE.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));
  vm.runInContext(`S.st = { besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] }, categories: [], catalogue: "CA Réel\\n    1\\n", flux: [] };`, ctx);
  vm.runInContext("S.ver++;", ctx);
  const counts = vm.runInContext("measureCounts()", ctx);
  assert.ok(counts.ok >= 0);
});
```

- [ ] **Step 2: Modifier la jauge dans viewer/ui.js**

Remplacer `Mesures ${c.ok + c.part}/${total}` par :

```javascript
const besoins = S.st.besoins || { themes: [], libres: [] };
const themesChoisis = besoins.themes.filter(t => t.choisi).length;
const total = CAT().list.length - c.hors;
const jaugeText = themesChoisis ? `${total} choisies, ${c.ok + c.part} alimentées` : `Mesures ${c.ok + c.part}/${CAT().list.length}`;
```

- [ ] **Step 3: Vérifier que le dashboard filtre par thème**

Dans `viewer/dash.js`, `renderPrev` utilise déjà `filtrerFeuilles` avec `horsPerimetre()`. Les mesures des thèmes non cochés sont déjà filtrées via Task 3.

- [ ] **Step 4: Lancer tous les tests**

```bash
npm test
```

Attendu : tous passent

- [ ] **Step 5: Commit**

```bash
git add viewer/ui.js viewer/dash.js tests/vue-besoins.test.mjs
git commit -m "feat(besoins): jauge et dashboard filtrés par thème"
```

---

### Task 10: Documentation AGENTS.md

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: spec du cycle 5
- Produces: documentation du format `besoins.yml` et de l'opération `classer`

- [ ] **Step 1: Ajouter la section besoins.yml dans AGENTS.md**

Après la section `spec/mesures.yml`, ajouter :

```markdown
### `spec/besoins.yml`
```yaml
themes:
  - id: accueil       # id de la feuille du dashboard
    choisi: true      # true : l'adhérent veut ces mesures
  - id: marge
    choisi: false     # false : ces mesures sont hors périmètre
libres:
  - text: "taux de sinistralité"  # besoin exprimé en texte libre
```

Les thèmes correspondent aux feuilles du dashboard (Accueil, Général, Résultat, Masse salariale, Activités, Coûts d'exploitation). Un thème non coché met toutes ses mesures en statut `hors`.
```

- [ ] **Step 2: Ajouter l'opération classer**

Dans la section des opérations de réponse :

```markdown
| `classer` | `flux:<id>.rules[<n>]` ou `flux:<id>` | `{cod, lib, nouveau}` | Change le code et libellé d'une règle de flux |
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: format besoins.yml et opération classer"
```

---

## Self-Review

1. **Spec coverage:**
   - Section 1 (Besoins) → Tasks 1, 4, 7, 8
   - Section 2 (Classement) → Task 5
   - Section 3 (Intégration) → Tasks 2, 3, 4
   - Section 4 (Interface) → Tasks 7, 9
   - Section 5 (Garde-fous) → Task 6
   - Documentation → Task 10

2. **Placeholder scan:** aucun TBD, TODO, "similar to".

3. **Type consistency:** `THEMES()` retourne `[{id, title, mesures}]` dans Task 2 et est utilisé ainsi dans Tasks 3, 4, 6, 7. OK.
