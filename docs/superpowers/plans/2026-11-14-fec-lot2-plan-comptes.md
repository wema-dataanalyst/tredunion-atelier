# FEC lot 2 : plan de comptes pour l'agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à l'agent de maquette, pour un FEC ou un grand livre, une vue par compte (libellé, nombre d'écritures, net signé, journaux, totaux par mois), lue sur le fichier entier ; et signaler quand l'aperçu ne lit qu'une partie d'un fichier.

**Architecture:** Une fonction pure `planComptes(texte, options)` (`tools/plan-comptes.mjs`) agrège un CSV bronze. L'espace l'expose (`espace.planComptes(id, classes)`) en lisant le fichier entier, hors de la limite de 50 000 lignes de l'aperçu, et l'agent la lit par un outil `lire_plan_comptes`. La limite de l'aperçu reste en place : elle protège la vitesse de chaque évaluation ; elle devient visible (`tronque` dans le profil, alerte de `check`).

**Tech Stack:** Node ≥ 22 (ESM), `node:test`, moteur `core/*.js` exécuté dans un contexte `vm` par `tools/espace.mjs`.

## Global Constraints

- Ne touche pas aux fichiers de `spec/`, `data/`, `generated/` du dépôt ; les tests travaillent dans des dossiers temporaires (`racineExemple()`, `fs.mkdtempSync`).
- Aucune valeur d'une colonne `pii: true` dans un résultat donné à l'agent : si `compte_lib` est `pii: true`, le plan de comptes n'a pas de libellé. `ecriture_lib` n'est jamais lu.
- Net signé = crédit − débit : positif pour un produit, négatif pour une charge. Montants arrondis à l'euro, jamais `-0`.
- Commentaires de code en français, seulement pour une contrainte que le code ne montre pas.
- Après chaque tâche : `npm test` entièrement vert.

## File Structure

