# Plateforme 2a : multi-adhérent, connexion, isolation : plan d'implémentation

> **Pour l'agent d'exécution :** utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans. Les étapes utilisent des cases `- [ ]`.

**Objectif :** un serveur qui sert plusieurs adhérents derrière une connexion, chacun isolé dans son dossier, avec une vue client sans schéma.

**Architecture :** la logique d'un espace (état, évaluation, réponse, page) sort de `tools/atelier.mjs` dans `tools/espace.mjs`, paramétrée par la racine d'un adhérent. `server/` ajoute l'authentification, la résolution du dossier depuis la session et les routes. La CLI et `npm run serve` gardent leur comportement.

**Stack :** Node ≥ 22, `node:http`, `node:crypto` (scrypt), `node:test`. Aucune dépendance nouvelle.

## Contraintes globales

- Tout en français (messages, commentaires). Pas de dépendance npm nouvelle.
- `repondre` est synchrone : dans un processus unique, deux réponses ne s'entrelacent pas. Pas de file à écrire en 2a.
- Cookie de session `sid` : `HttpOnly; SameSite=Strict; Path=/`, plus `Secure` si `COOKIE_SECURE=1`. Durée 12 h.
- Connexion : 5 échecs par couple (identifiant, IP) sur 10 min, puis 429. Message identique pour identifiant inconnu et mot de passe faux : « Identifiant ou mot de passe incorrect ».
- Identifiant d'adhérent : `^[a-z0-9_-]{1,40}$`, présent dans la liste des dossiers de `ADHERENTS_ROOT`.
- Le temps réel reste servi sur `/events` (pas `/api/events`) pour ne pas modifier le viewer.
- Le moteur (`core/`) et `viewer/` ne changent que là où une tâche le dit.
- Variables : `ADHERENTS_ROOT` (défaut `<APP>/adherents`), `COMPTES_FILE` (défaut `<APP>/comptes.json`), `COOKIE_SECURE`, `PORT`.
- Avant chaque commit : `npm test` vert. Le dépôt n'est pas git : ignorer les étapes « commit » tant que `git init` n'a pas été fait.

---

### Task 1 : extraire `tools/espace.mjs`

**Fichiers :**
- Créer : `tools/espace.mjs`
- Modifier : `tools/atelier.mjs`
- Test : `tests/espace.test.mjs`

**Interfaces :**
- Produit : `ouvrirEspace(racine: string) → { P, readYaml, listYaml, readCsv, makeCtx, loadState(ctx), evaluate(plus?), repondre({id, saisie, par}), ajouterAuRegistre(entree), viewerHtml(vue?) }`. `vue` (optionnel) est `{role: "adherent"|"admin"}` ; absent = vue complète actuelle.
- Consomme : `core/*.js`, `viewer/*`, `tools/memoire.mjs`.

- [ ] **Étape 1 : test d'abord**

`tests/espace.test.mjs` :
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";

test("deux espaces ouverts sur deux racines restent indépendants", () => {
  const a = racineExemple(), b = racineExemple();
  const ea = ouvrirEspace(a), eb = ouvrirEspace(b);
  const r = ea.repondre({ id: "compta_balance#q1", saisie: { texte: "Date de clôture" }, par: "Compta" });
  assert.ok(!r.erreurs, JSON.stringify(r));
  assert.equal(YAML.parse(fs.readFileSync(path.join(a, "spec/reponses.yml"), "utf8")).length, 1);
  assert.equal((YAML.parse(fs.readFileSync(path.join(b, "spec/reponses.yml"), "utf8")) || []).length, 0);
  assert.equal(eb.loadState(eb.makeCtx()).state.reponses.length, 0);
});

test("ajouterAuRegistre écrit de façon atomique : aucun fichier temporaire ne reste", () => {
  const root = racineExemple(); const e = ouvrirEspace(root);
  e.ajouterAuRegistre({ id: "x#q1", reponse: "a" });
  assert.deepEqual(fs.readdirSync(path.join(root, "spec")).filter(f => f.includes(".tmp")), []);
  assert.equal(YAML.parse(fs.readFileSync(path.join(root, "spec/reponses.yml"), "utf8"))[0].id, "x#q1");
});

