# Questions de séance : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une liste unique des questions de séance, dans un onglet de la prévisualisation et dans `npm run questions`, où les réponses se greffent et ne disparaissent jamais.

**Architecture:** `core/questions.js` (script classique, fonctions globales) calcule `listeQuestions()` à partir des sources existantes (questions des datasets, hypothèses, contrôles, fichiers non lus, valeurs hors recette) et du registre `spec/reponses.yml`. `core/check.js` valide le registre et étend la garde pii. La CLI et l'onglet ne font qu'afficher cette liste. L'agent suit `/seance`.

**Tech Stack:** Node ≥ 22, `node:test`, `yaml`, scripts classiques partagés navigateur et `vm`.

Conception : `docs/superpowers/specs/2026-11-07-questions-de-seance-design.md`.

## Global Constraints

- Pas de git : chaque tâche se termine par `npm test` et `npm run check`, sans commit.
- `core/*.js` : scripts classiques, pas d'`import`/`export`, fonctions globales, style compact du code existant.
- Textes en français. Commentaires seulement pour une contrainte que le code ne montre pas.
- `data/` et `generated/` ne sont écrits que par `npm run …`. Ne jamais lire `.env`.
- Aucune valeur d'une colonne `pii: true` affichée ni écrite. Tests avec données fabriquées uniquement.
- Le registre `spec/reponses.yml` est une liste ; on y ajoute, on n'y efface jamais.
- Une question est traitée si sa source le dit ou si le registre contient son id.
- Point de départ de `npm run check` sur la spec réelle : 1 erreur (question de `flux:f5`, valeur pii, décision de Michel en attente) et 10 alertes. Ne pas y toucher ; une tâche ne doit pas ajouter d'erreur hors celles annoncées.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `core/questions.js` | `lotDe`, `datasetDe`, `mesuresDe`, `listeQuestions` |
| `core/hypotheses.js` | `ciblesMesure` extrait de `hypothesesMesure` ; `reponse` dans `listeHypotheses` |
| `core/model.js` | `hydrate` : `st.reponses` par défaut |
| `core/check.js` | validation du registre ; garde pii étendue |
| `tools/atelier.mjs` | `CORE`, lecture de `spec/reponses.yml`, `cmdQuestions` |
| `tests/aide/moteur.mjs` | `CORE` |
| `viewer/body.html`, `viewer/ui.js`, `viewer/style.css` | onglet « Questions » |
| `.cursor/commands/seance.md`, `AGENTS.md`, `.cursor/rules/data-builder.mdc`, `README.md` | procédure et règles |
| `tests/questions.test.mjs` | tests |

---

### Task 1: Liste unique des questions

**Files:**
- Create: `core/questions.js`, `tests/questions.test.mjs`
- Modify: `core/hypotheses.js` (`listeHypotheses`, `hypothesesMesure`), `core/model.js` (`hydrate`), `tools/atelier.mjs` (`CORE`, `loadState`), `tests/aide/moteur.mjs` (`CORE`)

**Interfaces:**
- Consumes: `listeHypotheses()`, `CTRL()`, `FX(id)`, `CAT()`, `buildFaits()`, `ciblesFlux(fl, cods)`, `couplesMesure(m, seen)`, `cached(key, fn)`, `S.st` (`datasets[].questions`, `controles`, `nonLus`, `datasets[].meta`).
- Produces:
  - `ciblesMesure(m): Set<string>` (cibles dont dépend la mesure `m`) ;
  - `lotDe(dsId): string`, `datasetDe(cible): string|null`, `mesuresDe(elements: string[]): string[]` ;
  - `listeQuestions(): Question[]` avec `Question = {id, source: "profil"|"hypothese"|"controle"|"non_lu"|"hors_recette"|"registre", lot, element, elements, fichier, question, statut: "ouverte"|"traitee", reponse, date, effet, mesures: string[], retiree?: true}` ;
  - `S.st.reponses` (liste brute du registre), lue depuis `spec/reponses.yml`.

- [ ] **Step 1: Écrire le test qui échoue**

