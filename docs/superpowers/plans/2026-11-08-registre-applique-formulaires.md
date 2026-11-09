# Registre appliqué et formulaires de réponse — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** l'adhérent répond aux questions depuis l'onglet Questions de la prévisualisation (réponses guidées ou texte libre), sa réponse s'ajoute au registre `spec/reponses.yml` et le moteur l'applique aussitôt à la spec : dashboard, `check` et `build` voient la même chose.

**Architecture :** un nouveau script classique `core/calque.js` applique, au chargement (`hydrate`), les `modifs` de la dernière entrée de chaque question du registre, et construit une entrée à partir d'une saisie de formulaire (`entreeReponse`). Le serveur local reçoit `POST /api/reponse`, construit et valide l'entrée dans le moteur, calcule l'effet (avant → après) et l'ajoute au registre ; la surveillance de fichiers existante recharge la page. `ATELIER_ROOT` sépare le dossier de données (spec, data) du code, ce qui sert les tests et le sous-projet 2.

**Tech Stack :** Node ≥ 22, `node:test`, `yaml`, moteur en scripts classiques exécutés dans `vm` (CLI) et concaténés dans la page (navigateur). Aucune dépendance nouvelle.

Design : `docs/superpowers/specs/2026-11-08-plateforme-reponses-client-design.md` (sous-projet 1).

## Global Constraints

