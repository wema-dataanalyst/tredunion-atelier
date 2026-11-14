# FEC, lot 1 : lecture, dates, comptes et ordre des règles — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un FEC DGFiP déposé sur le SFTP est lu, normalisé en bronze, profilé avec les bons types (dates `AAAAMMJJ`, comptes en texte), et ses flux par préfixe de compte ne peuvent plus contenir de règle masquée.

**Architecture:** Un lecteur dédié `tools/lecteurs/fec.mjs` reconnaît un FEC par sa ligne d'en-tête (quelle que soit l'extension `.txt` ou `.csv`), écrit un CSV bronze aux noms de colonnes lisibles et dépose dans le `.meta.json` les types imposés par la norme. `npm run profil` applique ces types. Le moteur (`core/model.js`) reconnaît et lit le format `YYYYMMDD`. `check` signale une règle de compte jamais atteinte, et l'écriture de flux par l'agent insère une règle longue avant la règle courte qui la masquerait.

**Tech Stack:** Node ≥ 22, ES modules, `node:test`, `yaml`. Moteur `core/*.js` exécuté dans un contexte `vm` (tests via `tests/aide/moteur.mjs`).

## Global Constraints

- Ne touche pas aux fichiers de `spec/`, `data/`, `generated/` du dépôt ; les tests travaillent dans des dossiers temporaires (`racineExemple()`, `fs.mkdtempSync`).
- `snake()` de `tools/lecteurs/commun.mjs` doit rester identique à celui de `core/model.js`.
- Le SQL généré cible Postgres (`to_date(texte, 'YYYYMMDD')`).
- Commentaires de code en français, seulement pour une contrainte que le code ne montre pas.
- Pas de valeur de colonne personnelle dans les messages ni les tests.
- Après chaque tâche : `npm test` entièrement vert.

## Avant de commencer

`git status` montre des modifications non commitées dans `core/calque.js`, `core/check.js`, `core/model.js` (protection contre le Jinja dans le dbt généré). Elles ne font pas partie de ce plan : Michel les commite ou les met de côté avant la tâche 1, pour que chaque commit de ce plan ne contienne que ses propres changements.

## Fichiers

- Create: `tools/lecteurs/fec.mjs` — reconnaissance, décodage, lecture d'un FEC, types de la norme, id du dataset.
- Modify: `tools/normaliser.mjs` — branche FEC pour `.txt` et `.csv` ; `appliquerTypesMeta`.
- Modify: `tools/atelier.mjs` (`cmdProfile`) — applique les types du `.meta.json`.
- Modify: `core/model.js` — profil et lecture du format `YYYYMMDD`.
- Modify: `core/check.js` — alerte sur règle de compte masquée.
- Modify: `server/agent/specs.mjs` (`ecrireFlux`) — insertion ordonnée des règles.
- Test: `tests/fec.test.mjs` (créé), `tests/dates-aaaammjj.test.mjs` (créé), `tests/regles-masquees.test.mjs` (créé), `tests/specs-ecriture.test.mjs` (complété).

---

### Task 1: Lecteur FEC et normalisation

**Files:**
- Create: `tools/lecteurs/fec.mjs`
- Modify: `tools/normaliser.mjs:1-6` (imports), `tools/normaliser.mjs:50-54` (branche CSV)
- Test: `tests/fec.test.mjs`

**Interfaces:**
- Produces:
  - `decoder(buffer: Buffer): string` — UTF-8, sinon Windows-1252 (les FEC sont souvent en ISO-8859-15).
  - `estFec(premiereLigne: string): boolean`
  - `lireFec(texte: string): { entetes: string[], lignes: string[][], meta: { periode_du?: string, periode_au?: string }, colonnes: Record<string, {type: string, format?: string}> }`
  - `idFec(domaine: string, fichier: string): string` — `fec_<date de clôture>` si le nom suit la norme `<SIREN>FEC<AAAAMMJJ>`.
  - `TYPES_FEC` (objet exporté).
  - Le `.meta.json` d'un FEC contient `lecteur: "fec"`, `logiciel: "FEC (DGFiP)"`, `colonnes` (types), `periode_du`, `periode_au`, `lignes`.