`tests/questions.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, etatCaTotal } from "./aide/moteur.mjs";

const etat = (hypothese = { source: "agent", question: "Le montant est-il HT ?" }, extra = {}) => {
  const s = etatCaTotal(hypothese, extra);
  s.datasets[0].questions = [
    { id: "q1", text: "montant : valeurs négatives, avoirs ?", done: false },
    { id: "q2", text: "date_chgt : date réelle ou prévue ?", done: true, answer: "Date de chargement réelle" },
    { id: "q3", text: "Export complet ?", done: false },
  ];
  return s;
};
const liste = s => chargerMoteur(s).run("listeQuestions()");
const par = (l, id) => l.find(q => q.id === id);

test("la liste rassemble questions de profil et hypothèses, avec élément, lot et impact", () => {
  const l = liste(etat());
  assert.deepEqual(l.map(q => q.id), ["tms.montant", "tms#q1", "tms#q3", "tms#q2"]);
  assert.deepEqual(par(l, "tms#q1"), { ...par(l, "tms#q1"), source: "profil", lot: "tms", element: "tms.montant", fichier: "spec/datasets/tms.yml", statut: "ouverte", mesures: ["CA Réel"] });
  assert.equal(par(l, "tms#q3").element, "tms");
  assert.deepEqual(par(l, "tms.montant").mesures, ["CA Réel"]);
  assert.equal(par(l, "tms.montant").source, "hypothese");
});

test("une question traitée garde sa réponse, depuis la source ou depuis le registre", () => {
  assert.equal(par(liste(etat()), "tms#q2").reponse, "Date de chargement réelle");
  const v = par(liste(etat({ source: "agent", question: "HT ?", valide: true, reponse: "Oui, HT" })), "tms.montant");
  assert.deepEqual([v.statut, v.reponse], ["traitee", "Oui, HT"]);
  const r = par(liste(etat(undefined, { reponses: [{ id: "tms.montant", reponse: "HT", date: "2026-11-07T10:00:00", effet: "montant confirmé" }] })), "tms.montant");
  assert.deepEqual([r.statut, r.reponse, r.date, r.effet], ["traitee", "HT", "2026-11-07T10:00:00", "montant confirmé"]);
});

test("une réponse du registre dont la question a disparu reste listée", () => {
  const o = par(liste(etat(undefined, { reponses: [{ id: "flux:f9", question: "Ancienne question", element: "flux:f9", reponse: "Oui", date: "2026-11-07T09:00:00" }] })), "flux:f9");
  assert.deepEqual([o.statut, o.question, o.reponse, o.retiree, o.source], ["traitee", "Ancienne question", "Oui", true, "registre"]);
});

test("contrôles en écart, fichiers non lus et valeurs hors recette sont des questions", () => {
  const s = etat(undefined, { controles: [{ id: "c1", type: "mensuel", libelle: "Dates", ds: "tms", date: "", porte_sur: ["tms.montant"] }],
    nonLus: [{ societe: "s1", fichier: "Péage/x.pdf", raison: "format .pdf non pris en charge" }] });
  s.datasets[0].meta = { hors_recette: 3 };
  const l = liste(s);
  assert.deepEqual([par(l, "controle:c1").lot, par(l, "controle:c1").statut, par(l, "controle:c1").mesures], ["tms", "ouverte", ["CA Réel"]]);
  assert.equal(par(l, "non_lu:Péage/x.pdf").lot, "fichiers");
  assert.equal(par(l, "hors_recette:tms").source, "hors_recette");
  s.controles[0].reponse = "Normal, bloc annuel";
  assert.deepEqual([par(liste(s), "controle:c1").statut, par(liste(s), "controle:c1").reponse], ["traitee", "Normal, bloc annuel"]);
});

test("lot = domaine du dataset ; une hypothèse de flux prend le domaine de son dataset", () => {
  const m = chargerMoteur(etat());
  assert.equal(m.run("lotDe('carburant_cofi_table1')"), "carburant");
  assert.equal(m.run("datasetDe('flux:f1#7061')"), "tms");
  assert.equal(m.run("datasetDe('DIM_SITE.%LIB_SITE')"), null);
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test`
Expected: FAIL sur les 5 nouveaux tests (`listeQuestions is not defined`).

