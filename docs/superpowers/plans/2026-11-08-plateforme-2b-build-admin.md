# Plateforme 2b : build automatique, vue admin, surbrillance, déploiement : plan d'implémentation

> **Pour l'agent d'exécution :** utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans. Cases `- [ ]`.

**Objectif :** régénérer les livrables après chaque réponse, donner à Michel une vue d'avancement des adhérents, faire clignoter les tuiles qui changent, préparer le déploiement.

**Architecture :** `tools/espace.mjs` gagne `construire`, `apercu`, `livrables`, `lireLivrable`. `server/file.mjs` ordonne et regroupe les tâches par adhérent. `server/app.mjs` déclenche le build après une réponse et expose trois routes admin. Le viewer ajoute l'onglet Adhérents et la surbrillance.

**Stack :** Node ≥ 22, `node:test`, aucune dépendance nouvelle.

## Contraintes globales

- Textes, messages et noms en français. Aucune dépendance npm nouvelle. `core/*.js` en scripts classiques, inchangé par ce plan.
- Le dépôt n'est pas git : pas de commit, chaque tâche finit par `npm test` vert. Les tests travaillent sur des dossiers temporaires, jamais dans `spec/`, `data/`, `generated/`, `adherents/`, `comptes.json` du dépôt.
- `statut.json` : `.atelier/statut.json`, écriture atomique (fichier temporaire + renommage), fusionné avec l'existant ; 20 erreurs au plus.
- Routes admin (`/api/adherents`, `/api/livrables`, `/api/livrable`) : 403 pour un adhérent, 401 sans session. L'adhérent visé vient de `?adherent=` validé par `racineDe` (déjà en place).
- Un téléchargement ne sert que les chemins présents dans `espace.livrables()`.
- Ne jamais lire `.env`. Aucune valeur de colonne `pii: true` dans les rapports.

---

### Task 1 : `construire`, `apercu`, `livrables` dans l'espace

**Fichiers :**
- Modifier : `tools/espace.mjs`, `tools/atelier.mjs` (`cmdBuild`)
- Test : `tests/espace-build.test.mjs`