- Textes d'interface, messages d'erreur et noms de fonctions en français, comme le code existant.
- `core/*.js` reste en scripts classiques (pas d'`import`/`export`), fonctions globales partagées entre fichiers ; style compact du code existant.
- Le registre `spec/reponses.yml` n'est jamais réécrit : on ajoute à la fin. La garde pii (`piiFuites`) s'applique aux entrées.
- Opérations admises, et aucune autre : `valider`, `codes`, `exclure`, `definir`, `fichier`, `noter`. Champs de `definir` : flux `valeur`, `unite`, `champ`, `filtre` ; colonne `format`, `decimalComma`, `role`.
- Types de réponse : `confirmer`, `codes`, `choix`, `exclure`, `fichier`, `libre`. Dans ce sous-projet, le texte libre produit `noter` (l'agent arrive au sous-projet 3).
- `origine: client` pour toute entrée écrite par `POST /api/reponse`.
- Le dossier n'est pas un dépôt git : chaque tâche se termine par `npm test` vert au lieu d'un commit.

## Fichiers

| Fichier | Rôle |
|---|---|
| `core/calque.js` (créé) | opérations, validation, application du registre, construction d'une entrée |
| `core/model.js` | `hydrate` appelle `appliquerCalque` |
| `core/check.js` | alerte « réponse orpheline » ; `par` sous garde pii |
| `core/hypotheses.js` | les hypothèses portent leur formulaire |
| `core/questions.js` | type, formulaire, aperçu des données, historique, orpheline |
| `tools/atelier.mjs` | `ATELIER_ROOT`, chargement des champs de formulaire, `POST /api/reponse` |
| `viewer/ui.js`, `viewer/style.css` | formulaires de l'onglet Questions |
| `tests/aide/moteur.mjs`, `tests/aide/racine.mjs` (créé) | aides de test |
| `tests/racine.test.mjs`, `tests/calque.test.mjs`, `tests/reponses-client.test.mjs`, `tests/serveur-reponse.test.mjs` (créés), `tests/questions.test.mjs` | tests |
| `AGENTS.md`, `.cursor/commands/maquette.md` | format des questions typées |

---

### Task 1 : dossier de données séparé du code (`ATELIER_ROOT`)

**Files :**
- Modify : `tools/atelier.mjs` (lignes 16-24, 74, 91, 188, 220, 262, 272-273, 296)
- Create : `tests/aide/racine.mjs`, `tests/racine.test.mjs`

**Interfaces :**
- Produces : variable d'environnement `ATELIER_ROOT` (dossier contenant `spec/`, `data/`, `.atelier/`, `generated/`) ; `tests/aide/racine.mjs` exporte `ATELIER` (chemin de `tools/atelier.mjs`) et `racineExemple()` (crée un dossier temporaire avec la spec et les données de l'exemple, registre vide, renvoie son chemin).

- [ ] **Step 1 : écrire l'aide et le test qui échoue**

`tests/aide/racine.mjs` :

```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ATELIER = path.join(APP, "tools/atelier.mjs");

export function racineExemple() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atelier-"));
  fs.cpSync(path.join(APP, "exemple/spec"), path.join(root, "spec"), { recursive: true });
  fs.cpSync(path.join(APP, "exemple/data"), path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "spec/reponses.yml"), "# Registre des réponses de l'adhérent : on ajoute à la fin, on n'efface jamais.\n");
  return root;
}
```

`tests/racine.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { racineExemple, ATELIER } from "./aide/racine.mjs";

test("ATELIER_ROOT : la CLI lit la spec et les données d'un autre dossier que le code", () => {
  const root = racineExemple();
  const r = spawnSync(process.execPath, [ATELIER, "check", "--json"], { env: { ...process.env, ATELIER_ROOT: root }, encoding: "utf8" });
  assert.equal(JSON.parse(r.stdout).summary.datasets, 8);
});
```

- [ ] **Step 2 : lancer le test, il échoue**

Run : `node --test tests/racine.test.mjs`
Expected : FAIL (la CLI lit `spec/` du dépôt : le nombre de datasets vaut 18, celui de la spec courante, pas 8).

- [ ] **Step 3 : séparer `APP` (code) et `ROOT` (données) dans `tools/atelier.mjs`**

Remplacer :

```js
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...a) => path.join(ROOT, ...a);
```

par :

```js
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.env.ATELIER_ROOT ? path.resolve(process.env.ATELIER_ROOT) : APP;
const P = (...a) => path.join(ROOT, ...a);
const A = (...a) => path.join(APP, ...a);
```

Puis, dans le même fichier :
- `if (exists(P(".env"))) process.loadEnvFile(P(".env"));` devient `if (exists(A(".env"))) process.loadEnvFile(A(".env"));`
- les trois `cheminMemoire(ROOT)` (dans `loadState`, `cmdApprendre`, `cmdNormaliser`) deviennent `cheminMemoire(APP)` ;
- dans `makeCtx` : `fs.readFileSync(P(f), "utf8")` devient `fs.readFileSync(A(f), "utf8")` ;
- dans `cmdExemple` : `copyDir(P("exemple/spec"), P("spec")); copyDir(P("exemple/data"), P("data"));` devient `copyDir(A("exemple/spec"), P("spec")); copyDir(A("exemple/data"), P("data"));` et `fs.copyFileSync(P("exemple/layout.json"), P(".atelier/layout.json"))` devient `fs.copyFileSync(A("exemple/layout.json"), P(".atelier/layout.json"))` ;
- dans `viewerHtml` : `P("viewer/style.css")`, `P("viewer/body.html")` et `fs.readFileSync(P(f), "utf8")` utilisent `A(...)` ;
- dans `cmdServe`, la ligne de surveillance devient :

```js
  [[P("spec"), "spec"], [P("data"), "spec"], [A("viewer"), "code"], [A("core"), "code"]].forEach(([d, k]) => { if (exists(d)) fs.watch(d, { recursive: true }, onChange(k)); });
```

- [ ] **Step 4 : lancer les tests**

Run : `npm test`
Expected : PASS, 77 tests.

---

### Task 2 : le registre appliqué par le moteur (`core/calque.js`)

**Files :**
- Create : `core/calque.js`, `tests/calque.test.mjs`
- Modify : `core/model.js` (fonction `hydrate`), `core/check.js` (après la vérification du registre), `tools/atelier.mjs` (constante `CORE`), `tests/aide/moteur.mjs` (constante `CORE`)

**Interfaces :**
- Produces :
  - `OPS_REPONSE` (tableau des opérations), `DEFINIR` (`{flux:[…],colonne:[…]}`), `TYPES_REPONSE` (tableau des types) ;
  - `porteurHypothese(st, cible)` → l'objet qui porte le bloc `hypothese` (colonne, règle, flux, règle de flux, colonne de dimension) ou `null` ;
  - `erreurModif(m)` → `null` ou message ; `erreursModifs(modifs)` → tableau de messages (vide si tout est valide), sur `S.st` ;
  - `appliquerCalque(st)` → applique les `modifs` de la dernière entrée de chaque `id` et remplit `st._orphelines` (`[{id, op, cible, msg}]`) ;
  - `checkSpec()` ajoute une alerte `réponse orpheline <id> (<op> <cible>) : <msg>` sur `spec/reponses.yml`.

- [ ] **Step 1 : écrire les tests qui échouent**

`tests/calque.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, etatCaTotal, colonne } from "./aide/moteur.mjs";

// Chaque appel construit un état neuf : hydrate modifie les objets reçus.
const etat = (reponses = []) => { const s = etatCaTotal({ source: "agent", question: "Le montant est-il HT ?" }, { reponses });
  s.datasets[0].columns.push(colonne("statut")); s.datasets[0].rows = [["02/01/2025", "600", "L"], ["15/02/2025", "400", "A"]]; return s; };
const entree = (id, modifs, extra = {}) => ({ id, reponse: "r", date: "2026-11-12T14:00:00", origine: "client", modifs, ...extra });

test("valider confirme l'hypothèse ciblée", () => {
  const m = chargerMoteur(etat([entree("tms.montant", [{ op: "valider", cible: "tms.montant", valeur: true }], { reponse: "Oui, HT" })]));
  assert.deepEqual(m.run("[listeHypotheses()[0].confiance, listeHypotheses()[0].reponse]"), ["confirme", "Oui, HT"]);
});

test("codes et exclure s'appliquent au silver et à FAITS", () => {
  const m = chargerMoteur(etat([entree("tms#q4", [{ op: "codes", cible: "tms.statut", valeur: { L: "Livrée", A: "Annulée" } }, { op: "exclure", cible: "tms", sql: "statut <> 'A'", text: "Exclure les annulées" }])]));
  assert.equal(m.run("silverRows(DS('tms')).dropped"), 1);
  assert.equal(m.run("silverRows(DS('tms')).rows[0].statut_libelle"), "Livrée");
  assert.equal(m.run("buildFaits().stats.f1.total"), 600);
});

test("definir change un champ de flux", () => {
  assert.equal(chargerMoteur(etat([entree("flux:f1", [{ op: "definir", cible: "flux:f1.valeur", valeur: "montant / 2" }])])).run("buildFaits().stats.f1.total"), 500);
});

test("la dernière entrée d'une question l'emporte", () => {
  const m = chargerMoteur(etat([entree("tms#q4", [{ op: "codes", cible: "tms.statut", valeur: { L: "Livrée" } }]), entree("tms#q4", [{ op: "codes", cible: "tms.statut", valeur: { L: "Chargée" } }])]));
  assert.deepEqual(m.run("DS('tms').columns.find(c=>c.name==='statut').codes"), { L: "Chargée" });
});

test("une modification dont la cible a disparu est une réponse orpheline", () => {
  const f = chargerMoteur(etat([entree("tms#q4", [{ op: "codes", cible: "tms.disparue", valeur: { L: "Livrée" } }])])).run("checkSpec()");
  assert.ok(f.some(x => x.niv === "alerte" && x.fichier === "spec/reponses.yml" && /réponse orpheline tms#q4/.test(x.msg)));
});

test("erreursModifs refuse les opérations et les champs hors liste", () => {
  const m = chargerMoteur(etat());
  const e = js => m.run(`erreursModifs(${js})`);
  assert.match(e("[{op:'supprimer'}]")[0], /opération inconnue/);
  assert.match(e("[{op:'definir',cible:'flux:f1.note',valeur:'x'}]")[0], /non modifiable/);
  assert.match(e("[{op:'definir',cible:'flux:f1.champ',valeur:'Autre'}]")[0], /champ inconnu/);
  assert.match(e("[{op:'valider',cible:'tms.montant',valeur:'oui'}]")[0], /true ou false/);
  assert.match(e("[{op:'exclure',cible:'tms',sql:'statut ~ 1'}]")[0], /condition non reconnue/);
  assert.match(e("[{op:'codes',cible:'tms.statut',valeur:{}}]")[0], /table code/);
  assert.match(e("[]")[0], /aucune modification/);
  assert.deepEqual(e("[{op:'codes',cible:'tms.statut',valeur:{L:'Livrée'}},{op:'definir',cible:'tms.montant.decimalComma',valeur:true},{op:'noter'}]"), []);
});
```

- [ ] **Step 2 : lancer les tests, ils échouent**

Run : `node --test tests/calque.test.mjs`
Expected : FAIL (`erreursModifs is not defined`, et les modifications ne sont pas appliquées).

- [ ] **Step 3 : écrire `core/calque.js`**

```js
/* ───────────── calque des réponses : le registre appliqué sur la spec ───────────── */
const OPS_REPONSE=["valider","codes","exclure","definir","fichier","noter"];
const DEFINIR={flux:["valeur","unite","champ","filtre"],colonne:["format","decimalComma","role"]};
const TYPES_REPONSE=["confirmer","codes","choix","exclure","fichier","libre"];
function porteurHypothese(st,cible){
  cible=String(cible||""); let m=/^flux:([^#]+)(?:#(.+))?$/.exec(cible);
  if(m){ const fl=st.flux.find(f=>f.id===m[1]); if(!fl) return null; return m[2]==null?fl:(fl.rules||[]).find(r=>String(r.prefix)===m[2])||null; }
  m=/^([^.#]+)#regle(\d+)$/.exec(cible);
  if(m){ const d=st.datasets.find(x=>x.id===m[1]); return d&&d.rules[+m[2]-1]||null; }
  m=/^([^.#]+)\.(.+)$/.exec(cible); if(!m) return null;
  const d=st.datasets.find(x=>x.id===m[1]); if(d) return d.columns.find(c=>c.name===m[2])||null;
  const t=st.gold.find(x=>x.id===m[1]&&x.kind==="dim"); return t&&t.columns.find(c=>c.name===m[2])||null;
}
function erreurModif(m){
  if(!m||!OPS_REPONSE.includes(m.op)) return `opération inconnue (${OPS_REPONSE.join(", ")})`;
  if(m.op==="valider"){ if(typeof m.valeur!=="boolean") return "valeur doit être true ou false"; const p=porteurHypothese(S.st,m.cible); return p&&p.hypothese?null:`hypothèse introuvable : ${m.cible}`; }
  if(m.op==="codes"){ if(!colIndex(m.cible)) return `colonne introuvable : ${m.cible}`;
    if(!m.valeur||typeof m.valeur!=="object"||Array.isArray(m.valeur)||!Object.keys(m.valeur).length) return "codes : table code → libellé attendue";
    return Object.values(m.valeur).every(v=>typeof v==="string"&&v.trim())?null:"codes : libellé vide"; }
  if(m.op==="exclure"){ if(!DS(m.cible)) return `dataset introuvable : ${m.cible}`; return m.sql&&parseCond(m.sql)?null:`condition non reconnue : ${m.sql}`; }
  if(m.op==="definir"){ const c=String(m.cible||""); let x=/^flux:([^.]+)\.(\w+)$/.exec(c);
    if(x){ const fl=FX(x[1]); if(!fl) return `flux introuvable : ${x[1]}`; if(!DEFINIR.flux.includes(x[2])) return `champ de flux non modifiable : ${x[2]} (${DEFINIR.flux.join(", ")})`;
      if(x[2]==="champ"&&!CHAMPS.includes(m.valeur)) return `champ inconnu : ${m.valeur}`;
      if(x[2]==="unite"&&!UNITES.includes(m.valeur)) return `unité inconnue : ${m.valeur}`;
      if(x[2]==="valeur"){ const d=DS(fl.ds); if(!d||!compileVal(m.valeur,d)) return `valeur non calculable : ${m.valeur}`; }
      if(x[2]==="filtre"&&m.valeur!==""&&!parseCond(m.valeur)) return `filtre non reconnu : ${m.valeur}`;
      return null; }
    x=/^([^.]+\.[^.]+)\.(\w+)$/.exec(c); if(!x||!colIndex(x[1])) return `cible introuvable : ${c}`;
    if(!DEFINIR.colonne.includes(x[2])) return `champ de colonne non modifiable : ${x[2]} (${DEFINIR.colonne.join(", ")})`;
    if(x[2]==="role"&&!ROLES[m.valeur]) return `rôle inconnu : ${m.valeur}`;
    if(x[2]==="decimalComma"&&typeof m.valeur!=="boolean") return "decimalComma : true ou false";
    if(x[2]==="format"&&typeof m.valeur!=="string") return "format : texte attendu";
    return null; }
  if(m.op==="fichier") return ["traiter","ignorer"].includes(m.valeur)?null:"valeur traiter ou ignorer attendue";
  return null;
}
function erreursModifs(modifs){
  if(!Array.isArray(modifs)||!modifs.length) return ["aucune modification"];
  return modifs.map((m,i)=>{ const e=erreurModif(m); return e?`modification ${i+1} (${m&&m.op||"?"}) : ${e}`:null; }).filter(Boolean);
}
function appliquerModif(st,m,entree){
  const ds=id=>st.datasets.find(x=>x.id===id)||null;
  const col=ref=>{ const [d,c]=String(ref||"").split("."); const x=ds(d); return x&&x.columns.find(k=>k.name===c)||null; };
  if(m.op==="valider"){ const p=porteurHypothese(st,m.cible); if(!p||!p.hypothese) return "hypothèse introuvable"; Object.assign(p.hypothese,{valide:!!m.valeur,refuse:!m.valeur,reponse:String(entree.reponse||"")}); return null; }
  if(m.op==="codes"){ const c=col(m.cible); if(!c) return "colonne introuvable"; c.codes=Object.assign({},m.valeur); return null; }
  if(m.op==="exclure"){ const d=ds(m.cible); if(!d) return "dataset introuvable"; d.rules.push({text:String(m.text||entree.reponse||""),sql:String(m.sql||"")}); return null; }
  if(m.op==="definir"){ let x=/^flux:([^.]+)\.(\w+)$/.exec(String(m.cible||""));
    if(x){ const fl=st.flux.find(f=>f.id===x[1]); if(!fl) return "flux introuvable"; fl[x[2]]=m.valeur; return null; }
    x=/^([^.]+\.[^.]+)\.(\w+)$/.exec(String(m.cible||"")); const c=x&&col(x[1]); if(!c) return "colonne introuvable"; c[x[2]]=m.valeur; return null; }
  return null;
}
function appliquerCalque(st){
  st._orphelines=[]; if(!Array.isArray(st.reponses)) return st;
  const dernieres=new Map(); st.reponses.forEach(r=>{ if(r&&r.id!=null&&Array.isArray(r.modifs)) dernieres.set(String(r.id),r); });
  dernieres.forEach((r,id)=>r.modifs.forEach(m=>{ const e=OPS_REPONSE.includes(m&&m.op)?appliquerModif(st,m,r):"opération inconnue"; if(e) st._orphelines.push({id,op:m&&m.op,cible:m&&m.cible,msg:e}); }));
  return st;
}
```

- [ ] **Step 4 : brancher le calque**

Dans `core/model.js`, fonction `hydrate`, entre la ligne qui se termine par `st.reponses=st.reponses==null?[]:st.reponses;` et `st.datasets.forEach(profile);`, insérer :

```js
  appliquerCalque(st);
```

Dans `tools/atelier.mjs` et `tests/aide/moteur.mjs`, ajouter `"core/calque.js"` en fin de la constante `CORE` :

```js
const CORE = ["core/engine.js", "core/model.js", "core/check.js", "core/controles.js", "core/hypotheses.js", "core/questions.js", "core/calque.js"];
```

Dans `core/check.js`, juste après la ligne `else st.reponses.forEach((r,i)=>{ … });` (vérification id/reponse du registre), insérer :

```js
  (st._orphelines||[]).forEach(o=>add("alerte","spec/reponses.yml",`réponse orpheline ${o.id} (${o.op||"?"} ${o.cible||""}) : ${o.msg}`));
```

- [ ] **Step 5 : lancer les tests**

Run : `npm test`
Expected : PASS, 83 tests.

---

### Task 3 : questions typées et construction d'une entrée

**Files :**
- Modify : `tools/atelier.mjs` (chargement des questions dans `loadState`), `core/hypotheses.js` (`listeHypotheses`), `core/questions.js` (remplacé en entier), `core/check.js` (`piiFuites`), `core/calque.js` (ajout de `entreeReponse`), `tests/questions.test.mjs` (test « deux réponses »)
- Create : `tests/reponses-client.test.mjs`

**Interfaces :**
- Consumes : `TYPES_REPONSE`, `erreursModifs` (Task 2).
- Produces :
  - champs de question de dataset et de bloc `hypothese` : `reponse_type`, `reponse_cible`, `options` (`[{libelle, valeur}]`), `sql` ;
  - chaque élément de `listeQuestions()` gagne `type` (un de `TYPES_REPONSE`, ou `""` pour une entrée orpheline du registre), `formulaire` (`{cible, options, sql, valeurs:[{code, n, libelle}]}` ou `null`), `apercu` (texte), `par`, `historique` (`[{reponse, date, par}]`, plus récente d'abord), `orpheline` (booléen) ;
  - `entreeReponse(id, saisie, par, date)` → `{entree}` ou `{erreurs:[…]}`. Saisies : `confirmer {oui, precision}`, `codes {codes:{code:libellé}, exclus:[code]}`, `choix {option: index}`, `exclure {exclure: booléen}`, `fichier {valeur: "traiter"|"ignorer"}`, `libre {texte}` ; pour tout type, `{autre: true, texte}` répond en texte libre.

- [ ] **Step 1 : écrire les tests qui échouent**

`tests/reponses-client.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, etatCaTotal, colonne } from "./aide/moteur.mjs";

const etat = (reponses = [], extra = {}) => { const s = etatCaTotal({ source: "agent", question: "Le montant est-il HT ?" }, { reponses, ...extra });
  s.datasets[0].columns.push(colonne("statut")); s.datasets[0].rows = [["02/01/2025", "600", "L"], ["15/02/2025", "400", "A"]];
  s.datasets[0].questions = [{ id: "q4", text: "statut : valeurs L, A. Que signifie chacune ?", done: false, reponse_type: "codes" }, { id: "q5", text: "Export complet ?", done: false }]; return s; };
const question = (m, id) => m.run(`listeQuestions().find(q=>q.id===${JSON.stringify(id)})`);

test("type par défaut : confirmer pour une hypothèse, fichier pour un non lu, libre sinon", () => {
  const m = chargerMoteur(etat([], { nonLus: [{ societe: "s1", fichier: "x.pdf", raison: "pdf" }] }));
  assert.deepEqual(["tms.montant", "non_lu:x.pdf", "tms#q5", "tms#q4"].map(id => question(m, id).type), ["confirmer", "fichier", "libre", "codes"]);
});

test("formulaire codes : valeurs de la colonne et aperçu des données", () => {
  const q = question(chargerMoteur(etat()), "tms#q4");
  assert.equal(q.formulaire.cible, "tms.statut");
  assert.deepEqual(q.formulaire.valeurs, [{ code: "L", n: 1, libelle: "" }, { code: "A", n: 1, libelle: "" }]);
  assert.match(q.apercu, /2 valeurs distinctes · 0 % vides · fréquentes : L \(1\), A \(1\)/);
});

test("réponse codes : entrée construite, puis appliquée au rechargement", () => {
  const { entree } = chargerMoteur(etat()).run("entreeReponse('tms#q4',{codes:{L:'Livrée',A:'Annulée'},exclus:['A']},'Exploitation','2026-11-12T14:03:00')");
  assert.deepEqual(entree.modifs, [{ op: "codes", cible: "tms.statut", valeur: { L: "Livrée", A: "Annulée" } }, { op: "exclure", cible: "tms", sql: "statut not in ('A')", text: "Exclure statut A" }]);
  assert.deepEqual([entree.id, entree.origine, entree.par, entree.reponse, entree.date], ["tms#q4", "client", "Exploitation", "L Livrée, A Annulée ; à exclure : A", "2026-11-12T14:03:00"]);
  const m = chargerMoteur(etat([entree]));
  assert.equal(question(m, "tms#q4").statut, "traitee");
  assert.equal(m.run("buildFaits().stats.f1.total"), 600);
});

test("réponse confirmer : l'hypothèse devient confirmée", () => {
  const { entree } = chargerMoteur(etat()).run("entreeReponse('tms.montant',{oui:true,precision:'hors péages'},'','2026-11-12T14:00:00')");
  assert.deepEqual(entree.modifs, [{ op: "valider", cible: "tms.montant", valeur: true }]);
  assert.equal(entree.reponse, "Oui. hors péages"); assert.equal("par" in entree, false);
  assert.equal(chargerMoteur(etat([entree])).run("listeHypotheses()[0].confiance"), "confirme");
});

test("réponse choix et exclure : l'option ou la condition préparée par l'agent", () => {
  const s = etat(); s.datasets[0].questions.push({ id: "q6", text: "montant : HT ou TTC ?", done: false, reponse_type: "choix", reponse_cible: "flux:f1.valeur", options: [{ libelle: "HT", valeur: "montant" }, { libelle: "TTC", valeur: "montant / 1.2" }] },
    { id: "q7", text: "Faut-il exclure les ordres annulés ?", done: false, reponse_type: "exclure", sql: "statut <> 'A'" });
  const m = chargerMoteur(s);
  assert.deepEqual(m.run("entreeReponse('tms#q6',{option:1},'','d').entree.modifs"), [{ op: "definir", cible: "flux:f1.valeur", valeur: "montant / 1.2" }]);
  assert.deepEqual(m.run("entreeReponse('tms#q7',{exclure:true},'','d').entree.modifs"), [{ op: "exclure", cible: "tms", sql: "statut <> 'A'", text: "Faut-il exclure les ordres annulés ?" }]);
  assert.deepEqual(m.run("entreeReponse('tms#q7',{exclure:false},'','d').entree.modifs"), [{ op: "noter" }]);
});

test("entreeReponse refuse une question inconnue, une saisie incomplète, une donnée personnelle", () => {
  const s = etat(); s.datasets[0].columns.push(colonne("nom", { pii: true })); s.datasets[0].rows.forEach(r => r.push("Durandel"));
  const m = chargerMoteur(s);
  assert.match(m.run("entreeReponse('tms#q9',{texte:'x'},'','d').erreurs[0]"), /introuvable/);
  assert.match(m.run("entreeReponse('tms.montant',{},'','d').erreurs[0]"), /oui ou non/);
  assert.match(m.run("entreeReponse('tms#q4',{codes:{}},'','d').erreurs[0]"), /table code/);
  assert.match(m.run("entreeReponse('tms#q5',{texte:'Demander à Durandel'},'','d').erreurs[0]"), /donnée personnelle/);
  assert.match(m.run("entreeReponse('tms#q5',{texte:'Oui'},'Durandel','d').erreurs[0]"), /donnée personnelle/);
  assert.deepEqual(m.run("entreeReponse('tms#q4',{autre:true,texte:'Voir avec la compta'},'','d').entree.modifs"), [{ op: "noter" }]);
});

test("une question dont la réponse est orpheline le signale", () => {
  const q = question(chargerMoteur(etat([{ id: "tms#q4", question: "statut : valeurs L, A. Que signifie chacune ?", reponse: "r", date: "d", modifs: [{ op: "codes", cible: "tms.disparue", valeur: { L: "x" } }] }])), "tms#q4");
  assert.deepEqual([q.statut, q.orpheline], ["traitee", true]);
});
```

Dans `tests/questions.test.mjs`, remplacer le test « deux réponses pour la même question : la dernière se greffe, l'autre reste listée » par :

```js
test("deux réponses pour la même question : la dernière se greffe, les précédentes forment l'historique", () => {
  const l = liste(etat(undefined, { reponses: [{ id: "tms.montant", reponse: "A", date: "2026-11-07", par: "Compta" }, { id: "tms.montant", reponse: "B", date: "2026-11-08" }] }));
  const q = l.find(q => q.id === "tms.montant");
  assert.deepEqual([q.reponse, q.historique], ["B", [{ reponse: "A", date: "2026-11-07", par: "Compta" }]]);
  assert.ok(!l.some(q => q.retiree));
});
```

- [ ] **Step 2 : lancer les tests, ils échouent**

Run : `node --test tests/reponses-client.test.mjs tests/questions.test.mjs`
Expected : FAIL (`type` absent, `entreeReponse is not defined`, historique absent).

- [ ] **Step 3 : charger les champs de formulaire**

Dans `tools/atelier.mjs` (`loadState`), remplacer :

```js
    d.questions = (d.questions || []).map(q => ({ id: q.id || "", text: q.text || "", done: !!q.done, answer: q.answer || "" }));
```

par :

```js
    d.questions = (d.questions || []).map(q => ({ id: q.id || "", text: q.text || "", done: !!q.done, answer: q.answer || "", reponse_type: q.reponse_type || "", reponse_cible: q.reponse_cible || "", options: Array.isArray(q.options) ? q.options : [], sql: q.sql || "" }));
```

Dans `core/hypotheses.js` (`listeHypotheses`), dans l'objet poussé par `push`, remplacer `reponse:String(h.reponse||"")});` par :

```js
reponse:String(h.reponse||""),form:{reponse_type:String(h.reponse_type||""),reponse_cible:String(h.reponse_cible||""),options:Array.isArray(h.options)?h.options:[],sql:String(h.sql||"")}});
```

- [ ] **Step 4 : remplacer `core/questions.js` en entier**

```js
/* ───────────── questions de séance : liste unique, réponses greffées ───────────── */
const SRC_RANG={hypothese:0,controle:1,profil:2,hors_recette:3,non_lu:4,registre:5};
const TYPE_DEFAUT={hypothese:"confirmer",non_lu:"fichier"};
function lotDe(dsId){ return String(dsId||"").split("_")[0]||"divers"; }
function datasetDe(c){ c=String(c||""); if(c.startsWith("flux:")){ const fl=FX(c.slice(5).split("#")[0]); return fl?fl.ds:null; }
  if(/^(DIM_|controle:)/.test(c)) return null; return c.split(/[.#]/)[0]||null; }
function impactsMesures(){ return cached("impm",()=>{ const m=new Map(); CAT().list.forEach(x=>ciblesMesure(x).forEach(c=>{ if(!m.has(c)) m.set(c,new Set()); m.get(c).add(x.name); })); return m; }); }
function mesuresDe(elements){ const im=impactsMesures(), out=new Set();
  (elements||[]).filter(Boolean).forEach(e=>im.forEach((ms,c)=>{ if(c===e||(!/[.#:]/.test(e)&&(c.startsWith(e+".")||c.startsWith(e+"#")))) ms.forEach(n=>out.add(n)); }));
  return [...out]; }
function apercuDe(element){ const ci=/^[^.#:]+\.[^.#]+$/.test(String(element||""))?colIndex(element):null; const p=ci&&ci.ds._prof[ci.col.name]; if(!p||!p.n) return "";
  return `${p.distinct} valeur${p.distinct>1?"s":""} distincte${p.distinct>1?"s":""} · ${Math.round(p.nulls/p.n*100)} % vides`+(ci.col.pii?"":` · fréquentes : ${p.top.slice(0,5).map(([v,n])=>`${v} (${n})`).join(", ")}`); }
function formulaireDe(type,f,element){
  const fo={cible:String(f.reponse_cible||""),options:(Array.isArray(f.options)?f.options:[]).map(o=>({libelle:String(o&&o.libelle||""),valeur:o&&o.valeur})),sql:String(f.sql||""),valeurs:[]};
  if(!fo.cible) fo.cible=type==="exclure"?String(element||"").split(/[.#]/)[0]:String(element||"");
  const ci=type==="codes"?colIndex(fo.cible):null;
  if(ci&&!ci.col.pii) fo.valeurs=((ci.ds._prof[ci.col.name]||{}).top||[]).map(([v,n])=>({code:String(v),n,libelle:String((ci.col.codes||{})[v]||"")}));
  return fo;
}
function listeQuestions(){ return cached("questions",()=>{
  const reg=(Array.isArray(S.st.reponses)?S.st.reponses:[]).filter(r=>r&&r.id!=null), greffees=new Set(), out=[];
  const fuites=new Set(piiFuites().map(x=>x.cible)), MR="(réponse masquée : contient une donnée personnelle)", MQ=f=>`(texte masqué : contient une donnée personnelle, à reformuler dans ${f})`;
  const orph=new Set((S.st._orphelines||[]).map(o=>o.id));
  const add=q=>{ const t=String(q.question||"").trim(), memes=reg.filter(r=>String(r.id)===q.id&&(r.question==null||String(r.question).trim()===t)), r=memes[memes.length-1]; memes.forEach(x=>greffees.add(x));
    const fq=fuites.has(q.id), fr=fuites.has("reponse:"+q.id), f=q.form||{}, type=TYPES_REPONSE.includes(f.reponse_type)?f.reponse_type:TYPE_DEFAUT[q.source]||"libre";
    out.push({id:q.id,source:q.source,lot:q.lot,element:q.element,elements:q.elements,fichier:q.fichier,question:fq?MQ(q.fichier):String(q.question||""),
    statut:q.traitee||r?"traitee":"ouverte",reponse:fq||fr?MR:String((r&&r.reponse)||q.reponse||""),date:String((r&&r.date)||""),effet:fr?MR:String((r&&r.effet)||""),par:fr?"":String((r&&r.par)||""),
    historique:memes.slice(0,-1).reverse().map(x=>({reponse:fr?MR:String(x.reponse||""),date:String(x.date||""),par:fr?"":String(x.par||"")})),
    orpheline:orph.has(q.id),type,formulaire:formulaireDe(type,f,q.element),apercu:apercuDe(q.element),mesures:mesuresDe(q.elements)}); };
  S.st.datasets.forEach(d=>d.questions.forEach(q=>{ const col=d.columns.find(c=>String(q.text||"").startsWith(c.name+" :")); const el=col?`${d.id}.${col.name}`:d.id;
    add({id:`${d.id}#${q.id}`,source:"profil",lot:lotDe(d.id),element:el,elements:[el],fichier:`spec/datasets/${d.id}.yml`,question:q.text,traitee:!!q.done,reponse:q.answer,form:q}); }));
  listeHypotheses().filter(h=>h.valide||h.refuse||h.confiance!=="haute").forEach(h=>{ const ds=datasetDe(h.cible);
    add({id:h.cible,source:"hypothese",lot:ds?lotDe(ds):"dimensions",element:h.cible,elements:[h.cible],fichier:h.fichier,question:h.question||h.libelle,traitee:h.valide||h.refuse,reponse:h.reponse,form:h.form}); });
  CTRL().forEach(r=>{ const c=(S.st.controles||[]).find(x=>String(x.id)===r.id)||{}; if(r.statut==="ok"&&!c.reponse) return;
    const ds=c.ds||(c.a&&c.a.ds)||(c.from&&String(c.from).split(".")[0])||r.porte_sur.map(datasetDe).find(Boolean);
    add({id:`controle:${r.id}`,source:"controle",lot:ds?lotDe(ds):"divers",element:`controle:${r.id}`,elements:r.porte_sur,fichier:"spec/controles.yml",question:`${r.libelle} : ${r.msg}`,traitee:!!c.reponse,reponse:c.reponse}); });
  S.st.datasets.filter(d=>d.meta&&d.meta.hors_recette>0).forEach(d=>add({id:`hors_recette:${d.id}`,source:"hors_recette",lot:lotDe(d.id),element:d.id,elements:[d.id],fichier:d.file,
    question:`${d.meta.hors_recette} valeurs hors recette dans ${d.id} : que contiennent ces colonnes, faut-il les lire ?`}));
  (S.st.nonLus||[]).forEach(x=>add({id:`non_lu:${x.fichier}${x.feuille?"#"+x.feuille:""}`,source:"non_lu",lot:"fichiers",element:x.fichier,elements:[],fichier:`data/bronze/${x.societe}/_non_lus.json`,
    question:`Fichier non lu (${x.raison}) : faut-il le traiter ?`}));
  reg.filter(r=>!greffees.has(r)).forEach(r=>{ const id=String(r.id), f=fuites.has("reponse:"+id);
    out.push({id,source:"registre",lot:r.lot||lotDe(datasetDe(r.element||id)),element:String(r.element||""),elements:[],fichier:"spec/reponses.yml",
    question:f?MQ("spec/reponses.yml"):String(r.question||""),statut:"traitee",reponse:f?MR:String(r.reponse||""),date:String(r.date||""),effet:f?MR:String(r.effet||""),par:f?"":String(r.par||""),
    historique:[],orpheline:orph.has(id),type:"",formulaire:null,apercu:"",mesures:[],retiree:true}); });
  const imp=lot=>out.filter(q=>q.lot===lot&&q.statut==="ouverte").reduce((n,q)=>n+q.mesures.length,0);
  const lots=[...new Set(out.map(q=>q.lot))].sort((a,b)=>imp(b)-imp(a)||a.localeCompare(b));
  return out.sort((a,b)=>lots.indexOf(a.lot)-lots.indexOf(b.lot)||(a.statut===b.statut?0:a.statut==="ouverte"?-1:1)
    ||(a.statut==="ouverte"?b.mesures.length-a.mesures.length||SRC_RANG[a.source]-SRC_RANG[b.source]:b.date.localeCompare(a.date))||a.id.localeCompare(b.id));
}); }
```

- [ ] **Step 5 : `par` sous garde pii**

Dans `core/check.js` (`piiFuites`), remplacer `["question","reponse","effet"]` par `["question","reponse","effet","par"]`.

- [ ] **Step 6 : ajouter `entreeReponse` à la fin de `core/calque.js`**

```js
function entreeReponse(id,saisie,par,date){
  if(!Array.isArray(S.st.reponses)) return {erreurs:["registre spec/reponses.yml illisible"]};
  const q=listeQuestions().find(x=>x.id===id&&x.source!=="registre"); if(!q) return {erreurs:[`question introuvable : ${id}`]};
  if(/^\(texte masqué/.test(q.question)) return {erreurs:["question à reformuler par WeMa (donnée personnelle)"]};
  const s=saisie||{}, f=q.formulaire, txt=x=>String(x??"").trim(), type=s.autre?"libre":q.type; let reponse="", modifs;
  if(type==="confirmer"){ if(typeof s.oui!=="boolean") return {erreurs:["réponse oui ou non attendue"]};
    reponse=(s.oui?"Oui":"Non")+(txt(s.precision)?". "+txt(s.precision):""); modifs=[{op:"valider",cible:f.cible,valeur:s.oui}]; }
  else if(type==="codes"){ const codes={}; Object.entries(s.codes||{}).forEach(([k,v])=>{ if(txt(v)) codes[k]=txt(v); }); const exclus=(s.exclus||[]).map(String), [ds,col]=f.cible.split(".");
    reponse=Object.entries(codes).map(([k,v])=>`${k} ${v}`).join(", ")+(exclus.length?` ; à exclure : ${exclus.join(", ")}`:"");
    modifs=[{op:"codes",cible:f.cible,valeur:codes}]; if(exclus.length) modifs.push({op:"exclure",cible:ds,sql:`${col} not in (${exclus.map(sq).join(", ")})`,text:`Exclure ${col} ${exclus.join(", ")}`}); }
  else if(type==="choix"){ const o=f.options[s.option]; if(!o) return {erreurs:["choisir une option"]}; reponse=o.libelle; modifs=[{op:"definir",cible:f.cible,valeur:o.valeur}]; }
  else if(type==="exclure"){ if(typeof s.exclure!=="boolean") return {erreurs:["exclure ou garder attendu"]};
    reponse=s.exclure?"Exclure ces lignes":"Garder ces lignes"; modifs=[s.exclure?{op:"exclure",cible:f.cible,sql:f.sql,text:q.question}:{op:"noter"}]; }
  else if(type==="fichier"){ if(!["traiter","ignorer"].includes(s.valeur)) return {erreurs:["traiter ou ignorer attendu"]}; reponse=s.valeur==="traiter"?"À traiter":"À ignorer"; modifs=[{op:"fichier",cible:q.id,valeur:s.valeur}]; }
  else { reponse=txt(s.texte); if(!reponse) return {erreurs:["réponse vide"]}; modifs=[{op:"noter"}]; }
  const erreurs=erreursModifs(modifs); if(erreurs.length) return {erreurs};
  const e={id:q.id,question:q.question,reponse,origine:"client",date:String(date),modifs}; if(txt(par)) e.par=txt(par);
  S.st.reponses.push(e); S.ver++; const fuite=piiFuites().some(x=>x.cible==="reponse:"+q.id); S.st.reponses.pop(); S.ver++;
  return fuite?{erreurs:["la réponse cite une donnée personnelle (nom, carte…) : reformulez sans la citer, indiquez un service plutôt qu'un nom"]}:{entree:e};
}
```

- [ ] **Step 7 : lancer les tests**

Run : `npm test`
Expected : PASS, 90 tests (le test « deux réponses » remplacé compte toujours pour un).

---

### Task 4 : `POST /api/reponse` sur le serveur local

**Files :**
- Modify : `tools/atelier.mjs` (`evaluate`, nouvelles fonctions `lireCorps`, `ajouterAuRegistre`, `repondre`, route dans `cmdServe`)
- Create : `tests/serveur-reponse.test.mjs`

**Interfaces :**
- Consumes : `entreeReponse` (Task 3), `summary()` et `piiFuites()` du moteur, `ATELIER_ROOT` et `racineExemple` (Task 1).
- Produces : `POST /api/reponse` avec un corps JSON `{id, saisie, par}` ; réponse `200 {entree}` (l'entrée écrite, avec `effet`) ou `400 {erreurs:[…]}` ; `evaluate(plus = [])` évalue la spec avec des entrées de registre supplémentaires.

- [ ] **Step 1 : écrire le test qui échoue**

`tests/serveur-reponse.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { racineExemple, ATELIER } from "./aide/racine.mjs";

async function serveur(root) {
  const port = 40000 + Math.floor(Math.random() * 20000);
  const p = spawn(process.execPath, [ATELIER, "serve", "--port", String(port)], { env: { ...process.env, ATELIER_ROOT: root } });
  await new Promise((ok, ko) => { p.stdout.on("data", d => { if (/Prévisualisation/.test(d)) ok(); }); p.on("exit", c => ko(new Error("serveur arrêté : " + c))); });
  return { url: `http://127.0.0.1:${port}`, stop: () => p.kill() };
}
const post = (s, corps) => fetch(s.url + "/api/reponse", { method: "POST", headers: { "content-type": "application/json" }, body: typeof corps === "string" ? corps : JSON.stringify(corps) });
const registre = root => fs.readFileSync(path.join(root, "spec/reponses.yml"), "utf8");

test("POST /api/reponse ajoute l'entrée au registre, avec son effet", async t => {
  const root = racineExemple(); const s = await serveur(root); t.after(s.stop);
  assert.equal((await fetch(s.url + "/")).status, 200);
  const r = await post(s, { id: "compta_balance#q1", saisie: { texte: "Date de clôture réelle" }, par: "Comptabilité" });
  assert.equal(r.status, 200);
  assert.match((await r.json()).entree.effet, /mesures alimentées \d+ → \d+/);
  const reg = YAML.parse(registre(root));
  assert.deepEqual([reg.length, reg[0].id, reg[0].reponse, reg[0].par, reg[0].origine, reg[0].modifs], [1, "compta_balance#q1", "Date de clôture réelle", "Comptabilité", "client", [{ op: "noter" }]]);
  assert.match(registre(root), /^# Registre/);
});

test("POST /api/reponse refuse une question inconnue ou un corps illisible, sans rien écrire", async t => {
  const root = racineExemple(); const s = await serveur(root); t.after(s.stop);
  const r1 = await post(s, { id: "compta_balance#q99", saisie: { texte: "x" } });
  assert.equal(r1.status, 400); assert.match((await r1.json()).erreurs[0], /introuvable/);
  assert.equal((await post(s, "pas du json")).status, 400);
  assert.equal(YAML.parse(registre(root)), null);
});
```

- [ ] **Step 2 : lancer le test, il échoue**

Run : `node --test tests/serveur-reponse.test.mjs`
Expected : FAIL (`/api/reponse` répond 404).

- [ ] **Step 3 : `evaluate` accepte des entrées supplémentaires**

Remplacer :

```js
function evaluate() {
  const ctx = makeCtx(); const { state, errors } = loadState(ctx);
```

par :

```js
function evaluate(plus = []) {
  const ctx = makeCtx(); const { state, errors } = loadState(ctx); if (plus.length && Array.isArray(state.reponses)) state.reponses = state.reponses.concat(plus);
```

- [ ] **Step 4 : écrire la réception d'une réponse**

Juste avant la ligne `/* ───────── serveur de prévisualisation ───────── */`, ajouter :

```js
/* ───────── réponses de l'adhérent ───────── */
function lireCorps(req, res, fn) {
  let b = ""; req.on("data", c => { b += c; if (b.length > 65536) { res.writeHead(413); res.end(); req.destroy(); } });
  req.on("end", () => { if (res.writableEnded) return; let o; try { o = JSON.parse(b); } catch { res.writeHead(400, { "content-type": "application/json" }); return res.end(JSON.stringify({ erreurs: ["corps JSON illisible"] })); } fn(o || {}); });
}
function ajouterAuRegistre(entree) {
  const f = P("spec/reponses.yml"), avant = exists(f) ? fs.readFileSync(f, "utf8") : REGISTRE_VIDE;
  fs.writeFileSync(f, avant.replace(/^\[\]\s*$/m, "").replace(/\n*$/, "\n") + YAML.stringify([entree], { lineWidth: 0 }));
}
function repondre({ id, saisie, par }) {
  if (typeof id !== "string" || (saisie != null && typeof saisie !== "object") || (par != null && (typeof par !== "string" || par.length > 80))) return { erreurs: ["requête invalide : id, saisie, par"] };
  const { ctx } = evaluate(); const avant = vm.runInContext("summary()", ctx);
  ctx.__r = { id, saisie: saisie || {}, par: par || "", date: new Date().toISOString().slice(0, 19) };
  const r = JSON.parse(JSON.stringify(vm.runInContext("entreeReponse(__r.id, __r.saisie, __r.par, __r.date)", ctx)));
  if (r.erreurs) return r;
  const apres = vm.runInContext("summary()", evaluate([r.entree]).ctx);
  r.entree.effet = `mesures alimentées ${avant.mesures.ok} → ${apres.mesures.ok} · lignes FAITS ${avant.lignesFaits} → ${apres.lignesFaits} · questions ouvertes ${avant.questionsOuvertes} → ${apres.questionsOuvertes}`;
  ajouterAuRegistre(r.entree);
  return r;
}
```

- [ ] **Step 5 : ajouter la route**

Dans `cmdServe`, juste avant la ligne `if (url.pathname === "/api/layout" && req.method === "POST")`, ajouter :

```js
      if (url.pathname === "/api/reponse" && req.method === "POST") { lireCorps(req, res, b => { try { const r = repondre(b); res.writeHead(r.erreurs ? 400 : 200, { "content-type": "application/json" }); res.end(JSON.stringify(r)); } catch (e) { res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }); res.end(String(e.message || e)); } }); return; }
```

- [ ] **Step 6 : lancer les tests**

Run : `npm test`
Expected : PASS, 92 tests.

---

### Task 5 : formulaires de l'onglet Questions

**Files :**
- Modify : `viewer/ui.js` (section `/* ───────────── questions ───────────── */`), `viewer/style.css` (après les règles `.qi`)

**Interfaces :**
- Consumes : éléments de `listeQuestions()` avec `type`, `formulaire`, `apercu`, `par`, `historique`, `orpheline` (Task 3) ; `POST /api/reponse` (Task 4).
- Produces : `formQ(q)` (HTML du formulaire), `saisieQ(form, q)` (objet `saisie` attendu par `entreeReponse`), état `S.qEdit` (id de la question traitée rouverte).

- [ ] **Step 1 : remplacer la section questions de `viewer/ui.js`**

Remplacer tout le bloc compris entre `/* ───────────── questions ───────────── */` et `/* ───────────── onglets ───────────── */` (exclus) par :

```js
/* ───────────── questions ───────────── */
const SRC_LIB={hypothese:"Hypothèse",controle:"Contrôle",profil:"Profil",hors_recette:"Hors recette",non_lu:"Non lu",registre:"Registre"};
const radios=(n,l)=>`<div class="qopts">${l.map(([v,t])=>`<label><input type="radio" name="${n}" value="${esc(v)}"> ${esc(t)}</label>`).join("")}</div>`;
function formQ(q){
  const f=q.formulaire; let h="";
  if(q.type==="confirmer") h=radios("oui",[["1","Oui"],["0","Non"]])+`<input class="inp" name="precision" placeholder="Précision (facultatif)">`;
  if(q.type==="codes") h=f.valeurs.length?`<table class="qcodes"><thead><tr><th>Code</th><th>Lignes</th><th>Signification</th><th>À exclure</th></tr></thead><tbody>${f.valeurs.map(v=>`<tr><td class="mono">${esc(v.code)}</td><td>${v.n}</td><td><input class="inp" data-code="${esc(v.code)}" value="${esc(v.libelle)}"></td><td><input type="checkbox" data-exclu="${esc(v.code)}" aria-label="Exclure ${esc(v.code)}"></td></tr>`).join("")}</tbody></table>`:`<p class="note">Valeurs non disponibles : répondez en texte libre.</p>`;
  if(q.type==="choix") h=radios("option",f.options.map((o,i)=>[String(i),o.libelle]));
  if(q.type==="exclure") h=`<p class="note mono">Lignes gardées : ${esc(f.sql)}</p>`+radios("exclure",[["1","Exclure les autres lignes"],["0","Tout garder"]]);
  if(q.type==="fichier") h=radios("valeur",[["traiter","À traiter"],["ignorer","À ignorer"]]);
  const libre=q.type==="libre", texte=`<textarea class="inp" name="texte" rows="2" placeholder="Votre réponse"></textarea>`;
  return `<form class="qform" data-qid="${esc(q.id)}">${h}${libre?texte:`<details class="qautre"><summary>Autre réponse</summary>${texte}</details>`}
    <div class="qact"><input class="inp" name="par" placeholder="Service ou fonction (facultatif)" value="${esc(localStorage.getItem("atelier.par")||"")}"><button class="btn sm" type="submit">Valider</button></div><p class="qerr" hidden></p></form>`;
}
function saisieQ(form,q){
  const v=n=>form.querySelector(`[name="${n}"]:checked`)?.value, texte=form.querySelector('[name="texte"]').value.trim();
  if(q.type==="libre") return {texte};
  if(form.querySelector(".qautre").open&&texte) return {autre:true,texte};
  if(q.type==="confirmer") return {oui:v("oui")==null?null:v("oui")==="1",precision:form.querySelector('[name="precision"]').value};
  if(q.type==="codes"){ const codes={}; form.querySelectorAll("[data-code]").forEach(i=>codes[i.dataset.code]=i.value); return {codes,exclus:[...form.querySelectorAll("[data-exclu]:checked")].map(i=>i.dataset.exclu)}; }
  if(q.type==="choix") return {option:v("option")==null?null:+v("option")};
  if(q.type==="exclure") return {exclure:v("exclure")==null?null:v("exclure")==="1"};
  return {valeur:v("valeur")};
}
function renderQ(){
  const qs=listeQuestions(), f=S.qf||"ouvertes", keep=q=>f==="toutes"||(f==="ouvertes"?q.statut==="ouverte":q.statut==="traitee");
  const nOuv=qs.filter(q=>q.statut==="ouverte").length, repondable=q=>q.source!=="registre"&&!/^\(texte masqué/.test(q.question);
  const carte=q=>{ const edit=repondable(q)&&(q.statut==="ouverte"||S.qEdit===q.id), n=q.historique.length;
    return `<div class="qi ${q.statut}"><div class="qh"><span class="qid mono">${esc(q.id)}</span><span class="qs">${esc(SRC_LIB[q.source]||q.source)}</span>${q.mesures.length?`<span class="qm" title="${esc(q.mesures.join(", "))}">${q.mesures.length} mesure${q.mesures.length>1?"s":""}</span>`:""}</div>
    <p>${esc(q.question)}</p>${q.apercu?`<div class="qd">${esc(q.apercu)}</div>`:""}<div class="qe mono">${esc(q.element)}${q.element?" · ":""}${esc(q.fichier)}</div>
    ${q.statut==="traitee"?`<div class="qr"><b>Réponse${q.date?` du ${esc(q.date.slice(0,10))}`:""}${q.par?` · ${esc(q.par)}`:""}${q.retiree?" · retirée de la spec":""}${q.orpheline?" · orpheline : la spec a changé depuis":""}</b><p>${esc(q.reponse||"(réponse non saisie)")}</p>${q.effet?`<div class="qeff">${esc(q.effet)}</div>`:""}
      ${n?`<details class="qhist"><summary>${n} réponse${n>1?"s":""} précédente${n>1?"s":""}</summary>${q.historique.map(h=>`<p><span class="note">${esc(h.date.slice(0,10))}${h.par?" · "+esc(h.par):""}</span> ${esc(h.reponse)}</p>`).join("")}</details>`:""}
      ${repondable(q)&&!edit?`<button class="btn sm" data-qre="${esc(q.id)}">Répondre à nouveau</button>`:""}</div>`:""}
    ${edit?formQ(q):""}</div>`; };
  $("#qv").innerHTML=`<h2>Questions</h2><p class="lede">${nOuv} à traiter · ${qs.length-nOuv} traitées. Chaque réponse s'ajoute au registre <span class="mono">spec/reponses.yml</span> et s'applique aussitôt au dashboard.</p>
    <div class="qfilt">${[["ouvertes","À traiter"],["traitees","Traitées"],["toutes","Toutes"]].map(([k,l])=>`<button class="btn sm" data-qf="${k}" aria-pressed="${f===k}">${l}</button>`).join("")}</div>`
    +(qs.some(keep)?"":`<p class="lede">${{ouvertes:"Aucune question à traiter.",traitees:"Aucune question traitée.",toutes:"Aucune question."}[f]}</p>`)
    +[...new Set(qs.map(q=>q.lot))].map(lot=>{ const l=qs.filter(q=>q.lot===lot), v=l.filter(keep); if(!v.length) return "";
      return `<section class="qlot"><h3>${esc(lot)} <span class="c">${l.filter(q=>q.statut==="traitee").length} traitées sur ${l.length}</span></h3>${v.map(carte).join("")}</section>`; }).join("");
}
$("#qv").addEventListener("click",e=>{ const b=e.target.closest("[data-qf]"); if(b){ S.qf=b.dataset.qf; renderQ(); } const r=e.target.closest("[data-qre]"); if(r){ S.qEdit=r.dataset.qre; renderQ(); } });
$("#qv").addEventListener("submit",async e=>{
  const form=e.target.closest(".qform"); if(!form) return; e.preventDefault();
  const q=listeQuestions().find(x=>x.id===form.dataset.qid); if(!q) return;
  const par=form.querySelector('[name="par"]').value.trim(), err=form.querySelector(".qerr"), b=form.querySelector('[type="submit"]'); localStorage.setItem("atelier.par",par); b.disabled=true;
  const echec=m=>{ err.hidden=false; err.textContent=m; b.disabled=false; };
  try{ const r=await fetch("/api/reponse",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:q.id,saisie:saisieQ(form,q),par})});
    const j=await r.json().catch(()=>({erreurs:[`erreur ${r.status}`]})); if(!r.ok) return echec((j.erreurs||[]).join(" · "));
    S.qEdit=null; toast(j.entree.modifs.every(m=>m.op==="noter")?"Réponse reçue, WeMa reprend la main":`Réponse appliquée · ${j.entree.effet}`); }
  catch(_){ echec("Serveur injoignable"); }
});
```

- [ ] **Step 2 : styles**

Dans `viewer/style.css`, après la ligne `.qi .qeff{…}`, ajouter :

```css
.qi .qd{font-size:11.5px;color:var(--muted);margin:0 0 4px}
.qform{margin-top:8px;display:grid;gap:8px}
.qopts{display:flex;gap:14px;flex-wrap:wrap;font-size:13px}
.qcodes{border-collapse:collapse;font-size:12.5px}
.qcodes th,.qcodes td{padding:3px 10px 3px 0;text-align:left}
.qautre summary{font-size:12px;color:var(--muted);cursor:pointer}
.qact{display:flex;gap:8px;align-items:center}
.qact .inp{max-width:260px}
.qerr{color:var(--bad);font-size:12px;margin:0}
.qhist{margin-top:6px;font-size:12px}
.qi .qr .btn{margin-top:6px}
```

- [ ] **Step 3 : lancer les tests**

Run : `npm test`
Expected : PASS, 92 tests (le moteur est inchangé ; la page se construit sans erreur de syntaxe : `node -e "new Function(require('fs').readFileSync('viewer/ui.js','utf8'))"` ne lève rien).

- [ ] **Step 4 : vérifier dans le navigateur**

Préparer un dossier de démonstration avec une question de chaque type guidé :

```bash
R=$(mktemp -d) && cp -r exemple/spec "$R/spec" && cp -r exemple/data "$R/data" && printf "# Registre des réponses de l'adhérent : on ajoute à la fin, on n'efface jamais.\n" > "$R/spec/reponses.yml" && echo "$R"
```

Dans `$R/spec/datasets/compta_balance.yml`, ajouter `reponse_type: codes` à la question `q2` (etablissement). Puis :

```bash
ATELIER_ROOT="$R" node tools/atelier.mjs serve --port 4322
```

Ouvrir `http://localhost:4322`, onglet Questions :
- `compta_balance#q2` montre le tableau des codes avec les valeurs et leurs nombres de lignes ; saisir les libellés, valider : le message « Réponse appliquée · mesures alimentées … » apparaît, la question passe en traitée, `$R/spec/reponses.yml` contient l'entrée avec `modifs`.
- Filtre « Traitées », bouton « Répondre à nouveau », nouvelle réponse : l'historique « 1 réponse précédente » apparaît.
- Une question de profil sans type : zone de texte ; valider : « Réponse reçue, WeMa reprend la main ».
- Valider un formulaire vide : le message d'erreur s'affiche sous le formulaire, rien n'est écrit.