- [ ] **Step 3: Extraire `ciblesMesure` et ajouter `reponse` dans `core/hypotheses.js`**

Remplacer `hypothesesMesure` par :

```js
function ciblesMesure(m){ return cached("cibm:"+m.id,()=>{
  const parFlux=new Map(); couplesMesure(m,new Set()).forEach(k=>{ const [f,c]=k.split("\u0001"); if(!parFlux.has(f)) parFlux.set(f,new Set()); parFlux.get(f).add(c); });
  const cibles=new Set(); parFlux.forEach((cods,fid)=>{ const fl=FX(fid); if(fl) ciblesFlux(fl,cods).forEach(t=>cibles.add(t)); });
  return cibles;
}); }
function hypothesesMesure(m){ return cached("hypm:"+m.id,()=>{ const c=ciblesMesure(m); return listeHypotheses().filter(h=>c.has(h.cible)); }); }
```

Dans `listeHypotheses`, dans l'objet poussé par `push`, ajouter après `refuse:!!h.refuse` :

```js
,reponse:String(h.reponse||"")
```

- [ ] **Step 4: Écrire `core/questions.js`**

```js
/* ───────────── questions de séance : liste unique, réponses greffées ───────────── */
const SRC_RANG={hypothese:0,controle:1,profil:2,hors_recette:3,non_lu:4,registre:5};
function lotDe(dsId){ return String(dsId||"").split("_")[0]||"divers"; }
function datasetDe(c){ c=String(c||""); if(c.startsWith("flux:")){ const fl=FX(c.slice(5).split("#")[0]); return fl?fl.ds:null; }
  if(/^(DIM_|controle:)/.test(c)) return null; return c.split(/[.#]/)[0]||null; }
function impactsMesures(){ return cached("impm",()=>{ const m=new Map(); CAT().list.forEach(x=>ciblesMesure(x).forEach(c=>{ if(!m.has(c)) m.set(c,new Set()); m.get(c).add(x.name); })); return m; }); }
function mesuresDe(elements){ const im=impactsMesures(), out=new Set();
  (elements||[]).filter(Boolean).forEach(e=>im.forEach((ms,c)=>{ if(c===e||(!/[.#:]/.test(e)&&(c.startsWith(e+".")||c.startsWith(e+"#")))) ms.forEach(n=>out.add(n)); }));
  return [...out]; }
function listeQuestions(){ return cached("questions",()=>{
  const reg=new Map((Array.isArray(S.st.reponses)?S.st.reponses:[]).filter(r=>r&&r.id!=null).map(r=>[String(r.id),r])); const out=[];
  const add=q=>{ const r=reg.get(q.id); out.push({id:q.id,source:q.source,lot:q.lot,element:q.element,elements:q.elements,fichier:q.fichier,question:String(q.question||""),
    statut:q.traitee||r?"traitee":"ouverte",reponse:String((r&&r.reponse)||q.reponse||""),date:String((r&&r.date)||""),effet:String((r&&r.effet)||""),mesures:mesuresDe(q.elements)}); };
  S.st.datasets.forEach(d=>d.questions.forEach(q=>{ const col=d.columns.find(c=>String(q.text||"").startsWith(c.name+" :")); const el=col?`${d.id}.${col.name}`:d.id;
    add({id:`${d.id}#${q.id}`,source:"profil",lot:lotDe(d.id),element:el,elements:[el],fichier:`spec/datasets/${d.id}.yml`,question:q.text,traitee:!!q.done,reponse:q.answer}); }));
  listeHypotheses().filter(h=>h.valide||h.refuse||h.confiance!=="haute").forEach(h=>{ const ds=datasetDe(h.cible);
    add({id:h.cible,source:"hypothese",lot:ds?lotDe(ds):"dimensions",element:h.cible,elements:[h.cible],fichier:h.fichier,question:h.question||h.libelle,traitee:h.valide||h.refuse,reponse:h.reponse}); });
  CTRL().forEach(r=>{ const c=(S.st.controles||[]).find(x=>String(x.id)===r.id)||{}; if(r.statut==="ok"&&!c.reponse) return;
    const ds=c.ds||(c.a&&c.a.ds)||(c.from&&String(c.from).split(".")[0])||r.porte_sur.map(datasetDe).find(Boolean);
    add({id:`controle:${r.id}`,source:"controle",lot:ds?lotDe(ds):"divers",element:`controle:${r.id}`,elements:r.porte_sur,fichier:"spec/controles.yml",question:`${r.libelle} : ${r.msg}`,traitee:!!c.reponse,reponse:c.reponse}); });
  S.st.datasets.filter(d=>d.meta&&d.meta.hors_recette>0).forEach(d=>add({id:`hors_recette:${d.id}`,source:"hors_recette",lot:lotDe(d.id),element:d.id,elements:[d.id],fichier:d.file,
    question:`${d.meta.hors_recette} valeurs hors recette dans ${d.id} : que contiennent ces colonnes, faut-il les lire ?`}));
  (S.st.nonLus||[]).forEach(x=>add({id:`non_lu:${x.fichier}${x.feuille?"#"+x.feuille:""}`,source:"non_lu",lot:"fichiers",element:x.fichier,elements:[],fichier:`data/bronze/${x.societe}/_non_lus.json`,
    question:`Fichier non lu (${x.raison}) : faut-il le traiter ?`}));
  const vus=new Set(out.map(q=>q.id));
  reg.forEach((r,id)=>{ if(!vus.has(id)) out.push({id,source:"registre",lot:r.lot||lotDe(datasetDe(r.element||id)),element:String(r.element||""),elements:[],fichier:"spec/reponses.yml",
    question:String(r.question||""),statut:"traitee",reponse:String(r.reponse||""),date:String(r.date||""),effet:String(r.effet||""),mesures:[],retiree:true}); });
  const imp=lot=>out.filter(q=>q.lot===lot&&q.statut==="ouverte").reduce((n,q)=>n+q.mesures.length,0);
  const lots=[...new Set(out.map(q=>q.lot))].sort((a,b)=>imp(b)-imp(a)||a.localeCompare(b));
  return out.sort((a,b)=>lots.indexOf(a.lot)-lots.indexOf(b.lot)||(a.statut===b.statut?0:a.statut==="ouverte"?-1:1)
    ||(a.statut==="ouverte"?b.mesures.length-a.mesures.length||SRC_RANG[a.source]-SRC_RANG[b.source]:b.date.localeCompare(a.date))||a.id.localeCompare(b.id));
}); }
```

- [ ] **Step 5: Brancher le registre et le fichier**

`core/model.js`, dans `hydrate`, sur la ligne `st.controles=st.controles||[]; …`, ajouter à la fin :

```js
 st.reponses=st.reponses==null?[]:st.reponses;