- Modify: `tools/lecteurs/commun.mjs` — `decouperLigne(ligne, sep)` (déplacée depuis `tools/lecteurs/fec.mjs`, où elle s'appelle `decouper`).
- Modify: `tools/lecteurs/fec.mjs` — importe `decouperLigne`.
- Create: `tools/plan-comptes.mjs` — `planComptes(texte, { classes, libPersonnel })`.
- Modify: `tools/espace.mjs` — `planComptes(id, classes)` exposé ; `plan_comptes` et `tronque` dans `profilDataset` ; `tronque` dans `readCsv` et `d._tronque` dans `loadState`.
- Modify: `server/agent/maquette-outils.mjs` — outil `lire_plan_comptes`.
- Modify: `server/agent/maquette-agent.mjs` — l'outil est offert à la boucle des flux ; une ligne de consigne.
- Modify: `core/check.js` — alerte « aperçu limité ».
- Test: `tests/plan-comptes.test.mjs` (créé), `tests/apercu-tronque.test.mjs` (créé), `tests/maquette-agent.test.mjs` (liste des outils).

---

### Task 1: Agrégat « plan de comptes » d'un CSV bronze

**Files:**
- Modify: `tools/lecteurs/commun.mjs`
- Modify: `tools/lecteurs/fec.mjs`
- Create: `tools/plan-comptes.mjs`
- Test: `tests/plan-comptes.test.mjs`

**Interfaces:**
- Produces:
  - `decouperLigne(ligne: string, sep: string): string[]` dans `tools/lecteurs/commun.mjs` — découpe en respectant les champs entre guillemets (`""` = guillemet littéral).
  - `planComptes(texte: string, { classes = "67", libPersonnel = false } = {}): object` dans `tools/plan-comptes.mjs`. Retour : `{ lignes, classes, periode: {du, au} | null, mois: [{mois: "AAAA-MM", lignes, produits, charges}], sans_date?: n, journaux: [{code, lignes}], comptes: [{compte, lib?, lignes, net, journaux: [codes]}] }`, ou `{ erreur }` si le CSV n'a ni `compte_num` ni montants (`debit`+`credit` ou `montant`+`sens`).
    - `mois` couvre toutes les lignes ; `produits` = net des comptes de classe 7 ; `charges` = débit − crédit des comptes de classe 6.
    - `comptes` ne garde que les comptes dont le premier chiffre est dans `classes`. Ils sont triés par numéro. `lib` est le libellé le plus fréquent du compte, absent si `libPersonnel`. `journaux` donne au plus 3 codes, du plus fréquent au moins fréquent.
    - `journaux` (au niveau racine) est trié par nombre de lignes décroissant.

- [ ] **Step 1: Write the failing test**

Créer `tests/plan-comptes.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { decouperLigne } from "../tools/lecteurs/commun.mjs";
import { planComptes } from "../tools/plan-comptes.mjs";

export const FEC_CSV = [
  "journal_code;journal_lib;ecriture_num;ecriture_date;compte_num;compte_lib;debit;credit",
  "VT;Ventes;1;20260705;411000;Clients;1200,00;0,00",
  "VT;Ventes;1;20260705;706100;Transport national;0,00;1000,00",
  "VT;Ventes;1;20260705;445710;TVA collectée;0,00;200,00",
  "AC;Achats;2;20260810;606100;Gazole;500,40;0,00",
  "AC;Achats;2;20260810;401000;Fournisseurs;0,00;500,40",
  "OD;Opérations diverses;3;20260831;706100;Transport national;100,00;0,00",
  "VT;Ventes;4;20260902;706100;\"Transport; national\";0,00;300,00",
].join("\n") + "\n";

test("decouperLigne : guillemets, séparateur à l'intérieur, guillemet doublé", () => {
  assert.deepEqual(decouperLigne('a;"b;c";"d""e"', ";"), ["a", "b;c", 'd"e']);
  assert.deepEqual(decouperLigne("a\tb", "\t"), ["a", "b"]);
});

test("planComptes : comptes 6/7, mois, journaux, net crédit − débit", () => {
  const p = planComptes(FEC_CSV);
  assert.equal(p.lignes, 7);
  assert.deepEqual(p.periode, { du: "2026-07", au: "2026-09" });
  assert.deepEqual(p.mois, [
    { mois: "2026-07", lignes: 3, produits: 1000, charges: 0 },
    { mois: "2026-08", lignes: 3, produits: -100, charges: 500 },
    { mois: "2026-09", lignes: 1, produits: 300, charges: 0 },
  ]);
  assert.deepEqual(p.journaux, [{ code: "VT", lignes: 4 }, { code: "AC", lignes: 2 }, { code: "OD", lignes: 1 }]);
  assert.deepEqual(p.comptes, [
    { compte: "606100", lib: "Gazole", lignes: 1, net: -500, journaux: ["AC"] },
    { compte: "706100", lib: "Transport national", lignes: 3, net: 1200, journaux: ["VT", "OD"] },
  ]);
  assert.equal(p.sans_date, undefined);
});

test("planComptes : autres classes, libellé personnel retiré", () => {
  assert.deepEqual(planComptes(FEC_CSV, { classes: "4" }).comptes.map(c => c.compte), ["401000", "411000", "445710"]);
  assert.ok(planComptes(FEC_CSV, { libPersonnel: true }).comptes.every(c => !("lib" in c)));
});

test("planComptes : montant et sens, lignes sans date, CSV qui n'est pas un FEC", () => {
  const p = planComptes("compte_num;montant;sens\n706100;100;C\n606100;40,5;D\n");
  assert.deepEqual(p.comptes.map(c => [c.compte, c.net]), [["606100", -41], ["706100", 100]]);
  assert.equal(p.sans_date, 2); assert.equal(p.periode, null);
  assert.ok(planComptes("immat;km\nAB123CD;10\n").erreur);
});
```

Note : `Math.round(-40.5)` vaut `-40` en JavaScript. Le test attend `-41` parce que l'arrondi demandé est symétrique : `arrondi = n => Math.sign(n) * Math.round(Math.abs(n)) || 0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/plan-comptes.test.mjs`
Expected: FAIL, `decouperLigne` n'est pas exportée par `tools/lecteurs/commun.mjs` (SyntaxError sur l'import).

