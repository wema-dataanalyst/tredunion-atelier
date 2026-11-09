# Libellés lisibles des catégories — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque code `%COD_CATEGORIE` peut porter un libellé lisible (proposé par la maquette, corrigé par l'adhérent), affiché dans la plateforme et exposé dans FAITS par un nouveau champ `LIB_LISIBLE`, sans toucher aux codes, à `LIB_Categorie` ni au catalogue.

**Architecture:** Le référentiel (`spec/referentiel.yml`) porte `lib` et `hypothese` par code. Le moteur les charge dans `st.categories`, expose `libelleCat(cod)`, traite `categorie:<cod>` comme cible d'hypothèse et de `definir`, et génère `LIB_LISIBLE` à l'union des flux. Une boucle agent de la maquette propose les libellés ; la plateforme les affiche.

**Tech Stack:** Node ESM, `core/*.js` exécutés dans `vm`, `yaml` (Document, commentaires conservés), `node:test`.

Design : `docs/superpowers/specs/2026-11-08-libelles-categories-design.md`.

## Global Constraints

- Textes en français. Pas de git : un `npm test` vert remplace le commit.
- Ne modifie jamais le catalogue (`spec/catalogue/elements_principaux.txt`), les codes du référentiel, ni `LIB_Categorie`. Le `spec/` racine du dépôt est un gabarit : ne l'écris pas ; les tests utilisent `racineExemple()` (copie temporaire). N'écris pas dans `adherents/`.
- Le référentiel reste fermé : aucun code créé (traité au cycle KPI).
- Un libellé écrit par l'agent a toujours `valide: false`, `refuse: false`. Une hypothèse tranchée (validée ou refusée) n'est jamais réécrite. Longueur d'un libellé : 1 à 60 caractères, une ligne.
- Garde les commentaires YAML ; un référentiel sans aucun `lib` se comporte exactement comme avant (suite existante verte).
- Les fonctions de `core/` doivent rester utilisables dans le navigateur (le viewer concatène `core/*.js`, `ui.js`, `dash.js`, `boot.js` dans un seul script) : pas de `import`, pas d'API Node.
- Aucune valeur de colonne `pii: true` dans les textes écrits.

## Fichiers

| Fichier | Rôle |
|---|---|
| `tools/espace.mjs` | chargement de `lib`/`hypothese`, aperçu de question |
| `core/model.js` | `libelleCat`, `LIB_LISIBLE` (champ, SQL), hydrate |
| `core/calque.js` | cible `categorie:<cod>` pour `valider` et `definir` |
| `core/hypotheses.js`, `core/questions.js` | hypothèses et lot « categories » |
| `core/check.js` | validation des libellés |
| `server/agent/specs.mjs`, `maquette-outils.mjs`, `maquette-agent.mjs`, `interpreter.mjs` | écriture, outil, boucle, prompt d'interprétation |
| `server/maquette.mjs`, `viewer/ui.js` | étape « libelles » |
| `viewer/ui.js`, `tools/atelier.mjs`, `tools/espace.mjs` | affichage |
| `tests/libelles-categories.test.mjs` | tests de ce plan |

---

### Task 1: Moteur — chargement, libellé, hypothèses, réponses, FAITS

**Files:**
- Modify: `tools/espace.mjs:81` (catégories) et `apercuQuestion` (branche `perimetre:`)
- Modify: `core/model.js` (`FAITS_FIELDS` l.21, `faitsSql` l.312, nouveau `libelleCat`, `libLisibleSql`)
- Modify: `core/calque.js` (`porteurHypothese`, `cibleDefinir`, `erreurModif`, `appliquerModif`)
- Modify: `core/hypotheses.js` (`listeHypotheses`)
- Modify: `core/questions.js` (`datasetDe`, lot)
- Modify: `core/check.js`
- Create: `tests/libelles-categories.test.mjs`

**Interfaces:**
- Produces: `st.categories[i] = {cod, note, lib, hypothese}` (`lib`: texte ou `""`, `hypothese`: objet ou `undefined`) ; `libelleCat(cod) → string` (libellé ou code) ; cible d'hypothèse `categorie:<cod>` ; opération `definir` de cible `categorie:<cod>.lib` ; champ FAITS `LIB_LISIBLE`.

- [ ] **Step 1 : tests qui échouent**

Crée `tests/libelles-categories.test.mjs`. Avant, lis `tests/perimetre.test.mjs` (helper `moteur`) et `tests/perimetre-maquette.test.mjs` (`neuf`, `racineExemple`) pour reprendre la façon d'obtenir le contexte `vm` d'un espace (`ouvrirEspace(racine).evaluate().ctx` + `vm.runInContext(...)`). Tests à écrire (texte exact des assertions) :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import YAML from "yaml";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";

const hyp = { source: "agent", preuves: ["Flux f2 : 12 lignes"], question: "« AFFR » est-il l'affrètement ?", valide: false, refuse: false };
const ref = (racine, codes) => fs.writeFileSync(path.join(racine, "spec/referentiel.yml"), "# Référentiel\n" + YAML.stringify({ codes }));
const ctx = racine => ouvrirEspace(racine).evaluate().ctx;
const evalJs = (racine, js) => JSON.parse(JSON.stringify(vm.runInContext(js, ctx(racine))));