test("viewerHtml : la vue adhérent pose data-role, la vue locale non", () => {
  const e = ouvrirEspace(racineExemple());
  assert.match(e.viewerHtml({ role: "adherent" }), /<body data-role="adherent">/);
  assert.doesNotMatch(e.viewerHtml(), /data-role/);
});
```

- [ ] **Étape 2 : le lancer, il échoue** (`npm test -- tests/espace.test.mjs` → module introuvable).

- [ ] **Étape 3 : créer `tools/espace.mjs` par déplacement mécanique**

Squelette (le corps de chaque fonction est **copié sans modification** depuis `tools/atelier.mjs` ; seuls les noms `ROOT` → `racine` et la fermeture changent) :
```js
/* Un espace = un dossier d'adhérent (spec/, data/, generated/). Tout ce qui lit ou écrit la spec passe par ici. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { lireMemoire, cheminMemoire } from "./memoire.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const A = (...a) => path.join(APP, ...a);
const exists = f => fs.existsSync(f);
export const CORE = ["core/engine.js", "core/model.js", "core/check.js", "core/controles.js", "core/hypotheses.js", "core/questions.js", "core/calque.js"];
export const REGISTRE_VIDE = "# Registre des réponses de l'adhérent : on ajoute à la fin, on n'efface jamais.\n";
const csvCache = new Map();

export function ouvrirEspace(racine) {
  racine = path.resolve(racine);
  const P = (...a) => path.join(racine, ...a);
  const rel = f => path.relative(racine, f).split(path.sep).join("/");
  // ⇩ copier ici, tels quels : readYaml, listYaml, readCsv, loadState, filetReponses, makeCtx, evaluate, repondre
  // ⇩ ajouterAuRegistre : version atomique ci-dessous
  // ⇩ viewerHtml : version à paramètre ci-dessous
  return { P, readYaml, listYaml, readCsv, makeCtx, loadState, evaluate, repondre, ajouterAuRegistre, viewerHtml };
}
```

`ajouterAuRegistre` (remplace l'ancienne) :
```js
  function ajouterAuRegistre(entree) {
    const f = P("spec/reponses.yml"), avant = exists(f) ? fs.readFileSync(f, "utf8") : REGISTRE_VIDE;
    const tmp = f + `.${process.pid}.tmp`;
    fs.writeFileSync(tmp, avant.replace(/^\[\]\s*$/m, "").replace(/\n*$/, "\n") + YAML.stringify([entree], { lineWidth: 0 }));
    fs.renameSync(tmp, f);
  }
```

`viewerHtml` (même gabarit qu'avant ; seule la balise `<body>` change) :
```js
  function viewerHtml(vue) {
    const css = fs.readFileSync(A("viewer/style.css"), "utf8"), wema = fs.readFileSync(A("viewer/wema.css"), "utf8"), body = fs.readFileSync(A("viewer/body.html"), "utf8");
    const js = CORE.concat(["viewer/ui.js", "viewer/dash.js", "viewer/boot.js"]).map(f => `/* ${f} */\n` + fs.readFileSync(A(f), "utf8").replace(/^"use strict";/, "")).join("\n");
    const attr = vue?.role ? ` data-role="${vue.role === "admin" ? "admin" : "adherent"}"` : "";
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atelier silver → gold</title>
<style>*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}body{margin:0}${wema}${css}</style></head><body${attr}>
${body}
<script>"use strict";\n${js}\n</script></body></html>`;
  }
```

Dans `tools/atelier.mjs` : supprimer les définitions déplacées (`csvCache`, `readYaml`, `listYaml`, `readCsv`, `loadState`, `filetReponses`, `makeCtx`, `evaluate`, `ajouterAuRegistre`, `repondre`, `viewerHtml`, `CORE`, `REGISTRE_VIDE` sauf s'il sert à `cmdReset`, auquel cas l'importer) et ajouter après la définition de `ROOT` :
```js
import { ouvrirEspace, REGISTRE_VIDE } from "./espace.mjs";
const { readYaml, listYaml, readCsv, makeCtx, loadState, evaluate, repondre, viewerHtml } = ouvrirEspace(ROOT);
```
Garder dans `atelier.mjs` : `P`, `A`, `rel`, `exists`, `opt`, `lireCorps` et toutes les commandes. `loadState(ctx)` s'appelle toujours `loadState(ctx)`.

- [ ] **Étape 4 : tout le test passe**

Run : `npm test` — Attendu : 115 tests (112 + 3), 0 échec ; `npm run check` : 0 erreur.

- [ ] **Étape 5 : commit** (si git) : `git add tools tests && git commit -m "refactor: extraire l'espace d'un adhérent"`.

---

### Task 2 : `server/auth.mjs`

**Fichiers :**
- Créer : `server/auth.mjs`
- Test : `tests/auth.test.mjs`

**Interfaces :**
- Produit :
  - `hacher(mdp) → string` (`scrypt$<selHex>$<hashHex>`) ; `verifier(mdp, stocke) → boolean` (temps constant).
  - `lireComptes(fichier) → Compte[]` (`[]` si absent) ; `ecrireComptes(fichier, comptes)` (atomique) ; `Compte = {id, role: "adherent"|"admin", nom, mdp}`.
  - `creerSessions({duree = 43200000, now = Date.now}) → {ouvrir(compte) → jeton, lire(jeton) → {id, role, nom}|null, fermer(jeton)}`.
  - `creerLimiteur({max = 5, fenetre = 600000, now = Date.now}) → {bloque(cle) → boolean, echec(cle), succes(cle)}`.
  - `motDePasseAleatoire() → string` (16 caractères base64url).

- [ ] **Étape 1 : test**

`tests/auth.test.mjs` :
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hacher, verifier, lireComptes, ecrireComptes, creerSessions, creerLimiteur, motDePasseAleatoire } from "../server/auth.mjs";

test("hacher / verifier : bon mot de passe accepté, mauvais refusé, sel différent à chaque fois", () => {
  const h = hacher("secret"); assert.match(h, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.equal(verifier("secret", h), true); assert.equal(verifier("autre", h), false);
  assert.notEqual(hacher("secret"), h);
  assert.equal(verifier("secret", "n'importe quoi"), false);
});

test("comptes : lecture d'un fichier absent, aller-retour, aucun fichier temporaire", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cpt-")), "comptes.json");
  assert.deepEqual(lireComptes(f), []);
  ecrireComptes(f, [{ id: "a", role: "adherent", nom: "A", mdp: "x" }]);
  assert.equal(lireComptes(f)[0].id, "a");
  assert.deepEqual(fs.readdirSync(path.dirname(f)).filter(n => n.includes("tmp")), []);
});

test("sessions : jeton valide puis expiré, et fermeture", () => {
  let t = 1000; const s = creerSessions({ duree: 100, now: () => t });
  const j = s.ouvrir({ id: "a", role: "adherent", nom: "A", mdp: "x" });
  assert.deepEqual(s.lire(j), { id: "a", role: "adherent", nom: "A" });
  assert.equal(s.lire("faux"), null);
  t = 1101; assert.equal(s.lire(j), null);
  const k = s.ouvrir({ id: "b", role: "admin", nom: "B", mdp: "x" }); s.fermer(k); assert.equal(s.lire(k), null);
});

test("limiteur : bloque au 5e échec, se libère après la fenêtre, le succès remet à zéro", () => {
  let t = 0; const l = creerLimiteur({ max: 5, fenetre: 1000, now: () => t });
  for (let i = 0; i < 4; i++) l.echec("a|ip"); assert.equal(l.bloque("a|ip"), false);
  l.echec("a|ip"); assert.equal(l.bloque("a|ip"), true);
  t = 1001; assert.equal(l.bloque("a|ip"), false);
  l.echec("b|ip"); l.succes("b|ip"); for (let i = 0; i < 4; i++) l.echec("b|ip"); assert.equal(l.bloque("b|ip"), false);
});

test("motDePasseAleatoire : 16 caractères, différent à chaque appel", () => {
  const a = motDePasseAleatoire(); assert.match(a, /^[\w-]{16}$/); assert.notEqual(a, motDePasseAleatoire());
});
```