- [ ] **Step 3: Déplacer le découpage dans `commun.mjs`**

Dans `tools/lecteurs/fec.mjs`, supprimer le bloc :

```js
// Découpe une ligne en respectant les champs entre guillemets (« "" » = guillemet littéral) ; sans guillemet : split simple.
const decouper = (l, sep) => {
  if (!l.includes('"')) return l.split(sep);
  const r = []; let c = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const x = l[i];
    if (q) { if (x !== '"') c += x; else if (l[i + 1] === '"') { c += '"'; i++; } else q = false; }
    else if (x === '"') q = true; else if (x === sep) { r.push(c); c = ""; } else c += x;
  }
  return [...r, c];
};
```

Remplacer l'import en tête de `tools/lecteurs/fec.mjs` par :

```js
import { snake, entetesUniques, decouperLigne as decouper } from "./commun.mjs";
```

Dans `tools/lecteurs/commun.mjs`, ajouter après `entetesUniques` :

```js
// Champs entre guillemets : « "" » est un guillemet littéral ; sans guillemet, split simple.
export function decouperLigne(l, sep) {
  if (!l.includes('"')) return l.split(sep);
  const r = []; let c = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const x = l[i];
    if (q) { if (x !== '"') c += x; else if (l[i + 1] === '"') { c += '"'; i++; } else q = false; }
    else if (x === '"') q = true; else if (x === sep) { r.push(c); c = ""; } else c += x;
  }
  return [...r, c];
}
```

- [ ] **Step 4: Écrire `tools/plan-comptes.mjs`**

```js
/* Plan de comptes d'un FEC ou d'un grand livre en bronze, sur le fichier entier (l'aperçu s'arrête à 50 000 lignes). */
import { decouperLigne } from "./lecteurs/commun.mjs";

const nombre = s => { const n = Number(String(s ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const arrondi = n => Math.sign(n) * Math.round(Math.abs(n)) || 0;
const moisDe = s => { const t = String(s ?? "").trim(); let m = /^(\d{4})(\d{2})\d{2}$/.exec(t) || /^(\d{4})-(\d{2})-\d{2}/.exec(t); if (m) return `${m[1]}-${m[2]}`; m = /^\d{2}\/(\d{2})\/(\d{4})/.exec(t); return m ? `${m[2]}-${m[1]}` : "?"; };
const parFrequence = m => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
const compter = (m, k) => m.set(k, (m.get(k) || 0) + 1);

export function planComptes(texte, { classes = "67", libPersonnel = false } = {}) {
  const lignes = String(texte).replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  const h = decouperLigne(lignes[0] || "", ";").map(s => s.trim());
  const [iCpt, iLib, iJnl, iDate, iD, iC, iM, iS] = ["compte_num", "compte_lib", "journal_code", "ecriture_date", "debit", "credit", "montant", "sens"].map(n => h.indexOf(n));
  if (iCpt < 0 || !((iD >= 0 && iC >= 0) || (iM >= 0 && iS >= 0))) return { erreur: "ni compte_num ni montants (debit et credit, ou montant et sens) : ce dataset n'est pas un FEC ou un grand livre" };
  const comptes = new Map(), mois = new Map(), journaux = new Map();
  for (const l of lignes.slice(1)) {
    const v = decouperLigne(l, ";"), cpt = String(v[iCpt] ?? "").trim();
    if (!cpt) continue;
    const net = iD >= 0 ? nombre(v[iC]) - nombre(v[iD]) : (/^c/i.test(String(v[iS] ?? "").trim()) ? 1 : -1) * nombre(v[iM]);
    const jnl = iJnl >= 0 ? String(v[iJnl] ?? "").trim() : "", m = iDate >= 0 ? moisDe(v[iDate]) : "?";
    if (jnl) compter(journaux, jnl);
    const mm = mois.get(m) || { mois: m, lignes: 0, produits: 0, charges: 0 };
    mm.lignes++; if (cpt[0] === "7") mm.produits += net; else if (cpt[0] === "6") mm.charges -= net; mois.set(m, mm);
    if (!classes.includes(cpt[0])) continue;
    const c = comptes.get(cpt) || { compte: cpt, lignes: 0, net: 0, libs: new Map(), jnls: new Map() };
    c.lignes++; c.net += net;
    const lib = iLib >= 0 ? String(v[iLib] ?? "").trim() : "";
    if (lib) compter(c.libs, lib); if (jnl) compter(c.jnls, jnl); comptes.set(cpt, c);
  }
  const dates = [...mois.values()].filter(x => x.mois !== "?").sort((a, b) => a.mois.localeCompare(b.mois));
  return {
    lignes: lignes.length - 1, classes,
    periode: dates.length ? { du: dates[0].mois, au: dates.at(-1).mois } : null,
    mois: dates.map(x => ({ ...x, produits: arrondi(x.produits), charges: arrondi(x.charges) })),
    ...(mois.has("?") ? { sans_date: mois.get("?").lignes } : {}),
    journaux: parFrequence(journaux).map(([code, n]) => ({ code, lignes: n })),
    comptes: [...comptes.values()].sort((a, b) => a.compte.localeCompare(b.compte)).map(c => ({
      compte: c.compte, ...(!libPersonnel && c.libs.size ? { lib: parFrequence(c.libs)[0][0] } : {}),
      lignes: c.lignes, net: arrondi(c.net), journaux: parFrequence(c.jnls).slice(0, 3).map(x => x[0]),
    })),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/plan-comptes.test.mjs tests/fec.test.mjs`
