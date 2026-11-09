# Maquette d'avant-séance : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produire, sans l'adhérent, une maquette du dashboard Tredunion dont chaque chiffre remonte à une hypothèse tracée, à partir des exports du SFTP.

**Architecture:** Les étapes sûres sont codées : collecte SFTP, normalisation des Excel en CSV par des lecteurs, contrôles croisés, confiance calculée, fiche de séance, badges dans la prévisualisation. L'agent fait la déduction selon une procédure (`/maquette`) et écrit chaque déduction dans un bloc `hypothese` de la spec. Une mémoire commune, dans un dossier séparé, garde les recettes de lecture et les correspondances confirmées. `/apprendre` l'enrichit après chaque séance.

**Tech Stack:** Node ≥ 22 (ESM dans `tools/` et `tests/`, scripts classiques dans `core/`), `yaml`, `read-excel-file` 9, `node:test`, OpenSSH `sftp`.

Conception de référence : `docs/superpowers/specs/2026-11-06-maquette-avant-seance-design.md`.

## Global Constraints

- Node ≥ 22 : `engines.node` passe à `>=22` (glob de `node --test`). Node local : 24.18.
- Dépendances : `yaml` et `read-excel-file@^9.3.14` uniquement. Pas de Python dans le process.
- Pas de git dans ce dossier : chaque tâche se termine par un point de contrôle (`npm test`, `npm run check`), sans commit.
- `core/*.js` sont des scripts classiques exécutés à la fois dans le navigateur et dans un contexte `vm` : pas d'`import`/`export`, fonctions globales, même style compact que le code existant.
- Textes, messages et noms en français, comme le code existant. Commentaires seulement pour une contrainte que le code ne montre pas.
- `data/` et `generated/` ne sont écrits que par des commandes `npm run …`, jamais à la main par l'agent.
- Données personnelles : aucune donnée réelle dans les tests ; aucune valeur d'une colonne `pii: true` affichée ni écrite dans une preuve. L'agent ne lit jamais `.env`.
- Mémoire commune : `/home/michel/DEVEL/tredunion/tredunion-memoire` (par défaut `../tredunion-memoire` depuis le dépôt, ou variable `TREDUNION_MEMOIRE`).
- Règle de confiance, calculée par l'outil : `confirme` si `valide: true` ; sinon `basse` en cas de conflit (contrôle en écart ou `refuse: true`) ; sinon `haute` si mémoire confirmée et contrôle ok ; `moyenne` si l'un des deux ; `basse` sinon. Une entrée de mémoire contredite plafonne à `moyenne`.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `tools/lecteurs/commun.mjs` | `snake`, formatage des cellules, en-têtes uniques, écriture CSV |
| `tools/lecteurs/tableau.mjs` | Lecteur d'un tableau Excel simple (détection de la ligne d'en-tête) |
| `tools/lecteurs/positions.mjs` | Lecteur à positions fixes (éditions Sage), signature, métadonnées de période |
| `tools/memoire.mjs` | Chemin, lecture et écriture de la mémoire commune |
| `tools/normaliser.mjs` | `data/raw/<societe>` vers `data/bronze/<societe>` (CSV, `.meta.json`, `_non_lus.json`) |
| `tools/collecte.mjs` | Téléchargement SFTP vers `data/raw/<societe>` |
| `tools/apprendre.mjs` | Hypothèses tranchées vers mémoire (`comptes`, `colonnes`) |
| `tools/evaluer.mjs` | Comparaison d'une spec avec un corrigé (flux, décodages) |
| `core/controles.js` | Contrôles croisés (`ecart_somme`, `rapprochement`, `mensuel`) |
| `core/hypotheses.js` | Collecte des hypothèses, confiance, dépendances des mesures, badge, fiche de séance |
| `tools/atelier.mjs` | Chargement de l'état et nouvelles commandes CLI |
| `tests/aide/moteur.mjs` | Charge `core/` dans un contexte `vm` avec un état fabriqué |
| `tests/*.test.mjs` | Tests `node:test` |
| `../tredunion-memoire/*.yml` | Mémoire commune (recettes Sage, comptes, colonnes) |
| `.cursor/commands/maquette.md`, `apprendre.md` | Procédures de l'agent |

---

### Task 1: Socle de test et utilitaires CSV

**Files:**
- Modify: `package.json`
- Create: `tools/lecteurs/commun.mjs`
- Test: `tests/commun.test.mjs`

**Interfaces:**
- Produces: `snake(s: string): string` (identique à `core/model.js`), `cellule(v: string|number|boolean|Date|null): string`, `entetesUniques(noms: any[]): string[]`, `ecrireCsv(fichier: string, entetes: string[], lignes: string[][]): void`.

- [ ] **Step 1: Ajouter la dépendance et le script de test**

Run: `npm install read-excel-file@^9.3.14`

Puis, dans `package.json`, ajouter le script `test` et passer `engines.node` à `>=22` :

```json
    "couverture": "node tools/atelier.mjs couverture",
    "test": "node --test \"tests/**/*.test.mjs\""
```

```json
  "engines": {
    "node": ">=22"
  }
```

- [ ] **Step 2: Écrire le test qui échoue**

`tests/commun.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { snake, cellule, entetesUniques, ecrireCsv } from "../tools/lecteurs/commun.mjs";

test("snake reproduit les noms de colonnes de la spec", () => {
  assert.equal(snake("Montant HT €"), "montant_ht");
  assert.equal(snake("N° Ordre"), "n_ordre");
  assert.equal(snake("Kms parcourus \n Péage"), "kms_parcourus_peage");
  assert.equal(snake("1er relevé"), "c_1er_releve");
});

test("cellule formate dates, nombres, booléens et textes", () => {
  assert.equal(cellule(new Date(Date.UTC(2025, 0, 2))), "02/01/2025");
  assert.equal(cellule(new Date(Date.UTC(2025, 0, 2, 8, 30))), "2025-01-02T08:30:00");
  assert.equal(cellule(1234.5), "1234.5");
  assert.equal(cellule(0.1 + 0.2), "0.3");
  assert.equal(cellule(42), "42");
  assert.equal(cellule(true), "true");
  assert.equal(cellule("  deux\nlignes "), "deux lignes");
  assert.equal(cellule(null), "");
});

test("entetesUniques numérote les doublons et nomme les vides", () => {
  assert.deepEqual(entetesUniques(["N°Carte import", "Chauffeur", "N°Carte import", ""]), ["n_carte_import", "chauffeur", "n_carte_import_2", "col_4"]);
});

test("ecrireCsv sépare par point-virgule et protège les champs", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "csv-")), "t.csv");
  ecrireCsv(f, ["a", "b"], [["1", "x;y"], ["2", 'dit "oui"']]);
  assert.equal(fs.readFileSync(f, "utf8"), 'a;b\n1;"x;y"\n2;"dit ""oui"""\n');
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../tools/lecteurs/commun.mjs'`.

- [ ] **Step 4: Implémenter**

`tools/lecteurs/commun.mjs` :

```js
import fs from "node:fs";

// Doit rester identique à snake() de core/model.js : les noms de colonnes de la spec en dépendent.
export const snake = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "c_$1") || "col";

const p2 = n => String(n).padStart(2, "0");

export function cellule(v) {
  if (v == null) return "";
  if (v instanceof Date) {
    if (!v.getUTCHours() && !v.getUTCMinutes() && !v.getUTCSeconds()) return `${p2(v.getUTCDate())}/${p2(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
    return `${v.getUTCFullYear()}-${p2(v.getUTCMonth() + 1)}-${p2(v.getUTCDate())}T${p2(v.getUTCHours())}:${p2(v.getUTCMinutes())}:${p2(v.getUTCSeconds())}`;
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v).replace(/\s*\r?\n\s*/g, " ").trim();
}

export function entetesUniques(noms) {
  const vus = new Map();
  return noms.map((n, i) => {
    const base = String(n ?? "").trim() ? snake(n) : `col_${i + 1}`;
    const k = (vus.get(base) || 0) + 1; vus.set(base, k);
    return k === 1 ? base : `${base}_${k}`;
  });
}

const champCsv = s => /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

export function ecrireCsv(fichier, entetes, lignes) {
  fs.writeFileSync(fichier, [entetes, ...lignes].map(l => l.map(champCsv).join(";")).join("\n") + "\n");
}
```

- [ ] **Step 5: Vérifier le succès**

Run: `npm test`
Expected: PASS, 4 tests.

- [ ] **Step 6: Point de contrôle**

Run: `npm run check`
Expected: `0 erreur(s)`, comme avant la tâche.

---

### Task 2: Lecteur « tableau »

**Files:**
- Create: `tools/lecteurs/tableau.mjs`
- Test: `tests/tableau.test.mjs`

**Interfaces:**
- Consumes: `cellule`, `entetesUniques` (Task 1).
- Produces: `detecterEntete(lignes: any[][], max?: number): number` (index 0-based, `-1` si rien) ; `lireTableau(lignes, { ignorer?: string[] }): { ligneEntete: number, entetes: string[], lignes: string[][] } | { erreur: string }`.

- [ ] **Step 1: Écrire le test qui échoue**

`tests/tableau.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { detecterEntete, lireTableau } from "../tools/lecteurs/tableau.mjs";

const D = (a, m, j) => new Date(Date.UTC(a, m - 1, j));
const cofi = [
  ["Consommations TIPP", D(2025, 10, 15)],
  ["Sous-titre"],
  ["Période", "du", "au"],
  ["Date", "Véhicule", "Pays", "Montant HT €"],
  [D(2025, 1, 2), "AB-123-CD", "FRANCE", 12.5],
  [D(2025, 1, 3), "EF-456-GH", "FRANCE", 20],
  ["Nombre de lignes :", null, null, 2],
];

test("detecterEntete prend la ligne de texte la plus large", () => {
  assert.equal(detecterEntete(cofi), 3);
});

test("lireTableau renvoie les en-têtes en snake_case et les lignes formatées", () => {
  const t = lireTableau(cofi, { ignorer: ["^Nombre de lignes\\s*:"] });
  assert.equal(t.ligneEntete, 4);
  assert.deepEqual(t.entetes, ["date", "vehicule", "pays", "montant_ht"]);
  assert.deepEqual(t.lignes, [["02/01/2025", "AB-123-CD", "FRANCE", "12.5"], ["03/01/2025", "EF-456-GH", "FRANCE", "20"]]);
});

test("lireTableau garde la ligne de pied sans motif à ignorer", () => {
  assert.equal(lireTableau(cofi).lignes.length, 3);
});

test("lireTableau refuse les valeurs sous des colonnes sans en-tête", () => {
  const sage = [["Numéro de compte", null, "Intitulé", "Débit"], ["706", null, "Transport", null, 100]];
  assert.match(lireTableau(sage).erreur, /sans en-tête/);
});