```

`tools/atelier.mjs` :
- `const CORE = ["core/engine.js", "core/model.js", "core/check.js", "core/controles.js", "core/hypotheses.js", "core/questions.js"];`
- dans `loadState`, après la ligne `const controles = …` :

```js
  const reponses = safe(P("spec/reponses.yml"), [], () => readYaml(P("spec/reponses.yml"), []) ?? []);
```

- dans l'objet `state` renvoyé, ajouter `reponses` après `controles`.

`tests/aide/moteur.mjs` : même liste `CORE` (avec `"core/questions.js"`), et ajouter `reponses: []` dans `ctx.__state` après `nonLus: []`.

- [ ] **Step 6: Vérifier le succès**

Run: `npm test && npm run check`
Expected: PASS (71 tests), puis le même résultat qu'avant (1 erreur f5, 10 alertes) : la spec réelle n'a pas encore de registre.

---

### Task 2: Validation du registre et garde pii étendue

**Files:**
- Modify: `core/check.js` (`checkSpec`, `piiFuites`)
- Test: `tests/questions.test.mjs`

**Interfaces:**
- Consumes: `S.st.reponses`, `S.st.controles`, `listeHypotheses()` (champ `reponse`), `d.questions` (`text`, `answer`).
- Produces: messages de `checkSpec()` : erreur `spec/reponses.yml doit être une liste` ; alerte `réponse <id> : id ou reponse manquant` ; erreurs pii avec cibles `<dataset>#<qN>`, `reponse:<id>`, `controle:<id>`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `tests/questions.test.mjs` :