Expected: PASS (tous). Puis `npm test` : entièrement vert.

- [ ] **Step 6: Vérifier sur le FEC exemple**

```bash
T=$(mktemp -d) && mkdir -p "$T/brut" && cp exemple/data/bronze/484147699FEC20270630.txt "$T/brut/" && node --input-type=module -e "
import fs from 'node:fs'; import { normaliserSociete } from './tools/normaliser.mjs'; import { planComptes } from './tools/plan-comptes.mjs';
await normaliserSociete({ brut: '$T/brut', bronze: '$T/bronze', logiciels: [] });
const p = planComptes(fs.readFileSync('$T/bronze/fec_20270630.csv', 'utf8'));
console.log(p.lignes, p.periode, p.comptes.length, p.mois.length, JSON.stringify(p).length);"; rm -rf "$T"
```

Expected: `21580 { du: '2026-07', au: '2027-06' } 128 12 <taille>`. La taille doit rester sous 20 000 caractères.

- [ ] **Step 7: Commit**

```bash
git add tools/lecteurs/commun.mjs tools/lecteurs/fec.mjs tools/plan-comptes.mjs tests/plan-comptes.test.mjs
git commit -m "feat(fec): plan de comptes d'un CSV bronze (net, mois, journaux)"
```

---

### Task 2: L'agent lit le plan de comptes

**Files:**
- Modify: `tools/espace.mjs`
- Modify: `server/agent/maquette-outils.mjs`
- Modify: `server/agent/maquette-agent.mjs`
- Test: `tests/plan-comptes.test.mjs` (complété), `tests/maquette-agent.test.mjs`

**Interfaces:**
- Consumes: `planComptes(texte, { classes, libPersonnel })` de `tools/plan-comptes.mjs` (Task 1), `FEC_CSV` exporté par `tests/plan-comptes.test.mjs`.
- Produces:
  - `espace.planComptes(id: string, classes?: string): object | null`. Renvoie `null` si le dataset est inconnu, si son fichier manque, sort de la racine ou dépasse 200 Mo. Sinon `{ dataset: id, ...planComptes(...) }`. `classes` doit correspondre à `/^[0-9]{1,9}$/`, sinon `"67"`. `libPersonnel` vaut `true` si la colonne `compte_lib` du dataset est `pii: true`.
  - Outil `lire_plan_comptes({ id, classes? })`.
  - `profilDataset(id).plan_comptes` : texte d'invitation, seulement si le dataset a une colonne `compte_num`.