test("référentiel : forme chaîne, forme objet, avec libellé et hypothèse", () => {
  const racine = racineExemple();
  ref(racine, ["AUTRE", { cod: "AFFR", lib: "Chiffre d'affaires affrètement", hypothese: hyp }, { cod: "CA TPS", note: "n" }]);
  const cats = evalJs(racine, "S.st.categories");
  assert.deepEqual(cats.map(c => c.cod), ["AUTRE", "AFFR", "CA TPS"]);
  assert.equal(cats[0].lib, ""); assert.equal(cats[1].lib, "Chiffre d'affaires affrètement"); assert.equal(cats[1].hypothese.valide, false); assert.equal(cats[2].note, "n");
});

test("libelleCat : libellé, sinon code, sinon code inconnu tel quel", () => {
  const racine = racineExemple(); ref(racine, [{ cod: "AFFR", lib: "Affrètement" }, "AUTRE"]);
  assert.equal(evalJs(racine, `libelleCat("AFFR")`), "Affrètement");
  assert.equal(evalJs(racine, `libelleCat("AUTRE")`), "AUTRE");
  assert.equal(evalJs(racine, `libelleCat("ZZZ")`), "ZZZ");
});

test("hypothèse categorie:<cod> : listée, lot catégories, valider l'applique", () => {
  const racine = racineExemple(); ref(racine, [{ cod: "AFFR", lib: "Affrètement", hypothese: hyp }]);
  const h = evalJs(racine, `listeHypotheses().filter(h=>h.cible==="categorie:AFFR")`);
  assert.equal(h.length, 1); assert.equal(h[0].fichier, "spec/referentiel.yml");
  const q = evalJs(racine, `listeQuestions().filter(q=>q.id==="categorie:AFFR")`);
  assert.equal(q.length, 1); assert.equal(q[0].lot, "categories");
  const e = ouvrirEspace(racine);
  const r = e.repondre({ id: "categorie:AFFR", saisie: { oui: true }, par: "" });
  assert.ok(!r.erreurs, JSON.stringify(r));
  assert.equal(evalJs(racine, `S.st.categories.find(c=>c.cod==="AFFR").hypothese.valide`), true);
});

test("definir categorie:<cod>.lib : corrige le libellé ; texte invalide ou code inconnu refusés", () => {
  const racine = racineExemple(); ref(racine, [{ cod: "AFFR", lib: "Affrètement", hypothese: hyp }]);
  const ok = evalJs(racine, `erreurModif({op:"definir",cible:"categorie:AFFR.lib",valeur:"Affrètement national"})`);
  assert.equal(ok, null);
  assert.ok(evalJs(racine, `erreurModif({op:"definir",cible:"categorie:ZZZ.lib",valeur:"x"})`));
  assert.ok(evalJs(racine, `erreurModif({op:"definir",cible:"categorie:AFFR.lib",valeur:""})`));
  assert.ok(evalJs(racine, `erreurModif({op:"definir",cible:"categorie:AFFR.lib",valeur:"${"x".repeat(61)}"})`));
  assert.ok(evalJs(racine, `erreurModif({op:"definir",cible:"categorie:AFFR.lib",valeur:"a\\nb"})`));
  assert.ok(evalJs(racine, `erreurModif({op:"definir",cible:"categorie:AFFR.cod",valeur:"x"})`));
});

test("réponse définir : le libellé affiché et le CASE FAITS suivent", () => {
  const racine = racineExemple(); ref(racine, [{ cod: "AFFR", lib: "Affrètement", hypothese: hyp }, "AUTRE"]);
  fs.writeFileSync(path.join(racine, "spec/reponses.yml"), YAML.stringify([{ id: "categorie:AFFR", question: "q", reponse: "Non, c'est « Affrètement national »", origine: "client", date: "2026-11-08T10:00:00", modifs: [{ op: "definir", cible: "categorie:AFFR.lib", valeur: "Affrètement national" }] }]));
  assert.equal(evalJs(racine, `libelleCat("AFFR")`), "Affrètement national");
  assert.match(evalJs(racine, `faitsSql()`), /when 'AFFR' then 'Affrètement national'/);
});

