# Périmètre des mesures : moteur et affichage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `spec/perimetre.yml` écarte des mesures du dashboard et de la couverture, après validation de l'adhérent dans l'onglet Questions.

**Architecture:** `tools/espace.mjs` charge les groupes dans l'état (`perimetre`). Chaque groupe est un porteur d'hypothèse (cible `perimetre:<id>`) : le mécanisme existant fournit la question, la réponse `valider` et la confiance. `core/model.js` calcule l'ensemble des mesures hors périmètre (groupes validés + dépendances), le statut `hors`, et le filtrage des feuilles du dashboard. Le viewer et les commandes de couverture lisent ce calcul.

**Tech Stack:** Node (ESM, `node:test`), moteur `core/*.js` exécuté dans un contexte `vm`, YAML.

Ce plan couvre le moteur et l'affichage. L'écriture des groupes par la maquette (outil `ecrire_perimetre`) est un second plan, à écrire ensuite.

## Global Constraints

- Conception : `docs/superpowers/specs/2026-11-08-perimetre-mesures-design.md`.
- Un adhérent sans `spec/perimetre.yml` se comporte exactement comme avant : tous les tests existants restent verts (`npm test`).
- Un groupe proposé (ni `valide` ni `refuse`) ne retire rien. Validé : les mesures sont hors périmètre. Refusé : elles restent.
- Une mesure qui référence une mesure hors périmètre l'est aussi (dépendance transitive).
- Le catalogue Qlik, `SHEETS` (liste des feuilles) et `generated/` ne sont pas modifiés : le filtrage se fait à l'affichage et dans le calcul de couverture.
- Les réponses passent par le registre `spec/reponses.yml` et l'opération `valider` existante ; le moteur n'écrit jamais dans `perimetre.yml`.
- Dossier sans git : pas de commit ; chaque tâche se termine par `npm test`.
- Ne jamais écrire dans `data/` ni `generated/` à la main. Ne jamais lire `.env`.

## File Structure

- Modifier `core/model.js` : `hydrate`, `horsDe`, `horsPerimetre`, `statutMesure`, `measureCounts`, `ST_M`, `filtrerFeuilles`.
- Modifier `core/calque.js` : `porteurHypothese` reconnaît `perimetre:<id>`.
- Modifier `core/hypotheses.js` : `listeHypotheses` liste les groupes.
- Modifier `core/questions.js` : lot `adherent` pour les groupes.
- Modifier `core/check.js` : validation des groupes.
- Modifier `tools/espace.mjs` : chargement, `apercuQuestion`, `couverture`.
- Modifier `tools/atelier.mjs` : commande `couverture`.
- Modifier `viewer/ui.js`, `viewer/dash.js`, `viewer/style.css` : affichage.
- Modifier `AGENTS.md`, `.cursor/rules/spec-format.mdc` : format documenté.
- Créer `tests/perimetre.test.mjs`.

---

### Task 1: Calcul des mesures hors périmètre et filtrage du dashboard

**Files:**
- Modify: `core/model.js` (`hydrate` ligne 46, `ST_M` ligne 211, `measureCounts` ligne 209)
- Test: `tests/perimetre.test.mjs`

**Interfaces:**
- Produces : `st.perimetre` = tableau de `{id, cause, mesures:[nom], titre, contexte, hypothese}` ; `horsDe(cat)` → `Set` de noms ; `horsPerimetre()` → `Set` (sur `CAT()`, mis en cache) ; `statutMesure(m)` → `"ok"|"part"|"none"|"err"|"hors"` ; `measureCounts()` → `{ok, part, none, err, hors}` ; `filtrerFeuilles(sheets, estHors)` → feuilles sans les objets vides.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/perimetre.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, etatCaTotal } from "./aide/moteur.mjs";