- [ ] **Step 1: Write the failing test**

Ajouter à la fin de `tests/plan-comptes.test.mjs` :

```js
import fs from "node:fs";
import path from "node:path";
import { ouvrirEspace } from "../tools/espace.mjs";
import { creerOutilsMaquette } from "../server/agent/maquette-outils.mjs";
import { SYSTEME_MAQUETTE } from "../server/agent/maquette-agent.mjs";
import { racineExemple } from "./aide/racine.mjs";

const COLONNES = ["journal_code", "journal_lib", "ecriture_num", "ecriture_date", "compte_num", "compte_lib", "debit", "credit"];
function racineFec({ libPii = false } = {}) {
  const racine = racineExemple();
  fs.writeFileSync(path.join(racine, "data/bronze/kf/fec_test.csv"), FEC_CSV);
  fs.writeFileSync(path.join(racine, "spec/datasets/fec_test.yml"), `id: fec_test\nsociete: kf\nfile: data/bronze/kf/fec_test.csv\ncolumns:\n${COLONNES.map(n => `  - name: ${n}\n    type: text\n${n === "compte_lib" && libPii ? "    pii: true\n" : ""}`).join("")}`);
  const espace = ouvrirEspace(racine);
  return { racine, espace, o: creerOutilsMaquette({ espace, racine }) };
}

test("espace.planComptes : fichier entier, classes, libellé personnel", () => {
  const { espace } = racineFec();
  const p = espace.planComptes("fec_test");
  assert.equal(p.dataset, "fec_test");
  assert.deepEqual(p.comptes.map(c => c.compte), ["606100", "706100"]);
  assert.deepEqual(espace.planComptes("fec_test", "abc").classes, "67");
  assert.equal(espace.planComptes("fec_test", "4").comptes.length, 3);
  assert.equal(espace.planComptes("inconnu"), null);
  assert.ok(espace.planComptes("tms_missions").erreur);
  assert.ok(racineFec({ libPii: true }).espace.planComptes("fec_test").comptes.every(c => !("lib" in c)));
});

test("outil lire_plan_comptes et invitation dans le profil", async () => {
  const { o } = racineFec();
  assert.equal((await o.lire_plan_comptes.executer({ id: "fec_test", classes: "7" })).comptes.length, 1);
  for (const id of ["../../etc/passwd", "inconnu", "", undefined]) assert.ok((await o.lire_plan_comptes.executer({ id })).erreur, String(id));
  assert.match((await o.lire_dataset.executer({ id: "fec_test" })).plan_comptes, /lire_plan_comptes/);
  assert.equal((await o.lire_dataset.executer({ id: "tms_missions" })).plan_comptes, undefined);
  assert.match(SYSTEME_MAQUETTE, /lire_plan_comptes/);
});
```

Dans `tests/maquette-agent.test.mjs`, ajouter `"lire_plan_comptes"` à la constante `NOMS`, juste après `"lire_comptes"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/plan-comptes.test.mjs tests/maquette-agent.test.mjs`
Expected: FAIL. `espace.planComptes is not a function`, `o.lire_plan_comptes` est indéfini, et la liste des outils diffère de `NOMS`.

- [ ] **Step 3: Exposer `planComptes` dans l'espace**

Dans `tools/espace.mjs` :
- Ajouter l'import après celui de `./apprendre.mjs` :

```js
import { planComptes } from "./plan-comptes.mjs";
```

- Ajouter, juste après la fonction `memoireComptes` :