```js
import { colonne } from "./aide/moteur.mjs";
const check = s => chargerMoteur(s).run("checkSpec()");

test("le registre doit être une liste d'entrées avec id et réponse", () => {
  assert.ok(check(etat(undefined, { reponses: { id: "x" } })).some(f => f.niv === "erreur" && /reponses\.yml doit être une liste/.test(f.msg)));
  assert.ok(check(etat(undefined, { reponses: [{ id: "tms#q1" }] })).some(f => f.niv === "alerte" && /tms#q1.*reponse manquant/.test(f.msg)));
});

test("la garde pii couvre questions de profil, réponses du registre, des hypothèses et des contrôles", () => {
  const st = extra => { const s = etat({ source: "agent", reponse: extra.hyp || "" }, extra.ex || {}); s.datasets[0].columns.push(colonne("nom", { pii: true })); s.datasets[0].rows = [["02/01/2025", "600", "Durandel"]]; return s; };
  const pii = (s, cible) => { const f = check(s).filter(x => x.niv === "erreur" && /personnelle/.test(x.msg)); assert.ok(f.some(x => cible.test(x.msg)), cible); assert.ok(f.every(x => !x.msg.includes("Durandel"))); };
  const q = st({}); q.datasets[0].questions[0].text = "nom : valeurs Durandel"; pii(q, /tms#q1/);
  pii(st({ ex: { reponses: [{ id: "tms#q1", reponse: "Durandel est intérimaire", date: "2026-11-07" }] } }), /reponse:tms#q1/);
  pii(st({ hyp: "Seul Durandel" }), /tms\.montant/);
  pii(st({ ex: { controles: [{ id: "c1", type: "mensuel", libelle: "Dates", ds: "tms", date: "", reponse: "voir Durandel" }] } }), /controle:c1/);
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test`
Expected: FAIL sur les 2 nouveaux tests.

- [ ] **Step 3: Implémenter dans `core/check.js`**

Dans `checkSpec`, juste avant la ligne `piiFuites().forEach(…)` :

```js
  if(!Array.isArray(st.reponses)) add("erreur","spec/reponses.yml","spec/reponses.yml doit être une liste");
  else st.reponses.forEach((r,i)=>{ if(!r||r.id==null||!String(r.reponse||"").trim()) add("alerte","spec/reponses.yml",`réponse ${r&&r.id!=null?r.id:"n°"+(i+1)} : id ou reponse manquant`); });
```

Dans `piiFuites`, remplacer la ligne `listeHypotheses().forEach(h=>{ test(h.cible,h.fichier,h.question); … });` par :

```js
  listeHypotheses().forEach(h=>{ test(h.cible,h.fichier,h.question); test(h.cible,h.fichier,h.reponse); h.preuves.forEach(t=>test(h.cible,h.fichier,t)); });
```

et, dans le `S.st.datasets.forEach(d=>{ … })` de `piiFuites`, ajouter avant la fermeture :

```js
 d.questions.forEach(q=>{ test(`${d.id}#${q.id}`,f,q.text); test(`${d.id}#${q.id}`,f,q.answer); });
```

puis, après la ligne `S.st.flux.forEach(fl=>test(…));` :

```js
  (S.st.controles||[]).forEach(c=>test(`controle:${c.id}`,"spec/controles.yml",c.reponse));
  (Array.isArray(S.st.reponses)?S.st.reponses:[]).forEach(r=>r&&["question","reponse","effet"].forEach(k=>test(`reponse:${r.id}`,"spec/reponses.yml",r[k])));