test("FAITS : champ LIB_LISIBLE ; CASE seulement pour les codes libellés ; sans libellé : code", () => {
  const racine = racineExemple(); ref(racine, [{ cod: "AFFR", lib: "Affrètement" }, "AUTRE"]);
  assert.ok(evalJs(racine, `FAITS_FIELDS.some(f=>f[0]==="LIB_LISIBLE")`));
  const sql = evalJs(racine, `faitsSql()`);
  assert.match(sql, /as "LIB_LISIBLE"/); assert.match(sql, /when 'AFFR' then 'Affrètement'/); assert.doesNotMatch(sql, /when 'AUTRE'/);
  assert.match(sql, /as "LIB_Categorie"/, "LIB_Categorie inchangé");
  const sans = racineExemple(); ref(sans, ["AFFR", "AUTRE"]);
  const s2 = evalJs(sans, `faitsSql()`); assert.doesNotMatch(s2, /\bwhen '[A-Z ]+' then 'Aff/); assert.match(s2, /"LIB_LISIBLE"/);
});

test("libellé avec apostrophe : échappé dans le SQL", () => {
  const racine = racineExemple(); ref(racine, [{ cod: "AFFR", lib: "Chiffre d'affaires" }]);
  assert.match(evalJs(racine, `faitsSql()`), /then 'Chiffre d''affaires'/);
});

test("check : libellé trop long ou en double signalé ; référentiel sans lib sans alerte nouvelle", () => {
  const racine = racineExemple(); ref(racine, [{ cod: "AFFR", lib: "x".repeat(61) }, { cod: "AUTRE", lib: "Pareil" }, { cod: "AUTRE2", lib: "pareil" }]);
  const msgs = evalJs(racine, `runCheck().map(x=>x.msg||x.message||x.txt||JSON.stringify(x))`);
  assert.ok(msgs.some(m => /AFFR.*(60|long)/.test(m)), msgs.join("\n"));
  assert.ok(msgs.some(m => /Pareil|pareil/.test(m) && /AUTRE/.test(m)), msgs.join("\n"));
});

test("contrat ODCS de FAITS : LIB_LISIBLE déclaré", () => {
  const racine = racineExemple(); ref(racine, [{ cod: "AFFR", lib: "Affrètement" }]);
  const o = evalJs(racine, `odcs(S.st.gold.find(t=>t.kind==="faits"))`);
  assert.match(o, /LIB_LISIBLE/);
});

test("aperçu d'une question categorie: : pas de dataset", () => {
  const racine = racineExemple(); ref(racine, [{ cod: "AFFR", lib: "Affrètement", hypothese: hyp }]);
  const a = ouvrirEspace(racine).apercuQuestion("categorie:AFFR");
  assert.equal(a.aucun, true); assert.doesNotMatch(a.raison, /dataset introuvable/);
});
```

Adapte aux vrais noms : cherche dans `core/check.js` la fonction exportée (`runCheck`/autre) et la forme de ses messages (`rg -n "function check|function run" core/check.js`), et dans `tools/espace.mjs` la signature de `repondre` et `apercuQuestion` (`rg -n "function repondre|function apercuQuestion" tools/espace.mjs`). Ne change pas l'intention des assertions.

- [ ] **Step 2 : constater l'échec** — `node --test tests/libelles-categories.test.mjs` : tous échouent (fonctions, champs, cible absents).

- [ ] **Step 3 : chargement** — `tools/espace.mjs:81`, remplace la ligne `const categories = …` par :

```js
    const categories = (ref.codes || []).map(c => typeof c === "string" ? { cod: c, note: "", lib: "" } : { cod: String(c.cod), note: c.note || "", lib: typeof c.lib === "string" ? c.lib : "", ...(c.hypothese && typeof c.hypothese === "object" ? { hypothese: c.hypothese } : {}) });
```

Dans `apercuQuestion`, juste après la branche `perimetre:` ajoutée au plan A (`else if (el.startsWith("perimetre:")) …`), ajoute :

```js
    else if (el.startsWith("categorie:")) raison = "question sur le libellé d'une catégorie : pas de données à afficher";
```

- [ ] **Step 4 : `core/model.js`**

(a) `FAITS_FIELDS` (l.21) : insère après l'élément `["LIB_Categorie","text","Libellé catégorie"]` : `["LIB_LISIBLE","text","Libellé lisible de la catégorie"],`.

(b) Ajoute près de `fluxLabel` :

```js
/* libellé lisible d'un code catégorie : le libellé du référentiel, sinon le code */
function libelleCat(cod){ const c=(S.st.categories||[]).find(x=>x.cod===cod); return c&&c.lib&&String(c.lib).trim()?String(c.lib).trim():String(cod); }
function libLisibleSql(){ const cs=(S.st.categories||[]).filter(c=>c.lib&&String(c.lib).trim());
  if(!cs.length) return `u."%COD_CATEGORIE"`;
  return `case u."%COD_CATEGORIE"\n${cs.map(c=>`        when ${sq(c.cod)} then ${sq(String(c.lib).trim())}`).join("\n")}\n        else u."%COD_CATEGORIE"\n    end`; }
```

(c) `faitsSql` (l.312) : la 2e ligne du `return` devient :

```js
  return `-- FAITS · table longue du modèle Qlik Tredunion\n-- Une ligne = un montant pour une catégorie, un mois et les axes connus du flux.\n\nselect\n    u.*,\n    ${libLisibleSql()} as "LIB_LISIBLE"\nfrom (\n${parts.join("\n\nunion all\n\n")}\n) as u\n`; }