- [ ] **Step 1: Write the failing test**

Créer `tests/fec.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decoder, estFec, lireFec, idFec } from "../tools/lecteurs/fec.mjs";
import { normaliserSociete } from "../tools/normaliser.mjs";

const ENTETE = "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise";
const FEC = [ENTETE,
  "VT\tJournal de vente\t1\t20260701\t7060010009\tTransports France\t\t\tF1\t20260701\tFacture; client A\t0,0\t1200,50\t\t\t\t-1200,50\tEUR",
  "HA\tJournal d'achat\t2\t20260930\t6021000009\tAchats gasoil\t\t\tA1\t20260930\tGasoil\t300,0\t0,0\t\t\t\t300,00\tEUR"].join("\r\n") + "\r\n";

test("estFec : reconnaît l'en-tête DGFiP (tabulation ou barre), refuse un autre fichier", () => {
  assert.equal(estFec(ENTETE), true);
  assert.equal(estFec(ENTETE.replaceAll("\t", "|")), true);
  assert.equal(estFec("JournalCode|EcritureDate|CompteNum|Montant|Sens"), true);
  assert.equal(estFec("date;compte;montant"), false);
});

test("decoder : UTF-8, sinon Windows-1252", () => {
  assert.equal(decoder(Buffer.from("\uFEFFCrédit", "utf8")), "Crédit");
  assert.equal(decoder(Buffer.from([0x43, 0x72, 0xe9, 0x64, 0x69, 0x74])), "Crédit");
});

test("lireFec : noms de colonnes lisibles, cellules conservées, période et types", () => {
  const r = lireFec(FEC);
  assert.deepEqual(r.entetes.slice(0, 6), ["journal_code", "journal_lib", "ecriture_num", "ecriture_date", "compte_num", "compte_lib"]);
  assert.equal(r.lignes.length, 2);
  assert.equal(r.lignes[0][10], "Facture; client A");
  assert.equal(r.lignes[0][12], "1200,50");
  assert.deepEqual(r.meta, { periode_du: "2026-07-01", periode_au: "2026-09-30" });
  assert.deepEqual(r.colonnes.compte_num, { type: "text" });
  assert.deepEqual(r.colonnes.ecriture_date, { type: "date", format: "YYYYMMDD" });
  assert.equal(r.colonnes.compte_lib, undefined);
});

test("idFec : date de clôture du nom normé, sinon le nom du fichier", () => {
  assert.equal(idFec("", "/x/484147699FEC20270630.txt"), "fec_20270630");
  assert.equal(idFec("Compta", "/x/484147699FEC20270630.txt"), "compta_fec_20270630");
  assert.equal(idFec("", "/x/export grand livre.txt"), "export_grand_livre");
});

test("normaliserSociete : un FEC .txt devient un CSV bronze avec ses types ; un autre .txt reste non lu", async () => {
  const brut = fs.mkdtempSync(path.join(os.tmpdir(), "brut-")), bronze = `${brut}-bronze`;
  fs.writeFileSync(path.join(brut, "484147699FEC20270630.txt"), FEC);
  fs.writeFileSync(path.join(brut, "notes.txt"), "rien");
  const r = await normaliserSociete({ brut, bronze, logiciels: [] });
  assert.deepEqual(r.ecrits.map(e => [e.id, e.lecteur, e.lignes]), [["fec_20270630", "fec", 2]]);
  const csv = fs.readFileSync(path.join(bronze, "fec_20270630.csv"), "utf8").split("\n");
  assert.equal(csv[0].split(";")[4], "compte_num");
  assert.match(csv[1], /;"Facture; client A";/);
  const meta = JSON.parse(fs.readFileSync(path.join(bronze, "fec_20270630.meta.json"), "utf8"));
  assert.equal(meta.logiciel, "FEC (DGFiP)");
  assert.deepEqual(meta.colonnes.valid_date, { type: "date", format: "YYYYMMDD" });
  assert.deepEqual(r.nonLus, [{ fichier: "notes.txt", raison: "format .txt non pris en charge" }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fec.test.mjs`