---

### Task 6 : documentation de l'agent

**Files :**
- Modify : `AGENTS.md` (format de `spec/datasets/<id>.yml`, bloc `hypothese`), `.cursor/commands/maquette.md` (étape 3)

- [ ] **Step 1 : `AGENTS.md`**

Dans le bloc YAML de `spec/datasets/<id>.yml`, remplacer l'exemple de `questions:` par :

```yaml
questions:
 - id: q5
 text: "statut : valeurs L, C, A, R. Que signifie chacune ?"
 reponse_type: codes # confirmer | codes | choix | exclure | fichier | libre (défaut)
 done: false
 - id: q6
 text: "Le montant des ordres est-il HT ou TTC ?"
 reponse_type: choix
 reponse_cible: flux:f1.valeur # champ modifié par la réponse
 options: [{libelle: HT, valeur: montant}, {libelle: TTC, valeur: montant / 1.2}]
```

Après la section « Bloc `hypothese` », ajouter :

```markdown
### Réponses de l'adhérent

L'adhérent répond dans l'onglet Questions. Chaque réponse s'ajoute à `spec/reponses.yml` avec ses `modifs` (opérations `valider`, `codes`, `exclure`, `definir`, `fichier`, `noter`), que le moteur applique au chargement : la dernière entrée d'une question l'emporte. Ne recopie pas ces modifications dans les fichiers sources. Une réponse dont la cible a disparu est signalée par `check` (« réponse orpheline »).

Type de réponse d'une question (`reponse_type`, sur une question de dataset ou dans un bloc `hypothese`) :

| Type | Champs | La réponse produit |
|---|---|---|
| `confirmer` (défaut d'une hypothèse) | — | `valider` |
| `codes` | `reponse_cible` si la question ne commence pas par `colonne :` | `codes`, `exclure` |
| `choix` | `reponse_cible` (`flux:<id>.<champ>` pour valeur, unite, champ, filtre ; `<ds>.<col>.<champ>` pour format, decimalComma, role), `options` | `definir` |
| `exclure` | `sql` : condition des lignes gardées | `exclure` |
| `fichier` (défaut d'un fichier non lu) | — | `fichier` |
| `libre` (défaut) | — | `noter` |
```

- [ ] **Step 2 : `.cursor/commands/maquette.md`**

À l'étape 3, après la puce « supprime les questions automatiques auxquelles une hypothèse répond, garde les autres. », ajouter :

```markdown
   - donne à chaque question restante un `reponse_type` (voir AGENTS.md, « Réponses de l'adhérent ») : `codes` pour une colonne codée, `choix` avec `reponse_cible` et `options` pour une unité ou un HT/TTC, `exclure` avec `sql` pour une règle d'exclusion ; `libre` seulement si aucun formulaire ne convient.
```

- [ ] **Step 3 : vérifier**

Run : `npm test && npm run check`
Expected : tests PASS ; `check` sur la spec courante ne signale aucune nouvelle erreur liée au registre.