**Interfaces :**
- Produit (dans l'objet renvoyé par `ouvrirEspace`) :
  - `construire() → {ok: true, fichiers: number} | {ok: false, erreurs: Finding[]}`
  - `apercu() → {nom, questions: {traitees, total}, mesures: {ok, total}, erreurs, dernierBuild: string|null, buildOk: boolean|null, libres, nonLus}`
  - `livrables() → {path: string, taille: number}[]` (chemins relatifs à `generated/`, `/` comme séparateur, triés)
  - `lireLivrable(path) → Buffer | null` (`null` si `path` n'est pas dans `livrables()`)
  - `lireStatut() → object` (contenu de `.atelier/statut.json`, `{}` si absent)

- [ ] **Étape 1 : test d'abord** — `tests/espace-build.test.mjs` :
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";

const ls = d => fs.existsSync(d) ? fs.readdirSync(d).sort() : [];

test("construire : écrit generated/, le statut, sans résidu", () => {
  const root = racineExemple(), e = ouvrirEspace(root);
  const r = e.construire(); assert.equal(r.ok, true); assert.ok(r.fichiers > 0);
  assert.equal(ls(path.join(root, "generated")).length > 0, true);
  assert.deepEqual(ls(root).filter(n => /\.(tmp|old)-/.test(n)), []);
  const st = e.lireStatut(); assert.equal(st.ok, true); assert.match(st.dernierBuild, /^\d{4}-\d\d-\d\dT/); assert.equal(st.fichiers, r.fichiers);
});

test("construire : une spec en erreur laisse generated/ intact et garde dernierBuild", () => {
  const root = racineExemple(), e = ouvrirEspace(root);
  e.construire(); const avant = e.livrables(), dernier = e.lireStatut().dernierBuild;
  fs.writeFileSync(path.join(root, "spec/relations.yml"), "[\n");
  const r = e.construire(); assert.equal(r.ok, false); assert.ok(r.erreurs.length > 0);
  assert.deepEqual(e.livrables(), avant);
  const st = e.lireStatut(); assert.equal(st.ok, false); assert.equal(st.dernierBuild, dernier); assert.ok(st.nbErreurs > 0 && st.erreurs.length <= 20);
  assert.deepEqual(ls(root).filter(n => /\.(tmp|old)-/.test(n)), []);
});

test("apercu : questions, mesures, build ; libres compte les textes libres en attente", () => {
  const root = racineExemple(), e = ouvrirEspace(root);
  const a = e.apercu(); assert.equal(a.questions.traitees, 0); assert.ok(a.questions.total > 0); assert.ok(a.mesures.total >= a.mesures.ok);
  assert.equal(a.libres, 0); assert.equal(a.dernierBuild, null); assert.equal(a.buildOk, null);
  assert.ok(!e.repondre({ id: "compta_balance#q1", saisie: { texte: "Date de clôture" }, par: "Compta" }).erreurs);
  e.construire(); const b = e.apercu();
  assert.equal(b.questions.traitees, 1); assert.equal(b.libres, 1); assert.equal(b.buildOk, true); assert.ok(b.dernierBuild);
});

test("livrables / lireLivrable : liste, contenu, refus des chemins hors liste", () => {
  const root = racineExemple(), e = ouvrirEspace(root); assert.deepEqual(e.livrables(), []);
  e.construire(); const l = e.livrables(); assert.ok(l.length > 0 && l.every(x => x.taille >= 0 && !x.path.includes("\\")));
  assert.ok(e.lireLivrable(l[0].path) instanceof Buffer);
  for (const p of ["../spec/projet.yml", "../../etc/passwd", "/etc/passwd", "inconnu.txt", "", undefined]) assert.equal(e.lireLivrable(p), null);
});
```

- [ ] **Étape 2 :** lancer `node --test tests/espace-build.test.mjs` : échec (`construire` absent).

- [ ] **Étape 3 : implémenter** dans `tools/espace.mjs`, à l'intérieur de `ouvrirEspace`, après `ajouterAuRegistre` :
```js
  const STATUT = () => P(".atelier/statut.json");
  const lireStatut = () => exists(STATUT()) ? JSON.parse(fs.readFileSync(STATUT(), "utf8")) : {};
  function ecrireStatut(o) {
    const f = STATUT(); fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + `.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify({ ...lireStatut(), ...o }, null, 2)); fs.renameSync(tmp, f);
  }
  function construire() {
    const { ctx, findings } = evaluate(), at = new Date().toISOString().slice(0, 19), erreurs = findings.filter(f => f.niv === "erreur");
    if (erreurs.length) { ecrireStatut({ tentative: at, ok: false, nbErreurs: erreurs.length, erreurs: erreurs.slice(0, 20).map(f => ({ fichier: f.fichier, msg: f.msg })) }); return { ok: false, erreurs }; }
    const files = vm.runInContext("buildFiles()", ctx), out = P("generated"), tmp = P(`generated.tmp-${process.pid}`), old = P(`generated.old-${process.pid}`);
    fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(old, { recursive: true, force: true });
    files.forEach(f => { const t = path.join(tmp, f.path); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, f.body); });
    if (exists(out)) fs.renameSync(out, old);
    fs.renameSync(tmp, out); fs.rmSync(old, { recursive: true, force: true });
    ecrireStatut({ tentative: at, ok: true, dernierBuild: at, fichiers: files.length, nbErreurs: 0, erreurs: [] });
    return { ok: true, fichiers: files.length };
  }
  function livrables() {
    const base = P("generated"); if (!exists(base)) return [];
    const sortie = []; const parcourir = (d, pre) => fs.readdirSync(d, { withFileTypes: true }).forEach(en => { const rel = pre ? `${pre}/${en.name}` : en.name; en.isDirectory() ? parcourir(path.join(d, en.name), rel) : en.isFile() && sortie.push({ path: rel, taille: fs.statSync(path.join(d, en.name)).size }); });
    parcourir(base, ""); return sortie.sort((a, b) => a.path.localeCompare(b.path));
  }
  const lireLivrable = p => typeof p === "string" && livrables().some(x => x.path === p) ? fs.readFileSync(path.join(P("generated"), ...p.split("/"))) : null;
  function apercu() {
    const { ctx, findings, state } = evaluate(), s = vm.runInContext("summary()", ctx), qs = vm.runInContext("listeQuestions()", ctx), m = s.mesures, st = lireStatut();
    const dernieres = new Map(); (state.reponses || []).forEach(r => dernieres.set(r.id, r));
    const libres = [...dernieres.values()].filter(r => r.origine === "client" && r.reponse && (r.modifs || []).length && r.modifs.every(x => x.op === "noter")).length;
    return { nom: state.adherent, questions: { traitees: qs.filter(q => q.statut === "traitee").length, total: qs.length }, mesures: { ok: m.ok, total: m.ok + m.part + m.none + m.err },
      erreurs: findings.filter(f => f.niv === "erreur").length, dernierBuild: st.dernierBuild || null, buildOk: st.ok ?? null, libres, nonLus: (state.nonLus || []).length };
  }
```
Ajouter `construire, apercu, livrables, lireLivrable, lireStatut` à l'objet renvoyé en fin de `ouvrirEspace`.

Dans `tools/atelier.mjs`, remplacer le corps de `cmdBuild` par :
```js
function cmdBuild() {
  const r = construire();
  if (!r.ok) { printFindings(r.erreurs); console.error(`\n${C.red}Build interrompu : corrige d'abord les erreurs (npm run check).${C.reset}`); process.exitCode = 1; return; }
  const l = livrables(); console.log(`${r.fichiers} fichiers écrits dans generated/ :`); l.forEach(f => console.log("  generated/" + f.path));
}
```
et ajouter `construire, livrables` à la déstructuration de `ouvrirEspace(ROOT)`.

- [ ] **Étape 4 :** `npm test` : tout vert (≥ 154) ; `npm run check` : 0 erreur. Vérifier à la main qu'un `ATELIER_ROOT=<dossier temp avec exemple> node tools/atelier.mjs build` écrit toujours les fichiers.

---

### Task 2 : `server/file.mjs`

**Fichiers :** Créer `server/file.mjs`, `tests/file.test.mjs`.

**Interfaces :** Produit `creerFile() → {declencher(cle, tache) → Promise, attendre(cle) → Promise}` où `tache: () => void | Promise`.

- [ ] **Étape 1 : test** — `tests/file.test.mjs` :
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { creerFile } from "../server/file.mjs";

const pause = ms => new Promise(r => setTimeout(r, ms));

test("même clé : une tâche à la fois, dans l'ordre", async () => {
  const f = creerFile(), trace = []; let actives = 0, max = 0;
  const tache = nom => async () => { actives++; max = Math.max(max, actives); trace.push("début " + nom); await pause(20); trace.push("fin " + nom); actives--; };
  const p = f.declencher("a", tache("1")); await pause(5); f.declencher("a", tache("2")); await p;
  assert.equal(max, 1); assert.deepEqual(trace, ["début 1", "fin 1", "début 2", "fin 2"]);
});

test("regroupement : 5 déclenchements pendant une exécution n'en font qu'une de plus", async () => {
  const f = creerFile(); let n = 0;
  const tache = async () => { n++; await pause(20); };
  const p = f.declencher("a", tache); await pause(5);
  for (let i = 0; i < 5; i++) f.declencher("a", tache);
  await p; await f.attendre("a"); assert.equal(n, 2);
});

test("une tâche en échec ne bloque pas la suivante", async () => {
  const f = creerFile(); let ok = false; const log = console.error; console.error = () => {};
  try { const p = f.declencher("a", () => { throw new Error("boum"); }); await pause(5); f.declencher("a", () => { ok = true; }); await p; await f.attendre("a"); } finally { console.error = log; }
  assert.equal(ok, true);
});

test("clés différentes : indépendantes", async () => {
  const f = creerFile(), trace = [];
  const a = f.declencher("a", async () => { trace.push("a0"); await pause(30); trace.push("a1"); });
  const b = f.declencher("b", async () => { trace.push("b0"); await pause(5); trace.push("b1"); });
  await Promise.all([a, b]); assert.ok(trace.indexOf("b1") < trace.indexOf("a1"));
});

test("attendre une clé inconnue ou inactive se résout aussitôt", async () => {
  const f = creerFile(); await f.attendre("x"); await f.declencher("y", () => {}); await f.attendre("y");
});
```
> Dans le test 1, la seconde tâche est déclenchée pendant que la première tourne : le regroupement la planifie une fois ; l'ordre est préservé. Dans le test 3, le second déclenchement arrive pendant que la tâche en échec est encore à son tour de boucle : adapter `pause` si l'implémentation rend la première tâche trop courte.

- [ ] **Étape 2 :** échec attendu (module absent).

- [ ] **Étape 3 : implémenter** `server/file.mjs` :
```js
/* File de tâches par clé (un adhérent) : une à la fois, regroupées si elles s'accumulent. */
export function creerFile() {
  const etats = new Map(); // clé → { courant: Promise | null, encore: boolean }
  return {
    declencher(cle, tache) {
      let e = etats.get(cle); if (!e) etats.set(cle, e = { courant: null, encore: false });
      if (e.courant) { e.encore = true; return e.courant; }
      e.courant = (async () => {
        try {
          do { e.encore = false; await new Promise(r => setImmediate(r)); try { await tache(); } catch (x) { console.error(x); } } while (e.encore);
        } finally { e.courant = null; }
      })();
      return e.courant;
    },
    attendre: cle => etats.get(cle)?.courant || Promise.resolve(),
  };
}
```

- [ ] **Étape 4 :** `node --test tests/file.test.mjs` puis `npm test` : vert. Si le test 3 est instable (échec sur la durée), ajuster les pauses du test, pas l'implémentation.

---

### Task 3 : build automatique et routes admin dans `server/app.mjs`

**Fichiers :**
- Modifier : `server/app.mjs`
- Créer : `tests/aide/multi.mjs`, `tests/serveur-admin.test.mjs`
- Modifier : `tests/serveur-multi.test.mjs` (importe l'aide au lieu de la définir)

**Interfaces :**
- Consomme : `creerFile`, `espace.construire/apercu/livrables/lireLivrable`.
- Produit :
  - `creerApp({ …, construireAuto = true })` ; l'objet serveur renvoyé porte aussi `attendreFile(id) → Promise`.
  - Après un `POST /api/reponse` réussi : événement `spec` immédiat, puis `construire()` en tâche de fond, puis événement `statut`.
  - `GET /api/adherents`, `GET /api/livrables`, `GET /api/livrable` (admin).
  - `tests/aide/multi.mjs` exporte `monter(t, opts)`, `get(m, chemin, cookie, init)`, `post(m, chemin, cookie, corps, headers)`, `registre(m, id)` (code déplacé tel quel de `tests/serveur-multi.test.mjs`).

- [ ] **Étape 1 : extraire l'aide.** Déplacer `monter`, `get`, `post`, `registre` de `tests/serveur-multi.test.mjs` vers `tests/aide/multi.mjs` (avec leurs imports : `fs`, `os`, `path`, `YAML`, `creerApp`, `creerCompte`, `racineExemple` chemins ajustés à `../../server/…` et `./racine.mjs`), les exporter, et les importer dans `tests/serveur-multi.test.mjs`. `npm test` reste vert.

- [ ] **Étape 2 : test** — `tests/serveur-admin.test.mjs` :
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { monter, get, post } from "./aide/multi.mjs";

test("une réponse déclenche le build de son adhérent seulement, et un statut est écrit", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  assert.equal((await post(m, "/api/reponse", cookie, { id: "compta_balance#q1", saisie: { texte: "Date de clôture" } })).status, 200);
  await m.srv.attendreFile("alpha");
  const st = JSON.parse(fs.readFileSync(path.join(m.adherents, "alpha/.atelier/statut.json"), "utf8"));
  assert.equal(st.ok, true); assert.ok(fs.readdirSync(path.join(m.adherents, "alpha/generated")).length > 0);
  assert.equal(fs.existsSync(path.join(m.adherents, "beta/generated")), false);
});

test("plusieurs réponses rapprochées : le build reste cohérent et le dernier état est construit", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  await Promise.all(["Un", "Deux", "Trois"].map(x => post(m, "/api/reponse", cookie, { id: "compta_balance#q1", saisie: { texte: x } })));
  await m.srv.attendreFile("alpha");
  const reg = YAML.parse(fs.readFileSync(path.join(m.adherents, "alpha/spec/reponses.yml"), "utf8")); assert.equal(reg.length, 3);
  assert.equal(JSON.parse(fs.readFileSync(path.join(m.adherents, "alpha/.atelier/statut.json"), "utf8")).ok, true);
});

test("construireAuto: false ne construit rien", async t => {
  const m = await monter(t, { construireAuto: false }); const { cookie } = await m.connecter("alpha");
  await post(m, "/api/reponse", cookie, { id: "compta_balance#q1", saisie: { texte: "x" } }); await m.srv.attendreFile("alpha");
  assert.equal(fs.existsSync(path.join(m.adherents, "alpha/generated")), false);
});

test("/api/adherents : admin seulement, un objet par adhérent", async t => {
  const m = await monter(t);
  assert.equal((await get(m, "/api/adherents")).status, 401);
  const a = await m.connecter("alpha"); assert.equal((await get(m, "/api/adherents", a.cookie)).status, 403);
  const adm = await m.connecter("admin-michel"); const r = await get(m, "/api/adherents", adm.cookie); assert.equal(r.status, 200);
  const l = await r.json(); assert.deepEqual(l.map(x => x.id), ["alpha", "beta"]);
  for (const x of l) assert.deepEqual(Object.keys(x).sort(), ["buildOk", "dernierBuild", "erreurs", "id", "libres", "mesures", "nom", "nonLus", "questions"]);
});

test("livrables : liste et téléchargement pour l'admin, refus pour l'adhérent, rien hors liste", async t => {
  const m = await monter(t); const a = await m.connecter("alpha"), adm = await m.connecter("admin-michel");
  await post(m, "/api/reponse", a.cookie, { id: "compta_balance#q1", saisie: { texte: "x" } }); await m.srv.attendreFile("alpha");
  assert.equal((await get(m, "/api/livrables?adherent=alpha", a.cookie)).status, 403);
  const liste = await (await get(m, "/api/livrables?adherent=alpha", adm.cookie)).json(); assert.ok(liste.length > 0);
  const f = await get(m, `/api/livrable?adherent=alpha&f=${encodeURIComponent(liste[0].path)}`, adm.cookie);
  assert.equal(f.status, 200); assert.match(f.headers.get("content-disposition"), /^attachment; filename="/); assert.match(f.headers.get("content-type"), /text\/plain/);
  assert.equal((await get(m, `/api/livrable?adherent=alpha&f=${encodeURIComponent(liste[0].path)}`, a.cookie)).status, 403);
  for (const p of ["../../comptes.json", "..%2F..%2Fcomptes.json", "inconnu"]) assert.equal((await get(m, `/api/livrable?adherent=alpha&f=${p}`, adm.cookie)).status, 404);
  assert.equal((await get(m, "/api/livrable?adherent=gamma&f=x", adm.cookie)).status, 404);
});
```
`monter` doit renvoyer aussi `srv` (le serveur) : l'ajouter à l'objet renvoyé (`return { url, adherents, mdp, connecter, srv }`).

- [ ] **Étape 3 : implémenter** dans `server/app.mjs` :
  1. `import { creerFile } from "./file.mjs";` ; signature `creerApp({ adherents, comptes, cookieSecure = false, trustProxy = false, construireAuto = true, now = Date.now })` ; `const file = creerFile();`
  2. Route `/api/reponse` : remplacer la ligne par
```js
      if (p === "/api/reponse" && req.method === "POST") return corps(req, res, b => { try { const r = e.repondre(b); if (!r.erreurs) { envoyer(id, "spec"); if (construireAuto) file.declencher(id, () => { e.construire(); envoyer(id, "statut"); }); } json(res, r.erreurs ? 400 : 200, r); } catch (x) { erreurInterne(res, x); } });
```
  3. Avant la résolution de l'adhérent courant (donc après la vérification de session et avant `const liste = …`), la route de l'aperçu :
```js
      if (p === "/api/adherents") { if (s.role !== "admin") return refus(res, 403, "réservé à l'administrateur"); return json(res, 200, adherentsConnus(adherents).map(i => ({ id: i, ...espace(i).apercu() }))); }
```
  4. Après `let e; try { e = espace(id); } …`, ajouter :
```js
      if (p === "/api/livrables" || p === "/api/livrable") {
        if (s.role !== "admin") return refus(res, 403, "réservé à l'administrateur");
        if (p === "/api/livrables") return json(res, 200, e.livrables());
        const f = url.searchParams.get("f"), contenu = e.lireLivrable(f); if (!contenu) return refus(res, 404, "fichier introuvable");
        const nom = path.basename(f).replace(/[^\w.-]/g, "_");
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="${nom}"`, "cache-control": "no-store" }); return res.end(contenu);
      }
```
  5. Avant `return srv;` : `srv.attendreFile = i => file.attendre(i);`
  Remarque : `/api/livrables` avec `?adherent=` inconnu doit donner 404 (déjà le cas via `espace(id)`).

- [ ] **Étape 4 :** `node --test tests/serveur-admin.test.mjs tests/serveur-multi.test.mjs` puis `npm test` : tout vert.

---

### Task 4 : onglet Adhérents et surbrillance des tuiles (viewer)

**Fichiers :**
- Modifier : `viewer/body.html`, `viewer/ui.js`, `viewer/boot.js`, `viewer/dash.js`, `viewer/style.css`
- Test : `tests/vue-admin.test.mjs`

**Comportement :**
- `body.html` : bouton `<button role="tab" id="t-adh" aria-selected="false">Adhérents</button>` après l'onglet Journal ; `<section id="view-adh" class="page" hidden><div class="inner wrapx" id="adhv"></div></section>` après `#view-log`.
- `style.css` : `body:not([data-role="admin"]) #t-adh,body:not([data-role="admin"]) #view-adh{display:none}` ; styles du tableau `.adhtab` dans la charte (barres de progression `.qprog`, lien « Ouvrir » en pilule, erreurs en rouge).
- `ui.js` : ajouter `"adh"` au tableau `TABS` ; `renderTab` appelle `renderAdh()` pour `S.tab==="adh"`. `renderAdh()` : `fetch("/api/adherents")`, affiche le tableau (colonnes : adhérent, questions `traitees/total` avec barre, mesures `ok/total` avec barre, erreurs, dernier build, réponses libres à reprendre, fichiers non lus, lien « Ouvrir » vers `/?adherent=<id>`, bouton « Livrables » qui charge `/api/livrables?adherent=<id>` et liste des liens `/api/livrable?adherent=<id>&f=<chemin encodé>` avec attribut `download`). Tout texte issu du serveur passe par `esc()`.
- `boot.js` : écouter `es.addEventListener("statut", () => { if (S.tab === "adh") renderAdh(); })`.
- `dash.js` : dans `kcell`, ajouter `data-k="${esc((S.prev.sheet||"")+"|"+(it.label||it.m))}"` sur la `div.kc`. Nouvelle fonction :
```js
function tuilesChangees(avant, apres){ return [...apres.keys()].filter(k=>avant.has(k)&&avant.get(k)!==apres.get(k)); }
function suiviTuiles(){
  const p=S.prev, sig=[p.sheet,p.annee,p.mois,p.site,p.veh,p.chauf].join("|");
  const now=new Map(); document.querySelectorAll("#prevv [data-k]").forEach(el=>now.set(el.dataset.k,el.querySelector(".v")?.textContent||""));
  if(S.tuiles&&S.tuiles.sig===sig){ const ch=tuilesChangees(S.tuiles.v,now); if(ch.length){ S.flashTuiles={cles:new Set(ch),t:Date.now()}; } }
  S.tuiles={sig,v:now};
  if(S.flashTuiles&&Date.now()-S.flashTuiles.t<60000&&S.tab==="prev"){ document.querySelectorAll("#prevv [data-k]").forEach(el=>{ if(S.flashTuiles.cles.has(el.dataset.k)){ el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); } }); S.flashTuiles=null; }
}
```
  appelée à la fin de `renderPrev()` ; `boot.js` appelle `renderPrev()` à chaque `loadState` même quand l'onglet Dashboard n'est pas ouvert (après `renderTab` : `if(S.tab!=="prev") renderPrev();`). `setTab("prev")` appelle déjà `renderTab` donc `suiviTuiles` applique alors la surbrillance mémorisée.
- `style.css` : `.kc.flash{animation:flash 3s ease-out}` (en plus de `.flash` existant).

- [ ] **Étape 1 : test** — `tests/vue-admin.test.mjs` (statique + intégration) :
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { monter, get } from "./aide/multi.mjs";

const lire = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("l'onglet Adhérents n'existe que pour l'admin (CSS) et est branché", () => {
  assert.match(lire("viewer/body.html"), /id="t-adh"/); assert.match(lire("viewer/body.html"), /id="view-adh"/);
  assert.match(lire("viewer/style.css"), /body:not\(\[data-role="admin"\]\) #t-adh/);
  assert.match(lire("viewer/ui.js"), /"adh"/); assert.match(lire("viewer/ui.js"), /function renderAdh/);
  assert.match(lire("viewer/boot.js"), /addEventListener\("statut"/);
});

test("les tuiles portent data-k et le suivi compare les valeurs", () => {
  const d = lire("viewer/dash.js"); assert.match(d, /data-k=/); assert.match(d, /function tuilesChangees/); assert.match(d, /function suiviTuiles/);
  const f = new Function(d.match(/function tuilesChangees[^\n]*\n/)[0] + "return tuilesChangees;")();
  assert.deepEqual(f(new Map([["a", "1"], ["b", "2"]]), new Map([["a", "1"], ["b", "3"], ["c", "9"]])), ["b"]);
});

test("la page servie à l'admin contient l'onglet et le script, pas de donnée d'un autre adhérent dans le HTML", async t => {
  const m = await monter(t); const adm = await m.connecter("admin-michel");
  const h = await (await get(m, "/", adm.cookie)).text(); assert.match(h, /<body data-role="admin">/); assert.match(h, /id="t-adh"/);
});
```

- [ ] **Étape 2 :** échec attendu. **Étape 3 :** implémenter comme décrit (relire `viewer/ui.js` pour `TABS` et le style des autres `render*`).

- [ ] **Étape 4 : vérification à l'écran** (navigateur Cursor via GetDynamicTools/CallDynamicTool, émulation 1440 px puis `Emulation.clearDeviceMetricsOverride`) : dossier `/tmp/adh-demo` avec `ADHERENTS_ROOT=/tmp/adh-demo COMPTES_FILE=/tmp/adh-demo/comptes.json node tools/atelier.mjs exemple --multi`, serveur `PORT=<libre> node server/app.mjs` avec les mêmes variables. Vérifier : (1) admin : onglet Adhérents, deux lignes, liste des livrables vide puis, après une réponse d'alpha dans un autre onglet, mise à jour automatique avec livrables téléchargeables ; (2) alpha : pas d'onglet Adhérents ; réponse à une question qui change une mesure, puis ouverture du Dashboard : tuiles modifiées en surbrillance ; (3) console sans violation CSP. Arrêter le serveur, supprimer `/tmp/adh-demo`.

- [ ] **Étape 5 :** `npm test` vert.

---

### Task 5 : fichiers de déploiement et documentation

**Fichiers :** Créer `deploy/Caddyfile`, `deploy/tredunion.service`, `deploy/sauvegarde.sh` (exécutable), `deploy/LISEZMOI.md` ; modifier `README.md`, `AGENTS.md`. Test : `tests/deploy.test.mjs`.

- [ ] **Étape 1 : test** — `tests/deploy.test.mjs` :
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const lire = f => fs.readFileSync(new URL("../deploy/" + f, import.meta.url), "utf8");

test("le service systemd pose les variables de production", () => {
  const s = lire("tredunion.service");
  for (const v of ["ADHERENTS_ROOT=", "COMPTES_FILE=", "PORT=4400", "COOKIE_SECURE=1", "TRUST_PROXY=1", "ExecStart=", "server/app.mjs", "NoNewPrivileges=true"]) assert.ok(s.includes(v), v);
});

test("le Caddyfile relaie vers le port 4400 en local", () => {
  assert.match(lire("Caddyfile"), /reverse_proxy 127\.0\.0\.1:4400/);
});

test("sauvegarde.sh : syntaxe valide, n'embarque que adherents et comptes.json, garde 14 jours", () => {
  const f = new URL("../deploy/sauvegarde.sh", import.meta.url).pathname, t = lire("sauvegarde.sh");
  assert.equal(spawnSync("bash", ["-n", f]).status, 0);
  assert.match(t, /adherents/); assert.match(t, /comptes\.json/); assert.match(t, /-mtime \+14/);
  assert.doesNotMatch(t, /rm -rf \//);
});
```

- [ ] **Étape 2 :** échec. **Étape 3 : écrire les fichiers.**

`deploy/Caddyfile` :
```
# Remplacer par le nom de domaine réel. Caddy obtient le certificat HTTPS tout seul.
tredunion.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:4400
}
```

`deploy/tredunion.service` :
```
[Unit]
Description=Plateforme Tredunion (réponses des adhérents)
After=network.target

[Service]
User=tredunion
WorkingDirectory=/srv/tredunion/app
Environment=ADHERENTS_ROOT=/srv/tredunion/adherents
Environment=COMPTES_FILE=/srv/tredunion/comptes.json
Environment=PORT=4400
Environment=COOKIE_SECURE=1
Environment=TRUST_PROXY=1
ExecStart=/usr/bin/node server/app.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/srv/tredunion

[Install]
WantedBy=multi-user.target
```

`deploy/sauvegarde.sh` :
```bash
#!/usr/bin/env bash
# Sauvegarde quotidienne : adherents/ et comptes.json. À lancer par cron ou un timer systemd.
set -euo pipefail
RACINE="${TREDUNION_RACINE:-/srv/tredunion}"
DEST="${TREDUNION_SAUVEGARDES:-/srv/tredunion-sauvegardes}"
mkdir -p "$DEST"
tar -czf "$DEST/tredunion-$(date +%F).tar.gz" -C "$RACINE" adherents comptes.json
find "$DEST" -name 'tredunion-*.tar.gz' -mtime +14 -delete
```

`deploy/LISEZMOI.md` : installation pas à pas en français, sections : prérequis (Node 22, Caddy), utilisateur `tredunion`, dépôt dans `/srv/tredunion/app`, `npm ci`, dossiers `/srv/tredunion/adherents` et `comptes.json` (permissions 600), copie du service dans `/etc/systemd/system/` + `systemctl enable --now tredunion`, Caddyfile, création d'un adhérent (dossier `adherents/<id>/` avec `spec/` puis `npm run compte -- --adherent <id>`), création du compte admin, planification de `sauvegarde.sh` (cron `15 3 * * *`), mise à jour (`git pull && npm ci && systemctl restart tredunion`), restauration depuis une archive, et rappel : ne pas lancer `npm run serve` sur le serveur ; le port 4400 n'est pas exposé (pare-feu : seuls 80 et 443).

`README.md` : section « Déploiement » renvoyant à `deploy/LISEZMOI.md`. `AGENTS.md` : une ligne dans la table des commandes pour le build automatique (« après chaque réponse d'adhérent, `npm run serveur` régénère `generated/` ; le statut est dans `.atelier/statut.json` »).

- [ ] **Étape 4 :** `chmod +x deploy/sauvegarde.sh` ; `npm test` (attendu ≥ 175 verts) ; `npm run check` : 0 erreur.

---

## Auto-revue

- **Couverture de la spec 2b :** build auto + statut (T1, T3), file et regroupement (T2, T3), vue admin et téléchargements (T1, T3, T4), surbrillance (T4), déploiement (T5), tests listés (T1 à T5).
- **Cohérence des noms :** `construire`, `apercu`, `livrables`, `lireLivrable`, `lireStatut`, `creerFile`, `declencher`, `attendre`, `attendreFile`, `construireAuto`, `statut` (événement), `tuilesChangees`, `suiviTuiles`, `renderAdh` identiques partout.
- **Risques :** le test 3 de `file.test.mjs` dépend de petites pauses (réglage de test autorisé) ; `apercu()` évalue la spec à chaque appel (un adhérent = quelques dizaines de ms) : acceptable pour 50 adhérents, à mettre en cache si la vue admin ralentit.