```

- [ ] **Step 4: Vérifier le succès**

Run: `npm test && npm run check`
Expected: PASS (73 tests). `npm run check` peut maintenant signaler des questions de profil qui citent des valeurs de colonnes personnelles : c'est attendu, elles sont traitées à la Task 5. Noter leur nombre.

---

### Task 3: `npm run questions` sur la liste unique

**Files:**
- Modify: `tools/atelier.mjs` (`cmdQuestions`, message d'usage)

**Interfaces:**
- Consumes: `listeQuestions()` (via `vm.runInContext` sur le `ctx` de `evaluate()`), `cmdQuestion(args, ctx, state)`, `opt(args, k)`.
- Produces: `npm run questions [--toutes] [--lot <lot>] [--suivante]`.

- [ ] **Step 1: Remplacer `cmdQuestions`**

```js
function cmdQuestions(args) {
  const { ctx, state } = evaluate(); const lot = opt(args, "lot"); const toutes = args.includes("--toutes");
  const list = vm.runInContext("listeQuestions()", ctx).filter(q => (toutes || q.statut === "ouverte") && (!lot || q.lot === lot));
  if (!list.length) { console.log(toutes ? "Aucune question." : "Aucune question ouverte."); return; }
  let cur = null;
  list.forEach(q => { if (q.lot !== cur) { cur = q.lot; console.log(`\n${C.bold}${cur}${C.reset}`); }
    console.log(`${q.statut === "traitee" ? C.dim + "[traitée]" : C.yellow + "[ouverte]"}${C.reset} ${C.bold}${q.id}${C.reset} · ${q.source}${q.mesures.length ? ` · ${q.mesures.length} mesure(s)` : ""}  ${q.question}${q.reponse ? `\n            → ${q.reponse}` : ""}`); });
  const q = list.find(x => x.statut === "ouverte");
  if ((args.includes("--suivante") || args.includes("--next")) && q && q.source === "profil") cmdQuestion([q.id], ctx, state);
}
```

Dans le message d'usage, remplacer `questions [--suivante|--toutes]` par `questions [--toutes] [--lot <lot>] [--suivante]`.

- [ ] **Step 2: Vérifier**

Run: `npm test && npm run questions -- --lot tms && npm run questions -- --toutes --lot fichiers`
Expected: PASS ; le lot `tms` s'affiche, ouvertes seulement, hypothèses en tête ; la seconde commande affiche « Aucune question. » ou les fichiers non lus.

---

### Task 4: Onglet « Questions »

**Files:**
- Modify: `viewer/body.html`, `viewer/ui.js`, `viewer/style.css`

**Interfaces:**
- Consumes: `listeQuestions()`, `esc`, `$`, `S`.
- Produces: onglet `#t-q`, vue `#view-q` (contenu `#qv`), `renderQ()`, filtre `S.qf` (`ouvertes` | `traitees` | `toutes`).

- [ ] **Step 1: HTML**

`viewer/body.html` : avant `<button role="tab" id="t-log" …>Journal</button>` :

```html
    <button role="tab" id="t-q" aria-selected="false">Questions</button>
```

et avant `<section id="view-log" …>` :

```html
  <section id="view-q" class="page" hidden><div class="inner wrapx" id="qv"></div></section>
```

- [ ] **Step 2: Rendu dans `viewer/ui.js`**

Avant la section `/* ───────────── onglets ───────────── */` :