- [ ] **Étape 2 :** lancer : échec (module absent).

- [ ] **Étape 3 : implémentation**

`server/auth.mjs` :
```js
/* Comptes, mots de passe (scrypt), sessions en mémoire, limitation des tentatives. */
import crypto from "node:crypto";
import fs from "node:fs";

const N = 16384, LONG = 32;
export function hacher(mdp) {
  const sel = crypto.randomBytes(16);
  return `scrypt$${sel.toString("hex")}$${crypto.scryptSync(String(mdp), sel, LONG, { N }).toString("hex")}`;
}
export function verifier(mdp, stocke) {
  const m = /^scrypt\$([0-9a-f]+)\$([0-9a-f]+)$/.exec(String(stocke || "")); if (!m) return false;
  const attendu = Buffer.from(m[2], "hex"), calcule = crypto.scryptSync(String(mdp), Buffer.from(m[1], "hex"), attendu.length, { N });
  return attendu.length === calcule.length && crypto.timingSafeEqual(attendu, calcule);
}
export const motDePasseAleatoire = () => crypto.randomBytes(12).toString("base64url");

export function lireComptes(fichier) {
  if (!fs.existsSync(fichier)) return [];
  const l = JSON.parse(fs.readFileSync(fichier, "utf8")); return Array.isArray(l) ? l : [];
}
export function ecrireComptes(fichier, comptes) {
  const tmp = `${fichier}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(comptes, null, 2), { mode: 0o600 }); fs.renameSync(tmp, fichier);
}

export function creerSessions({ duree = 12 * 3600 * 1000, now = Date.now } = {}) {
  const m = new Map();
  return {
    ouvrir(c) { const j = crypto.randomBytes(32).toString("base64url"); m.set(j, { id: c.id, role: c.role, nom: c.nom || c.id, fin: now() + duree }); return j; },
    lire(j) { const s = m.get(j); if (!s) return null; if (now() > s.fin) { m.delete(j); return null; } return { id: s.id, role: s.role, nom: s.nom }; },
    fermer(j) { m.delete(j); },
  };
}

export function creerLimiteur({ max = 5, fenetre = 10 * 60 * 1000, now = Date.now } = {}) {
  const m = new Map();
  const vivants = cle => { const l = (m.get(cle) || []).filter(t => now() - t < fenetre); m.set(cle, l); return l; };
  return { bloque: cle => vivants(cle).length >= max, echec(cle) { vivants(cle).push(now()); }, succes(cle) { m.delete(cle); } };
}
```

- [ ] **Étape 4 :** `npm test` : tout vert.

---

### Task 3 : `server/adherents.mjs`, commande `compte`, `exemple --multi`

**Fichiers :**
- Créer : `server/adherents.mjs`, `tools/compte.mjs`
- Modifier : `tools/atelier.mjs` (commandes `compte`, option `--multi` de `exemple`, usage), `package.json` (scripts `compte`, `serveur`), `.gitignore` (`comptes.json`, `adherents/`)
- Test : `tests/adherents.test.mjs`

**Interfaces :**
- Produit :
  - `adherentsRoot(env = process.env) → string` ; `comptesFile(env = process.env) → string`.
  - `adherentsConnus(racine) → string[]` (sous-dossiers conformes à `^[a-z0-9_-]{1,40}$` contenant `spec/`).
  - `racineDe(racine, id) → string` ; lève `Error("adhérent inconnu")` si l'id n'est pas dans la liste.
  - `creerCompte({fichier, id, role, nom}) → {mdp}` (remplace un compte de même id, mot de passe en clair renvoyé une fois).

- [ ] **Étape 1 : test**

`tests/adherents.test.mjs` :
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { adherentsConnus, racineDe, creerCompte } from "../server/adherents.mjs";
import { lireComptes, verifier } from "../server/auth.mjs";

function base() {
  const b = fs.mkdtempSync(path.join(os.tmpdir(), "adh-"));
  for (const id of ["alpha", "beta"]) fs.mkdirSync(path.join(b, id, "spec"), { recursive: true });
  fs.mkdirSync(path.join(b, "Pas Valide", "spec"), { recursive: true }); fs.mkdirSync(path.join(b, "sans-spec"));
  return b;
}

test("adherentsConnus ne garde que les dossiers conformes avec spec/", () => {
  assert.deepEqual(adherentsConnus(base()), ["alpha", "beta"]);
});

test("racineDe refuse l'inconnu, les chemins relatifs et les ids hors format", () => {
  const b = base();
  assert.equal(racineDe(b, "alpha"), path.join(b, "alpha"));
  for (const id of ["gamma", "../alpha", "alpha/..", "", "Pas Valide", undefined]) assert.throws(() => racineDe(b, id), /adhérent inconnu/);
});

test("creerCompte : mot de passe renvoyé une fois, haché au fichier, remplacé si l'id existe", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cpt-")), "comptes.json");
  const { mdp } = creerCompte({ fichier: f, id: "alpha", role: "adherent", nom: "Alpha" });
  assert.equal(verifier(mdp, lireComptes(f)[0].mdp), true); assert.notEqual(lireComptes(f)[0].mdp, mdp);
  const { mdp: m2 } = creerCompte({ fichier: f, id: "alpha", role: "adherent", nom: "Alpha" });
  assert.equal(lireComptes(f).length, 1); assert.equal(verifier(m2, lireComptes(f)[0].mdp), true);
});
```