Expected: FAIL, `Cannot find module '.../tools/lecteurs/fec.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Créer `tools/lecteurs/fec.mjs` :

```js
import path from "node:path";
import { snake, entetesUniques } from "./commun.mjs";

// Article A47 A-1 du LPF : colonnes obligatoires ; les montants sont en Debit/Credit ou en Montant/Sens.
const OBLIGATOIRES = ["journalcode", "ecrituredate", "comptenum"];
const MONTANTS = [["debit", "credit"], ["montant", "sens"]];
const DATE8 = { type: "date", format: "YYYYMMDD" };
export const TYPES_FEC = {
  journal_code: { type: "text" }, ecriture_num: { type: "text" }, ecriture_date: DATE8, compte_num: { type: "text" },
  comp_aux_num: { type: "text" }, piece_ref: { type: "text" }, piece_date: DATE8, ecriture_let: { type: "text" },
  date_let: DATE8, valid_date: DATE8, debit: { type: "decimal" }, credit: { type: "decimal" },
  montant: { type: "decimal" }, montantdevise: { type: "decimal" },
};

export function decoder(buffer) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, ""); }
  catch { return new TextDecoder("windows-1252").decode(buffer); }
}

const separateur = ligne => ["\t", "|", ";"].map(s => [s, ligne.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];

export function estFec(premiereLigne) {
  const noms = new Set(String(premiereLigne).split(separateur(premiereLigne)).map(n => n.trim().toLowerCase()));
  return OBLIGATOIRES.every(n => noms.has(n)) && MONTANTS.some(p => p.every(n => noms.has(n)));
}

const iso = d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

export function lireFec(texte) {
  const brutes = texte.split(/\r?\n/).filter(l => l.trim());
  const sep = separateur(brutes[0] || "");
  const entetes = entetesUniques(brutes[0].split(sep).map(n => n.trim().replace(/([a-z])([A-Z])/g, "$1_$2")));
  const lignes = brutes.slice(1).map(l => { const v = l.split(sep); return entetes.map((_, i) => (v[i] ?? "").trim()); });
  const iDate = entetes.indexOf("ecriture_date");
  const dates = iDate < 0 ? [] : lignes.map(l => l[iDate]).filter(d => /^\d{8}$/.test(d)).sort();
  const meta = dates.length ? { periode_du: iso(dates[0]), periode_au: iso(dates[dates.length - 1]) } : {};
  const colonnes = Object.fromEntries(entetes.filter(e => TYPES_FEC[e]).map(e => [e, TYPES_FEC[e]]));
  return { entetes, lignes, meta, colonnes };
}

export function idFec(domaine, fichier) {
  const base = path.basename(fichier).replace(/\.[^.]+$/, "");
  const m = /^(?:\d{9})?FEC(\d{8})$/i.exec(base);
  return snake([domaine, m ? `fec_${m[1]}` : base].filter(Boolean).join("_"));
}
```

Dans `tools/normaliser.mjs`, ajouter l'import après la ligne `import { correspond, lirePositions, lireMeta } from "./lecteurs/positions.mjs";` :

```js
import { decoder, estFec, lireFec, idFec } from "./lecteurs/fec.mjs";
```

Remplacer le bloc :

```js
    if (ext === ".csv") {
      const lignes = Math.max(0, fs.readFileSync(f, "utf8").split(/\r?\n/).filter(l => l.trim()).length - 1);
      ecrire(idDataset(domaine, f, ""), relatif, { source: relatif, domaine, lecteur: "copie", lignes }, cible => fs.copyFileSync(f, cible));
      continue;
    }
```

par :

```js
    if (ext === ".csv" || ext === ".txt") {
      const texte = decoder(fs.readFileSync(f));
      if (estFec(texte.split(/\r?\n/)[0] || "")) {
        const r = lireFec(texte);
        ecrire(idFec(domaine, f), relatif, { source: relatif, domaine, lecteur: "fec", logiciel: "FEC (DGFiP)", ...r.meta, lignes: r.lignes.length, colonnes: r.colonnes }, cible => ecrireCsv(cible, r.entetes, r.lignes));
        continue;
      }
      if (ext === ".txt") { nonLus.push({ fichier: relatif, raison: "format .txt non pris en charge" }); continue; }
      const lignes = Math.max(0, texte.split(/\r?\n/).filter(l => l.trim()).length - 1);
      ecrire(idDataset(domaine, f, ""), relatif, { source: relatif, domaine, lecteur: "copie", lignes }, cible => fs.copyFileSync(f, cible));
      continue;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/fec.test.mjs tests/normaliser.test.mjs`
Expected: PASS (tous).

- [ ] **Step 5: Vérification sur le vrai fichier**

Run:

```bash
T=$(mktemp -d) && cp exemple/data/bronze/484147699FEC20270630.txt "$T/" && node -e "
import('./tools/normaliser.mjs').then(async m=>{const r=await m.normaliserSociete({brut:'$T',bronze:'$T-b',logiciels:[]});console.log(r.ecrits.map(e=>[e.id,e.lignes,e.periode_du,e.periode_au]),r.nonLus)})"
```

Expected: `[ [ 'fec_20270630', 21580, '2026-07-01', '2027-06-30' ] ] []`

- [ ] **Step 6: Commit**

```bash
git add tools/lecteurs/fec.mjs tools/normaliser.mjs tests/fec.test.mjs
git commit -m "feat(normaliser): lecture des FEC DGFiP (.txt ou .csv) en bronze"
```

---

### Task 2: Dates au format AAAAMMJJ dans le moteur

**Files:**
- Modify: `core/model.js:54` (expressions régulières), `core/model.js:61` (profil), `core/model.js:102` (lecture)
- Test: `tests/dates-aaaammjj.test.mjs`

**Interfaces:**
- Consumes: rien des autres tâches.
- Produces: une colonne aux valeurs `AAAAMMJJ` a `_prof[col].guess === "date"` et `fmt === "YYYYMMDD"` ; `castVal` rend une `Date` pour `format: YYYYMMDD` ; `silverSql` produit `to_date(..., 'YYYYMMDD')` (déjà en place via `c.format`).

- [ ] **Step 1: Write the failing test**

Créer `tests/dates-aaaammjj.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, dataset, colonne } from "./aide/moteur.mjs";

const lignes = [["20260701", "7060010009", "1200,50"], ["20260915", "604", "300,00"]];
const etat = (cols, extra = {}) => ({ datasets: [dataset("fec", cols, lignes)], ...extra });

test("profil : AAAAMMJJ est une date YYYYMMDD ; un entier de 8 chiffres hors calendrier reste un entier", () => {
  const m = chargerMoteur(etat([colonne("ecriture_date"), colonne("compte_num"), colonne("debit")]));
  assert.deepEqual(m.run("[DS('fec')._prof.ecriture_date.guess, DS('fec')._prof.ecriture_date.fmt]"), ["date", "YYYYMMDD"]);
  const n = chargerMoteur({ datasets: [dataset("x", [colonne("code")], [["20261399"], ["20260101"]])] });
  assert.equal(n.run("DS('x')._prof.code.guess"), "int");
});

test("silver : une colonne date YYYYMMDD est lue en date, en aperçu et en SQL", () => {
  const m = chargerMoteur(etat([colonne("ecriture_date", { type: "date", format: "YYYYMMDD" }), colonne("compte_num", { type: "text" }), colonne("debit", { type: "decimal", decimalComma: true })]));
  assert.deepEqual(m.run("silverRows(DS('fec')).rows.map(o=>[o.ecriture_date.getFullYear(),o.ecriture_date.getMonth()+1,o.ecriture_date.getDate()])"), [[2026, 7, 1], [2026, 9, 15]]);
  assert.match(m.run("silverSql(DS('fec'))"), /to_date\(nullif\(trim\(src\.ecriture_date\), ''\), 'YYYYMMDD'\) as ecriture_date/);
});

test("FAITS : un flux daté en YYYYMMDD produit des lignes mensuelles", () => {
  const m = chargerMoteur(etat([colonne("ecriture_date", { type: "date", format: "YYYYMMDD" }), colonne("compte_num", { type: "text" }), colonne("debit", { type: "decimal", decimalComma: true })], {
    flux: [{ id: "f1", ds: "fec", codMode: "fixe", cod: "CA TOTAL", lib: "CA total", valeur: "debit", agg: "sum", champ: "MontantReel", unite: "€", date: "ecriture_date",
      rules: [], codCol: "", libCol: "", vehicule: "", chauffeur: "", site: "", client: "", collaborateur: "", filtre: "", note: "" }],
    categories: [{ cod: "CA TOTAL", note: "" }] }));
  assert.deepEqual(m.run("(s=>[s.noDate,s.n])(buildFaits().stats.f1)"), [0, 2]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dates-aaaammjj.test.mjs`
Expected: FAIL — `guess` vaut `"int"` au lieu de `"date"`, `noDate` vaut 2.

- [ ] **Step 3: Write minimal implementation**

Dans `core/model.js`, ligne 54, remplacer :

```js
const reDateFR=/^\d{2}\/\d{2}\/\d{4}$/, reISO=/^\d{4}-\d{2}-\d{2}$/, reTS=/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/, reInt=/^-?\d+$/, reDec=/^-?\d+[.,]\d+$/;
```

par :

```js
const reDateFR=/^\d{2}\/\d{2}\/\d{4}$/, reISO=/^\d{4}-\d{2}-\d{2}$/, reTS=/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/, reInt=/^-?\d+$/, reDec=/^-?\d+[.,]\d+$/;
const reDate8=/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/;
```

Ligne 61, remplacer :

```js
    if(all(reInt)) guess="int";
```

par :

```js
    if(all(reDate8)){ guess="date"; fmt="YYYYMMDD"; }
    else if(all(reInt)) guess="int";
```

Ligne 102, remplacer :

```js
  if(type==="date"||type==="timestamp"){ let m=/^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
```

par :

```js
  if(type==="date"||type==="timestamp"){ if((c.format||p.fmt)==="YYYYMMDD"){ const m8=/^(\d{4})(\d{2})(\d{2})$/.exec(s); return m8?new Date(+m8[1],+m8[2]-1,+m8[3]):null; } let m=/^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
```

(le reste de la ligne est inchangé).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dates-aaaammjj.test.mjs && npm test`
Expected: PASS, suite complète verte.

- [ ] **Step 5: Commit**

```bash
git add core/model.js tests/dates-aaaammjj.test.mjs
git commit -m "feat(moteur): dates au format AAAAMMJJ (profil, aperçu, SQL)"
```

---

### Task 3: Le profil applique les types de la norme FEC

**Files:**
- Modify: `tools/normaliser.mjs` (fonction exportée `appliquerTypesMeta`)
- Modify: `tools/atelier.mjs:12` (import), `tools/atelier.mjs:89` (`cmdProfile`)
- Test: `tests/fec.test.mjs` (deux tests ajoutés)

**Interfaces:**
- Consumes: `.meta.json` avec `colonnes` (tâche 1) ; format `YYYYMMDD` compris par le moteur (tâche 2).
- Produces: `appliquerTypesMeta(colonnes: object[], meta: object|null): object[]` — pour chaque colonne citée dans `meta.colonnes`, remplace `type` et `format` ; garde `decimalComma` détecté par le profil.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/fec.test.mjs` (et compléter l'import : `import { normaliserSociete, appliquerTypesMeta } from "../tools/normaliser.mjs";`, plus `import { spawnSync } from "node:child_process";`, `import YAML from "yaml";`, `import { racineExemple, ATELIER } from "./aide/racine.mjs";`) :

```js
test("appliquerTypesMeta : impose type et format, garde la virgule détectée", () => {
  const cols = [{ name: "compte_num", type: "int", role: "attr", desc: "" }, { name: "debit", type: "decimal", role: "attr", desc: "", decimalComma: true }, { name: "compte_lib", type: "text", role: "attr", desc: "" }];
  const r = appliquerTypesMeta(cols, { colonnes: { compte_num: { type: "text" }, debit: { type: "decimal" } } });
  assert.deepEqual(r.map(c => [c.name, c.type, c.decimalComma ?? false]), [["compte_num", "text", false], ["debit", "decimal", true], ["compte_lib", "text", false]]);
  assert.deepEqual(appliquerTypesMeta(cols, null), cols);
});

test("npm run profil : un FEC bronze sort avec comptes en texte et dates YYYYMMDD", async () => {
  const r = racineExemple(), brut = fs.mkdtempSync(path.join(os.tmpdir(), "brut-")), bronze = path.join(r, "data/bronze/kf");
  fs.writeFileSync(path.join(brut, "484147699FEC20270630.txt"), FEC);
  await normaliserSociete({ brut, bronze, logiciels: [] });
  const p = spawnSync("node", [ATELIER, "profil", "data/bronze/kf/fec_20270630.csv", "--societe", "kf"], { env: { ...process.env, ATELIER_ROOT: r }, encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr);
  const d = YAML.parse(fs.readFileSync(path.join(r, "spec/datasets/fec_20270630.yml"), "utf8"));
  const col = n => d.columns.find(c => c.name === n);
  assert.equal(col("compte_num").type, "text");
  assert.deepEqual([col("ecriture_date").type, col("ecriture_date").format], ["date", "YYYYMMDD"]);
  assert.deepEqual([col("debit").type, col("debit").decimalComma], ["decimal", true]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fec.test.mjs`
Expected: FAIL — `appliquerTypesMeta is not a function` ; le second test trouve `compte_num` en `int`.

- [ ] **Step 3: Write minimal implementation**

Dans `tools/normaliser.mjs`, ajouter après `planProfil` :

```js
// Types imposés par le lecteur (norme FEC) : le profil devinerait un entier pour les comptes et les dates AAAAMMJJ vides.
export function appliquerTypesMeta(colonnes, meta) {
  const t = meta?.colonnes || {};
  return colonnes.map(c => t[c.name] ? { ...c, ...t[c.name] } : c);
}
```

Dans `tools/atelier.mjs`, ligne 12, remplacer :

```js
import { normaliserSociete, planProfil } from "./normaliser.mjs";
```

par :

```js
import { normaliserSociete, planProfil, appliquerTypesMeta } from "./normaliser.mjs";
```

Dans `cmdProfile`, remplacer la ligne :

```js
    columns: d.columns.map(c => { const p = d._prof[c.name]; const o = { name: c.name, type: p.guess, role: "attr", desc: "" }; if (p.fmt) o.format = p.fmt; if (p.comma) o.decimalComma = true; return o; }),
```

par :

```js
    columns: appliquerTypesMeta(d.columns.map(c => { const p = d._prof[c.name]; const o = { name: c.name, type: p.guess, role: "attr", desc: "" }; if (p.fmt) o.format = p.fmt; if (p.comma) o.decimalComma = true; return o; }),
      exists(abs.replace(/\.csv$/i, ".meta.json")) ? JSON.parse(fs.readFileSync(abs.replace(/\.csv$/i, ".meta.json"), "utf8")) : null),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/fec.test.mjs && npm test`
Expected: PASS, suite complète verte.

- [ ] **Step 5: Commit**

```bash
git add tools/normaliser.mjs tools/atelier.mjs tests/fec.test.mjs
git commit -m "feat(profil): types de la norme FEC appliqués depuis le .meta.json"
```

---

### Task 4: `check` signale une règle de compte masquée

**Files:**
- Modify: `core/check.js:72` (dans `st.flux.forEach`, après le contrôle des codes)
- Test: `tests/regles-masquees.test.mjs`

**Interfaces:**
- Consumes: rien des autres tâches.
- Produces: constat `{niv:"alerte", fichier:"spec/flux/<id>.yml", msg}` dont `msg` contient `jamais atteinte`.

- [ ] **Step 1: Write the failing test**

Créer `tests/regles-masquees.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, dataset, colonne } from "./aide/moteur.mjs";

const etat = rules => ({
  datasets: [dataset("bal", [colonne("compte", { type: "text" }), colonne("mois", { type: "date" }), colonne("montant", { type: "decimal" })], [["7061", "2026-07-31", "10"], ["706", "2026-07-31", "5"]])],
  flux: [{ id: "f1", ds: "bal", codMode: "regles", codCol: "compte", rules, valeur: "montant", agg: "sum", champ: "MontantReel", unite: "€", date: "mois",
    cod: "", lib: "", libCol: "", vehicule: "", chauffeur: "", site: "", client: "", collaborateur: "", filtre: "", note: "" }],
  categories: [{ cod: "CA TOTAL", note: "" }, { cod: "CA TPS", note: "" }],
});
const masquees = st => chargerMoteur(st).run("checkSpec()").filter(x => /jamais atteinte/.test(x.msg));

test("check : une règle placée après un préfixe plus court qui la couvre est signalée", () => {
  const c = masquees(etat([{ prefix: "706", cod: "CA TOTAL", lib: "CA" }, { prefix: "7061", cod: "CA TPS", lib: "CA transport" }]));
  assert.deepEqual(c.map(x => [x.niv, x.fichier]), [["alerte", "spec/flux/f1.yml"]]);
  assert.match(c[0].msg, /7061.*706/);
});

test("check : préfixes longs d'abord, aucune alerte", () => {
  assert.equal(masquees(etat([{ prefix: "7061", cod: "CA TPS", lib: "CA transport" }, { prefix: "706", cod: "CA TOTAL", lib: "CA" }])).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/regles-masquees.test.mjs`
Expected: FAIL — premier test : `[]` au lieu d'une alerte.

- [ ] **Step 3: Write minimal implementation**

Dans `core/check.js`, après la ligne :

```js
    used.filter(c=>c&&!codes.has(c)).forEach(c=>add("alerte",f,`code « ${c} » absent de spec/referentiel.yml`));
```

ajouter :

```js
    if(fl.codMode==="regles"){ const px=(fl.rules||[]).map(r=>String(r.prefix??""));
      px.forEach((p,j)=>{ const i=px.findIndex((q,k)=>k<j&&q!==""&&p.startsWith(q)); if(i>=0) add("alerte",f,`règle ${p} jamais atteinte : la règle ${px[i]}, placée avant, prend déjà ces comptes (placez les préfixes longs en premier)`); }); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/regles-masquees.test.mjs && npm test`
Expected: PASS, suite complète verte (l'exemple Kessler n'a pas de règle masquée).

- [ ] **Step 5: Commit**

```bash
git add core/check.js tests/regles-masquees.test.mjs
git commit -m "feat(check): alerte sur une règle de compte masquée par un préfixe plus court"
```

---

### Task 5: L'agent ne peut plus écrire une règle masquée

**Files:**
- Modify: `server/agent/specs.mjs:273-274` (`ecrireFlux`, fusion des règles)
- Test: `tests/specs-ecriture.test.mjs` (un test ajouté)

**Interfaces:**
- Consumes: `sequence`, `trouver`, `fusionnerListe` de `server/agent/specs.mjs`.
- Produces: une règle **nouvelle** est insérée juste avant la première règle existante dont le préfixe la couvre ; sinon ajoutée à la fin. Une règle existante garde sa place.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/specs-ecriture.test.mjs` :

```js
test("ecrireFlux : une règle plus longue est insérée avant la règle courte qui la masquerait", () => {
  const r = racineExemple();
  assert.equal(ecrireFlux(r, { id: "f1", rules: [{ prefix: "706", cod: "CA TOTAL", lib: "CA total" }, { prefix: "70611", cod: "CA LOG", lib: "CA détaillé" }] }).ok, true);
  const px = YAML.parse(lire(r, "spec/flux/f1.yml")).rules.map(x => String(x.prefix));
  assert.ok(px.indexOf("70611") < px.indexOf("7061"), px.join(","));
  assert.ok(px.indexOf("7061") < px.indexOf("706"), px.join(","));
  assert.ok(!/jamais atteinte/.test(check(r).stdout));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/specs-ecriture.test.mjs`
Expected: FAIL — `70611` est ajoutée après `7061`.

- [ ] **Step 3: Write minimal implementation**

Dans `server/agent/specs.mjs`, remplacer :

```js
  if (regles.length) { const seq = sequence(doc, map, "rules");
    regles.forEach((r, i) => fusionnerListe(doc, seq, "prefix", String(r.prefix), { cod: r.cod, ...(r.lib !== undefined ? { lib: r.lib } : {}), ...(hr[i] ? { hypothese: hr[i] } : {}) })); }
```

par :

```js
  if (regles.length) { const seq = sequence(doc, map, "rules");
    // Le moteur prend la première règle qui correspond : une règle nouvelle passe avant celle dont le préfixe la couvre.
    regles.forEach((r, i) => { const p = String(r.prefix), nouvelle = !trouver(seq, "prefix", p);
      const couvre = nouvelle ? seq.items.findIndex(x => YAML.isMap(x) && String(x.get("prefix") ?? "") !== "" && p.startsWith(String(x.get("prefix")))) : -1;
      const item = fusionnerListe(doc, seq, "prefix", p, { cod: r.cod, ...(r.lib !== undefined ? { lib: r.lib } : {}), ...(hr[i] ? { hypothese: hr[i] } : {}) });
      if (couvre >= 0) { seq.items.splice(seq.items.indexOf(item), 1); seq.items.splice(couvre, 0, item); } }); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/specs-ecriture.test.mjs && npm test`
Expected: PASS, suite complète verte.

- [ ] **Step 5: Commit**

```bash
git add server/agent/specs.mjs tests/specs-ecriture.test.mjs
git commit -m "feat(agent): règles de compte insérées avant le préfixe qui les masquerait"
```

---

## Self-review

- Lecture du fichier `.txt` : tâche 1. Encodage Windows-1252 : tâche 1. Point-virgule dans les libellés : tâche 1 (test `"Facture; client A"`).
- Dates `AAAAMMJJ` (profil, aperçu, SQL, FAITS) : tâche 2. Dates vides (`ValidDate`) : typées par la tâche 3.
- `CompteNum` en texte : tâche 3.
- Ordre des règles : tâches 4 (détection) et 5 (prévention à l'écriture).
- Noms partagés : `estFec`, `lireFec`, `idFec`, `decoder`, `TYPES_FEC`, `appliquerTypesMeta`, clé `colonnes` du `.meta.json` : cohérents entre tâches 1 et 3.

## Lots suivants (plans séparés)

1. **Profil « plan de comptes »** pour l'agent : par compte, libellé, nombre de lignes, net signé, répartition par mois et par journal, à la place des 8 valeurs fréquentes. Lever au passage la limite de 50 000 lignes lues par l'aperçu (`tools/espace.mjs`, `rows.slice(1, 50001)`), atteinte par un FEC de groupe.
2. **Étape de maquette dédiée au FEC** : flux produits, charges, CA TOTAL et résultat écrits en une fois (au lieu de 8 boucles par catégorie), signes `credit - debit` / `debit - credit`, `site` fixe = la société.
3. **Questions propres au FEC** : dernier mois clos (chute du CA, `ValidDate` vide), journaux de situation et d'OD.
4. **Données personnelles par contenu** dans `compte_lib` et `ecriture_lib` (comptes courants d'associés, virements nominatifs), au lieu d'un drapeau `pii` par colonne.
5. **Mémoire `comptes.yml`** alimentée par la séance de cet adhérent (`apprendre`).