```js
/* ───────────── questions ───────────── */
const SRC_LIB={hypothese:"Hypothèse",controle:"Contrôle",profil:"Profil",hors_recette:"Hors recette",non_lu:"Non lu",registre:"Registre"};
function renderQ(){
  const qs=listeQuestions(), f=S.qf||"ouvertes", keep=q=>f==="toutes"||(f==="ouvertes"?q.statut==="ouverte":q.statut==="traitee");
  const nOuv=qs.filter(q=>q.statut==="ouverte").length;
  const carte=q=>`<div class="qi ${q.statut}"><div class="qh"><span class="qid mono">${esc(q.id)}</span><span class="qs">${esc(SRC_LIB[q.source]||q.source)}</span>${q.mesures.length?`<span class="qm" title="${esc(q.mesures.join(", "))}">${q.mesures.length} mesure${q.mesures.length>1?"s":""}</span>`:""}</div>
    <p>${esc(q.question)}</p><div class="qe mono">${esc(q.element)}${q.element?" · ":""}${esc(q.fichier)}</div>
    ${q.statut==="traitee"?`<div class="qr"><b>Réponse${q.date?` du ${esc(q.date.slice(0,10))}`:""}${q.retiree?" · retirée de la spec":""}</b><p>${esc(q.reponse||"(réponse non saisie)")}</p>${q.effet?`<div class="qeff">${esc(q.effet)}</div>`:""}</div>`:""}</div>`;
  $("#qv").innerHTML=`<h2>Questions</h2><p class="lede">${nOuv} à traiter · ${qs.length-nOuv} traitées. Les réponses restent greffées sous leur question (registre <span class="mono">spec/reponses.yml</span>).</p>
    <div class="qfilt">${[["ouvertes","À traiter"],["traitees","Traitées"],["toutes","Toutes"]].map(([k,l])=>`<button class="btn sm" data-qf="${k}" aria-pressed="${f===k}">${l}</button>`).join("")}</div>`
    +[...new Set(qs.map(q=>q.lot))].map(lot=>{ const l=qs.filter(q=>q.lot===lot), v=l.filter(keep); if(!v.length) return "";
      return `<section class="qlot"><h3>${esc(lot)} <span class="c">${l.filter(q=>q.statut==="traitee").length} traitées sur ${l.length}</span></h3>${v.map(carte).join("")}</section>`; }).join("");
}
$("#qv").addEventListener("click",e=>{ const b=e.target.closest("[data-qf]"); if(b){ S.qf=b.dataset.qf; renderQ(); } });
```

Dans la section onglets :
- `const TABS=["canvas","cat","mes","prev","files","q","log"];`
- dans `renderTab`, ajouter `if(S.tab==="q") renderQ();` avant `if(S.tab==="log") renderLog();`.

- [ ] **Step 3: CSS en fin de `viewer/style.css`**

```css
.qfilt{display:flex;gap:6px;margin:0 0 18px}
.qfilt [aria-pressed="true"]{border-color:var(--fg)}
.qlot{margin:0 0 22px}
.qlot h3{font-size:14px;text-transform:capitalize;margin:0 0 8px;display:flex;gap:8px;align-items:center}
.qlot h3 .c{font-family:var(--f-mono);font-size:11px;text-transform:none;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:0 6px}
.qi{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:0 0 8px}
.qi.traitee{border-color:var(--line-2);background:var(--surface-2)}
.qi .qh{display:flex;gap:8px;align-items:center;font-size:11px;color:var(--muted)}
.qi .qm{margin-left:auto;font-family:var(--f-mono)}
.qi p{margin:6px 0;line-height:1.45}
.qi .qe{font-size:10.5px;color:var(--muted)}
.qi .qr{margin-top:8px;padding:8px 10px;border-left:3px solid var(--fg);background:var(--surface)}
.qi .qr p{margin:4px 0 0}
.qi .qeff{font-size:11px;color:var(--muted);margin-top:4px}
```

- [ ] **Step 4: Vérifier**

Run: `npm test`, puis relancer un serveur (`npm run serve -- --port 4399`, ou redémarrer celui de Michel) et ouvrir l'onglet « Questions ».
Expected : lots affichés, filtre À traiter par défaut, aucune erreur dans la console (`Runtime.evaluate` : `listeQuestions().length` > 0 et `document.querySelectorAll('.qi').length` > 0).

---

### Task 5: Procédure `/seance`, règles et mise en conformité de la spec réelle

**Files:**
- Create: `.cursor/commands/seance.md`, `spec/reponses.yml`
- Modify: `AGENTS.md`, `.cursor/rules/data-builder.mdc`, `README.md`, `spec/datasets/*.yml` (questions de profil qui citent des valeurs personnelles), `spec/journal.yml`

- [ ] **Step 1: `.cursor/commands/seance.md`**

```markdown
# Séance avec l'adhérent

Michel est en visio avec l'adhérent et te relaie ses réponses dans le chat. Une question à la fois.

1. **Choisir le lot.** `npm run questions` : prends le lot ouvert de plus fort impact (le premier), sauf si Michel en demande un autre.
2. **Présenter une question** (`npm run question -- <dataset>#<id>` pour le profil d'une question de dataset), en 4 lignes au plus :
   - la question, pour un exploitant transport, sans jargon data ;
   - ce que montrent les données (en nombres, jamais une valeur pii) ;
   - ton hypothèse en une phrase ;
   - ce que la réponse changera dans la spec.
   Puis arrête-toi et attends la réponse.