const CATALOGUE = "CA Réel\n    Sum({<[%COD_CATEGORIE]={'CA TOTAL'}>} MontantReel)\n\nGazole\n    Sum({<[%COD_CATEGORIE]={'GO'}>} MontantReel)\n\nPart gazole\n    [Gazole] / [CA Réel]\n";
const groupe = (valide, refuse = false) => ({ id: "g1", cause: "Pas de carburant", mesures: ["Gazole"], titre: "Retirer le gazole ?", contexte: "Aucune donnée.", hypothese: { source: "agent", preuves: ["Aucune ligne GO"], question: "Le gazole ne s'applique pas ?", valide, refuse } });
const moteur = (perimetre) => chargerMoteur(etatCaTotal(undefined, { catalogue: CATALOGUE, ...(perimetre ? { perimetre } : {}) }));
const noms = m => m.run("[...horsPerimetre()].sort()");

test("sans perimetre, aucune mesure n'est hors périmètre", () => {
  assert.deepEqual(noms(moteur()), []);
});

test("un groupe proposé ne retire rien", () => {
  assert.deepEqual(noms(moteur([groupe(false)])), []);
});

test("un groupe refusé ne retire rien", () => {
  assert.deepEqual(noms(moteur([groupe(false, true)])), []);
});

test("un groupe validé retire ses mesures et celles qui en dépendent", () => {
  assert.deepEqual(noms(moteur([groupe(true)])), ["Gazole", "Part gazole"]);
});

test("une dépendance circulaire ne boucle pas", () => {
  const circ = "A\n    [B] + 1\n\nB\n    [A] + 1\n";
  const m = chargerMoteur(etatCaTotal(undefined, { catalogue: circ, perimetre: [{ ...groupe(true), mesures: ["A"] }] }));
  assert.deepEqual(noms(m), ["A", "B"]);
});

test("statutMesure et measureCounts : hors sort du total", () => {
  const m = moteur([groupe(true)]);
  assert.equal(m.run("statutMesure(CAT().resolve('Gazole'))"), "hors");
  assert.equal(m.run("statutMesure(CAT().resolve('CA Réel'))"), "ok");
  const c = m.run("measureCounts()");
  assert.equal(c.hors, 2);
  assert.equal(c.ok + c.part + c.none + c.err + c.hors, 3);
});