- [ ] **Étape 2 :** échec attendu.

- [ ] **Étape 3 : implémentation**

`server/adherents.mjs` :
```js
/* Liste des adhérents (un dossier chacun) et création des comptes. Un chemin ne se construit que depuis cette liste. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hacher, lireComptes, ecrireComptes, motDePasseAleatoire } from "./auth.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ID = /^[a-z0-9_-]{1,40}$/;
export const adherentsRoot = (env = process.env) => path.resolve(env.ADHERENTS_ROOT || path.join(APP, "adherents"));
export const comptesFile = (env = process.env) => path.resolve(env.COMPTES_FILE || path.join(APP, "comptes.json"));

export function adherentsConnus(racine) {
  if (!fs.existsSync(racine)) return [];
  return fs.readdirSync(racine, { withFileTypes: true }).filter(e => e.isDirectory() && ID.test(e.name) && fs.existsSync(path.join(racine, e.name, "spec"))).map(e => e.name).sort();
}
export function racineDe(racine, id) {
  if (typeof id !== "string" || !ID.test(id) || !adherentsConnus(racine).includes(id)) throw new Error("adhérent inconnu");
  return path.join(racine, id);
}
export function creerCompte({ fichier, id, role, nom }) {
  const mdp = motDePasseAleatoire();
  const autres = lireComptes(fichier).filter(c => c.id !== id);
  ecrireComptes(fichier, autres.concat([{ id, role, nom: nom || id, mdp: hacher(mdp) }]));
  return { mdp };
}
```