```

(la branche « aucun flux défini » reste telle quelle, elle liste déjà `FAITS_FIELDS`, donc `LIB_LISIBLE` y figure). Vérifie que `sq` double bien les apostrophes ; sinon corrige l'appel, pas `sq`.

- [ ] **Step 5 : `core/calque.js`**

`porteurHypothese`, avant la ligne `m=/^perimetre:…` ajoute :

```js
  m=/^categorie:(.+)$/.exec(cible); if(m) return (st.categories||[]).find(c=>c.cod===m[1])||null;
```

`cibleDefinir` : en première ligne du corps, avant le test `flux:`, ajoute `let k=/^categorie:(.+)\.(\w+)$/.exec(c); if(k) return {categorie:k[1],champ:k[2]};` (en gardant `let x` pour la suite). Dans `erreurModif`, dans le bloc `m.op==="definir"`, juste après `const x=cibleDefinir(m.cible);` ajoute :

```js
    if(x&&x.categorie){ const c=(st.categories||[]).find(k=>k.cod===x.categorie); if(!c) return `catégorie introuvable : ${x.categorie}`; if(x.champ!=="lib") return `champ de catégorie non modifiable : ${x.champ} (lib)`;
      const t=typeof m.valeur==="string"?m.valeur.trim():""; if(!t) return "libellé vide"; if(t.length>60) return "libellé trop long (60 caractères au plus)"; const bad=texteInvalide(m.valeur); return bad?`libellé ${bad}`:null; }
```

Dans `appliquerModif`, bloc `m.op==="definir"` : remplace la ligne par

```js
  if(m.op==="definir"){ const x=cibleDefinir(m.cible); if(x.categorie) st.categories.find(k=>k.cod===x.categorie).lib=String(m.valeur).trim(); else (x.flux?flux(x.flux):col(x.ref))[x.champ]=m.valeur; }
```

- [ ] **Step 6 : hypothèses, questions, check**

`core/hypotheses.js`, après la ligne `perimetre:` ajoutée au plan A, ajoute :

```js
  (S.st.categories||[]).forEach(c=>{ if(c.hypothese) push(`categorie:${c.cod}`,"spec/referentiel.yml",`Libellé de la catégorie ${c.cod} : ${c.lib||c.cod}`,{...c.hypothese,titre:c.hypothese.titre||`Appelez-vous « ${c.cod} » : ${c.lib||c.cod} ?`,contexte:c.hypothese.contexte||""}); });