```js
  function planComptesDataset(id, classes) {
    const d = listYaml(P("spec/datasets")).map(f => readYaml(f, {})).find(x => x && x.id === id);
    const file = d && d.file ? P(d.file) : null;
    if (!file || !dansRacine(file) || !exists(file) || fs.statSync(file).size > CSV_MAX_OCTETS) return null;
    const libPersonnel = (d.columns || []).some(c => c && c.name === "compte_lib" && c.pii);
    return { dataset: id, ...planComptes(fs.readFileSync(file, "utf8"), { classes: /^[0-9]{1,9}$/.test(String(classes ?? "")) ? String(classes) : "67", libPersonnel }) };
  }
```

- Dans l'objet renvoyé par `ouvrirEspace` (le `return { besoins, ... }` final), ajouter `planComptes: planComptesDataset,` juste après `memoireComptes,`.
- Dans `profilDataset`, l'objet renvoyé commence par `return {id:d.id,societe:d.societe||"",desc:d.desc||"",grain:d.grain||"",lignes:d.rows.length,colonnes,`. Le remplacer par :

```js
      return {id:d.id,societe:d.societe||"",desc:d.desc||"",grain:d.grain||"",lignes:d.rows.length,colonnes,...(d.columns.some(c=>c.name==="compte_num")?{plan_comptes:"plan de comptes du fichier entier (libellé, net, journaux par compte ; totaux par mois) : outil lire_plan_comptes"}:{}),
```

- [ ] **Step 4: Ajouter l'outil**

Dans `server/agent/maquette-outils.mjs`, juste après la ligne de l'outil `lire_comptes`, ajouter :

```js
    outil("lire_plan_comptes", "Plan de comptes d'un FEC ou d'un grand livre, lu sur le fichier entier : par compte, libellé, nombre d'écritures, net (crédit − débit : positif pour un produit, négatif pour une charge) et journaux ; totaux par mois et par journal. classes : premiers chiffres des comptes retenus (défaut \"67\").", { id: TXT, classes: TXT }, ["id"],
      a => typeof a.id === "string" && ID.test(a.id) ? (espace.planComptes(a.id, a.classes) || { erreur: `dataset inconnu ou fichier absent : ${a.id}` }) : { erreur: "dataset inconnu : id invalide" }),
```

- [ ] **Step 5: Offrir l'outil à la boucle des flux et le citer dans la consigne**

Dans `server/agent/maquette-agent.mjs` :
- Dans `ecrireFluxEtControles`, remplacer `["lire_dataset", "lire_comptes", "lire_memoire", "ecrire_flux", "terminer"]` par `["lire_dataset", "lire_comptes", "lire_plan_comptes", "lire_memoire", "ecrire_flux", "terminer"]`.
- Dans `SYSTEME_MAQUETTE`, la ligne qui commence par `- Pour un flux : codes de catégorie pris dans le référentiel` se termine par `n'alimente pas FAITS.`. Ajouter à la fin de cette ligne, avant le retour à la ligne :

```
 Pour un FEC ou un grand livre (colonne compte_num), lis le plan de comptes (lire_plan_comptes) et écris une règle par préfixe de compte, les préfixes longs avant les courts.
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test tests/plan-comptes.test.mjs tests/maquette-agent.test.mjs`
Expected: PASS. Puis `npm test` : entièrement vert.

- [ ] **Step 7: Commit**

```bash
git add tools/espace.mjs server/agent/maquette-outils.mjs server/agent/maquette-agent.mjs tests/plan-comptes.test.mjs tests/maquette-agent.test.mjs
git commit -m "feat(agent): outil lire_plan_comptes pour les FEC et grands livres"
```

---

### Task 3: L'aperçu tronqué est signalé

**Files:**
- Modify: `tools/espace.mjs`
- Modify: `core/check.js`
- Test: `tests/apercu-tronque.test.mjs`