`tools/compte.mjs` :
```js
/* npm run compte -- --adherent <id> | --admin <nom> */
import { adherentsRoot, comptesFile, adherentsConnus, creerCompte } from "../server/adherents.mjs";

export function cmdCompte(args, env = process.env) {
  const val = k => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : null; };
  const fichier = comptesFile(env);
  if (val("admin")) { const id = `admin-${val("admin").toLowerCase().replace(/[^a-z0-9_-]/g, "")}`; const { mdp } = creerCompte({ fichier, id, role: "admin", nom: val("admin") }); return console.log(`Compte administrateur créé.\n  identifiant : ${id}\n  mot de passe : ${mdp}\n(affiché une seule fois)`); }
  const id = val("adherent"); if (!id) throw new Error("Usage : npm run compte -- --adherent <id> | --admin <nom>");
  if (!adherentsConnus(adherentsRoot(env)).includes(id)) throw new Error(`Adhérent « ${id} » introuvable dans ${adherentsRoot(env)} (crée d'abord son dossier).`);
  const { mdp } = creerCompte({ fichier, id, role: "adherent", nom: id });
  console.log(`Compte créé.\n  identifiant : ${id}\n  mot de passe : ${mdp}\n(affiché une seule fois)`);
}
```

Dans `tools/atelier.mjs` :
- importer `cmdCompte` et l'ajouter à `CMDS` : `compte: a => cmdCompte(a)` ; ajouter `compte --adherent <id>|--admin <nom>` et `exemple [--force|--multi]` à la ligne d'usage.
- `cmdExemple` : au début, si `args.includes("--multi")` : pour chaque `[id, nom]` de `[["alpha", "Transports Alpha"], ["beta", "Transports Bêta"]]`, créer `adherentsRoot()/<id>/` avec copies de `exemple/spec` et `exemple/data`, un `spec/reponses.yml` vide (`REGISTRE_VIDE`), remplacer la ligne `adherent: …` de `spec/projet.yml` par `adherent: <nom>`, créer le compte (`creerCompte`) et afficher identifiant + mot de passe ; créer aussi le compte admin `admin-michel`. Puis `return`. Refuser (message + `exitCode = 1`) si `adherentsRoot()/alpha` existe déjà, sauf `--force`.
- `package.json` : `"compte": "node tools/atelier.mjs compte"`, `"serveur": "node server/app.mjs"`.
- `.gitignore` : ajouter `comptes.json` et `adherents/`.

- [ ] **Étape 4 :** `npm test` vert ; vérification manuelle : `ADHERENTS_ROOT=/tmp/adh COMPTES_FILE=/tmp/adh/comptes.json npm run exemple -- --multi` affiche 3 couples identifiant/mot de passe ; les dossiers `alpha` et `beta` existent.

---

### Task 4 : `server/app.mjs` (routes, session, isolation)

**Fichiers :**
- Créer : `server/app.mjs`, `server/connexion.html`
- Test : `tests/serveur-multi.test.mjs`

**Interfaces :**
- Consomme : `ouvrirEspace`, `auth.mjs`, `adherents.mjs`.
- Produit : `creerApp({ adherents, comptes, cookieSecure = false, now = Date.now }) → http.Server` (non démarré). Démarrage CLI : `node server/app.mjs` lit `PORT` (défaut 4400) et écoute sur `127.0.0.1`.
- `/api/state` renvoie le JSON habituel plus `vue: {role, nom, adherents}` (`adherents` : liste pour l'admin, `[]` sinon ; `nom` = nom de l'adhérent lu dans `state.adherent`).

Règles de routage :
- Public : `GET /connexion`, `POST /api/connexion`, `GET /fonts/<fichier>.woff2`.
- Sans session : `GET /` → 302 `/connexion` ; `/api/*` et `/events` → 401 JSON `{erreurs: ["connexion requise"]}`.
- Adhérent résolu : session adhérent → `session.id` ; session admin → `?adherent=<id>` (sinon le premier de la liste ; aucun → page « Aucun adhérent »). Toute erreur de `racineDe` → 404.
- POST (`/api/connexion`, `/api/deconnexion`, `/api/reponse`, `/api/layout`) : refus 403 si `Origin` présent et différent de `http(s)://<Host>`.
- `/api/layout` : admin seulement (403 sinon). `/api/reponse` : adhérent ou admin, sur l'espace résolu.
- Temps réel : un ensemble de réponses SSE par adhérent ; après `repondre` réussi, envoyer `event: spec` à ses clients ; `fs.watch` récursif de `spec/` de l'adhérent à la première ouverture de son espace, avec anti-rebond 250 ms (comme `cmdServe`).

- [ ] **Étape 1 : test**

`tests/serveur-multi.test.mjs` :
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { creerApp } from "../server/app.mjs";
import { creerCompte } from "../server/adherents.mjs";
import { racineExemple } from "./aide/racine.mjs";

async function monter(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "multi-")), adherents = path.join(base, "adherents"), comptes = path.join(base, "comptes.json");
  for (const id of ["alpha", "beta"]) { fs.mkdirSync(adherents, { recursive: true }); fs.cpSync(racineExemple(), path.join(adherents, id), { recursive: true }); }
  const mdp = {}; for (const [id, role] of [["alpha", "adherent"], ["beta", "adherent"], ["admin-michel", "admin"]]) mdp[id] = creerCompte({ fichier: comptes, id, role, nom: id }).mdp;
  const srv = creerApp({ adherents, comptes }); await new Promise(ok => srv.listen(0, "127.0.0.1", ok)); t.after(() => srv.close());
  const url = `http://127.0.0.1:${srv.address().port}`;
  const connecter = async (id, pass = mdp[id]) => { const r = await fetch(url + "/api/connexion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, mdp: pass }) }); return { r, cookie: (r.headers.get("set-cookie") || "").split(";")[0] }; };
  return { url, adherents, mdp, connecter };
}
const get = (m, chemin, cookie, init = {}) => fetch(m.url + chemin, { redirect: "manual", ...init, headers: { cookie: cookie || "", ...(init.headers || {}) } });
const post = (m, chemin, cookie, corps, headers = {}) => fetch(m.url + chemin, { method: "POST", headers: { "content-type": "application/json", cookie: cookie || "", ...headers }, body: JSON.stringify(corps) });
const registre = (m, id) => YAML.parse(fs.readFileSync(path.join(m.adherents, id, "spec/reponses.yml"), "utf8")) || [];

test("sans session : / redirige, /api/state et /events refusent", async t => {
  const m = await monter(t);
  const r = await get(m, "/"); assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/connexion");
  assert.equal((await get(m, "/api/state")).status, 401); assert.equal((await get(m, "/events")).status, 401);
  assert.equal((await post(m, "/api/reponse", "", { id: "x" })).status, 401);
  assert.equal((await get(m, "/connexion")).status, 200);
});

test("connexion : cookie HttpOnly SameSite=Strict ; mauvais mot de passe : 401 au message unique", async t => {
  const m = await monter(t);
  const ok = await m.connecter("alpha"); assert.equal(ok.r.status, 200);
  assert.match(ok.r.headers.get("set-cookie"), /HttpOnly/); assert.match(ok.r.headers.get("set-cookie"), /SameSite=Strict/);
  const a = await m.connecter("alpha", "faux"), b = await m.connecter("inconnu", "faux");
  assert.deepEqual([a.r.status, b.r.status], [401, 401]); assert.deepEqual(await a.r.json(), await b.r.json());
});

test("limitation : 429 après 5 échecs, même avec le bon mot de passe ensuite", async t => {
  const m = await monter(t);
  for (let i = 0; i < 5; i++) assert.equal((await m.connecter("alpha", "faux")).r.status, 401);
  assert.equal((await m.connecter("alpha")).r.status, 429);
});

test("isolation : alpha écrit chez alpha seulement, ?adherent=beta est ignoré", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  const r = await post(m, "/api/reponse?adherent=beta", cookie, { id: "compta_balance#q1", saisie: { texte: "Réponse alpha" } });
  assert.equal(r.status, 200);
  assert.equal(registre(m, "alpha").length, 1); assert.equal(registre(m, "beta").length, 0);
  const st = await (await get(m, "/api/state?adherent=beta", cookie)).json();
  assert.equal(st.state.reponses.length, 1); assert.equal(st.vue.role, "adherent");
});

test("admin : choisit l'adhérent, voit la liste ; un id piégé donne 404", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("admin-michel");
  const st = await (await get(m, "/api/state?adherent=beta", cookie)).json();
  assert.deepEqual(st.vue.adherents, ["alpha", "beta"]); assert.equal(st.vue.role, "admin");
  for (const id of ["gamma", "..%2Falpha", "alpha%2F..%2F..%2Fetc"]) assert.equal((await get(m, `/api/state?adherent=${id}`, cookie)).status, 404);
});

test("l'adhérent ne peut pas écrire la disposition du schéma (admin seulement)", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  assert.equal((await post(m, "/api/layout", cookie, { kind: "ds", id: "x", x: 1, y: 1 })).status, 403);
  const adm = await m.connecter("admin-michel");
  assert.equal((await post(m, "/api/layout?adherent=alpha", adm.cookie, { kind: "ds", id: "x", x: 1, y: 1 })).status, 204);
});

test("POST d'une autre origine refusé (403), rien au registre", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  const r = await post(m, "/api/reponse", cookie, { id: "compta_balance#q1", saisie: { texte: "x" } }, { origin: "http://evil.example" });
  assert.equal(r.status, 403); assert.equal(registre(m, "alpha").length, 0);
});

test("deux réponses simultanées : deux entrées intactes", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  const rs = await Promise.all(["Une", "Deux"].map(x => post(m, "/api/reponse", cookie, { id: "compta_balance#q1", saisie: { texte: x } })));
  assert.deepEqual(rs.map(r => r.status), [200, 200]);
  assert.deepEqual(registre(m, "alpha").map(e => e.reponse).sort(), ["Deux", "Une"]);
});

test("page d'un adhérent : data-role=adherent ; déconnexion invalide la session", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  assert.match(await (await get(m, "/", cookie)).text(), /<body data-role="adherent">/);
  assert.equal((await post(m, "/api/deconnexion", cookie, {})).status, 204);
  assert.equal((await get(m, "/api/state", cookie)).status, 401);
});
```

- [ ] **Étape 2 :** échec attendu (module absent).

- [ ] **Étape 3 : implémentation**

`server/app.mjs` :
```js
/* Serveur multi-adhérent : connexion, session, un espace par adhérent. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ouvrirEspace } from "../tools/espace.mjs";
import { verifier, lireComptes, creerSessions, creerLimiteur } from "./auth.mjs";
import { adherentsConnus, racineDe, adherentsRoot, comptesFile } from "./adherents.mjs";

const ICI = path.dirname(fileURLToPath(import.meta.url)), APP = path.resolve(ICI, "..");
const json = (res, code, o, h = {}) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store", ...h }); res.end(JSON.stringify(o)); };
const refus = (res, code, msg) => json(res, code, { erreurs: [msg] });

function corps(req, res, fn) {
  if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) { req.resume(); return refus(res, 415, "corps attendu en application/json"); }
  const morceaux = []; let taille = 0, trop = false;
  req.on("data", c => { if (trop) return; taille += c.length; if (taille > 65536) { trop = true; refus(res, 413, "corps trop volumineux"); } else morceaux.push(c); });
  req.on("end", () => { if (trop) return; let o; try { o = JSON.parse(Buffer.concat(morceaux).toString("utf8")); } catch { return refus(res, 400, "corps JSON illisible"); } fn(o || {}); });
}
const cookieDe = req => /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie || "")?.[1] || "";

export function creerApp({ adherents, comptes, cookieSecure = false, now = Date.now }) {
  const sessions = creerSessions({ now }), limiteur = creerLimiteur({ now });
  const espaces = new Map(), flux = new Map(); // id → espace / Set de réponses SSE
  const envoyer = (id, ev) => (flux.get(id) || new Set()).forEach(r => r.write(`event: ${ev}\ndata: {}\n\n`));
  function espace(id) {
    let e = espaces.get(id); if (e) return e;
    e = ouvrirEspace(racineDe(adherents, id)); espaces.set(id, e);
    let timer = null; fs.watch(e.P("spec"), { recursive: true }, (_, f) => { if (f && /(^|[\\/])\.|~$|\.swp$|\.tmp$/.test(String(f))) return; clearTimeout(timer); timer = setTimeout(() => envoyer(id, "spec"), 250); });
    return e;
  }
  const originOk = req => { const o = req.headers.origin; return !o || o === `http://${req.headers.host}` || o === `https://${req.headers.host}`; };
  const connexionHtml = () => fs.readFileSync(path.join(ICI, "connexion.html"), "utf8").replace("/*WEMA*/", fs.readFileSync(path.join(APP, "viewer/wema.css"), "utf8"));

  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://x"), p = url.pathname;
    try {
      const pf = /^\/fonts\/([\w-]+\.woff2)$/.exec(p);
      if (pf) { const f = path.join(APP, "viewer/fonts", pf[1]); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable" }); return res.end(fs.readFileSync(f)); }
      if (p === "/connexion" && req.method === "GET") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); return res.end(connexionHtml()); }
      if (req.method === "POST" && !originOk(req)) return refus(res, 403, "origine refusée");
      if (p === "/api/connexion" && req.method === "POST") return corps(req, res, b => {
        const cle = `${String(b.id)}|${req.socket.remoteAddress}`;
        if (limiteur.bloque(cle)) return refus(res, 429, "Trop de tentatives, réessayez plus tard");
        const c = lireComptes(comptes).find(x => x.id === b.id);
        if (!c || !verifier(String(b.mdp ?? ""), c.mdp)) { limiteur.echec(cle); return refus(res, 401, "Identifiant ou mot de passe incorrect"); }
        limiteur.succes(cle);
        const sid = sessions.ouvrir(c);
        json(res, 200, { ok: true, role: c.role }, { "set-cookie": `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${cookieSecure ? "; Secure" : ""}` });
      });
      const s = sessions.lire(cookieDe(req));
      if (!s) { if (p === "/") { res.writeHead(302, { location: "/connexion" }); return res.end(); } return refus(res, 401, "connexion requise"); }
      if (p === "/api/deconnexion" && req.method === "POST") { sessions.fermer(cookieDe(req)); res.writeHead(204, { "set-cookie": "sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" }); return res.end(); }

      const liste = adherentsConnus(adherents);
      const id = s.role === "admin" ? (url.searchParams.get("adherent") || liste[0]) : s.id;
      if (!id) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end("<p>Aucun adhérent.</p>"); }
      let e; try { e = espace(id); } catch { return refus(res, 404, "adhérent introuvable"); }

      if (p === "/" && req.method === "GET") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); return res.end(e.viewerHtml({ role: s.role })); }
      if (p === "/api/state") { const { state, errors } = e.loadState(e.makeCtx()); return json(res, 200, { state, errors, at: new Date().toISOString(), vue: { role: s.role, nom: state.adherent, adherents: s.role === "admin" ? liste : [] } }); }
      if (p === "/events") { res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" }); res.write("retry: 1500\n\n"); if (!flux.has(id)) flux.set(id, new Set()); flux.get(id).add(res); req.on("close", () => flux.get(id).delete(res)); return; }
      if (p === "/api/reponse" && req.method === "POST") return corps(req, res, b => { try { const r = e.repondre(b); if (!r.erreurs) envoyer(id, "spec"); json(res, r.erreurs ? 400 : 200, r); } catch (x) { refus(res, 500, String(x.message || x)); } });
      if (p === "/api/layout" && req.method === "POST") {
        if (s.role !== "admin") return refus(res, 403, "réservé à l'administrateur");
        return corps(req, res, b => { try { const f = e.P(".atelier/layout.json"); fs.mkdirSync(path.dirname(f), { recursive: true }); const l = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {}; l[`${b.kind}:${b.id}`] = { x: Math.round(b.x), y: Math.round(b.y) }; fs.writeFileSync(f, JSON.stringify(l, null, 2)); res.writeHead(204); res.end(); } catch { res.writeHead(400); res.end(); } });
      }
      res.writeHead(404); res.end("introuvable");
    } catch (x) { res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }); res.end(String(x.message || x)); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = +process.env.PORT || 4400;
  creerApp({ adherents: adherentsRoot(), comptes: comptesFile(), cookieSecure: process.env.COOKIE_SECURE === "1" })
    .listen(port, "127.0.0.1", () => console.log(`Plateforme : http://localhost:${port}\nAdhérents : ${adherentsConnus(adherentsRoot()).join(", ") || "(aucun)"}`));
}
```

`server/connexion.html` : page autonome (formulaire identifiant + mot de passe, fond Marine, carte blanche centrée, bouton pilule dégradé), style `/*WEMA*/` injecté, polices via `/fonts/`. Le script envoie `POST /api/connexion` (JSON), redirige vers `/` si 200, affiche l'erreur du serveur sinon :
```html
<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion · Tredunion</title>
<style>/*WEMA*/
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--wm-gradient-side);font-family:var(--wm-font-body)}
form{background:#fff;border-radius:18px;padding:32px 36px;width:min(380px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.25)}
h1{font-family:var(--wm-font-heading);font-size:22px;margin:0 0 4px;color:var(--wm-marine)} p{margin:0 0 20px;color:var(--muted);font-size:13px}
label{display:block;font-size:12px;font-weight:700;margin:12px 0 4px;color:var(--wm-marine)}
input{width:100%;padding:10px 12px;border:1px solid var(--line-2);border-radius:10px;font:inherit}
button{margin-top:20px;width:100%;padding:12px;border:0;border-radius:999px;background:var(--wm-gradient-pill);color:#fff;font:inherit;font-weight:700;cursor:pointer}
#err{color:var(--bad);font-size:13px;min-height:18px;margin-top:12px}
</style></head><body>
<form id="f"><h1>Vos questions Tredunion</h1><p>Connectez-vous avec l'identifiant reçu de WeMa.</p>
<label for="id">Identifiant</label><input id="id" autocomplete="username" required>
<label for="mdp">Mot de passe</label><input id="mdp" type="password" autocomplete="current-password" required>
<button type="submit">Se connecter</button><div id="err" role="alert"></div></form>
<script>
document.getElementById("f").onsubmit=async e=>{ e.preventDefault();
  const r=await fetch("/api/connexion",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:document.getElementById("id").value.trim(),mdp:document.getElementById("mdp").value})});
  if(r.ok) return location.href="/"; const j=await r.json().catch(()=>({})); document.getElementById("err").textContent=(j.erreurs||["Erreur de connexion"])[0]; };