3. **Enregistrer la réponse à sa source** :
   - question de dataset : `answer` (résumé fidèle) et `done: true` ;
   - hypothèse : `valide: true` ou `refuse: true`, et `reponse` ;
   - contrôle : `reponse` ;
   - fichier non lu, valeurs hors recette : registre seulement.
   Puis modifie la spec en conséquence (colonnes, règles, flux, contrôles). Ne supprime jamais un bloc `hypothese` démenti avant d'avoir écrit sa réponse au registre.
4. **Ajouter au registre** `spec/reponses.yml` (à la fin, sans rien effacer) :
   `id`, `question` (texte exact), `element`, `reponse`, `date`, `effet` (ce qui a changé dans la spec, en une ligne).
5. **Doute nouveau** : une nouvelle question dans le dataset concerné (id suivant), pas de supposition.
6. **Fin du lot** : `npm run check` (corrige toute erreur), `npm run build`, une entrée dans `spec/journal.yml` pour le lot, puis l'effet en deux lignes (lignes FAITS, mesures alimentées avant → après). Propose le lot suivant.
```

- [ ] **Step 2: `spec/reponses.yml`**

```yaml
# Registre des réponses de l'adhérent : on ajoute à la fin, on n'efface jamais.
[]
```

- [ ] **Step 3: Règles**

`AGENTS.md`, section « Boucle de séance » : sous le titre, ajouter la phrase :

```markdown
Les questions de toutes les sources (datasets, hypothèses, contrôles, fichiers non lus) forment une liste unique : `npm run questions` et l'onglet « Questions ». La procédure détaillée est `/seance`. Chaque réponse s'écrit à sa source et s'ajoute au registre `spec/reponses.yml`, qu'on n'efface jamais. La relance (`check`, `build`, effet mesuré) se fait à la fin de chaque lot.
```

Dans le tableau des commandes de `AGENTS.md`, remplacer la ligne `npm run questions` par :

```markdown
| `npm run questions` (`-- --toutes`, `-- --lot <lot>`, `-- --suivante`) | Liste unique des questions, par lot et par impact |
```

`.cursor/rules/data-builder.mdc`, puce « Deux modes » : remplacer « En séance (visio) : une question à la fois, présentée, puis tu attends la réponse de Michel avant de modifier quoi que ce soit. » par « En séance (visio, `/seance`) : une question à la fois, présentée, puis tu attends la réponse de Michel ; chaque réponse va à sa source et au registre `spec/reponses.yml`, jamais effacé. »

`README.md` : dans la liste des commandes ou du déroulé de séance, ajouter « `/seance` : traiter la liste unique des questions avec l'adhérent ; les réponses restent dans l'onglet « Questions » ».

- [ ] **Step 4: Questions de profil qui citent des valeurs personnelles**

Run: `npm run check`
Pour chaque erreur « contient une valeur de la colonne personnelle » dont la cible est `<dataset>#<qN>` : réécrire le `text` de la question en remplaçant la liste de valeurs par leur nombre (ex. `nom_du_chauffeur : 87 valeurs distinctes (données personnelles). Que signifie cette colonne ?`). Ne jamais afficher les valeurs dans la sortie.

- [ ] **Step 5: Journal et vérification**

Ajouter à `spec/journal.yml` :

```yaml
- date: 2026-11-07T09:30:00
  question: questions de séance
  decision: Liste unique des questions (npm run questions, onglet Questions), registre spec/reponses.yml, procédure /seance. Questions de profil qui citaient des valeurs personnelles réécrites en nombres.
  fichiers: [spec/reponses.yml, spec/datasets, .cursor/commands/seance.md]
```

Run: `npm test && npm run check ; npm run questions`
Expected: PASS (73 tests) ; `check` ne garde que l'erreur f5 (en attente de Michel) ; liste par lot avec les hypothèses de plus fort impact en tête. `npm run build` reste bloqué tant que f5 n'est pas tranchée : le signaler, ne pas contourner.