**Interfaces:**
- Consumes: rien des tâches précédentes.
- Produces:
  - `readCsv(...)` renvoie `{ header, rows, tronque }`. `tronque` vaut `true` si le fichier a plus de 50 000 lignes de données. `parseCSV` (dans `core/model.js`) s'arrête dès qu'il a 50 002 lignes, en-tête compris.
  - `d._tronque` dans `loadState` ; `profilDataset(id).tronque` (booléen).
  - Une alerte de `check` sur `spec/datasets/<id>.yml`, dont le message commence par `aperçu limité aux`.

- [ ] **Step 1: Write the failing test**

Créer `tests/apercu-tronque.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";

function racineAvec(n) {
  const racine = racineExemple();
  fs.writeFileSync(path.join(racine, "data/bronze/kf/gros.csv"), "a;b\n" + Array.from({ length: n }, (_, i) => `${i};1`).join("\n") + "\n");
  fs.writeFileSync(path.join(racine, "spec/datasets/gros.yml"), "id: gros\nsociete: kf\nfile: data/bronze/kf/gros.csv\ncolumns:\n  - name: a\n    type: int\n  - name: b\n    type: int\n");
  return ouvrirEspace(racine);
}
const alertes = e => e.evaluate().findings.filter(f => f.fichier === "spec/datasets/gros.yml" && /^aperçu limité aux/.test(f.msg));

test("plus de 50 000 lignes : aperçu tronqué signalé", () => {
  const e = racineAvec(50001);
  assert.equal(alertes(e).length, 1);
  assert.equal(alertes(e)[0].niv, "alerte");
  assert.equal(e.profilDataset("gros").tronque, true);
  assert.equal(e.profilDataset("tms_missions").tronque, false);
});

test("50 000 lignes tout juste : rien à signaler", () => {
  const e = racineAvec(50000);
  assert.equal(alertes(e).length, 0);
  assert.equal(e.profilDataset("gros").tronque, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/apercu-tronque.test.mjs`
Expected: FAIL. Aucune alerte n'est trouvée, et `tronque` vaut `undefined`.

- [ ] **Step 3: Porter l'information de troncature**

Dans `tools/espace.mjs` :
- Dans `readCsv`, remplacer `const data = { header, rows: rows.slice(1, 50001) };` par :

```js
    const data = { header, rows: rows.slice(1, 50001), tronque: rows.length > 50001 };
```

- Dans `loadState`, remplacer `else { const { header, rows } = readCsv(file, parseCSV, snake); const idx = d.columns.map(c => header.indexOf(c.name));` par :

```js
      else { const { header, rows, tronque } = readCsv(file, parseCSV, snake); d._tronque = !!tronque; const idx = d.columns.map(c => header.indexOf(c.name));
```

- Dans `profilDataset`, remplacer `lignes:d.rows.length,colonnes,` par `lignes:d.rows.length,tronque:!!d._tronque,colonnes,`.

- [ ] **Step 4: Alerte de `check`**

Dans `core/check.js`, juste après la ligne `if(d._fileMissing) add("erreur",f,`fichier de données introuvable : ${d.file}`);`, ajouter :

```js
    if(d._tronque) add("alerte",f,`aperçu limité aux ${d.rows.length} premières lignes du fichier : sommes, contrôles et FAITS de l'aperçu sont partiels (le projet dbt lit le fichier entier)`);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/apercu-tronque.test.mjs`
Expected: PASS. Puis `npm test` : entièrement vert.

- [ ] **Step 6: Commit**

```bash
git add tools/espace.mjs core/check.js tests/apercu-tronque.test.mjs
git commit -m "feat(apercu): fichier de plus de 50 000 lignes signalé comme aperçu partiel"
```

---

## Lots suivants (inchangés)

3. Étape de maquette dédiée au FEC, qui s'appuie sur `lire_plan_comptes`.
4. Questions propres au FEC : dernier mois clos (les totaux par mois du plan de comptes le montrent) ; journaux de situation et d'OD.
5. Données personnelles par contenu dans `compte_lib` et `ecriture_lib`.
6. Mémoire `comptes.yml`.