</script></body></html>
```

- [ ] **Étape 4 :** `npm test` : tout vert (les 9 tests du fichier + les précédents).

---

### Task 5 : vue adhérent (viewer) et vérification visuelle

**Fichiers :**
- Modifier : `viewer/boot.js`, `viewer/ui.js` (onglet initial), `viewer/body.html`, `viewer/style.css`
- Test : `tests/vue-adherent.test.mjs`

**Comportement :**
- `/api/state` fournit `vue` ; `loadState()` de `boot.js` le range dans `S.vue` (`S.vue = j.vue || null`).
- `body[data-role="adherent"]` : cacher par CSS `#t-canvas, #t-cat, #t-mes, #t-files, #t-log, #b-flows, #b-mask, #socs, .dock #st-chk, #b-chk` ; l'onglet par défaut est Questions (`S.tab` initial = `"q"`) ; le nom de l'adhérent s'affiche (déjà fait par `renderTop`, `S.st.adherent`) ; un bouton « Se déconnecter » (`#b-out`) apparaît dans la barre latérale pour tout rôle connecté.
- `body[data-role="admin"]` : tout visible + sélecteur `<select id="sel-adh">` listant `S.vue.adherents` ; son changement recharge `/?adherent=<id>` (et `loadState`/`/events` des pages utilisent déjà la requête de la page : ajouter `location.search` aux appels `fetch("/api/state"+location.search)`, `fetch("/api/reponse"+location.search)` et `new EventSource("/events"+location.search)`).
- En mode local (`npm run serve`) : pas de `data-role`, `S.vue` null : rien ne change, pas de bouton de déconnexion.