test("filtrerFeuilles : objet vide retiré, objet partiel gardé, feuille vide retirée", () => {
  const sheets = [
    { id: "a", title: "A", objs: [
      { t: "kb", items: [{ m: "X" }, { m: "Y" }] },
      { t: "chart", measures: [{ m: "X" }] },
      { t: "gauge", m: "X" },
      { t: "costdonut" },
    ] },
    { id: "b", title: "B", objs: [{ t: "pie", measures: [{ m: "X" }] }] },
  ];
  const r = moteur().run(`filtrerFeuilles(${JSON.stringify(sheets)}, n => n === "X")`);
  assert.deepEqual(r.map(s => s.id), ["a"]);
  assert.deepEqual(r[0].objs, [{ t: "kb", items: [{ m: "Y" }] }, { t: "costdonut" }]);
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `node --test tests/perimetre.test.mjs`
Expected: FAIL (`horsPerimetre is not defined`).

- [ ] **Step 3: Normaliser `perimetre` dans `hydrate`**

`core/model.js` ligne 46, ajouter `st.perimetre=st.perimetre||[];` après `st.questions=st.questions||[];` :

```js
  st.relations=st.relations||[]; st.flux=st.flux||[]; st.categories=st.categories||[]; st.cases=st.cases||[]; st.questions=st.questions||[]; st.perimetre=st.perimetre||[]; st.log=st.log||[]; st.catalogue=st.catalogue||"";
```

- [ ] **Step 4: Ajouter le calcul**

Dans `core/model.js`, remplacer la ligne `function measureCounts(){ ... }` (ligne 209) et la ligne `const ST_M=...` (ligne 211) par :

```js
/* mesures hors périmètre : groupes validés de spec/perimetre.yml, plus les mesures qui s'appuient sur elles */
function horsDe(cat){
  const noms=new Set(); (S.st.perimetre||[]).filter(g=>g&&g.hypothese&&g.hypothese.valide).forEach(g=>(g.mesures||[]).forEach(n=>noms.add(String(n))));
  if(!noms.size) return new Set();
  const memo=new Map(), est=(m,pile=new Set())=>{
    if(memo.has(m.id)) return memo.get(m.id); if(pile.has(m.id)) return false; pile.add(m.id);
    const r=noms.has(m.name)||(m.refs||[]).some(x=>{ const t=cat.resolve(x); return !!t&&est(t,pile); });
    pile.delete(m.id); memo.set(m.id,r); return r; };
  const out=new Set(); cat.list.forEach(m=>{ if(est(m)) out.add(m.name); }); return out;
}
function horsPerimetre(){ return cached("hors",()=>horsDe(CAT())); }
function statutMesure(m){ return horsPerimetre().has(m.name)?"hors":COV().get(m.id).s; }
function measureCounts(){ const c={ok:0,part:0,none:0,err:0,hors:0}; CAT().list.forEach(m=>{ c[statutMesure(m)]++; }); return c; }
/* feuilles du dashboard sans les mesures hors périmètre : objet vide retiré, objet partiel gardé, feuille vide retirée */
function filtrerFeuilles(sheets,estHors){
  const garde=l=>l.filter(x=>!estHors(x.m));
  const objet=o=>{
    if(Array.isArray(o.items)){ const items=garde(o.items); return items.length?{...o,items}:null; }
    if(Array.isArray(o.measures)){ const measures=garde(o.measures); return measures.length?{...o,measures}:null; }
    if(o.m) return estHors(o.m)?null:o;
    return o; };
  return sheets.map(s=>({...s,objs:s.objs.map(objet).filter(Boolean)})).filter(s=>s.objs.length);
}
```

et à la place de l'ancienne ligne `ST_M` :

```js
const ST_M={ok:"Alimentée",part:"Partielle",none:"Non alimentée",err:"À corriger",hors:"Hors périmètre"};
```

(`ST_M` et `measureCounts` restent aux mêmes endroits relatifs : ne déplace rien d'autre.)

- [ ] **Step 5: Vérifier**

Run: `node --test tests/perimetre.test.mjs && npm test`
Expected: PASS partout. Les appelants existants de `measureCounts` (`core/check.js`, `viewer/boot.js`, `viewer/ui.js`) calculent leur total avec `ok+part+none+err` : `hors` en est exclu sans autre changement.

---

### Task 2: Chargement, hypothèses, questions et validation

**Files:**
- Modify: `tools/espace.mjs` (`loadState`, `apercuQuestion`)
- Modify: `core/calque.js` (`porteurHypothese`)
- Modify: `core/hypotheses.js` (`listeHypotheses`)
- Modify: `core/questions.js` (lot, rang)
- Modify: `core/check.js`
- Test: `tests/perimetre.test.mjs`

**Interfaces:**
- Consumes : `st.perimetre` (Task 1) ; `racineExemple()` (`tests/aide/racine.mjs`), `ouvrirEspace(racine)` avec `loadState(makeCtx())`, `evaluate()`, `repondre({id, saisie, par})`, `apercuQuestion(id)`.
- Produces : `loadState(...).state.perimetre` ; cible `perimetre:<id>` ; entrée de `listeQuestions()` avec `id:"perimetre:<id>"`, `source:"hypothese"`, `lot:"adherent"`, `fichier:"spec/perimetre.yml"` ; constats `check` sur `spec/perimetre.yml`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `tests/perimetre.test.mjs`, avec ces imports en tête du fichier :

```js
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import YAML from "yaml";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";
```

```js
const liste = m => m.run("listeQuestions()");
const constats = m => m.run("checkSpec()").filter(c => c.fichier === "spec/perimetre.yml");

test("un groupe est une question de l'adhérent, avec le titre et le contexte du groupe", () => {
  const q = liste(moteur([groupe(false)])).find(x => x.id === "perimetre:g1");
  assert.deepEqual([q.source, q.lot, q.fichier, q.statut, q.type], ["hypothese", "adherent", "spec/perimetre.yml", "ouverte", "confirmer"]);
  assert.equal(q.titre, "Retirer le gazole ?");
  assert.equal(q.intro, "Aucune donnée.");
});

test("le lot adherent passe en tête quand un groupe est ouvert", () => {
  const s = etatCaTotal(undefined, { catalogue: CATALOGUE, perimetre: [groupe(false)] });
  s.datasets[0].questions = [{ id: "q1", text: "montant : valeurs négatives, avoirs ?", done: false }];
  assert.equal(liste(chargerMoteur(s))[0].id, "perimetre:g1");
});

test("check : id manquant, id en double, cause vide, hypothèse absente, mesure inconnue", () => {
  const g = (o) => ({ ...groupe(false), ...o });
  const c = constats(moteur([g({ id: "" }), g({ id: "g2" }), g({ id: "g2" }), g({ id: "g3", cause: "" }), g({ id: "g4", hypothese: null }), g({ id: "g5", mesures: ["Inconnue"] })]));
  const msgs = c.map(x => `${x.niv}:${x.msg}`);
  assert.ok(msgs.some(m => /^erreur:.*id manquant/.test(m)), msgs.join("\n"));
  assert.ok(msgs.some(m => /^erreur:.*g2.*en double/.test(m)));
  assert.ok(msgs.some(m => /^erreur:.*g3.*cause manquante/.test(m)));
  assert.ok(msgs.some(m => /^erreur:.*g4.*hypothèse manquante/.test(m)));
  assert.ok(msgs.some(m => /^alerte:.*g5.*Inconnue/.test(m)));
  assert.deepEqual(constats(moteur([groupe(false)])), []);
});

const racineAvecGroupe = () => {
  const racine = racineExemple(), e0 = ouvrirEspace(racine);
  const nom = vm.runInContext("CAT().list[0].name", e0.evaluate().ctx);
  fs.writeFileSync(path.join(racine, "spec/perimetre.yml"), YAML.stringify({ groupes: [{ ...groupe(false), mesures: [nom] }] }));
  return { racine, nom, e: ouvrirEspace(racine) };
};

test("de bout en bout : perimetre.yml chargé, réponse oui au registre, mesure hors périmètre", () => {
  const { racine, nom, e } = racineAvecGroupe();
  assert.equal(e.loadState(e.makeCtx()).state.perimetre[0].id, "g1");
  assert.deepEqual(vm.runInContext("[...horsPerimetre()]", e.evaluate().ctx), []);
  const r = e.repondre({ id: "perimetre:g1", saisie: { oui: true }, par: "Dirigeant" });
  assert.ok(!r.erreurs, JSON.stringify(r));
  const reg = YAML.parse(fs.readFileSync(path.join(racine, "spec/reponses.yml"), "utf8"));
  assert.deepEqual([reg.at(-1).id, reg.at(-1).modifs[0].op, reg.at(-1).modifs[0].valeur], ["perimetre:g1", "valider", true]);
  assert.ok(vm.runInContext("[...horsPerimetre()]", e.evaluate().ctx).includes(nom));
  assert.equal(YAML.parse(fs.readFileSync(path.join(racine, "spec/perimetre.yml"), "utf8")).groupes[0].hypothese.valide, false, "perimetre.yml n'est pas modifié");
});

test("réponse non : la mesure reste, groupe refusé", () => {
  const { e } = racineAvecGroupe();
  const r = e.repondre({ id: "perimetre:g1", saisie: { oui: false }, par: "Dirigeant" });
  assert.ok(!r.erreurs, JSON.stringify(r));
  assert.deepEqual(vm.runInContext("[...horsPerimetre()]", e.evaluate().ctx), []);
});

test("l'aperçu d'un groupe ne parle pas de dataset introuvable", () => {
  const { e } = racineAvecGroupe();
  const r = e.apercuQuestion("perimetre:g1");
  assert.equal(r.aucun, true);
  assert.doesNotMatch(r.raison, /introuvable/);
});

test("un perimetre.yml mal formé ne casse pas le chargement", () => {
  const racine = racineExemple();
  fs.writeFileSync(path.join(racine, "spec/perimetre.yml"), YAML.stringify({ groupes: [null, "texte", { id: "g1", cause: "x", mesures: "pas une liste" }] }));
  const e = ouvrirEspace(racine);
  assert.deepEqual(e.loadState(e.makeCtx()).state.perimetre.map(g => g.id), ["g1"]);
  assert.deepEqual(e.loadState(e.makeCtx()).state.perimetre[0].mesures, []);
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `node --test tests/perimetre.test.mjs`
Expected: FAIL (le groupe n'est pas une question, `state.perimetre` indéfini, aucun constat `check`).

- [ ] **Step 3: Charger `perimetre.yml` dans `tools/espace.mjs`**

Dans `loadState`, juste avant la ligne `const controles = safe(P("spec/controles.yml"), ...)`, ajouter :

```js
    const perimetre = safe(P("spec/perimetre.yml"), [], () => { const doc = readYaml(P("spec/perimetre.yml"), {}); const l = doc && Array.isArray(doc.groupes) ? doc.groupes : [];
      return l.filter(g => g && typeof g === "object").map(g => ({ id: String(g.id ?? ""), cause: String(g.cause || ""), mesures: Array.isArray(g.mesures) ? g.mesures.map(String) : [], titre: String(g.titre || ""), contexte: String(g.contexte || ""), hypothese: g.hypothese && typeof g.hypothese === "object" ? g.hypothese : null })); });
```

Dans l'objet `state` retourné par `loadState` (la ligne `return { state: { version: 2, adherent: ..., questions: ..., log, controles, ...`), ajouter `perimetre,` juste avant `log,`.

- [ ] **Step 4: Aperçu d'un groupe dans `tools/espace.mjs`**

Dans `apercuQuestion`, dans la chaîne `else if`, juste avant la ligne `else if (/^DIM_/.test(el)) raison = ...`, ajouter :

```js
    else if (el.startsWith("perimetre:")) raison = "question sur votre tableau de bord : pas de données à afficher";
```

- [ ] **Step 5: `porteurHypothese` dans `core/calque.js`**

Dans `porteurHypothese`, le premier `if(m){ ... }` traite les flux ; il est suivi de `m=/^([^.#]+)#regle(\d+)$/.exec(cible);`. Insérer entre les deux cette ligne :

```js
  m=/^perimetre:(.+)$/.exec(cible); if(m) return (st.perimetre||[]).find(g=>String(g.id)===m[1])||null;
```

- [ ] **Step 6: Lister les groupes dans `core/hypotheses.js`**

Dans `listeHypotheses`, juste avant la ligne `out.forEach(h=>Object.assign(h,confianceDe(h)));`, ajouter :

```js
  (S.st.perimetre||[]).forEach(g=>push(`perimetre:${g.id}`,"spec/perimetre.yml",`Mesures écartées : ${g.cause||g.id}`,g.hypothese&&{...g.hypothese,titre:g.hypothese.titre||g.titre,contexte:g.hypothese.contexte||g.contexte}));
```

- [ ] **Step 7: Lot `adherent` dans `core/questions.js`**

Dans `listeQuestions`, remplacer, dans l'appel `add({id:h.cible,source:"hypothese",lot:ds?lotDe(ds):"dimensions",...` la partie `lot:ds?lotDe(ds):"dimensions"` par :

```js
lot:h.cible.startsWith("perimetre:")?"adherent":ds?lotDe(ds):"dimensions"
```

Remplacer ensuite `datasetDe` : dans la ligne `if(/^(DIM_|controle:)/.test(c)) return null;` mettre `if(/^(DIM_|controle:|perimetre:)/.test(c)) return null;`.

Remplacer enfin la ligne `const ouvAdh=out.some(q=>q.source==="projet"&&q.statut==="ouverte"), rang=...` par :

```js
  const ouvAdh=out.some(q=>q.lot==="adherent"&&q.statut==="ouverte"), rang=l=>l==="adherent"&&ouvAdh?0:1;
```

- [ ] **Step 8: Validation dans `core/check.js`**

Après le bloc `idsProjet` (les questions d'adhérent), ajouter :

```js
  const idsGroupes=new Set();
  (st.perimetre||[]).forEach(g=>{
    const f="spec/perimetre.yml";
    if(!g.id) return add("erreur",f,"groupe de périmètre : id manquant");
    if(idsGroupes.has(g.id)) add("erreur",f,`groupe ${g.id} : id en double`); idsGroupes.add(g.id);
    if(!String(g.cause||"").trim()) add("erreur",f,`groupe ${g.id} : cause manquante`);
    if(!g.hypothese) add("erreur",f,`groupe ${g.id} : hypothèse manquante`);
    (g.mesures||[]).forEach(n=>{ if(!CAT().resolve(n)) add("alerte",f,`groupe ${g.id} : mesure inconnue du catalogue « ${n} »`); });
  });
```

- [ ] **Step 9: Vérifier**

Run: `node --test tests/perimetre.test.mjs && npm test`
Expected: PASS partout. Si un test existant compare `listeQuestions` à un ordre exact sans `perimetre`, il reste vert : sans groupe, rien ne change.

---

### Task 3: Couverture, dashboard, documentation

**Files:**
- Modify: `viewer/ui.js` (`renderMes`)
- Modify: `viewer/dash.js` (`renderPrev`)
- Modify: `viewer/style.css`
- Modify: `tools/atelier.mjs` (commande `couverture`)
- Modify: `tools/espace.mjs` (`couverture`)
- Modify: `AGENTS.md`, `.cursor/rules/spec-format.mdc`

- [ ] **Step 1: Liste des mesures dans `viewer/ui.js`**

Dans `renderMes`, remplacer exactement :

`const cat=CAT(), cov=COV(); const ev=evalCtx(); const q=S.mesQ.toLowerCase();`

par :

`const cat=CAT(), cov=COV(); const ev=evalCtx(); const q=S.mesQ.toLowerCase(); const hors=horsPerimetre(), st=m=>hors.has(m.name)?"hors":cov.get(m.id).s;`

Remplacer `const cnt={all:cat.list.length,ok:0,part:0,none:0,err:0,iss:0}; cat.list.forEach(m=>{ cnt[cov.get(m.id).s]++;` par `const cnt={all:cat.list.length,ok:0,part:0,none:0,err:0,hors:0,iss:0}; cat.list.forEach(m=>{ cnt[st(m)]++;`.

Remplacer `const keep=m=>{ const s=cov.get(m.id).s;` par `const keep=m=>{ const s=st(m);`.

Remplacer `${F("err","À corriger")}` par `${F("err","À corriger")}${cnt.hors?F("hors","Hors périmètre"):""}`.

Remplacer `<span class="ms ms-${c.s}">${ST_M[c.s]}</span>` par `<span class="ms ms-${st(m)}">${ST_M[st(m)]}</span>`.

- [ ] **Step 2: Style**

`viewer/style.css`, après la ligne `.ms-err{color:var(--bad);border-color:var(--bad)}` :

```css
.ms-hors{color:var(--muted);border-color:var(--line);border-style:dashed}
```

- [ ] **Step 3: Dashboard dans `viewer/dash.js`**

Dans `renderPrev`, remplacer exactement :

`if(!p.sheet) p.sheet="accueil"; const sh=SHEETS.find(s=>s.id===p.sheet)||SHEETS[0];`

par :

```js
  const hors=horsDe(DCAT()), feuilles=filtrerFeuilles(SHEETS,n=>{ const m=dm(n); return hors.has(m?m.name:n); });
  if(!feuilles.length){ $("#prevv").innerHTML='<h2>Dashboard</h2><p class="lede">Aucun indicateur applicable à cet adhérent pour l\'instant.</p>'; return; }
  if(!p.sheet) p.sheet="accueil"; const sh=feuilles.find(s=>s.id===p.sheet)||feuilles[0];
```

Dans le gabarit de la page, remplacer `${SHEETS.map(s=>` (dans `<div class="sheetbar">`) par `${feuilles.map(s=>`. Les objets `costdonut`, `costtable` et `agrid` n'ont pas de mesure à filtrer : ils restent affichés (limite connue, à noter dans la conception).

- [ ] **Step 4: Commandes de couverture**

`tools/atelier.mjs`, dans la commande `couverture` (le `vm.runInContext` qui construit `ms`), remplacer :

`const cat=CAT(), cov=COV(); const need=new Map(); const ms={ok:[],part:[],none:[],err:[]};`

par :

`const cat=CAT(), cov=COV(), hors=horsPerimetre(); const need=new Map(); const ms={ok:[],part:[],none:[],err:[],hors:[]};`

et remplacer `cat.list.forEach(m=>{ const c=cov.get(m.id); ms[c.s].push(m.name);` par `cat.list.forEach(m=>{ const c=cov.get(m.id); if(hors.has(m.name)){ ms.hors.push(m.name); return; } ms[c.s].push(m.name);`.

`tools/espace.mjs`, dans `couverture()` : remplacer `const cat=CAT(), cov=COV(), need=new Map(), n={ok:0,part:0,none:0,err:0};` par `const cat=CAT(), cov=COV(), hors=horsPerimetre(), need=new Map(), n={ok:0,part:0,none:0,err:0,hors:0};` et `cat.list.forEach(m=>{ const c=cov.get(m.id); n[c.s]++;` par `cat.list.forEach(m=>{ const c=cov.get(m.id); if(hors.has(m.name)){ n.hors++; return; } n[c.s]++;`.

Si l'affichage texte de `npm run couverture` énumère les clés de `ms`, vérifier qu'il tolère `hors` ; sinon ajouter une ligne `Hors périmètre : N` à la phrase de synthèse (`Mesures : N alimentées, ...`).

- [ ] **Step 5: Documentation**

`AGENTS.md`, après la section `### spec/referentiel.yml`, ajouter :

````markdown
### `spec/perimetre.yml`
Mesures du dashboard de référence écartées chez cet adhérent, groupées par cause. Chaque groupe porte un bloc `hypothese` : proposé tant qu'il n'est pas validé.
```yaml
groupes:
  - id: g1
    cause: "Aucune donnée de suivi des véhicules"
    mesures: [KM Réel, Charges VS KM]   # noms du catalogue
    titre: "Faut-il retirer les indicateurs liés aux kilomètres ?"
    contexte: "Vos exports ne contiennent pas de kilomètres exploitables."
    hypothese: {source: agent, preuves: [...], question: "...", valide: false, refuse: false}
```
Cible de réponse : `perimetre:g1` (opération `valider`). Validé : les mesures du groupe, et celles qui s'appuient sur elles, sortent du dashboard et de la couverture (statut `hors`). Refusé ou proposé : elles restent. Le moteur n'écrit jamais dans ce fichier.
````

`.cursor/rules/spec-format.mdc` : ajouter la ligne

`- Périmètre : `spec/perimetre.yml`, groupes `{id, cause, mesures, titre, contexte, hypothese}` ; cible de réponse `perimetre:<id>` ; ids uniques, cause et hypothèse obligatoires, mesures prises dans le catalogue.`

- [ ] **Step 6: Vérifier**

Run: `npm test`
Expected: PASS (toute la suite). Puis vérifier à l'écran : lancer l'instance de test (copie jetable de l'espace d'un adhérent sans son `.env`, compte de test, port à part), y placer un `perimetre.yml` avec un groupe, ouvrir l'onglet Questions (la question du groupe est en tête), répondre « oui », ouvrir Dashboard et Éléments principaux : la mesure et les objets concernés ont disparu, la jauge est recalculée. Arrêter l'instance et supprimer la copie.

---

## Self-review

- **Couverture de la conception :** fichier et sens (Tasks 1 et 2), dépendance transitive (Task 1), statut `hors` et jauge (Tasks 1 et 3), dashboard (Tasks 1 et 3), chargement, hypothèses et réponses (Task 2), `check` (Task 2), documentation (Task 3). Les groupes écrits par la maquette et l'outil `ecrire_perimetre` sont dans un second plan.
- **Limites connues :** les objets `costdonut`, `costtable` et `agrid` ne sont pas filtrés ; un dataset nommé `adherent_…` partage le lot `adherent` ; le script Qlik généré garde les mesures écartées.
- **Cohérence des noms :** `st.perimetre`, `horsDe`, `horsPerimetre`, `statutMesure`, `filtrerFeuilles`, cible `perimetre:<id>`, lot `adherent`.