test("lireTableau signale l'absence d'en-tête", () => {
  assert.match(lireTableau([[1, 2], [3, 4]]).erreur, /en-tête/);
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test`
Expected: FAIL, module `tableau.mjs` introuvable.

- [ ] **Step 3: Implémenter**

`tools/lecteurs/tableau.mjs` :

```js
import { cellule, entetesUniques } from "./commun.mjs";

const vide = v => v == null || (typeof v === "string" && v.trim() === "");
const texte = v => typeof v === "string" && v.trim() !== "";

export function detecterEntete(lignes, max = 15) {
  let meilleure = -1, largeur = 1;
  lignes.slice(0, max).forEach((l, i) => {
    const pleines = l.filter(v => !vide(v));
    if (pleines.length < 2 || !pleines.every(texte)) return;
    if (pleines.length > largeur) { meilleure = i; largeur = pleines.length; }
  });
  return meilleure;
}

export function lireTableau(lignes, { ignorer = [] } = {}) {
  const h = detecterEntete(lignes);
  if (h < 0) return { erreur: "aucune ligne d'en-tête trouvée" };
  const tete = lignes[h];
  const cols = tete.map((v, i) => (vide(v) ? -1 : i)).filter(i => i >= 0);
  const motifs = ignorer.map(m => new RegExp(m, "i"));
  let pleines = 0, orphelines = 0;
  const sortie = [];
  for (const l of lignes.slice(h + 1)) {
    l.forEach((v, i) => { if (vide(v)) return; pleines++; if (vide(tete[i])) orphelines++; });
    const vals = cols.map(i => cellule(l[i]));
    if (!vals.some(Boolean)) continue;
    if (motifs.some(r => r.test(vals.find(Boolean)))) continue;
    sortie.push(vals);
  }
  if (pleines && orphelines / pleines > 0.05) return { erreur: `${Math.round(orphelines / pleines * 100)} % des valeurs sont sous des colonnes sans en-tête` };
  return { ligneEntete: h + 1, entetes: entetesUniques(cols.map(i => cellule(tete[i]))), lignes: sortie };
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npm test`
Expected: PASS, 9 tests.

- [ ] **Step 5: Point de contrôle**

Run: `npm run check`
Expected: `0 erreur(s)`.

---

### Task 3: Lecteur « positions » pour les éditions Sage

**Files:**
- Create: `tools/lecteurs/positions.mjs`, `tests/aide/sage.mjs`
- Test: `tests/positions.test.mjs`

**Interfaces:**
- Consumes: `cellule` (Task 1).
- Produces:
  - `correspond(lignes, recette, max?): boolean` : tous les textes de `recette.signature` apparaissent dans les `max` premières lignes (casse ignorée).
  - `lirePositions(lignes, recette): { entetes: string[], lignes: string[][], horsRecette: number }`.
  - `lireMeta(lignes, max?): { periode_du?: string, periode_au?: string, tirage?: string }` (dates ISO `YYYY-MM-DD`).
- Forme d'une recette (mémoire `logiciels.yml`) : `{ id, logiciel, signature: string[], lecteur: "positions", requis: string[], ignorer: string[], colonnes: [{ col: number (1-based), nom: string }], confirme_chez: string[], contredit_chez: string[] }`.

- [ ] **Step 1: Écrire le test qui échoue**

`tests/aide/sage.mjs` (données fabriquées, partagées avec la Task 5) :

```js
const D = (a, m, j) => new Date(Date.UTC(a, m - 1, j));
export const recetteTest = {
  id: "test_balance", logiciel: "Sage 100 Comptabilité", signature: ["Sage 100", "Balance des comptes"], lecteur: "positions",
  requis: ["numero_compte"], ignorer: ["^Numéro de compte$"],
  colonnes: [{ col: 1, nom: "numero_compte" }, { col: 3, nom: "intitule" }, { col: 5, nom: "debit" }, { col: 7, nom: "credit" }],
};
export const sageTest = [
  [null],
  ["ACME", null, null, "Balance des comptes", null, "Période du", D(2025, 1, 1)],
  [null, null, null, null, null, "au", D(2025, 12, 31)],
  ["© Sage - Sage 100 Comptabilité", null, null, "Date de tirage", D(2026, 1, 15)],
  ["Numéro de compte", null, null, "Mouvements"],
  [null, null, null, "Débit", "Crédit"],
  ["70610000", null, "Transport", null, 100, null, 2500.5],
  [null, null, null, null, null, "Total classe 7", 2500.5],
  ["ACME", null, null, "Balance des comptes"],
  ["70620000", null, "Logistique", null, null, null, 800],
];
```

`tests/positions.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { correspond, lirePositions, lireMeta } from "../tools/lecteurs/positions.mjs";
import { recetteTest, sageTest } from "./aide/sage.mjs";

test("correspond exige tous les textes de la signature", () => {
  assert.equal(correspond(sageTest, recetteTest), true);
  assert.equal(correspond(sageTest, { ...recetteTest, signature: ["Sage 100", "Balance des tiers"] }), false);
});

test("lirePositions garde les lignes de données et retire en-têtes, totaux et répétitions de page", () => {
  const t = lirePositions(sageTest, recetteTest);
  assert.deepEqual(t.entetes, ["numero_compte", "intitule", "debit", "credit"]);
  assert.deepEqual(t.lignes, [["70610000", "Transport", "100", "2500.5"], ["70620000", "Logistique", "", "800"]]);
  assert.equal(t.horsRecette, 0);
});

test("lirePositions compte les valeurs hors des colonnes de la recette", () => {
  const t = lirePositions([...sageTest, ["70630000", null, "Affrètement", null, null, null, 10, null, 99]], recetteTest);
  assert.equal(t.horsRecette, 1);
});

test("lireMeta lit la période et la date de tirage", () => {
  assert.deepEqual(lireMeta(sageTest), { periode_du: "2025-01-01", periode_au: "2025-12-31", tirage: "2026-01-15" });
  assert.deepEqual(lireMeta([["x"]]), {});
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test`
Expected: FAIL, module `positions.mjs` introuvable.

- [ ] **Step 3: Implémenter**

`tools/lecteurs/positions.mjs` :

```js
import { cellule } from "./commun.mjs";

const vide = v => v == null || (typeof v === "string" && v.trim() === "");

export function correspond(lignes, recette, max = 12) {
  const textes = lignes.slice(0, max).flat().filter(v => typeof v === "string").map(v => v.toLowerCase());
  const sig = recette.signature || [];
  return sig.length > 0 && sig.every(s => textes.some(t => t.includes(s.toLowerCase())));
}

export function lirePositions(lignes, recette) {
  const sig = recette.signature.map(s => s.toLowerCase());
  const motifs = (recette.ignorer || []).map(m => new RegExp(m, "i"));
  const noms = recette.colonnes.map(c => c.nom);
  const prises = new Set(recette.colonnes.map(c => c.col - 1));
  const requis = (recette.requis || []).map(n => noms.indexOf(n));
  const sortie = []; let horsRecette = 0;
  for (const l of lignes) {
    if (l.some(v => typeof v === "string" && sig.some(s => v.toLowerCase().includes(s)))) continue;
    const vals = recette.colonnes.map(c => cellule(l[c.col - 1]));
    if (!vals.some(Boolean)) continue;
    if (requis.some(i => i < 0 || !vals[i])) continue;
    if (motifs.some(r => r.test(vals.find(Boolean)))) continue;
    horsRecette += l.filter((v, i) => !vide(v) && !prises.has(i)).length;
    sortie.push(vals);
  }
  return { entetes: noms, lignes: sortie, horsRecette };
}

const premiereDate = l => l.find(v => v instanceof Date);

export function lireMeta(lignes, max = 12) {
  const meta = {};
  const chercher = (cle, motif) => {
    const l = lignes.slice(0, max).find(l => l.some(v => typeof v === "string" && motif.test(v.trim())) && premiereDate(l));
    if (l) meta[cle] = premiereDate(l).toISOString().slice(0, 10);
  };
  chercher("periode_du", /^période du$/i);
  chercher("periode_au", /^au$/i);
  chercher("tirage", /^date de tirage$/i);
  return meta;
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npm test`
Expected: PASS, 13 tests.

- [ ] **Step 5: Point de contrôle**

Run: `npm run check`
Expected: `0 erreur(s)`.

---

### Task 4: Mémoire commune et recettes Sage

**Files:**
- Create: `tools/memoire.mjs`
- Create: `/home/michel/DEVEL/tredunion/tredunion-memoire/logiciels.yml`, `comptes.yml`, `colonnes.yml`, `README.md`
- Test: `tests/memoire.test.mjs`

**Interfaces:**
- Produces: `cheminMemoire(root: string, env?): string`, `lireMemoire(dir): { dir, existe: boolean, logiciels: object[], comptes: object[], colonnes: object[] }`, `ecrireMemoire(m, cles?: string[]): void`.
- Entrées de mémoire : `comptes` = `{ id: "<préfixe>", cod, lib, confirme_chez, contredit_chez }` ; `colonnes` = `{ id: "<nom snake>", desc, type, confirme_chez, contredit_chez }` ; `logiciels` = recettes (Task 3). Une hypothèse y renvoie par `source: memoire:<fichier>/<id>`.

- [ ] **Step 1: Écrire le test qui échoue**

`tests/memoire.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cheminMemoire, lireMemoire, ecrireMemoire } from "../tools/memoire.mjs";

test("cheminMemoire prend TREDUNION_MEMOIRE, sinon le dossier voisin", () => {
  assert.equal(cheminMemoire("/a/vibe", {}), path.resolve("/a/tredunion-memoire"));
  assert.equal(cheminMemoire("/a/vibe", { TREDUNION_MEMOIRE: "/m" }), "/m");
});

test("lireMemoire renvoie des listes vides si le dossier manque", () => {
  const m = lireMemoire("/nulle/part");
  assert.equal(m.existe, false);
  assert.deepEqual([m.logiciels, m.comptes, m.colonnes], [[], [], []]);
});

test("ecrireMemoire n'écrit que les fichiers demandés", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mem-"));
  fs.writeFileSync(path.join(dir, "logiciels.yml"), "# à garder\n[]\n");
  ecrireMemoire({ dir, logiciels: [], comptes: [{ id: "706", cod: "CA TPS", confirme_chez: ["x"], contredit_chez: [] }], colonnes: [] }, ["comptes"]);
  assert.deepEqual(lireMemoire(dir).comptes[0].confirme_chez, ["x"]);
  assert.equal(fs.readFileSync(path.join(dir, "logiciels.yml"), "utf8"), "# à garder\n[]\n");
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test`
Expected: FAIL, module `memoire.mjs` introuvable.

- [ ] **Step 3: Implémenter**

`tools/memoire.mjs` :

```js
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const FICHIERS = ["logiciels", "comptes", "colonnes"];

export function cheminMemoire(root, env = process.env) {
  return path.resolve(root, env.TREDUNION_MEMOIRE || "../tredunion-memoire");
}

export function lireMemoire(dir) {
  const m = { dir, existe: fs.existsSync(dir) };
  FICHIERS.forEach(k => {
    const f = path.join(dir, `${k}.yml`);
    m[k] = fs.existsSync(f) ? (YAML.parse(fs.readFileSync(f, "utf8")) || []) : [];
  });
  return m;
}

export function ecrireMemoire(m, cles = FICHIERS) {
  fs.mkdirSync(m.dir, { recursive: true });
  cles.forEach(k => fs.writeFileSync(path.join(m.dir, `${k}.yml`), `# Mémoire Tredunion : ${k}\n` + YAML.stringify(m[k], { lineWidth: 0 })));
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npm test`
Expected: PASS, 16 tests.

- [ ] **Step 5: Créer la mémoire commune**

`/home/michel/DEVEL/tredunion/tredunion-memoire/logiciels.yml` (positions relevées sur les éditions Sage 100 d'Euro Trans Chanet ; `col` est la colonne Excel des valeurs, pas celle du titre) :

```yaml
# Mémoire Tredunion : logiciels
# Recettes de lecture des exports. lecteur positions : col = colonne Excel (1 = A) où sont les valeurs.
- id: sage100_balance_comptes
  logiciel: Sage 100 Comptabilité
  signature: ["Sage 100", "Balance des comptes"]
  lecteur: positions
  requis: [numero_compte]
  ignorer: ["^Numéro de compte$", "^©"]
  colonnes:
    - {col: 1, nom: numero_compte}
    - {col: 3, nom: intitule}
    - {col: 10, nom: mouvements_debit}
    - {col: 13, nom: mouvements_credit}
    - {col: 15, nom: soldes_debit}
    - {col: 18, nom: soldes_credit}
  confirme_chez: [eurotranschanet]
  contredit_chez: []
- id: sage100_balance_tiers
  logiciel: Sage 100 Comptabilité
  signature: ["Sage 100", "Balance des tiers"]
  lecteur: positions
  requis: [numero_compte]
  ignorer: ["^Numéro de compte$", "^©"]
  colonnes:
    - {col: 1, nom: numero_compte}
    - {col: 4, nom: intitule}
    - {col: 11, nom: mouvements_anterieurs_debit}
    - {col: 14, nom: mouvements_anterieurs_credit}
    - {col: 17, nom: mouvements_debit}
    - {col: 20, nom: mouvements_credit}
    - {col: 23, nom: soldes_cumules_debit}
    - {col: 26, nom: soldes_cumules_credit}
  confirme_chez: [eurotranschanet]
  contredit_chez: []
- id: sage100_plan_tiers
  logiciel: Sage 100 Comptabilité
  signature: ["Sage 100", "Liste des tiers"]
  lecteur: positions
  requis: [compte_tiers]
  ignorer: ["^Type$", "^©"]
  colonnes:
    - {col: 1, nom: type}
    - {col: 2, nom: compte_tiers}
    - {col: 5, nom: intitule}
    - {col: 11, nom: code_postal}
    - {col: 13, nom: ville}
  confirme_chez: [eurotranschanet]
  contredit_chez: []
- id: sage100_plan_comptes
  logiciel: Sage 100 Comptabilité
  signature: ["Sage 100", "Liste des comptes"]
  lecteur: positions
  requis: [numero_compte]
  ignorer: ["^Type$", "^©"]
  colonnes:
    - {col: 1, nom: type}
    - {col: 2, nom: numero_compte}
    - {col: 5, nom: intitule}
    - {col: 14, nom: nature}
  confirme_chez: [eurotranschanet]
  contredit_chez: []
```

`comptes.yml` et `colonnes.yml` :

```yaml
# Mémoire Tredunion : comptes
[]
```

```yaml
# Mémoire Tredunion : colonnes
[]
```

`README.md` :

```markdown
# Mémoire Tredunion

Connaissance partagée entre les dépôts adhérents de l'atelier silver → gold.

- `logiciels.yml` : recettes de lecture des exports (signature, lecteur, positions des colonnes).
- `comptes.yml` : préfixe de compte → `%COD_CATEGORIE`, confirmé ou contredit par adhérent.
- `colonnes.yml` : nom de colonne → sens, confirmé ou contredit par adhérent.

`comptes.yml` et `colonnes.yml` sont écrits par `npm run apprendre`. `logiciels.yml` est écrit à la main quand un nouvel export apparaît.
```

- [ ] **Step 6: Point de contrôle**

Run: `npm test && npm run check`
Expected: PASS, puis `0 erreur(s)`.

---

### Task 5: Normalisation et migration d'Euro Trans Chanet

**Files:**
- Create: `tools/normaliser.mjs`
- Modify: `tools/atelier.mjs` (imports, `opt`, `.env`, commande `normaliser`, répartiteur asynchrone)
- Modify: `package.json` (script `normaliser`)
- Test: `tests/normaliser.test.mjs`

**Interfaces:**
- Consumes: Tasks 1 à 4.
- Produces:
  - `idDataset(domaine: string, fichier: string, feuille: string): string`.
  - `lireFeuille(lignes, logiciels): { entetes, lignes, lecteur, logiciel?, meta, horsRecette? } | { erreur }`.
  - `normaliserSociete({ brut, bronze, logiciels }): Promise<{ ecrits: object[], nonLus: { fichier, feuille?, raison }[] }>`. Écrit `<id>.csv`, `<id>.meta.json` et `_non_lus.json` dans `bronze`.
  - Dans `tools/atelier.mjs` : `opt(args, cle)` et `cmdNormaliser(args)` (async).

- [ ] **Step 1: Écrire le test qui échoue**

`tests/normaliser.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { idDataset, lireFeuille, normaliserSociete } from "../tools/normaliser.mjs";
import { recetteTest, sageTest } from "./aide/sage.mjs";

test("idDataset combine domaine, fichier et feuille", () => {
  assert.equal(idDataset("TMS", "/x/Akanea donnees.xlsx", "Activités ventes"), "tms_akanea_donnees_activites_ventes");
  assert.equal(idDataset("Comptabilité", "/x/Balance.xlsx", ""), "comptabilite_balance");
  assert.equal(idDataset("", "/x/tms_missions.csv", ""), "tms_missions");
});

test("lireFeuille applique la recette reconnue, sinon le lecteur tableau", () => {
  assert.equal(lireFeuille(sageTest, [recetteTest]).lecteur, "test_balance");
  assert.deepEqual(lireFeuille(sageTest, [recetteTest]).meta, { periode_du: "2025-01-01", periode_au: "2025-12-31", tirage: "2026-01-15" });
  assert.equal(lireFeuille([["a", "b"], ["1", "2"]], [recetteTest]).lecteur, "tableau");
  assert.ok(lireFeuille([[1, 2]], [recetteTest]).erreur);
});

test("normaliserSociete copie les CSV et liste les formats non pris en charge", async () => {
  const brut = fs.mkdtempSync(path.join(os.tmpdir(), "brut-"));
  const bronze = `${brut}-bronze`;
  fs.mkdirSync(path.join(brut, "TMS"));
  fs.writeFileSync(path.join(brut, "TMS", "Missions.csv"), "a;b\n1;2\n");
  fs.writeFileSync(path.join(brut, "notice.pdf"), "x");
  const r = await normaliserSociete({ brut, bronze, logiciels: [] });
  assert.deepEqual(r.ecrits.map(e => e.id), ["tms_missions"]);
  assert.equal(fs.readFileSync(path.join(bronze, "tms_missions.csv"), "utf8"), "a;b\n1;2\n");
  assert.equal(JSON.parse(fs.readFileSync(path.join(bronze, "tms_missions.meta.json"), "utf8")).lignes, 1);
  assert.deepEqual(r.nonLus, [{ fichier: "notice.pdf", raison: "format .pdf non pris en charge" }]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(bronze, "_non_lus.json"), "utf8")), r.nonLus);
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test`
Expected: FAIL, module `normaliser.mjs` introuvable.

- [ ] **Step 3: Implémenter le module**

`tools/normaliser.mjs` :

```js
import fs from "node:fs";
import path from "node:path";
import readXlsxFile from "read-excel-file/node";
import { snake, ecrireCsv } from "./lecteurs/commun.mjs";
import { lireTableau } from "./lecteurs/tableau.mjs";
import { correspond, lirePositions, lireMeta } from "./lecteurs/positions.mjs";

const IGNORER = ["^Nombre de lignes\\s*:"];

function fichiers(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? fichiers(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    .sort();
}

export function idDataset(domaine, fichier, feuille) {
  const base = path.basename(fichier).replace(/\.[^.]+$/, "");
  return snake([domaine, base, feuille].filter(Boolean).join("_"));
}

export function lireFeuille(lignes, logiciels) {
  const recette = logiciels.find(r => r.lecteur === "positions" && correspond(lignes, r));
  if (recette) return { ...lirePositions(lignes, recette), lecteur: recette.id, logiciel: recette.logiciel, meta: lireMeta(lignes) };
  const t = lireTableau(lignes, { ignorer: IGNORER });
  return t.erreur ? t : { ...t, lecteur: "tableau", meta: lireMeta(lignes) };
}

export async function normaliserSociete({ brut, bronze, logiciels }) {
  fs.mkdirSync(bronze, { recursive: true });
  const ecrits = [], nonLus = [], ids = new Map();
  const ecrire = (id, relatif, meta, corps) => {
    if (ids.has(id)) { nonLus.push({ fichier: relatif, ...(meta.feuille ? { feuille: meta.feuille } : {}), raison: `même nom de dataset que ${ids.get(id)}` }); return; }
    ids.set(id, relatif); corps(path.join(bronze, `${id}.csv`));
    fs.writeFileSync(path.join(bronze, `${id}.meta.json`), JSON.stringify(meta, null, 2) + "\n");
    ecrits.push({ id, ...meta });
  };
  for (const f of fichiers(brut)) {
    const relatif = path.relative(brut, f).split(path.sep).join("/");
    const parts = relatif.split("/"); const domaine = parts.length > 1 ? parts[0] : "";
    const ext = path.extname(f).toLowerCase();
    if (ext === ".csv") {
      const lignes = Math.max(0, fs.readFileSync(f, "utf8").split(/\r?\n/).filter(l => l.trim()).length - 1);
      ecrire(idDataset(domaine, f, ""), relatif, { source: relatif, domaine, lecteur: "copie", lignes }, cible => fs.copyFileSync(f, cible));
      continue;
    }
    if (ext !== ".xlsx") { nonLus.push({ fichier: relatif, raison: `format ${ext || "sans extension"} non pris en charge` }); continue; }
    let feuilles;
    try { feuilles = await readXlsxFile(f); }
    catch (e) { nonLus.push({ fichier: relatif, raison: `Excel illisible : ${e.message}` }); continue; }
    for (const s of feuilles) {
      const r = lireFeuille(s.data, logiciels);
      if (r.erreur) { nonLus.push({ fichier: relatif, feuille: s.sheet, raison: r.erreur }); continue; }
      const meta = { source: relatif, feuille: s.sheet, domaine, lecteur: r.lecteur, ...(r.logiciel ? { logiciel: r.logiciel } : {}), ...r.meta, lignes: r.lignes.length, ...(r.horsRecette ? { hors_recette: r.horsRecette } : {}) };
      ecrire(idDataset(domaine, f, feuilles.length > 1 ? s.sheet : ""), relatif, meta, cible => ecrireCsv(cible, r.entetes, r.lignes));
    }
  }
  fs.writeFileSync(path.join(bronze, "_non_lus.json"), JSON.stringify(nonLus, null, 2) + "\n");
  return { ecrits, nonLus };
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npm test`
Expected: PASS, 19 tests.

- [ ] **Step 5: Brancher la commande dans la CLI**

Dans `tools/atelier.mjs`, après `import YAML from "yaml";` :

```js
import { lireMemoire, cheminMemoire, ecrireMemoire } from "./memoire.mjs";
import { normaliserSociete } from "./normaliser.mjs";
```

Après la ligne `const CORE = [...]` :

```js
if (exists(P(".env"))) process.loadEnvFile(P(".env"));
const opt = (args, k) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : null; };
```

Avant `/* ───────── serveur de prévisualisation ───────── */` :

```js
async function cmdNormaliser(args) {
  const soc = opt(args, "societe"); if (!soc) throw new Error("Usage : npm run normaliser -- --societe <id>");
  const brut = P("data/raw", soc); if (!exists(brut)) throw new Error(`Dossier introuvable : data/raw/${soc} (lance d'abord npm run collecte)`);
  const memoire = lireMemoire(cheminMemoire(ROOT));
  if (!memoire.existe) console.warn(`${C.yellow}Mémoire introuvable (${memoire.dir}) : seul le lecteur tableau sera utilisé.${C.reset}`);
  const { ecrits, nonLus } = await normaliserSociete({ brut, bronze: P("data/bronze", soc), logiciels: memoire.logiciels });
  console.log(`${ecrits.length} fichiers CSV écrits dans data/bronze/${soc}/`);
  ecrits.forEach(e => console.log(`  ${e.id}.csv  ${e.lignes} lignes · ${e.lecteur}${e.hors_recette ? ` · ${C.yellow}${e.hors_recette} valeurs hors recette${C.reset}` : ""}`));
  if (nonLus.length) { console.log(`\n${C.yellow}${nonLus.length} non lus${C.reset}`); nonLus.forEach(n => console.log(`  ${n.fichier}${n.feuille ? " · " + n.feuille : ""} : ${n.raison}`)); }
}
```

Remplacer les deux dernières lignes du fichier (table `CMDS` et répartiteur) par :

```js
const CMDS = { couverture: cmdCouverture, serve: cmdServe, check: cmdCheck, build: cmdBuild, questions: cmdQuestions, question: a => cmdQuestion(a), profil: cmdProfile, exemple: cmdExemple, reset: cmdReset, normaliser: cmdNormaliser };
if (!CMDS[cmd]) { console.log("Commandes : serve | couverture [--anomalies|--json] | check [--json] | build | questions [--suivante|--toutes] | question <dataset>#<id> | profil <csv> --societe <id> [--id nom] | exemple [--force] | reset --force | normaliser --societe <id>"); process.exitCode = cmd ? 1 : 0; }
else Promise.resolve().then(() => CMDS[cmd](args)).catch(e => { console.error(`${C.red}${e.message}${C.reset}`); process.exitCode = 1; });
```

Dans `package.json`, script : `"normaliser": "node tools/atelier.mjs normaliser"`.

- [ ] **Step 6: Migrer les exports d'Euro Trans Chanet vers `data/raw`**

Les Excel copiés à la main passent dans `data/raw/`. Les anciens CSV et la spec qui les décrit sont retirés.

```bash
mkdir -p data/raw/eurotranschanet
mv data/bronze/eurotranschanet/Carburant data/bronze/eurotranschanet/Comptabilité data/bronze/eurotranschanet/Entretien data/bronze/eurotranschanet/Paie data/bronze/eurotranschanet/TMS data/raw/eurotranschanet/
rm data/bronze/eurotranschanet/*.csv
rm spec/datasets/*.yml
npm run normaliser -- --societe eurotranschanet
```

Expected : 18 CSV, 0 non lu, aucune « valeur hors recette ». Les quatre fichiers comptables passent par les recettes `sage100_*`, les autres par `tableau`. Ordres de grandeur attendus : `tms_akanea` 10 596 lignes ; `comptabilite_balance` 351 lignes (sans les 3 totaux) ; `comptabilite_plan_comptable_des_tiers` 8 027 ; `comptabilite_plan_comptable` 745 ; `carburant_cofi_table1_detailconso` 1 833 (sans la ligne « Nombre de lignes : »). Un écart sur un fichier comptable signale une recette fausse : corriger la recette, pas les données.

- [ ] **Step 7: Profiler les nouveaux CSV et remettre les données personnelles**

```bash
for f in data/bronze/eurotranschanet/*.csv; do npm run profil --silent -- "$f" --societe eurotranschanet; done
```

Puis ajouter `pii: true` (sous `desc:` de la colonne) sur :

| Dataset | Colonnes |
|---|---|
| `paie_silae_cout_salariaux` | `salarie` |
| `tms_akanea_donnees_tiers` | `nom`, `adresse_1`, `adresse_2`, `telephone`, `adresse_mail`, `fax` |
| `tms_akanea` | `nom_du_chauffeur` |
| `entretien_tabletotalcout` | `personnel` |
| `carburant_table1` | `personnel` |
| `carburant_table3` | `chauffeur` |
| `carburant_table` | `chauffeur`, `n_carte_import`, `n_carte_import_2` |
| `carburant_cofi_table1_detailconso` | `chauffeur` |

Vérifier sur `tms_akanea.yml` : `date_chgt` détectée `date`, format `DD/MM/YYYY`.

- [ ] **Step 8: Tracer et vérifier**

Ajouter à `spec/journal.yml` :

```yaml
- date: 2026-11-06T23:30:00
  question: migration normalisation
  decision: Excel Euro Trans Chanet déplacés dans data/raw, CSV régénérés par npm run normaliser (recettes Sage de la mémoire), datasets reprofilés, données personnelles remarquées.
  fichiers: [spec/datasets]
```

Run: `npm test && npm run check`
Expected: PASS, puis `0 erreur(s)`.

---

### Task 6: Collecte SFTP

**Files:**
- Create: `tools/collecte.mjs`, `.env.exemple`, `.cursorignore`
- Modify: `.gitignore`, `tools/atelier.mjs` (commande `collecte`), `package.json`
- Test: `tests/collecte.test.mjs`

**Interfaces:**
- Produces: `configSftp(env): { host, port, user, password, dir }` (lève une erreur listant les variables manquantes) ; `argsSftp(cfg): string[]` ; `scriptSftp(cfg, local): string` ; `collecter(cfg, cible): number` (nombre de fichiers copiés).

- [ ] **Step 1: Écrire le test qui échoue**

`tests/collecte.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { configSftp, argsSftp, scriptSftp } from "../tools/collecte.mjs";

const env = { SFTP_HOST: "sftp.exemple.fr", SFTP_USER: "u", SFTP_PASSWORD: "p", SFTP_DIR: "/DOSSIER/" };

test("configSftp liste les variables manquantes", () => {
  assert.throws(() => configSftp({ SFTP_HOST: "h" }), /SFTP_USER, SFTP_PASSWORD, SFTP_DIR/);
});

test("configSftp met le port 22 par défaut et retire la barre finale", () => {
  const c = configSftp(env);
  assert.equal(c.port, "22");
  assert.equal(c.dir, "/DOSSIER");
});

test("argsSftp force le mot de passe sans mode batch", () => {
  const a = argsSftp(configSftp({ ...env, SFTP_PORT: "9222" }));
  assert.deepEqual(a.slice(0, 2), ["-P", "9222"]);
  assert.equal(a.at(-1), "u@sftp.exemple.fr");
  assert.ok(!a.includes("-b"));
});

test("scriptSftp télécharge le dossier dans le répertoire local", () => {
  assert.equal(scriptSftp(configSftp(env), "/tmp/dl"), 'lcd "/tmp/dl"\nget -r "/DOSSIER"\n');
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test`
Expected: FAIL, module `collecte.mjs` introuvable.

- [ ] **Step 3: Implémenter**

`tools/collecte.mjs` :

```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function configSftp(env) {
  const manque = ["SFTP_HOST", "SFTP_USER", "SFTP_PASSWORD", "SFTP_DIR"].filter(k => !env[k]);
  if (manque.length) throw new Error(`Variables manquantes dans .env : ${manque.join(", ")}`);
  return { host: env.SFTP_HOST, port: env.SFTP_PORT || "22", user: env.SFTP_USER, password: env.SFTP_PASSWORD, dir: env.SFTP_DIR.replace(/\/+$/, "") };
}

// Pas de -b : le mode batch d'OpenSSH désactive l'authentification par mot de passe.
export function argsSftp(cfg) {
  return ["-P", String(cfg.port), "-o", "StrictHostKeyChecking=accept-new", "-o", "PreferredAuthentications=password", "-o", "PubkeyAuthentication=no", "-o", "NumberOfPasswordPrompts=1", "-o", "ConnectTimeout=20", `${cfg.user}@${cfg.host}`];
}

export function scriptSftp(cfg, local) {
  return `lcd "${local}"\nget -r "${cfg.dir}"\n`;
}

const compter = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? compter(path.join(dir, e.name)) : 1), 0);

export function collecter(cfg, cible) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "collecte-"));
  const askpass = path.join(tmp, "askpass.sh");
  fs.writeFileSync(askpass, "#!/bin/sh\nprintf '%s\\n' \"$SFTP_PASSWORD\"\n", { mode: 0o700 });
  try {
    const dl = path.join(tmp, "dl"); fs.mkdirSync(dl);
    const r = spawnSync("sftp", argsSftp(cfg), { input: scriptSftp(cfg, dl), encoding: "utf8", timeout: 600000,
      env: { ...process.env, SFTP_PASSWORD: cfg.password, SSH_ASKPASS: askpass, SSH_ASKPASS_REQUIRE: "force", DISPLAY: process.env.DISPLAY || "atelier" } });
    if (r.error) throw new Error(`sftp : ${r.error.message}`);
    const src = path.join(dl, path.posix.basename(cfg.dir));
    if (!fs.existsSync(src)) throw new Error(`Rien téléchargé depuis ${cfg.dir} : ${(r.stderr || "").trim().split("\n").pop()}`);
    fs.mkdirSync(cible, { recursive: true });
    fs.cpSync(src, cible, { recursive: true });
    return compter(src);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npm test`
Expected: PASS, 23 tests.

- [ ] **Step 5: Brancher la commande et protéger les identifiants**

Dans `tools/atelier.mjs`, import :

```js
import { configSftp, collecter } from "./collecte.mjs";
```

Avant `cmdNormaliser` :

```js
function cmdCollecte(args) {
  const soc = opt(args, "societe"); if (!soc) throw new Error("Usage : npm run collecte -- --societe <id>");
  const n = collecter(configSftp(process.env), P("data/raw", soc));
  console.log(`${n} fichiers copiés dans data/raw/${soc}/`);
}
```

Ajouter `collecte: cmdCollecte` à `CMDS`, et `| collecte --societe <id>` au message d'usage. Script `package.json` : `"collecte": "node tools/atelier.mjs collecte"`.

`.env.exemple` :

```
# Copier en .env (jamais dans git, jamais lu par l'agent)
SFTP_HOST=sftp.wema.fr
SFTP_PORT=9222
SFTP_USER=
SFTP_PASSWORD=
SFTP_DIR=
TREDUNION_MEMOIRE=../tredunion-memoire
```

`.cursorignore` :

```
.env
```

`.gitignore` : ajouter la ligne `.env`.

- [ ] **Step 6: Vérification réelle (Michel)**

Michel crée `.env` depuis `.env.exemple`, avec `SFTP_DIR=SFTP_EURO_TRANS_CHANET` et un mot de passe renouvelé.

Run: `npm run collecte -- --societe eurotranschanet`
Expected : `15 fichiers copiés dans data/raw/eurotranschanet/`, avec la même arborescence par domaine qu'à la Task 5.

- [ ] **Step 7: Point de contrôle**

Run: `npm test && npm run check`
Expected: PASS, puis `0 erreur(s)`.

---

### Task 7: Contrôles croisés

**Files:**
- Create: `core/controles.js`, `tests/aide/moteur.mjs`
- Modify: `tools/atelier.mjs` (`CORE`, chargement de `spec/controles.yml` et des `.meta.json`, commande `controles`), `core/model.js` (`hydrate`), `core/check.js`, `package.json`
- Test: `tests/controles.test.mjs`

**Interfaces:**
- Consumes: `DS`, `silverRows`, `compileVal`, `parseCond`, `matchRate`, `cached`, `fmtN` (`core/model.js`).
- Produces: `runControle(c): { id, type, libelle, porte_sur: string[], statut: "ok"|"ecart"|"erreur", msg, a?, b?, ecart?, taux?, mois? }` ; `CTRL(): résultat[]` (mis en cache) ; `d.meta` sur chaque dataset ; `S.st.controles`.
- Format `spec/controles.yml` :

```yaml
- id: c1
  type: ecart_somme             # ecart_somme | rapprochement | mensuel
  libelle: CA Akanea contre comptes 70
  annee: 2025                   # filtre les côtés qui ont une date
  tolerance: 0.05               # écart relatif admis (défaut 0,05)
  a: {ds: tms_akanea, valeur: montant, date: date_chgt}
  b: {ds: comptabilite_balance, valeur: "mouvements_credit - mouvements_debit", filtre: "numero_compte like '70%'"}
  porte_sur: [tms_akanea.montant, flux:f1]
- id: c4
  type: rapprochement
  from: carburant_table.materiel
  to: tms_akanea.plaque_moteur
  norm: alnum_upper
  seuil: 0.9                    # défaut 0,9
  porte_sur: [flux:f3]
- id: c5
  type: mensuel
  ds: comptabilite_balance
  date: ""                      # colonne de date ; vide = la source n'a pas de date par ligne
  porte_sur: [flux:f1]
```

- [ ] **Step 1: Écrire l'aide de test**

`tests/aide/moteur.mjs` :

```js
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CORE = ["core/engine.js", "core/model.js", "core/check.js", "core/controles.js", "core/hypotheses.js"];

export const colonne = (name, extra = {}) => ({ name, type: "", role: "attr", desc: "", pii: false, codes: null, format: "", decimalComma: false, hypothese: null, ...extra });
export const dataset = (id, columns, rows, extra = {}) => ({ id, societe: "s1", file: `data/bronze/s1/${id}.csv`, desc: "", grain: "", columns, rows, rules: [], questions: [], cases: [], meta: null, ...extra });

export function chargerMoteur(partiel) {
  const ctx = vm.createContext({ console, Intl, Date, Math, JSON });
  CORE.filter(f => fs.existsSync(path.join(ROOT, f))).forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));
  const gold = vm.runInContext("goldTemplate()", ctx).filter(t => t.kind === "faits" || t.generated);
  ctx.__state = { version: 2, adherent: "Test", societes: [{ id: "s1", name: "S1", source: "", color: 0 }], datasets: [], relations: [], gold, flux: [], categories: [], catalogue: "", cases: [], log: [], controles: [], memoire: { logiciels: [], comptes: [], colonnes: [] }, nonLus: [], ...partiel };
  vm.runInContext("S.st=hydrate(__state); S.ver++;", ctx);
  return { run: code => JSON.parse(JSON.stringify(vm.runInContext(code, ctx)) ?? "null") };
}
```

- [ ] **Step 2: Écrire le test qui échoue**

`tests/controles.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, colonne, dataset } from "./aide/moteur.mjs";

const tms = () => dataset("tms", [colonne("date_chgt"), colonne("montant"), colonne("plaque")],
  [["02/01/2025", "600", "AB-123-CD"], ["15/02/2025", "400", "EF-456-GH"], ["20/12/2024", "999", "AB-123-CD"]]);
const balance = credit => dataset("balance", [colonne("numero_compte"), colonne("credit")], [["70610000", String(credit)], ["60610000", "50"]],
  { meta: { periode_du: "2025-01-01", periode_au: "2025-12-31" } });
const parc = () => dataset("parc", [colonne("immat")], [["AB123CD"], ["EF456GH"]]);
const c1 = { id: "c1", type: "ecart_somme", libelle: "CA TMS contre comptes 70", annee: 2025, tolerance: 0.05,
  a: { ds: "tms", valeur: "montant", date: "date_chgt" }, b: { ds: "balance", valeur: "credit", filtre: "numero_compte like '70%'" }, porte_sur: ["tms.montant"] };
const resultats = (datasets, controles) => chargerMoteur({ datasets, controles }).run("CTRL()");

test("ecart_somme : ok dans la tolérance, sur l'année demandée", () => {
  const [r] = resultats([tms(), balance(1020)], [c1]);
  assert.equal(r.statut, "ok"); assert.equal(r.a, 1000); assert.equal(r.b, 1020);
});

test("ecart_somme : écart au-delà de la tolérance", () => {
  assert.equal(resultats([tms(), balance(2000)], [c1])[0].statut, "ecart");
});

test("rapprochement : taux après normalisation", () => {
  const c = { id: "c4", type: "rapprochement", from: "tms.plaque", to: "parc.immat", seuil: 0.9 };
  assert.equal(resultats([tms(), parc()], [{ ...c, norm: "alnum_upper" }])[0].statut, "ok");
  assert.equal(resultats([tms(), parc()], [c])[0].statut, "ecart");
});

test("mensuel : une source sans date par ligne est en écart, avec sa période", () => {
  const [r] = resultats([balance(1)], [{ id: "c5", type: "mensuel", ds: "balance" }]);
  assert.equal(r.statut, "ecart"); assert.match(r.msg, /2025-01-01/);
  const [m] = resultats([tms()], [{ id: "c6", type: "mensuel", ds: "tms", date: "date_chgt" }]);
  assert.equal(m.statut, "ok"); assert.equal(m.mois, 3);
});

test("type inconnu ou id manquant : erreur", () => {
  assert.equal(resultats([], [{ id: "c9", type: "autre" }])[0].statut, "erreur");
  assert.equal(resultats([], [{ type: "mensuel" }])[0].statut, "erreur");
});

test("checkSpec remonte les écarts en alerte sur spec/controles.yml", () => {
  const f = chargerMoteur({ datasets: [tms(), balance(2000)], controles: [c1] }).run("checkSpec()");
  assert.ok(f.some(x => x.fichier === "spec/controles.yml" && x.niv === "alerte" && x.msg.startsWith("c1")));
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npm test`
Expected: FAIL, `CTRL is not defined`.

- [ ] **Step 4: Implémenter `core/controles.js`**

```js
/* ───────────── contrôles croisés entre sources ───────────── */
const CTRL_TYPES=["ecart_somme","rapprochement","mensuel"];
function sommeCote(c,annee){
  const d=c&&DS(c.ds); if(!d) return {err:`dataset « ${c&&c.ds} » inconnu`};
  const val=compileVal(c.valeur,d); if(!val) return {err:`valeur « ${c.valeur} » non calculable sur ${c.ds}`};
  const pf=parseCond(c.filtre); if(c.filtre&&!pf) return {err:`filtre non interprété : ${c.filtre}`};
  let s=0;
  silverRows(d).rows.forEach(o=>{ if(pf&&!pf(o)) return;
    if(annee!=null&&c.date){ const dt=o[c.date]; if(!(dt instanceof Date)||dt.getFullYear()!==+annee) return; }
    const v=val(o); if(v!=null) s+=v; });
  return {s};
}
function runControle(c){
  const r={id:c.id||"?",type:c.type,libelle:c.libelle||c.id||"",porte_sur:c.porte_sur||[],statut:"erreur",msg:""};
  if(!c.id){ r.msg="id manquant"; return r; }
  if(!CTRL_TYPES.includes(c.type)){ r.msg=`type « ${c.type} » inconnu (${CTRL_TYPES.join(", ")})`; return r; }
  if(c.type==="ecart_somme"){
    const a=sommeCote(c.a,c.annee), b=sommeCote(c.b,c.annee); if(a.err||b.err){ r.msg=a.err||b.err; return r; }
    const tol=c.tolerance??0.05, ref=Math.max(Math.abs(a.s),Math.abs(b.s));
    r.a=a.s; r.b=b.s; r.ecart=ref?Math.abs(a.s-b.s)/ref:0; r.statut=r.ecart<=tol?"ok":"ecart";
    r.msg=`${fmtN(a.s)} contre ${fmtN(b.s)}, écart ${(r.ecart*100).toFixed(1)} % (tolérance ${Math.round(tol*100)} %)`; return r;
  }
  if(c.type==="rapprochement"){
    const m=matchRate({from:c.from,to:c.to,norm:c.norm||"none"}); if(!m){ r.msg=`colonnes ${c.from} ou ${c.to} introuvables ou vides`; return r; }
    const seuil=c.seuil??0.9; r.taux=m.rate; r.statut=m.rate>=seuil?"ok":"ecart";
    r.msg=`${(m.rate*100).toFixed(1)} % de ${c.from} retrouvés dans ${c.to} (seuil ${Math.round(seuil*100)} %)`; return r;
  }
  const d=DS(c.ds); if(!d){ r.msg=`dataset « ${c.ds} » inconnu`; return r; }
  const p=d.meta||{};
  if(!c.date){ r.statut="ecart"; r.msg=`${c.ds} n'a pas de date par ligne${p.periode_du?` : un seul bloc du ${p.periode_du} au ${p.periode_au}`:""}. FAITS est mensuelle.`; return r; }
  const mois=new Set(); silverRows(d).rows.forEach(o=>{ const dt=o[c.date]; if(dt instanceof Date&&!isNaN(dt)) mois.add(dt.getFullYear()*100+dt.getMonth()+1); });
  r.mois=mois.size; r.statut=mois.size>=2?"ok":"ecart"; r.msg=`${mois.size} mois distincts dans ${c.ds}.${c.date}`; return r;
}
function CTRL(){ return cached("ctrl",()=>(S.st.controles||[]).map(runControle)); }
```

- [ ] **Step 5: Brancher le contrôle, l'hydratation et le chargement**

`core/model.js`, dans `hydrate`, remplacer la ligne qui commence par `st.relations=st.relations||[];` par :

```js
  st.relations=st.relations||[]; st.flux=st.flux||[]; st.categories=st.categories||[]; st.cases=st.cases||[]; st.log=st.log||[]; st.catalogue=st.catalogue||"";
  st.controles=st.controles||[]; st.memoire=st.memoire||{logiciels:[],comptes:[],colonnes:[]}; st.nonLus=st.nonLus||[];
```

`core/check.js`, juste avant `if(!st.catalogue.trim())` :

```js
  CTRL().forEach(r=>add(r.statut==="erreur"?"erreur":r.statut==="ecart"?"alerte":"info","spec/controles.yml",`${r.id}${r.libelle&&r.libelle!==r.id?" "+r.libelle:""} : ${r.msg}`));
```

`tools/atelier.mjs` :
- `const CORE = ["core/engine.js", "core/model.js", "core/check.js", "core/controles.js"];`
- dans `loadState`, après la ligne `d.rows = rows.map(...)` du bloc `else { ... }`, ajouter la lecture des métadonnées. Remplacer la ligne `const pos = layout["ds:" + d.id]; …` par :

```js
    const metaF = file ? file.replace(/\.csv$/i, ".meta.json") : null; d.meta = metaF && exists(metaF) ? JSON.parse(fs.readFileSync(metaF, "utf8")) : null;
    const pos = layout["ds:" + d.id]; d.x = pos?.x ?? 40 + (i % 2) * 290; d.y = pos?.y ?? 40 + Math.floor(i / 2) * 280;
```

- après la ligne `const journal = …` :

```js
  const controles = safe(P("spec/controles.yml"), [], () => readYaml(P("spec/controles.yml"), []) || []);
```

- dans l'objet `state` renvoyé, ajouter `controles` après `log`.
- avant `cmdNormaliser` :

```js
function cmdControles() {
  const { ctx } = evaluate(); const res = vm.runInContext("CTRL()", ctx);
  if (!res.length) { console.log("Aucun contrôle dans spec/controles.yml."); return; }
  res.forEach(r => console.log(`${r.statut === "ok" ? C.green : r.statut === "ecart" ? C.yellow : C.red}${r.statut.padEnd(7)}${C.reset} ${C.bold}${r.id}${C.reset} ${r.libelle} : ${r.msg}`));
}
```

- ajouter `controles: cmdControles` à `CMDS` et `| controles` à l'usage ; script `package.json` : `"controles": "node tools/atelier.mjs controles"`.

- [ ] **Step 6: Vérifier le succès**

Run: `npm test`
Expected: PASS, 29 tests.

- [ ] **Step 7: Point de contrôle**

Run: `npm run check && npm run controles`
Expected : `0 erreur(s)`, puis `Aucun contrôle dans spec/controles.yml.`

---

### Task 8: Hypothèses et confiance calculée

**Files:**
- Create: `core/hypotheses.js`
- Modify: `tools/atelier.mjs` (`CORE`, `hypothese` sur colonnes de datasets et de dimensions, `memoire`, `nonLus`, affichage du check), `core/check.js`, `tests/aide/moteur.mjs`
- Test: `tests/hypotheses.test.mjs`

**Interfaces:**
- Consumes: `CTRL()` (Task 7), `CAT()`, `buildFaits()`, `measureNeeds`, `fluxLabel`, `FX`, `DS`, `cached`.
- Produces :
  - Bloc YAML `hypothese: { source: "agent" | "memoire:<fichier>/<id>", preuves: string[], question: string, valide: bool, refuse: bool }` sur : colonne de dataset, règle silver (`rules[]`), flux, règle de flux (`rules[]` en `codMode: regles`), colonne de dimension.
  - Cibles : `dataset.colonne`, `dataset#regleN` (N à partir de 1), `flux:fN`, `flux:fN#<prefixe>`, `DIM_X.COLONNE`.
  - `listeHypotheses(): { cible, fichier, libelle, question, source, preuves, valide, refuse, confiance: "confirme"|"haute"|"moyenne"|"basse", conflit: bool, raisons: string[] }[]`.
  - `entreeMemoire(source): object|null`, `hypothesesMesure(m)`, `badgeMesure(m): { niveau: "vert"|"orange"|"rouge", pire, n } | null`, `CONF_LIB`, `CONF_RANG`.
  - `summary().hypotheses: { confirme, haute, moyenne, basse }`.

- [ ] **Step 1: Ajouter un état d'exemple à l'aide de test**

À la fin de `tests/aide/moteur.mjs` :

```js
export const CATALOGUE = "CA Réel\n    Sum({<[%COD_CATEGORIE]={'CA TOTAL'}>} MontantReel)\n\nGazole\n    Sum({<[%COD_CATEGORIE]={'GO'}>} MontantReel)\n";

export const etatCaTotal = (hypothese, extra = {}) => ({
  datasets: [dataset("tms", [colonne("date_chgt"), colonne("montant", { desc: "Montant HT", hypothese })], [["02/01/2025", "600"], ["15/02/2025", "400"]])],
  flux: [{ id: "f1", ds: "tms", codMode: "fixe", cod: "CA TOTAL", lib: "CA total", valeur: "montant", agg: "sum", champ: "MontantReel", unite: "€", date: "date_chgt",
    rules: [], codCol: "", libCol: "", vehicule: "", chauffeur: "", site: "", client: "", collaborateur: "", filtre: "", note: "" }],
  categories: [{ cod: "CA TOTAL", note: "" }, { cod: "GO", note: "" }],
  catalogue: CATALOGUE,
  ...extra,
});
```

- [ ] **Step 2: Écrire le test qui échoue**

`tests/hypotheses.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, etatCaTotal } from "./aide/moteur.mjs";

const ok = { id: "c1", type: "mensuel", ds: "tms", date: "date_chgt", porte_sur: ["tms.montant"] };
const ko = { id: "c2", type: "mensuel", ds: "tms", porte_sur: ["tms.montant"] };
const mem = (contredit = []) => ({ logiciels: [], comptes: [], colonnes: [{ id: "montant_ht", desc: "Montant HT", confirme_chez: ["autre"], contredit_chez: contredit }] });
const hyp = st => chargerMoteur(st).run("listeHypotheses()")[0];

test("déduction de l'agent seule : confiance basse", () => {
  const h = hyp(etatCaTotal({ source: "agent", preuves: ["somme 1 000"], question: "Le montant est-il HT ?" }));
  assert.equal(h.cible, "tms.montant"); assert.equal(h.confiance, "basse"); assert.equal(h.conflit, false);
  assert.equal(h.question, "Le montant est-il HT ?");
});

test("un contrôle concordant donne moyenne", () => {
  assert.equal(hyp(etatCaTotal({ source: "agent" }, { controles: [ok] })).confiance, "moyenne");
});

test("mémoire confirmée et contrôle concordant donnent haute", () => {
  assert.equal(hyp(etatCaTotal({ source: "memoire:colonnes/montant_ht" }, { controles: [ok], memoire: mem() })).confiance, "haute");
});

test("une mémoire contredite plafonne à moyenne", () => {
  assert.equal(hyp(etatCaTotal({ source: "memoire:colonnes/montant_ht" }, { controles: [ok], memoire: mem(["x"]) })).confiance, "moyenne");
});

test("un contrôle en écart donne basse avec conflit", () => {
  const h = hyp(etatCaTotal({ source: "agent" }, { controles: [ok, ko] }));
  assert.equal(h.confiance, "basse"); assert.equal(h.conflit, true);
});

test("une hypothèse validée est confirmée", () => {
  assert.equal(hyp(etatCaTotal({ source: "agent", valide: true }, { controles: [ko] })).confiance, "confirme");
});

test("une entrée de mémoire introuvable est une erreur de spec", () => {
  const f = chargerMoteur(etatCaTotal({ source: "memoire:colonnes/inconnue" })).run("checkSpec()");
  assert.ok(f.some(x => x.niv === "erreur" && /mémoire introuvable/.test(x.msg)));
});

test("le badge d'une mesure suit la pire hypothèse de ses flux", () => {
  const { run } = chargerMoteur(etatCaTotal({ source: "agent" }));
  assert.deepEqual(run(`badgeMesure(CAT().list.find(m=>m.name==="CA Réel"))`), { niveau: "rouge", pire: "basse", n: 1 });
  assert.equal(run(`badgeMesure(CAT().list.find(m=>m.name==="Gazole"))`), null);
});

test("summary compte les hypothèses par confiance", () => {
  assert.deepEqual(chargerMoteur(etatCaTotal({ source: "agent" })).run("summary().hypotheses"), { confirme: 0, haute: 0, moyenne: 0, basse: 1 });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npm test`
Expected: FAIL, `listeHypotheses is not defined`.

- [ ] **Step 4: Implémenter `core/hypotheses.js`**

```js
/* ───────────── hypothèses : collecte, confiance, dépendances des mesures ───────────── */
const CONF_RANG={confirme:0,haute:1,moyenne:2,basse:3};
const CONF_LIB={confirme:"Confirmé",haute:"Confiance haute",moyenne:"Confiance moyenne",basse:"Confiance basse"};
function entreeMemoire(source){ const m=/^memoire:([a-z]+)\/(.+)$/.exec(String(source||"")); if(!m) return null; return ((S.st.memoire||{})[m[1]]||[]).find(e=>String(e.id)===m[2])||null; }
function confianceDe(h){
  if(h.valide) return {confiance:"confirme",conflit:false,raisons:["confirmé par l'adhérent"]};
  const raisons=[]; const deMem=h.source.startsWith("memoire:"); const e=deMem?entreeMemoire(h.source):null;
  if(deMem&&!e) raisons.push(`entrée de mémoire introuvable : ${h.source}`);
  const mem=!!(e&&(e.confirme_chez||[]).length), contredite=!!(e&&(e.contredit_chez||[]).length);
  if(mem) raisons.push(`mémoire : confirmé chez ${e.confirme_chez.join(", ")}`);
  if(contredite) raisons.push(`mémoire : contredit chez ${e.contredit_chez.join(", ")}`);
  const ctrls=CTRL().filter(r=>r.porte_sur.includes(h.cible)); ctrls.forEach(r=>raisons.push(`contrôle ${r.id} (${r.statut}) : ${r.msg}`));
  const ok=ctrls.some(r=>r.statut==="ok"), conflit=h.refuse||ctrls.some(r=>r.statut==="ecart");
  if(h.refuse) raisons.push("démenti par l'adhérent");
  let confiance=conflit?"basse":mem&&ok?"haute":mem||ok?"moyenne":"basse";
  if(contredite&&confiance==="haute") confiance="moyenne";
  return {confiance,conflit,raisons};
}
function listeHypotheses(){ return cached("hyp",()=>{
  const out=[]; const push=(cible,fichier,libelle,h)=>{ if(h) out.push({cible,fichier,libelle,question:h.question||"",source:String(h.source||"agent"),preuves:h.preuves||[],valide:!!h.valide,refuse:!!h.refuse}); };
  S.st.datasets.forEach(d=>{ const f=`spec/datasets/${d.id}.yml`;
    d.columns.forEach(c=>push(`${d.id}.${c.name}`,f,`${d.id}.${c.name} : ${c.desc||"sens à confirmer"}`,c.hypothese));
    d.rules.forEach((r,i)=>push(`${d.id}#regle${i+1}`,f,`${d.id} : ${r.text||r.sql}`,r.hypothese)); });
  S.st.flux.forEach(fl=>{ const f=`spec/flux/${fl.id}.yml`;
    push(`flux:${fl.id}`,f,`${fl.ds} → ${fluxLabel(fl)}`,fl.hypothese);
    (fl.rules||[]).forEach(r=>push(`flux:${fl.id}#${r.prefix}`,f,`${fl.ds} : comptes ${r.prefix}… → ${r.cod}`,r.hypothese)); });
  S.st.gold.filter(t=>t.kind==="dim"&&!t.generated).forEach(t=>t.columns.forEach(c=>push(`${t.id}.${c.name}`,`spec/dims/${t.id}.yml`,`${t.id}.${c.name}`,c.hypothese)));
  out.forEach(h=>Object.assign(h,confianceDe(h)));
  return out;
}); }
function ciblesFlux(fl,cods){
  const t=[`flux:${fl.id}`]; const d=DS(fl.ds);
  if(fl.codMode==="regles") (fl.rules||[]).filter(r=>cods.has(r.cod)).forEach(r=>t.push(`flux:${fl.id}#${r.prefix}`));
  if(d){ const cols=new Set(d.columns.map(c=>c.name));
    const txt=[fl.valeur,fl.date,fl.vehicule,fl.chauffeur,fl.site,fl.client,fl.collaborateur,fl.codCol,fl.libCol,fl.filtre].filter(Boolean).join(" ");
    (txt.match(/\b[a-z_][a-z0-9_]*\b/gi)||[]).forEach(w=>{ const n=w.replace(/_libelle$/,""); if(cols.has(n)) t.push(`${d.id}.${n}`); });
    d.rules.forEach((r,i)=>t.push(`${d.id}#regle${i+1}`)); }
  return t;
}
function couplesMesure(m,seen){
  const out=new Set(); if(!m||seen.has(m.id)) return out; seen.add(m.id); const rows=buildFaits().rows;
  measureNeeds(m).forEach(n=>{ let rs=rows.filter(r=>!n.field||!(n.field in r)||r[n.field]!=null);
    n.filters.forEach(fl=>{ const vs=new Set(fl.vals); const get=r=>fl.f==="%COD_CATEGORIE"?r.cod:r.lib; rs=rs.filter(r=>fl.op==="-="?!vs.has(get(r)):vs.has(get(r))); });
    rs.forEach(r=>out.add(r.flux+"\u0001"+r.cod)); });
  (m.refs||[]).forEach(x=>couplesMesure(CAT().resolve(x),seen).forEach(k=>out.add(k)));
  return out;
}
function hypothesesMesure(m){ return cached("hypm:"+m.id,()=>{
  const parFlux=new Map(); couplesMesure(m,new Set()).forEach(k=>{ const [f,c]=k.split("\u0001"); if(!parFlux.has(f)) parFlux.set(f,new Set()); parFlux.get(f).add(c); });
  const cibles=new Set(); parFlux.forEach((cods,fid)=>{ const fl=FX(fid); if(fl) ciblesFlux(fl,cods).forEach(t=>cibles.add(t)); });
  return listeHypotheses().filter(h=>cibles.has(h.cible));
}); }
function badgeMesure(m){
  const hs=hypothesesMesure(m); if(!hs.length) return null;
  const pire=hs.reduce((a,h)=>CONF_RANG[h.confiance]>CONF_RANG[a]?h.confiance:a,"confirme");
  return {niveau:pire==="basse"?"rouge":pire==="moyenne"?"orange":"vert",pire,n:hs.length};
}
```

- [ ] **Step 5: Brancher le contrôle et le résumé**

`core/check.js`, juste après la ligne `CTRL().forEach(...)` ajoutée à la Task 7 :

```js
  listeHypotheses().forEach(h=>{ if(h.source.startsWith("memoire:")&&!entreeMemoire(h.source)) add("erreur",h.fichier,`${h.cible} : entrée de mémoire introuvable (${h.source})`); });
```

`core/check.js`, remplacer la fonction `summary` par :

```js
function summary(){
  const mc=measureCounts(); const open=[]; S.st.datasets.forEach(d=>d.questions.forEach(q=>{ if(!q.done) open.push(q); }));
  const hyp={confirme:0,haute:0,moyenne:0,basse:0}; listeHypotheses().forEach(h=>hyp[h.confiance]++);
  return {mesures:mc,questionsOuvertes:open.length,lignesFaits:buildFaits().rows.length,flux:S.st.flux.length,datasets:S.st.datasets.length,hypotheses:hyp};
}
```

`tools/atelier.mjs` :
- `const CORE = ["core/engine.js", "core/model.js", "core/check.js", "core/controles.js", "core/hypotheses.js"];`
- dans `loadState`, colonnes de dataset : ajouter `hypothese: c.hypothese || null` à l'objet de chaque colonne (après `decimalComma: !!c.decimalComma`).
- colonnes de dimension : `t.columns = (t.columns || []).map(c => ({ name: String(c.name), type: c.type || "text", desc: c.desc || "", map: c.map || {}, hypothese: c.hypothese || null }));`
- après la ligne `const controles = …` :

```js
  const memoire = lireMemoire(cheminMemoire(ROOT));
  const nonLus = societes.flatMap(s => { const f = P("data/bronze", s.id, "_non_lus.json"); return exists(f) ? JSON.parse(fs.readFileSync(f, "utf8")).map(x => ({ societe: s.id, ...x })) : []; });
```

- dans l'objet `state`, ajouter `memoire, nonLus` après `controles`.
- dans `cmdCheck`, après la ligne `console.log(\`Mesures : …\`)` :

```js
    const h = s.hypotheses; console.log(`Hypothèses : ${h.basse} basses, ${h.moyenne} moyennes, ${h.haute} hautes, ${h.confirme} confirmées`);
```

- [ ] **Step 6: Vérifier le succès**

Run: `npm test`
Expected: PASS, 38 tests.

- [ ] **Step 7: Point de contrôle**

Run: `npm run check`
Expected : `0 erreur(s)` et `Hypothèses : 0 basses, 0 moyennes, 0 hautes, 0 confirmées`.

---

### Task 9: Fiche de séance

**Files:**
- Modify: `core/hypotheses.js` (`ficheSeanceMd`), `core/model.js` (`buildFiles`)
- Test: `tests/fiche.test.mjs`

**Interfaces:**
- Consumes: `listeHypotheses`, `hypothesesMesure`, `CTRL`, `CAT`, `S.st.nonLus`.
- Produces: `ficheSeanceMd(): string`, écrit par `npm run build` dans `generated/fiche_seance.md`.

- [ ] **Step 1: Écrire le test qui échoue**

`tests/fiche.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, etatCaTotal } from "./aide/moteur.mjs";

test("la fiche classe les hypothèses à valider et liste les fichiers non lus", () => {
  const md = chargerMoteur(etatCaTotal({ source: "agent", preuves: ["somme 2025 : 1 000 €"], question: "Le montant des ordres est-il HT ?" },
    { nonLus: [{ societe: "s1", fichier: "Péage/export.pdf", raison: "format .pdf non pris en charge" }] })).run("ficheSeanceMd()");
  assert.match(md, /## 1\. Le montant des ordres est-il HT \?/);
  assert.match(md, /Mesures concernées \(1\) : CA Réel/);
  assert.match(md, /Preuve : somme 2025 : 1 000 €/);
  assert.match(md, /Péage\/export\.pdf/);
});

test("la fiche exclut les hypothèses confirmées", () => {
  assert.match(chargerMoteur(etatCaTotal({ source: "agent", valide: true })).run("ficheSeanceMd()"), /0 point à valider/);
});

test("le build produit la fiche", () => {
  assert.ok(chargerMoteur(etatCaTotal({ source: "agent" })).run("buildFiles().map(f=>f.path)").includes("fiche_seance.md"));
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test`
Expected: FAIL, `ficheSeanceMd is not defined`.

- [ ] **Step 3: Implémenter**

À la fin de `core/hypotheses.js` :

```js
function ficheSeanceMd(){
  const parCible=new Map(listeHypotheses().filter(h=>h.confiance!=="confirme"&&h.confiance!=="haute").map(h=>[h.cible,{h,mesures:[]}]));
  CAT().list.forEach(m=>hypothesesMesure(m).forEach(h=>{ const x=parCible.get(h.cible); if(x) x.mesures.push(m.name); }));
  const items=[...parCible.values()].sort((a,b)=>b.mesures.length-a.mesures.length||CONF_RANG[b.h.confiance]-CONF_RANG[a.h.confiance]);
  const L=[`# Fiche de séance — ${S.st.adherent}`,"",`${items.length} point${items.length>1?"s":""} à valider avec l'adhérent, du plus impactant au moins impactant.`,""];
  items.forEach((x,i)=>{ const h=x.h;
    L.push(`## ${i+1}. ${h.question||h.libelle}`,"",`- ${CONF_LIB[h.confiance]}${h.conflit?" · sources en désaccord":""} · \`${h.fichier}\` · \`${h.cible}\``,
      `- Mesures concernées (${x.mesures.length}) : ${x.mesures.slice(0,6).join(", ")||"aucune pour l'instant"}${x.mesures.length>6?"…":""}`);
    h.preuves.forEach(p=>L.push(`- Preuve : ${p}`)); h.raisons.forEach(r=>L.push(`- ${r}`)); L.push(""); });
  const nl=S.st.nonLus||[]; if(nl.length){ L.push("## Fichiers non lus",""); nl.forEach(x=>L.push(`- \`${x.fichier}\`${x.feuille?` (feuille ${x.feuille})`:""} : ${x.raison}`)); L.push(""); }
  const ec=CTRL().filter(r=>r.statut!=="ok"); if(ec.length){ L.push("## Contrôles en écart",""); ec.forEach(r=>L.push(`- ${r.id} ${r.libelle} : ${r.msg}`)); L.push(""); }
  return L.join("\n");
}
```

`core/model.js`, dans `buildFiles`, après la ligne `F.push({group:"Documentation",path:"docs/seance.md",body:sessionMd()});` :

```js
  F.push({group:"Documentation",path:"fiche_seance.md",body:ficheSeanceMd()});
```

- [ ] **Step 4: Vérifier le succès**

Run: `npm test`
Expected: PASS, 41 tests.

- [ ] **Step 5: Point de contrôle**

Run: `npm run check && npm run build`
Expected : `0 erreur(s)` ; la liste des fichiers écrits contient `generated/fiche_seance.md`.

---

### Task 10: Badges dans la prévisualisation

**Files:**
- Modify: `viewer/ui.js` (`renderMes`), `viewer/dash.js` (`mTitle`), `viewer/style.css`

**Interfaces:**
- Consumes: `badgeMesure`, `hypothesesMesure`, `CONF_LIB` (Task 8), servis au navigateur par `CORE`.

- [ ] **Step 1: Badge et détail dans la liste des mesures**

`viewer/ui.js`, dans `renderMes`, remplacer :

```js
  <div class="mlist">${cat.list.filter(keep).map(m=>{ const c=cov.get(m.id); const r=ev(m); const nb=m.issues.filter(i=>i.sev==="bad").length;
    return `<details class="mrow"><summary><span class="mn">${esc(m.name)}</span><span class="per">${esc(m.period)}</span>${nb?`<span class="nb-iss">${nb} anomalie${nb>1?"s":""}</span>`:""}<span class="ms ms-${c.s}">${ST_M[c.s]}</span>
```

par :

```js
  <div class="mlist">${cat.list.filter(keep).map(m=>{ const c=cov.get(m.id); const r=ev(m); const nb=m.issues.filter(i=>i.sev==="bad").length; const hb=badgeMesure(m);
    return `<details class="mrow"><summary><span class="mn">${esc(m.name)}</span><span class="per">${esc(m.period)}</span>${nb?`<span class="nb-iss">${nb} anomalie${nb>1?"s":""}</span>`:""}${hb?`<span class="hb hb-${hb.niveau}" title="${esc(CONF_LIB[hb.pire])}">${hb.n} hyp.</span>`:""}<span class="ms ms-${c.s}">${ST_M[c.s]}</span>
```

et remplacer `<div class="mbody"><div>${m.issues.length?` par :

```js
<div class="mbody"><div>${hb?`<h5>Hypothèses</h5><ul class="iss">${hypothesesMesure(m).map(h=>`<li class="${h.confiance==="basse"?"bad":""}">${esc(h.question||h.libelle)} · ${esc(CONF_LIB[h.confiance])}${h.preuves.concat(h.raisons).map(p=>`<br><span class="note">${esc(p)}</span>`).join("")}</li>`).join("")}</ul>`:""}${m.issues.length?`
```

- [ ] **Step 2: Infobulle des indicateurs du dashboard**

`viewer/dash.js`, remplacer la fonction `mTitle` par :

```js
function mTitle(name){ const m=dm(name); const real=m?m.name:"absente"; const st=m&&!RECON.has(name)?(COVD().get(m.id)?.s):null; const cm=m&&!RECON.has(name)?CAT().resolve(m.name):null; const hb=cm?badgeMesure(cm):null; return `Mesure : ${real}${RECON.has(name)?" (reconstituée, hors catalogue)":""}${st?" · "+ST_M[st]:""}${hb?" · "+CONF_LIB[hb.pire]:""}`; }
```

- [ ] **Step 3: Styles**

À la fin de `viewer/style.css` :

```css
.hb{font-size:11px;font-weight:600;border:1px solid currentColor;border-radius:3px;padding:0 5px;white-space:nowrap}
.hb-vert{color:var(--ok)}
.hb-orange{color:var(--warn)}
.hb-rouge{color:var(--bad)}
```

- [ ] **Step 4: Vérifier dans le navigateur**

Run: `npm run serve` (en arrière-plan), puis ouvrir http://localhost:4321, onglet « Éléments principaux ».
Expected : la page se charge sans erreur dans la console. Sans hypothèse dans la spec, aucune mesure n'a de badge. Le badge sera vérifié avec des données à la Task 14.

- [ ] **Step 5: Point de contrôle**

Run: `npm test && npm run check`
Expected: PASS, puis `0 erreur(s)`.

---

### Task 11: Apprentissage après séance

**Files:**
- Create: `tools/apprendre.mjs`
- Modify: `tools/atelier.mjs` (commande `apprendre`), `package.json`
- Test: `tests/apprendre.test.mjs`

**Interfaces:**
- Consumes: `lireMemoire`, `ecrireMemoire`, `cheminMemoire` (Task 4) ; l'état de `loadState` (datasets avec `columns[].hypothese`, flux avec `rules[].hypothese`).
- Produces: `apprendre(state, memoire): { comptes, colonnes, faits: string[] }`, sans modifier `memoire`.

- [ ] **Step 1: Écrire le test qui échoue**

`tests/apprendre.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { apprendre } from "../tools/apprendre.mjs";

const etat = (hypothese, cod = "CA TPS") => ({ datasets: [{ id: "bal", societe: "etc", columns: [] }], flux: [{ id: "f1", ds: "bal", rules: [{ prefix: "706", cod, lib: "CA transport", hypothese }] }] });
const vide = { comptes: [], colonnes: [] };
const existant = () => ({ comptes: [{ id: "706", cod: "CA TPS", lib: "CA transport", confirme_chez: ["autre"], contredit_chez: [] }], colonnes: [] });

test("une règle validée entre dans la mémoire des comptes", () => {
  assert.deepEqual(apprendre(etat({ source: "agent", valide: true }), vide).comptes,
    [{ id: "706", cod: "CA TPS", lib: "CA transport", confirme_chez: ["etc"], contredit_chez: [] }]);
});

test("relancer ne duplique pas la confirmation", () => {
  const une = apprendre(etat({ valide: true }), vide);
  assert.deepEqual(apprendre(etat({ valide: true }), une).comptes[0].confirme_chez, ["etc"]);
});

test("un démenti contredit l'entrée existante", () => {
  assert.deepEqual(apprendre(etat({ refuse: true }), existant()).comptes[0].contredit_chez, ["etc"]);
});

test("un autre code validé contredit l'entrée sans la changer", () => {
  const e = apprendre(etat({ valide: true }, "CA LOG"), existant()).comptes[0];
  assert.deepEqual([e.cod, e.contredit_chez], ["CA TPS", ["etc"]]);
});

test("une hypothèse non tranchée est ignorée, la mémoire d'entrée n'est pas modifiée", () => {
  const m = existant();
  assert.equal(apprendre(etat({ source: "agent" }), m).faits.length, 0);
  assert.deepEqual(m, existant());
});

test("une colonne validée entre dans la mémoire des colonnes", () => {
  const st = { datasets: [{ id: "tms", societe: "etc", columns: [{ name: "montant_ht", desc: "Montant HT", type: "decimal", hypothese: { valide: true } }] }], flux: [] };
  assert.deepEqual(apprendre(st, vide).colonnes, [{ id: "montant_ht", desc: "Montant HT", type: "decimal", confirme_chez: ["etc"], contredit_chez: [] }]);
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test`
Expected: FAIL, module `apprendre.mjs` introuvable.

- [ ] **Step 3: Implémenter**

`tools/apprendre.mjs` :

```js
const ajouter = (liste, v) => { if (!liste.includes(v)) liste.push(v); };

export function apprendre(state, memoire) {
  const comptes = structuredClone(memoire.comptes || []), colonnes = structuredClone(memoire.colonnes || []), faits = [];
  const noter = (liste, cle, h, societe, creer, pareil = () => true) => {
    if (!h || !(h.valide || h.refuse) || !societe) return;
    let e = liste.find(x => String(x.id) === cle);
    if (!e) { if (h.refuse) return; e = { id: cle, ...creer(), confirme_chez: [], contredit_chez: [] }; liste.push(e); }
    const confirme = h.valide && pareil(e);
    ajouter(confirme ? e.confirme_chez : e.contredit_chez, societe);
    faits.push(`${confirme ? "confirmé" : "contredit"} : ${cle} chez ${societe}`);
  };
  const societeDe = ds => state.datasets.find(d => d.id === ds)?.societe;
  state.flux.forEach(fl => (fl.rules || []).forEach(r =>
    noter(comptes, String(r.prefix), r.hypothese, societeDe(fl.ds), () => ({ cod: r.cod, lib: r.lib || r.cod }), e => e.cod === r.cod)));
  state.datasets.forEach(d => (d.columns || []).forEach(c =>
    noter(colonnes, c.name, c.hypothese, d.societe, () => ({ desc: c.desc, type: c.type }))));
  return { comptes, colonnes, faits };
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npm test`
Expected: PASS, 47 tests.

- [ ] **Step 5: Brancher la commande**

`tools/atelier.mjs`, import : `import { apprendre } from "./apprendre.mjs";`. Avant `cmdNormaliser` :

```js
function cmdApprendre() {
  const { state } = evaluate(); const memoire = lireMemoire(cheminMemoire(ROOT));
  if (!memoire.existe) throw new Error(`Mémoire introuvable : ${memoire.dir}`);
  const { comptes, colonnes, faits } = apprendre(state, memoire);
  ecrireMemoire({ ...memoire, comptes, colonnes }, ["comptes", "colonnes"]);
  console.log(faits.length ? faits.join("\n") : "Aucune hypothèse tranchée à apprendre.");
}
```

Ajouter `apprendre: cmdApprendre` à `CMDS`, `| apprendre` à l'usage ; script : `"apprendre": "node tools/atelier.mjs apprendre"`.

- [ ] **Step 6: Point de contrôle**

Run: `npm test && npm run check && npm run apprendre`
Expected : PASS, `0 erreur(s)`, puis `Aucune hypothèse tranchée à apprendre.`

---

### Task 12: Évaluation contre un corrigé

**Files:**
- Create: `tools/evaluer.mjs`
- Modify: `tools/atelier.mjs` (commande `evaluer`), `package.json`
- Test: `tests/evaluer.test.mjs`

**Interfaces:**
- Produces: `comparer(spec: { flux, datasets }, corrige: { flux, datasets }): { flux: Ecart, codes: Ecart }` avec `Ecart = { attendus, trouves, taux, manquants: string[], en_plus: string[] }`. Signatures : flux à règles `ds|prefixe|cod`, flux fixe `ds|valeur|cod`, flux colonne `ds|codCol|*` ; décodage `dataset.colonne.code`.

- [ ] **Step 1: Écrire le test qui échoue**

`tests/evaluer.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { comparer } from "../tools/evaluer.mjs";

test("comparer compte les flux et les décodages du corrigé retrouvés", () => {
  const corrige = {
    flux: [{ ds: "bal", codMode: "regles", rules: [{ prefix: "7061", cod: "CA TPS" }, { prefix: "6061", cod: "GO" }] }, { ds: "tele", codMode: "fixe", valeur: "distance_km", cod: "DISTANCE" }],
    datasets: [{ id: "tms", columns: [{ name: "statut", codes: { L: "Livrée", A: "Annulée" } }] }],
  };
  const spec = {
    flux: [{ ds: "bal", codMode: "regles", rules: [{ prefix: "7061", cod: "CA TPS" }] }, { ds: "tele", codMode: "fixe", valeur: "distance_km", cod: "DISTANCE" }],
    datasets: [{ id: "tms", columns: [{ name: "statut", codes: { L: "Livré" } }] }],
  };
  const r = comparer(spec, corrige);
  assert.deepEqual(r.flux, { attendus: 3, trouves: 2, taux: 2 / 3, manquants: ["bal|6061|GO"], en_plus: [] });
  assert.deepEqual(r.codes, { attendus: 2, trouves: 1, taux: 0.5, manquants: ["tms.statut.A"], en_plus: [] });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test`
Expected: FAIL, module `evaluer.mjs` introuvable.

- [ ] **Step 3: Implémenter**

`tools/evaluer.mjs` :

```js
function sigFlux(flux) {
  const s = new Set();
  (flux || []).forEach(f => {
    if (f.codMode === "regles") (f.rules || []).forEach(r => s.add(`${f.ds}|${r.prefix}|${r.cod}`));
    else if (f.codMode === "colonne") s.add(`${f.ds}|${f.codCol}|*`);
    else s.add(`${f.ds}|${f.valeur}|${f.cod}`);
  });
  return s;
}

function sigCodes(datasets) {
  const s = new Set();
  (datasets || []).forEach(d => (d.columns || []).forEach(c => Object.keys(c.codes || {}).forEach(k => s.add(`${d.id}.${c.name}.${k}`))));
  return s;
}

function ecart(obtenu, attendu) {
  const trouves = [...attendu].filter(x => obtenu.has(x)).length;
  return { attendus: attendu.size, trouves, taux: attendu.size ? trouves / attendu.size : 1, manquants: [...attendu].filter(x => !obtenu.has(x)), en_plus: [...obtenu].filter(x => !attendu.has(x)) };
}

export function comparer(spec, corrige) {
  return { flux: ecart(sigFlux(spec.flux), sigFlux(corrige.flux)), codes: ecart(sigCodes(spec.datasets), sigCodes(corrige.datasets)) };
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npm test`
Expected: PASS, 48 tests.

- [ ] **Step 5: Brancher la commande**

`tools/atelier.mjs`, import : `import { comparer } from "./evaluer.mjs";`. Avant `cmdNormaliser` :

```js
function cmdEvaluer(args) {
  const dir = opt(args, "corrige"); if (!dir) throw new Error("Usage : npm run evaluer -- --corrige <dossier spec>");
  const lire = sous => listYaml(path.resolve(ROOT, dir, sous)).map(f => readYaml(f, {}));
  const { state } = evaluate();
  const r = comparer(state, { flux: lire("flux"), datasets: lire("datasets") });
  [["Flux", r.flux], ["Décodages", r.codes]].forEach(([n, x]) => {
    console.log(`${C.bold}${n}${C.reset} : ${x.trouves}/${x.attendus} retrouvés (${Math.round(x.taux * 100)} %)`);
    if (x.manquants.length) console.log(`  manquants : ${x.manquants.join(", ")}`);
    if (x.en_plus.length) console.log(`  en plus : ${x.en_plus.join(", ")}`);
  });
}
```

Ajouter `evaluer: cmdEvaluer` à `CMDS`, `| evaluer --corrige <dossier>` à l'usage ; script : `"evaluer": "node tools/atelier.mjs evaluer"`.

- [ ] **Step 6: Point de contrôle**

Run: `npm test && npm run check && npm run evaluer -- --corrige exemple/spec`
Expected : PASS, `0 erreur(s)`, puis `Flux : 0/… retrouvés (0 %)` (la spec Euro Trans n'a pas encore de flux).

---

### Task 13: Commande maquette et procédures de l'agent

**Files:**
- Modify: `tools/atelier.mjs` (commande `maquette`), `package.json`
- Create: `.cursor/commands/maquette.md`, `.cursor/commands/apprendre.md`
- Modify: `AGENTS.md`, `.cursor/rules/data-builder.mdc`, `README.md`, `docs/superpowers/specs/2026-11-06-maquette-avant-seance-design.md`

**Interfaces:**
- Consumes: `cmdCollecte`, `cmdNormaliser`, `cmdProfile`, `cmdCheck`.

- [ ] **Step 1: Commande `maquette`**

`tools/atelier.mjs`, avant `cmdNormaliser` :

```js
async function cmdMaquette(args) {
  const soc = opt(args, "societe"); if (!soc) throw new Error("Usage : npm run maquette -- --societe <id> [--sans-collecte]");
  const projet = readYaml(P("spec/projet.yml"), {});
  if (!(projet.societes || []).some(s => String(s.id) === soc)) throw new Error(`Déclare d'abord la société « ${soc} » dans spec/projet.yml.`);
  if (!args.includes("--sans-collecte")) cmdCollecte(args);
  await cmdNormaliser(args);
  const bronze = P("data/bronze", soc);
  fs.readdirSync(bronze).filter(f => f.endsWith(".csv")).sort().forEach(f => {
    if (!exists(P("spec/datasets", f.replace(/\.csv$/, ".yml")))) cmdProfile([rel(path.join(bronze, f)), "--societe", soc]);
  });
  console.log(""); cmdCheck([]);
}
```

Ajouter `maquette: cmdMaquette` à `CMDS`, `| maquette --societe <id> [--sans-collecte]` à l'usage ; script : `"maquette": "node tools/atelier.mjs maquette"`.

Run: `npm run maquette -- --societe eurotranschanet --sans-collecte`
Expected : 18 CSV réécrits, aucun nouveau profil (les datasets existent déjà depuis la Task 5), puis le résumé du check avec `0 erreur(s)`.

- [ ] **Step 2: Procédure `/maquette`**

`.cursor/commands/maquette.md` :

```markdown
# Maquette d'avant-séance

Produit la maquette du dashboard d'un adhérent sans lui. Chaque déduction est une hypothèse tracée ; la séance ne sert plus qu'à valider `generated/fiche_seance.md`.

Argument : l'id de société (ex. `eurotranschanet`), suivi de `--sans-collecte` si les fichiers sont déjà dans `data/raw/<id>/`.

1. **Prérequis.** La société est déclarée dans `spec/projet.yml`. Sans `--sans-collecte`, vérifie la présence de `.env` avec `test -f .env` ; ne l'ouvre jamais. S'il manque, demande à Michel de le créer depuis `.env.exemple`.
2. **Collecte et lecture.** Lance `npm run maquette -- --societe <id> [--sans-collecte]`. Les fichiers non lus et les « valeurs hors recette » iront dans la fiche : ne les devine pas. Un export Sage ou autre non reconnu se traite en ajoutant une recette à `logiciels.yml` de la mémoire, sur demande de Michel.
3. **Datasets.** Pour chaque fichier de `spec/datasets/` :
   - renseigne `desc`, `grain`, `role` ; corrige `type` si le profil se trompe ; `pii: true` pour noms, prénoms, téléphones, adresses, e-mails, numéros de carte ;
   - chaque sens déduit (montant et son unité, HT ou TTC, `codes`, règle d'exclusion) reçoit un bloc `hypothese` ;
   - cherche d'abord dans la mémoire (`$TREDUNION_MEMOIRE`, par défaut `../tredunion-memoire`) : `colonnes.yml` par nom de colonne, `comptes.yml` par préfixe de compte. Si une entrée s'applique : `source: memoire:<fichier>/<id>`. Sinon : `source: agent` ;
   - `preuves` : des faits mesurés (sommes, nombres de lignes, % de vides, taux de rapprochement). Jamais une valeur d'une colonne `pii` ;
   - `question` : ce qu'il faudra demander à l'adhérent, en langage d'exploitant ;
   - supprime les questions automatiques auxquelles une hypothèse répond, garde les autres.
4. **Flux.** Lance `npm run couverture`. Pour les catégories qui débloquent le plus de mesures, écris les flux `spec/flux/fN.yml` avec un bloc `hypothese` ; en `codMode: regles`, un bloc par règle de compte. Codes pris dans `spec/referentiel.yml` uniquement.
5. **Contrôles.** Écris `spec/controles.yml`, au moins un contrôle par flux :
   - `ecart_somme` : un même montant vu par deux sources (TMS contre comptes 70, carburant contre comptes de gazole, paie contre comptes 641 et 645) ;
   - `rapprochement` : identifiants retrouvés d'une source à l'autre (immatriculations, matricules) ;
   - `mensuel` : la source a une date par ligne.
   Renseigne `porte_sur` avec les cibles concernées (`dataset.colonne`, `flux:fN`, `flux:fN#prefixe`).
6. **Sources sans date par ligne.** Une balance annuelle n'alimente pas FAITS : pas de répartition par mois. Un contrôle `mensuel` et une hypothèse ou une question le signalent.
7. **Vérifier.** `npm run check` (0 erreur), `npm run controles`, puis `npm run build`. Ajoute l'entrée de `spec/journal.yml`.
8. **Résumer à Michel en 4 lignes** : mesures alimentées avant → après ; hypothèses basses, moyennes, hautes ; contrôles en écart ; chemin `generated/fiche_seance.md`.

Ne pose aucune question à Michel pendant la maquette, sauf blocage (fichier manquant, `.env` absent).
```

- [ ] **Step 3: Procédure `/apprendre`**

`.cursor/commands/apprendre.md` :

```markdown
# Apprendre de la séance

Après la séance, fait entrer dans la mémoire commune ce que l'adhérent a confirmé ou démenti.

1. Pour chaque point de `generated/fiche_seance.md` tranché en séance, passe l'hypothèse à `valide: true` (confirmée) ou `refuse: true` (démentie). Si elle est démentie, corrige la spec selon la réponse, avec une nouvelle hypothèse `valide: true`.
2. `npm run check`.
3. `npm run apprendre` : met à jour `comptes.yml` et `colonnes.yml` de la mémoire et affiche ce qui a été confirmé ou contredit.
4. Ajoute l'entrée de `spec/journal.yml` et résume en deux lignes.
```

- [ ] **Step 4: Règles de l'agent**

`.cursor/rules/data-builder.mdc` : garder l'en-tête du fichier (front matter) et remplacer le corps par :

```markdown
Tu es le lead dev data builder décrit dans AGENTS.md : lis-le avant toute action dans ce dépôt.

- Deux modes. En maquette (`/maquette`, sans l'adhérent) : tu déduis, et chaque déduction va dans un bloc `hypothese`. En séance (visio) : une question à la fois, présentée, puis tu attends la réponse de Michel avant de modifier quoi que ce soit.
- Tu écris dans `spec/`. `data/` et `generated/` ne sont écrits que par les commandes npm. `core/`, `viewer/`, `tools/` seulement sur demande explicite.
- Après chaque modification : `npm run check`, puis une entrée dans `spec/journal.yml`, puis l'effet mesuré en deux lignes (lignes FAITS, mesures alimentées avant → après).
- Aucune hypothèse cachée : pas de déduction sans bloc `hypothese` ; en séance, un doute devient une question dans le dataset concerné.
- Pas de valeur en clair pour les colonnes `pii: true`, ni dans le chat, ni dans les preuves.
- Ne lis jamais `.env`.
- Réponses courtes : l'adhérent est en visio.
```

`AGENTS.md` :
- section « Règles », remplacer la puce « **N'invente aucun sens métier.** … » par :

```markdown
- **Aucune hypothèse cachée.** Un code, une unité, un HT/TTC, une règle d'exclusion viennent de l'adhérent, de la mémoire commune ou des données. En séance, un doute devient une question. En maquette, une déduction s'écrit dans un bloc `hypothese` (source, preuves, question) : pas de déduction sans bloc.
```

- remplacer la puce « **Ne touche jamais à `data/`** ni à `generated/`. … » par :

```markdown
- **N'écris jamais à la main dans `data/`** ni dans `generated/` : seules les commandes `npm run collecte`, `normaliser`, `maquette` et `build` y écrivent. Ne lis jamais `.env`. Ne modifie `core/`, `viewer/`, `tools/` que si Michel le demande.
```

- ajouter avant « ## Commandes » :

````markdown
## Mode maquette (avant séance)

Sans l'adhérent, `/maquette <societe>` collecte le SFTP, lit les exports, documente les datasets et écrit flux et contrôles. Chaque déduction porte un bloc `hypothese`. La confiance n'est pas écrite : l'outil la calcule à partir de la mémoire et des contrôles. La séance valide ensuite `generated/fiche_seance.md`, et `/apprendre` fait entrer les réponses dans la mémoire commune.

### Bloc `hypothese`

Sur une colonne, une règle silver, un flux, une règle de compte d'un flux, ou une colonne de dimension :

```yaml
hypothese:
  source: agent              # agent | memoire:<fichier>/<id> (ex. memoire:comptes/706)
  preuves:                   # faits mesurés, jamais de valeur pii
    - "Somme 2025 : 5,86 M€ sur 10 596 ordres"
  question: "Le montant d'un ordre Akanea est-il hors taxe ?"
  valide: false              # true : confirmé par l'adhérent
  refuse: false              # true : démenti par l'adhérent
```

Confiance calculée : haute si la mémoire et un contrôle concordent ; moyenne si l'un des deux ; basse sinon, ou si un contrôle est en écart ; confirmé si `valide: true`.

### `spec/controles.yml`

```yaml
- id: c1
  type: ecart_somme          # ecart_somme | rapprochement | mensuel
  libelle: CA Akanea contre comptes 70
  annee: 2025
  tolerance: 0.05
  a: {ds: tms_akanea, valeur: montant, date: date_chgt}
  b: {ds: comptabilite_balance, valeur: "mouvements_credit - mouvements_debit", filtre: "numero_compte like '70%'"}
  porte_sur: [tms_akanea.montant, flux:f1]
```

`rapprochement` : `from`, `to`, `norm`, `seuil`. `mensuel` : `ds`, `date` (vide si la source n'a pas de date par ligne).

### Mémoire commune

`$TREDUNION_MEMOIRE` (par défaut `../tredunion-memoire`) : `logiciels.yml` (recettes de lecture), `comptes.yml` (préfixe → catégorie), `colonnes.yml` (nom de colonne → sens). Chaque entrée liste `confirme_chez` et `contredit_chez`.
````

- dans la table « Commandes », ajouter :

```markdown
| `npm run maquette -- --societe <id> [--sans-collecte]` | Collecte, normalisation, profil des nouveaux exports, contrôle |
| `npm run collecte -- --societe <id>` / `npm run normaliser -- --societe <id>` | Étapes séparées de la maquette |
| `npm run controles` | Résultat des contrôles croisés |
| `npm run apprendre` | Hypothèses tranchées vers la mémoire commune |
| `npm run evaluer -- --corrige <dossier spec>` | Compare la spec à un corrigé (flux, décodages) |
| `npm test` | Tests de l'outil |
```

`README.md`, avant « ## Commandes de l'agent » :

```markdown
## Maquette d'avant-séance

Sans l'adhérent, l'agent produit une première version du dashboard. Chaque déduction est une hypothèse tracée, et la séance ne sert plus qu'à valider la fiche `generated/fiche_seance.md`.

1. Créer `.env` depuis `.env.exemple` (identifiants SFTP de l'adhérent, chemin de la mémoire commune).
2. Déclarer la société dans `spec/projet.yml`.
3. Dans le chat Cursor : `/maquette <societe>`.
4. En séance : valider la fiche, point par point.
5. Après la séance : `/apprendre`.
```

et ajouter à la table des commandes de l'agent :

```markdown
| `/maquette <societe>` | Maquette d'avant-séance : collecte, lecture, hypothèses, flux, contrôles, fiche |
| `/apprendre` | Fait entrer les réponses de la séance dans la mémoire commune |
```

- [ ] **Step 5: Mettre la conception à jour**

Dans `docs/superpowers/specs/2026-11-06-maquette-avant-seance-design.md`, section « Format des hypothèses dans la spec », remplacer le bloc YAML par celui de `AGENTS.md` (sans champ `confiance`, avec `question` et `refuse`), et ajouter sous le bloc : « La confiance n'est pas écrite dans la spec : l'outil la calcule. » Section « Mémoire commune », remplacer « Dépôt git séparé » par « Dossier séparé (sans git pour l'instant) ». Ajouter : « Les entrées de `comptes.yml` ont pour `id` le préfixe de compte, celles de `colonnes.yml` le nom de colonne en snake_case. »

- [ ] **Step 6: Point de contrôle**

Run: `npm test && npm run check`
Expected: PASS, puis `0 erreur(s)`.

---

### Task 14: Première maquette Euro Trans Chanet et évaluation Kessler

**Files:**
- Modify: `spec/datasets/*.yml`, `spec/flux/*.yml`, `spec/controles.yml`, `spec/journal.yml` (écrits par l'agent selon `/maquette`)

- [ ] **Step 1: Produire la maquette**

Suivre `.cursor/commands/maquette.md` avec `eurotranschanet --sans-collecte`. Contrôles attendus au minimum :
- `ecart_somme` : CA d'Akanea (`montant`) contre comptes 70 ;
- `ecart_somme` : montant HT du carburant COFI contre comptes de gazole ;
- `ecart_somme` : `cout_global` Silae contre comptes 641 et 645 ;
- `rapprochement` : immatriculations du carburant contre `plaque_moteur` d'Akanea ;
- `mensuel` : `comptabilite_balance`, sans date par ligne.

- [ ] **Step 2: Vérifier les critères de réussite**

Run: `npm run check && npm run controles && npm run build`
Expected :
- `0 erreur(s)` ;
- au moins une mesure alimentée ;
- toute mesure alimentée a un badge (aucun flux sans bloc `hypothese`) : vérifier dans l'onglet « Éléments principaux » de http://localhost:4321 ;
- `generated/fiche_seance.md` tient sur une page (environ 60 lignes au plus) et ne contient aucune valeur de colonne `pii`.

- [ ] **Step 3: Évaluer sur Kessler-Rhin avec une mémoire vide**

```bash
rm -rf /tmp/vibe-kessler /tmp/memoire-vide && mkdir -p /tmp/memoire-vide
cp -r /home/michel/DEVEL/tredunion/vibe /tmp/vibe-kessler
cd /tmp/vibe-kessler
rm -rf data generated .env
npm run reset -- --force
mkdir -p data/raw/kf data/raw/rl
cp exemple/data/bronze/kf/*.csv data/raw/kf/ && cp exemple/data/bronze/rl/*.csv data/raw/rl/
```

Écrire `/tmp/vibe-kessler/spec/projet.yml` avec les sociétés `kf` (Kessler Frères) et `rl` (Rhin Logistique), reprises de `exemple/spec/projet.yml`. Puis :

```bash
TREDUNION_MEMOIRE=/tmp/memoire-vide npm run maquette -- --societe kf --sans-collecte
TREDUNION_MEMOIRE=/tmp/memoire-vide npm run maquette -- --societe rl --sans-collecte
```

Suivre ensuite les étapes 3 à 7 de `/maquette` dans `/tmp/vibe-kessler`, sans lire `exemple/spec/`. Puis :

Run: `npm run evaluer -- --corrige exemple/spec`
Expected : plus de 50 % des flux retrouvés. Noter dans le journal du dépôt principal les taux, les flux manquants et ce qu'ils disent des limites de la déduction.

- [ ] **Step 4: Journal**

Ajouter à `/home/michel/DEVEL/tredunion/vibe/spec/journal.yml` une entrée « maquette Euro Trans Chanet » : mesures alimentées, répartition des hypothèses, contrôles en écart, taux Kessler.