- [ ] **Étape 1 : test**

`tests/vue-adherent.test.mjs` (statique, lit les sources) :
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lire = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("le CSS cache le schéma et les outils d'atelier pour un adhérent", () => {
  const css = lire("viewer/style.css");
  for (const id of ["#t-canvas", "#t-cat", "#t-mes", "#t-files", "#t-log"]) assert.ok(css.includes(`body[data-role="adherent"] ${id}`), id);
});

test("boot.js transmet la requête de la page (?adherent=) à l'état, aux réponses et au temps réel", () => {
  const b = lire("viewer/boot.js"), u = lire("viewer/ui.js");
  assert.match(b, /\/api\/state"\s*\+\s*location\.search/); assert.match(b, /\/events"\s*\+\s*location\.search/);
  assert.match(u, /\/api\/reponse"\s*\+\s*location\.search/);
});

test("les pages portent le bouton de déconnexion et le sélecteur admin", () => {
  const h = lire("viewer/body.html"); assert.match(h, /id="b-out"/); assert.match(h, /id="sel-adh"/);
});
```

- [ ] **Étape 2 :** échec attendu.

- [ ] **Étape 3 : implémenter**

1. `viewer/style.css` (à la fin) :
```css
/* vue adhérent : seulement Questions et Dashboard */
body[data-role="adherent"] #t-canvas,body[data-role="adherent"] #t-cat,body[data-role="adherent"] #t-mes,
body[data-role="adherent"] #t-files,body[data-role="adherent"] #t-log,body[data-role="adherent"] #b-flows,
body[data-role="adherent"] #b-mask,body[data-role="adherent"] #socs,body[data-role="adherent"] #st-chk{display:none}
body:not([data-role]) #b-out,body:not([data-role]) #sel-adh,body[data-role="adherent"] #sel-adh{display:none}
#sel-adh,#b-out{margin:8px 12px;font:inherit;font-size:12.5px}
#b-out{background:transparent;border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:999px;padding:6px 12px;cursor:pointer}
```
2. `viewer/body.html` : dans l'en-tête après `<span id="adherent"></span>` ajouter `<select id="sel-adh" aria-label="Adhérent"></select>` ; après `<div class="spacer"></div>` ajouter `<button id="b-out" type="button">Se déconnecter</button>`.
3. `viewer/boot.js` :
   - `fetch("/api/state",{cache:"no-store"})` → `fetch("/api/state"+location.search,{cache:"no-store"})` ; `new EventSource("/events")` → `new EventSource("/events"+location.search)`.
   - Dans `loadState()`, après `const r=…; const j=…;` : `S.vue=j.vue||null; if(S.vue&&!S.vueInit){ S.vueInit=true; if(S.vue.role==="adherent") S.tab="q"; const sel=$("#sel-adh"); sel.innerHTML=S.vue.adherents.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join(""); sel.value=new URLSearchParams(location.search).get("adherent")||S.vue.adherents[0]||""; }`.
   - En fin de fichier, avant `loadState();` : `$("#sel-adh").onchange=e=>{ location.search="?adherent="+encodeURIComponent(e.target.value); }; $("#b-out").onclick=async()=>{ await fetch("/api/deconnexion",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}); location.href="/connexion"; };`
   - Ajuster l'affichage initial : si `S.tab==="q"` après `S.vueInit`, appeler la fonction qui active l'onglet (la même que les clics `#t-q`, voir `ui.js`) ; relire `ui.js` pour trouver son nom et l'appeler.