```

`core/questions.js` : dans la regexp de `datasetDe`, ajoute `categorie:` (`/^(DIM_|controle:|perimetre:|categorie:)/`). Dans le `add({… lot:h.cible.startsWith("perimetre:")?"adherent":ds?…` des hypothèses, remplace par `lot:h.cible.startsWith("perimetre:")?"adherent":h.cible.startsWith("categorie:")?"categories":ds?lotDe(ds):"dimensions"` (en conservant le reste de l'appel).

`core/check.js`, après la boucle des groupes de périmètre ajoutée au plan A, ajoute :

```js
  const libs=new Map();
  (st.categories||[]).forEach(c=>{ const f="spec/referentiel.yml"; if(c.lib===undefined||c.lib==="") return;
    if(String(c.lib).length>60) add("erreur",f,`catégorie ${c.cod} : libellé trop long (60 caractères au plus)`);
    const k=String(c.lib).trim().toLowerCase(); if(libs.has(k)) add("alerte",f,`catégories ${libs.get(k)} et ${c.cod} : même libellé « ${c.lib} »`); else libs.set(k,c.cod); });
```

Aucune hypothèse ne doit être dupliquée : si `check.js` vérifie déjà les hypothèses des autres porteurs par parcours de `listeHypotheses`, rien d'autre à faire.

- [ ] **Step 7 : tests verts** — `node --test tests/libelles-categories.test.mjs` PASS, puis `npm test` tout vert.

---

### Task 2: Écriture validée, outil, boucle de la maquette, prompt d'interprétation

**Files:**
- Modify: `server/agent/specs.mjs` (ajout `ecrireLibelles` en fin de fichier)
- Modify: `server/agent/maquette-outils.mjs`, `server/agent/maquette-agent.mjs`, `server/agent/interpreter.mjs` (ligne 7), `server/agent/outils.mjs` (ligne 6, libellé d'opération)
- Modify: `server/maquette.mjs`, `viewer/ui.js` (`etapeMaquette`)
- Modify: `tests/maquette-agent.test.mjs` (liste `NOMS` : `ecrire_libelles`, `lire_codes_sans_libelle`)
- Test: `tests/libelles-categories.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `espace.couverture` / flux de l'espace ; `hypotheseNette`, `preparer`, `chemin`, `lireYaml`, `ecrire`, `poser`, `erreursPii`, `str`, `obj`, `sauf` de `specs.mjs` ; `lireReferentiel`.
- Produces: `espace.codesSansLibelle() → [{cod, flux: string[]}]` (codes utilisés par au moins un flux, sans libellé, hors hypothèse tranchée) ; `ecrireLibelles(racine, entree, autorises) → {ok:true}|{erreurs}` où `entree = {id, libelles:[{cod, lib, hypothese}]}` ; `proposerLibelles({espace, racine, llm, rapporter, budget})`.

- [ ] **Step 1 : tests qui échouent** (ajoute au fichier de test, imports `ecrireLibelles`, `creerOutilsMaquette`, `proposerLibelles`, `creerBudget`, `SYSTEME_MAQUETTE`, `fauxLlm`, `appelOutil` ; reprends la forme d'usage de `tests/perimetre-maquette.test.mjs`)

```js
test("codesSansLibelle : codes utilisés par un flux, sans libellé, et plus après écriture", () => {
  const racine = racineExemple(), e = ouvrirEspace(racine);
  const c = e.codesSansLibelle(); assert.ok(c.length > 0);
  c.forEach(x => { assert.equal(typeof x.cod, "string"); assert.ok(x.flux.length > 0); });
  assert.deepEqual(ecrireLibelles(racine, { id: "libelles", libelles: [{ cod: c[0].cod, lib: "Un libellé", hypothese: hyp }] }, c.map(x => x.cod)), { ok: true });
  assert.ok(!ouvrirEspace(racine).codesSansLibelle().some(x => x.cod === c[0].cod));
});

test("ecrireLibelles : écrit lib + hypothèse non validée, conserve commentaire et autres codes", () => {
  const racine = racineExemple(), cod = ouvrirEspace(racine).codesSansLibelle()[0].cod;
  const avant = fs.readFileSync(path.join(racine, "spec/referentiel.yml"), "utf8");
  assert.deepEqual(ecrireLibelles(racine, { id: "libelles", libelles: [{ cod, lib: "Affrètement", hypothese: { ...hyp, valide: true } }] }, [cod]), { ok: true });
  const t = fs.readFileSync(path.join(racine, "spec/referentiel.yml"), "utf8"), d = YAML.parse(t);
  assert.equal(t.split("\n")[0], avant.split("\n")[0], "commentaire conservé");
  const c = d.codes.find(x => (x.cod ?? x) === cod); assert.equal(c.lib, "Affrètement"); assert.equal(c.hypothese.valide, false);
  assert.equal(d.codes.length, YAML.parse(avant).codes.length, "aucun code créé ou perdu");
});

test("ecrireLibelles : refuse code inconnu, libellé vide/long/multiligne, sans preuves ; atomique", () => {
  const racine = racineExemple(), cod = ouvrirEspace(racine).codesSansLibelle()[0].cod, f = path.join(racine, "spec/referentiel.yml"), avant = fs.readFileSync(f, "utf8");
  const essai = l => ecrireLibelles(racine, { id: "libelles", libelles: l }, [cod]);
  assert.ok(essai([{ cod: "ZZZ_INCONNU", lib: "x", hypothese: hyp }]).erreurs);
  assert.ok(essai([{ cod, lib: "", hypothese: hyp }]).erreurs);
  assert.ok(essai([{ cod, lib: "x".repeat(61), hypothese: hyp }]).erreurs);
  assert.ok(essai([{ cod, lib: "a\nb", hypothese: hyp }]).erreurs);
  assert.ok(essai([{ cod, lib: "ok", hypothese: { source: "agent", preuves: [], question: "q" } }]).erreurs);
  assert.ok(essai([{ cod, lib: "ok", hypothese: hyp }, { cod: "ZZZ", lib: "x", hypothese: hyp }]).erreurs, "un refus annule tout le lot");
  assert.equal(fs.readFileSync(f, "utf8"), avant, "rien d'écrit en cas de refus");
});

test("ecrireLibelles : un libellé tranché n'est pas réécrit ; un libellé proposé peut l'être", () => {
  const racine = racineExemple(), cod = ouvrirEspace(racine).codesSansLibelle()[0].cod;
  const w = lib => ecrireLibelles(racine, { id: "libelles", libelles: [{ cod, lib, hypothese: hyp }] }, [cod]);
  assert.deepEqual(w("Premier"), { ok: true }); assert.deepEqual(w("Second"), { ok: true });
  const f = path.join(racine, "spec/referentiel.yml");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("valide: false", "valide: true"));
  assert.match(w("Troisième").erreurs.join(), /tranchée/);
});

test("outils maquette : lire_codes_sans_libelle et ecrire_libelles ; prompt et interpréteur à jour", async () => {
  const racine = racineExemple(), espace = ouvrirEspace(racine), o = creerOutilsMaquette({ espace, racine });
  const c = (await o.lire_codes_sans_libelle.executer({})).codes; assert.ok(c.length > 0);
  assert.ok((await o.ecrire_libelles.executer({ id: "libelles", libelles: [{ cod: "ZZZ", lib: "x", hypothese: hyp }] })).erreurs);
  assert.deepEqual(await o.ecrire_libelles.executer({ id: "libelles", libelles: [{ cod: c[0].cod, lib: "Libellé", hypothese: { ...hyp, valide: true } }] }), { ok: true });
  assert.match(SYSTEME_MAQUETTE, /ecrire_libelles/);
  assert.match(fs.readFileSync("server/agent/interpreter.mjs", "utf8"), /categorie:<code>\.lib/);
});

test("proposerLibelles : sans code à libeller, aucun appel LLM ; sinon une boucle", async () => {
  const racine = racineExemple(), espace = ouvrirEspace(racine);
  espace.codesSansLibelle = () => [];
  const r0 = await proposerLibelles({ espace, racine, llm: fauxLlm([]), budget: creerBudget() });
  assert.equal(r0.ok, true); assert.deepEqual(r0.boucles, []);
  const e2 = ouvrirEspace(racine), cod = e2.codesSansLibelle()[0].cod;
  const llm = fauxLlm([appelOutil("lire_codes_sans_libelle", {}), appelOutil("ecrire_libelles", { id: "libelles", libelles: [{ cod, lib: "Libellé proposé", hypothese: hyp }] }), appelOutil("terminer", { resume: "ok" })]);
  const r = await proposerLibelles({ espace: e2, racine, llm, budget: creerBudget() });
  assert.equal(r.ok, true); assert.equal(r.boucles.length, 1);
  assert.ok(!ouvrirEspace(racine).codesSansLibelle().some(x => x.cod === cod), "pas reproposé à la relance");
});
```

Adapte `fauxLlm`/`appelOutil` à leur vraie forme (lis `tests/aide/faux-llm.mjs`). Ajoute `"lire_codes_sans_libelle"` et `"ecrire_libelles"` à `NOMS` dans `tests/maquette-agent.test.mjs`.

- [ ] **Step 2 : constater l'échec** (`node --test tests/libelles-categories.test.mjs tests/maquette-agent.test.mjs`).

- [ ] **Step 3 : `codesSansLibelle` dans `tools/espace.mjs`** (après `candidatsPerimetre`, et à l'objet retourné) :

```js
  /* Codes utilisés par au moins un flux, sans libellé : candidats à la proposition de la maquette. Un code dont l'hypothèse est tranchée est écarté. */
  function codesSansLibelle() {
    const { ctx } = evaluate();
    return JSON.parse(JSON.stringify(vm.runInContext(`(()=>{ const use=new Map();
      S.st.flux.forEach(f=>{ const cods=f.codMode==="regles"?(f.rules||[]).map(r=>r.cod):f.codMode==="colonne"?[]:[f.cod]; cods.filter(Boolean).forEach(c=>{ if(!use.has(c)) use.set(c,new Set()); use.get(c).add(f.id); }); });
      return S.st.categories.filter(c=>use.has(c.cod)&&!(c.lib&&String(c.lib).trim())&&!(c.hypothese&&(c.hypothese.valide||c.hypothese.refuse))).map(c=>({cod:c.cod,flux:[...use.get(c.cod)]})); })()`, ctx)));
  }
```

Un code lu dans une colonne (`codMode: colonne`) n'est pas énumérable sans lire les données : il est volontairement ignoré (limite à noter dans la doc). Si `ecrireLibelles` doit aussi proposer un libellé pour un code déjà libellé mais seulement proposé, il l'écrase (cas relance) : `codesSansLibelle` ne le renvoie pas, donc l'agent ne le reçoit pas, mais `ecrireLibelles` l'accepte tant qu'il est dans `autorises`.

- [ ] **Step 4 : `ecrireLibelles` dans `server/agent/specs.mjs`** (fin de fichier ; réutilise les mêmes helpers que `ecrirePerimetre`) :

```js
/* ───── libellés lisibles des catégories ───── */
export function ecrireLibelles(racine, entree, autorises) {
  const p = preparer(entree); if (p.erreurs) return p;
  const e = p.e, f = chemin(racine, "referentiel.yml"), errs = [];
  if (!f || !fs.existsSync(f)) return { erreurs: ["referentiel.yml absent"] };
  if (!Array.isArray(e.libelles) || !e.libelles.length || e.libelles.length > 40) return { erreurs: ["libelles : liste de 1 à 40 éléments {cod, lib, hypothese}"] };
  const doc = lireYaml(f), map = racineMap(doc), seq = sequence(doc, map, "codes"), ok = new Set(autorises), v = [];
  e.libelles.forEach((l, i) => { const ou = `libelles[${i}]`;
    if (!obj(l) || !str(l.cod)) return errs.push(`${ou} : cod obligatoire`);
    const item = seq.items.find(x => (YAML.isMap(x) ? x.get("cod") : YAML.isScalar(x) ? x.value : x) === l.cod);
    if (!item) return errs.push(`${ou} : code « ${l.cod} » absent du référentiel (aucun code ne peut être créé)`);
    if (!ok.has(l.cod)) errs.push(`${ou} : code « ${l.cod} » non autorisé (codes utilisés par un flux, sans libellé tranché)`);
    const lib = typeof l.lib === "string" ? l.lib.trim() : "";
    if (!lib || lib.length > 60 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(l.lib)) errs.push(`${ou} : libellé de 1 à 60 caractères, sur une ligne`);
    const h = hypotheseNette(l.hypothese, errs, `${ou}.hypothese`, YAML.isMap(item) ? hypExistante(item) : undefined);
    v.push({ item, cod: l.cod, lib, h }); });
  if (errs.length) return { erreurs: errs };
  const dsDir = path.join(racine, "spec/datasets");
  const tous = fs.existsSync(dsDir) ? fs.readdirSync(dsDir).filter(x => /\.ya?ml$/.test(x)).map(x => sauf(() => YAML.parse(fs.readFileSync(path.join(dsDir, x), "utf8")))).filter(obj) : [];
  const pii = erreursPii(racine, { libelles: v.map(x => ({ lib: x.lib, h: x.h })) }, tous);
  if (pii.length) return { erreurs: pii };
  v.forEach(x => { let noeud = x.item;
    if (!YAML.isMap(noeud)) { noeud = doc.createNode({ cod: x.cod }); seq.items[seq.items.indexOf(x.item)] = noeud; }
    poser(doc, noeud, "lib", x.lib); poser(doc, noeud, "hypothese", x.h); });
  ecrire(f, doc); return { ok: true };
}
```

(Si un code est écrit sous forme chaîne `- AFFR`, il est converti en map `{cod, lib, hypothese}`. Contrôle que le commentaire de tête et l'ordre des codes sont conservés ; si `seq.items` contient des nœuds `Scalar`, adapte le test d'identification de `item`.)

- [ ] **Step 5 : outils, boucle, prompts**

`maquette-outils.mjs` : importe `ecrireLibelles`. Dans la liste : après `lire_candidats_perimetre`

```js
    outil("lire_codes_sans_libelle", "Codes catégorie utilisés par un flux et sans libellé lisible, avec les flux qui les alimentent.", {}, [], () => ({ codes: espace.codesSansLibelle() })),
```

après `ecrire_perimetre` :

```js
    ecriture("ecrire_libelles", "Propose des libellés lisibles pour des codes catégorie : id (\"libelles\"), libelles[{cod, lib, hypothese}] ; cod issu de lire_codes_sans_libelle, lib de 1 à 60 caractères en langage d'exploitant, hypothese (source, preuves, question). Aucun code ne peut être créé ; l'adhérent tranche.",
      (r, a) => ecrireLibelles(r, a, espace.codesSansLibelle().map(x => x.cod))),
```

`maquette-agent.mjs` : dans `SYSTEME_MAQUETTE`, avant « Si une écriture est refusée », ajoute :

```
- Pour les libellés de catégories : écris en langage d'exploitant, sans abréviation (« Chiffre d'affaires affrètement », pas « CA AFF »), d'après le flux qui alimente le code et les colonnes lues ; preuves = faits mesurés (flux, montants, nombre de lignes). Tu ne crées aucun code, tu ne modifies pas les codes existants.
```

et en fin de fichier :

```js
/* Une boucle : un libellé lisible proposé pour chaque code utilisé par un flux. Sans code à libeller : aucun appel. */
export async function proposerLibelles({ espace, racine, llm, rapporter = () => {}, budget = creerBudget() }) {
  const codes = espace.codesSansLibelle(), boucles = [];
  if (!codes.length) return bilan(boucles, budget);
  rapporter({ etape: "libelles", i: 1, n: 1 });
  const outils = creerOutilsMaquette({ espace, racine });
  const r = await tache({ llm, outils, budget, utilisateur: `${codes.length} codes catégorie utilisés par les flux n'ont pas de libellé lisible (lire_codes_sans_libelle). Pour chacun, lis le flux et le dataset qui l'alimente (lire_dataset), puis propose son libellé avec ecrire_libelles et son hypothese. Termine par terminer.` });
  if (r.erreurs) return bilan(boucles, budget, r.erreurs);
  suivi(boucles, "libelles", r);
  return bilan(boucles, budget);
}
```

`server/agent/interpreter.mjs` ligne 7 : dans l'énumération des opérations, remplace `definir` par `definir (cible flux:<id>.<champ>, <dataset>.<colonne>.<champ>, ou categorie:<code>.lib pour corriger le libellé lisible d'une catégorie ; valeur = le libellé, 60 caractères au plus)` (garde le reste de la phrase). Si l'énumération ne mentionne `definir` que par son nom, ajoute la parenthèse à cet endroit exact.

- [ ] **Step 6 : branchement** — `server/maquette.mjs` : importe `proposerLibelles` ; après le bloc `perimetre` du plan B :

```js
    if (coupe()) return interrompu();
    const lb = await proposerLibelles({ espace, racine, llm: llmCoupe, rapporter: etapeAgent, budget }); boucles("libelles", lb);
    if (lb.erreurs) return echec(lb.erreurs, "libelles");
```

`viewer/ui.js` `etapeMaquette` : ajoute `libelles:"Libellés des catégories…"` à côté de `perimetre`. Ajoute un test dans `tests/vue-maquette.test.mjs` et/ou `tests/maquette.test.mjs` dans la même veine que ceux du plan B (étape « libelles » exécutée, libellé écrit non validé, `check` sans erreur, relance sans toucher un libellé tranché) ; complète les scripts de faux LLM existants si la nouvelle boucle s'y insère, sans affaiblir leurs assertions.

- [ ] **Step 7 : tests verts** — `npm test` entier.

---

### Task 3: Affichage et documentation

**Files:**
- Modify: `viewer/ui.js` (`renderCat` ~l.200-215, « Manque dans FAITS » ~l.236)
- Modify: `viewer/style.css` (une règle)
- Modify: `tools/atelier.mjs` (commande `couverture`, ~l.98-110)
- Modify: `tools/espace.mjs` (`couverture()` : ajoute `libelle` aux entrées de `manque`)
- Modify: `AGENTS.md`, `.cursor/rules/spec-format.mdc`, `deploy/LISEZMOI.md` (si l'étape y figure)
- Test: `tests/libelles-categories.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `libelleCat(cod)` (Task 1) ; `espace.couverture().manque[i] = {categorie, mesures, libelle}`.

- [ ] **Step 1 : tests**

```js
test("couverture : chaque catégorie manquante porte son libellé (code si absent)", () => {
  const racine = racineExemple(), e0 = ouvrirEspace(racine), m0 = e0.couverture().manque; assert.ok(m0.length > 0);
  m0.forEach(x => assert.equal(x.libelle, x.categorie));
  const cat = m0[0].categorie; ref(racine, [{ cod: cat, lib: "Libellé de test" }]);
  const m1 = ouvrirEspace(racine).couverture().manque.find(x => x.categorie === cat);
  assert.equal(m1.libelle, "Libellé de test");
});

test("viewer : renderCat et éléments principaux utilisent libelleCat", () => {
  const ui = fs.readFileSync("viewer/ui.js", "utf8");
  assert.match(ui, /libelleCat\(/);
  assert.ok((ui.match(/libelleCat\(/g) || []).length >= 2);
});
```

- [ ] **Step 2 : échec** — `node --test tests/libelles-categories.test.mjs`.

- [ ] **Step 3 : `espace.couverture`** (`tools/espace.mjs`) : dans l'objet `manque`, ajoute `libelle:libelleCat(categorie)` : remplace `.map(([categorie,ms])=>({categorie,mesures:[...ms]}))` par `.map(([categorie,ms])=>({categorie,libelle:libelleCat(categorie),mesures:[...ms]}))`. La clé `categorie` reste le code (la boucle flux de la maquette et `admis.has(x.categorie)` en dépendent).

- [ ] **Step 4 : viewer** (`viewer/ui.js`)

(a) Éléments principaux : dans « Manque dans FAITS », remplace `${esc(x)}` du tag par `${esc(libelleCat(x))}${libelleCat(x)!==x?` <small class="mono">${esc(x)}</small>`:""}` (le `title` garde le code).
(b) `renderCat`, tableau « Codes » : colonne « Libellé » entre « Code » et « Exigé par » : cellule `${esc(libelleCat(c))}` suivie, si `S.st.categories.find(k=>k.cod===c)?.hypothese` non validée, d'un `<span class="ms ms-part" title="Libellé proposé, à confirmer">proposé</span>` ; adapte l'en-tête `<th>`. Texte du `lede` : ajoute « Le libellé lisible est celui de spec/referentiel.yml ; il alimente le champ LIB_LISIBLE de FAITS, sans changer les codes. »
(c) `viewer/style.css` : ajoute `.tags small{opacity:.6;margin-left:4px}`.

- [ ] **Step 5 : CLI** (`tools/atelier.mjs`, commande `couverture`) : à l'endroit où chaque catégorie manquante est affichée avec son code, affiche `libelle (code)` quand `libelle!==categorie`, sinon le code seul. Lis les lignes ~98-110 pour l'insérer sans changer le format existant des autres colonnes ; si la commande n'a qu'une liste de codes issue d'un autre calcul, réutilise `libelleCat` du contexte `vm` comme le fait déjà ce fichier pour `ms`/`need`.

- [ ] **Step 6 : documentation**

- `AGENTS.md`, section `spec/referentiel.yml` : documente `lib` et `hypothese` par code (YAML de l'exemple du design), « un code sans `lib` s'affiche tel quel », cible `categorie:<code>` (opération `valider`) et `definir` sur `categorie:<code>.lib`, champ FAITS `LIB_LISIBLE` (« n'est pas `LIB_Categorie` : celui-ci reste un contrat avec le catalogue »), règle : le référentiel reste fermé (« ajoute un code seulement si Michel le valide » inchangé), limite des flux `codMode: colonne`. Dans « Mode maquette », ajoute une phrase : la maquette propose aussi des libellés lisibles pour les codes utilisés par un flux (outil `ecrire_libelles`), toujours `valide: false`.
- `.cursor/rules/spec-format.mdc` : même ajout, une ligne.
- `deploy/LISEZMOI.md` : seulement si l'étape y est décrite.

- [ ] **Step 7 : vérification finale** — `npm test` entier ; note le nombre de tests.