4. `viewer/ui.js` : `fetch("/api/reponse",` → `fetch("/api/reponse"+location.search,`.

- [ ] **Étape 4 : vérification**

`npm test` vert. Puis vérification visuelle : `ADHERENTS_ROOT=/tmp/adh COMPTES_FILE=/tmp/adh/comptes.json npm run exemple -- --multi`, lancer `PORT=4482 npm run serveur` (mêmes variables), puis :
1. `/` sans session → page de connexion (capture).
2. Connexion `alpha` : seuls Questions et Dashboard visibles, nom « Transports Alpha », répondre à une question, effet affiché ; `/?adherent=beta` n'y change rien.
3. Connexion `admin-michel` : tous les onglets et le sélecteur ; passer sur `beta` : « Transports Bêta », 0 réponse.
4. Déconnexion → retour à la connexion.
Arrêter le serveur et effacer `/tmp/adh`.

---

### Task 6 : documentation et fin

**Fichiers :** `AGENTS.md`, `README.md`, spec `2026-11-08-plateforme-2a-multi-adherent-design.md`.

- [ ] Ajouter à `AGENTS.md` (table des commandes) : `npm run serveur` (plateforme multi-adhérent, variables `ADHERENTS_ROOT`, `COMPTES_FILE`, `PORT`, `COOKIE_SECURE`), `npm run compte -- --adherent <id> | --admin <nom>`, `npm run exemple -- --multi`.
- [ ] Dans le design 2a : remplacer `/api/events` par `/events` et la phrase sur la file par « `repondre` est synchrone : dans un processus unique les écritures d'un adhérent sont déjà sérialisées ».
- [ ] `npm test` (attendu ≥ 130 tests, 0 échec) et `npm run check` (0 erreur).
- [ ] Revue finale de la branche entière (isolation, cookies, aucun mot de passe en clair dans les journaux).

---

## Auto-revue

- **Couverture du design 2a :** dossiers et comptes (T3), module d'espace (T1), auth, sessions, limitation (T2), routes, isolation, admin, origine, atomicité (T1, T4), vue adhérent/admin et connexion (T4, T5), démonstration à deux adhérents (T3, T5), tests (T1 à T5). La file par adhérent est écartée avec justification (synchrone), notée en T6.
- **Cohérence des noms :** `ouvrirEspace`, `creerApp`, `racineDe`, `adherentsConnus`, `creerCompte`, `creerSessions`, `creerLimiteur`, `hacher`, `verifier`, `lireComptes`, `ecrireComptes` identiques partout.
- **Point à surveiller :** T1 est un déplacement mécanique : si un test existant échoue après, c'est une référence à `ROOT`/`P` non traduite.
