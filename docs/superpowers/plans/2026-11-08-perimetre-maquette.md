# Périmètre des mesures : la maquette propose les groupes — Plan d'implémentation (plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La maquette automatique propose, sans l'adhérent, des groupes de mesures « non applicables » dans `spec/perimetre.yml` (toujours `valide: false`), que l'adhérent valide ensuite dans l'onglet Questions.

**Architecture:** Le code calcule les candidats (mesures de statut `none`, hors groupes existants) et les expose à l'agent (outil de lecture). L'agent décide, après lecture des exports, et écrit via `ecrire_perimetre`, outil à garde-fous (candidats seulement, preuves obligatoires, hypothèse forcée non validée). Une boucle agent dédiée s'ajoute après les flux dans `server/maquette.mjs`. Sans LLM, la maquette ne démarre pas déjà : aucun groupe n'est écrit.

**Tech Stack:** Node ESM, `yaml` (Document, commentaires conservés), `node:test`, faux LLM de `tests/aide/faux-llm.mjs`.

Design : `docs/superpowers/specs/2026-11-08-perimetre-mesures-design.md` (section « La maquette écrit les groupes »). Plan A (moteur, affichage) déjà livré.

## Global Constraints

- Réponses et textes en français. Pas de git : pas de commit, remplacer par un `npm test` vert.
- Le `spec/` racine du dépôt est un gabarit : ne jamais l'écrire. Les tests utilisent `racineExemple()` (copie temporaire).
- Un groupe écrit par l'agent a toujours `valide: false`, `refuse: false`. Une hypothèse déjà tranchée n'est jamais réécrite.
- Seules les mesures de statut `none` (ni `hors`, ni déjà dans un groupe, quel que soit son état) sont des candidats. Jamais `part`, `ok`, `err`.
- Aucune valeur de colonne `pii: true` dans les textes écrits (même contrôle que les autres outils : `erreursPii`).
- Garde les commentaires YAML ; plus petit changement possible ; ne modifie pas `core/`, `viewer/` (sauf mention).
- Sans LLM : aucun groupe, comportement identique à aujourd'hui.
- Relance : un groupe validé ou refusé n'est pas touché ; une mesure déjà dans un groupe n'est pas reproposée.

## Fichiers

| Fichier | Rôle |
|---|---|
| `tools/espace.mjs` | `candidatsPerimetre()` : candidats + catégories manquantes |
| `server/agent/specs.mjs` | `ecrirePerimetre(racine, entree, autorises)` : écriture validée |
| `server/agent/maquette-outils.mjs` | outils `lire_candidats_perimetre`, `ecrire_perimetre` |
| `server/agent/maquette-agent.mjs` | règle de prompt + `proposerPerimetre()` |
| `server/maquette.mjs` | étape « perimetre » après les flux |
| `tests/perimetre-maquette.test.mjs` | tous les tests de ce plan |
| `tests/maquette-agent.test.mjs` | liste NOMS des outils (+2) |
| `AGENTS.md`, `deploy/LISEZMOI.md`, `.cursor/commands/seance.md` | documentation |

---

### Task 1: Candidats et écriture validée

**Files:**
- Modify: `tools/espace.mjs` (fonction `couverture`, ~l.161 ; export ~l.267)
- Modify: `server/agent/specs.mjs` (ajout après `ecrireRelation`, fin de fichier)
- Create: `tests/perimetre-maquette.test.mjs`

**Interfaces:**
- Produces: `espace.candidatsPerimetre() → [{mesure: string, manque: string[]}]` ; `ecrirePerimetre(racine, entree, autorises: Iterable<string>) → {ok:true} | {erreurs:string[]}`.

- [ ] **Step 1 : tests qui échouent**

Crée `tests/perimetre-maquette.test.mjs` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ouvrirEspace } from "../tools/espace.mjs";
import { ecrirePerimetre } from "../server/agent/specs.mjs";
import { racineExemple } from "./aide/racine.mjs";

const hyp = { source: "agent", preuves: ["3 exports lus, aucune colonne de kilomètres"], question: "Ces indicateurs ne s'appliquent-ils pas à vous ?" };
const neuf = () => { const racine = racineExemple(), espace = ouvrirEspace(racine); return { racine, espace }; };
const lire = (racine) => YAML.parse(fs.readFileSync(path.join(racine, "spec/perimetre.yml"), "utf8"));

test("candidatsPerimetre : que des mesures none, avec leurs catégories manquantes", () => {
  const { espace } = neuf();
  const c = espace.candidatsPerimetre();
  assert.ok(Array.isArray(c) && c.length > 0);
  c.forEach(x => { assert.equal(typeof x.mesure, "string"); assert.ok(Array.isArray(x.manque)); });
  assert.equal(new Set(c.map(x => x.mesure)).size, c.length, "pas de doublon");
});

test("candidatsPerimetre : une mesure déjà dans un groupe (même proposé) n'est plus candidate", () => {
  const { racine, espace } = neuf();
  const nom = espace.candidatsPerimetre()[0].mesure;
  assert.deepEqual(ecrirePerimetre(racine, { id: "g1", cause: "Pas de suivi", mesures: [nom], hypothese: hyp }, [nom]), { ok: true });
  assert.ok(!ouvrirEspace(racine).candidatsPerimetre().some(x => x.mesure === nom));
});

test("ecrirePerimetre : écrit un groupe non validé, avec cause et hypothèse", () => {
  const { racine } = neuf();
  assert.deepEqual(ecrirePerimetre(racine, { id: "g1", cause: "Pas de suivi véhicules", mesures: ["A", "B"], titre: "Retirer ces indicateurs ?", contexte: "Vos exports n'en contiennent pas.", hypothese: { ...hyp, valide: true, refuse: true } }, ["A", "B"]), { ok: true });
  const g = lire(racine).groupes[0];
  assert.deepEqual([g.id, g.cause, g.mesures], ["g1", "Pas de suivi véhicules", ["A", "B"]]);
  assert.equal(g.hypothese.valide, false); assert.equal(g.hypothese.refuse, false);
});

test("ecrirePerimetre : refuse une mesure non candidate, sans preuves, sans cause, un id invalide", () => {
  const { racine } = neuf();
  assert.match(ecrirePerimetre(racine, { id: "g1", cause: "x", mesures: ["Z"], hypothese: hyp }, ["A"]).erreurs.join(), /candidat/);
  assert.ok(ecrirePerimetre(racine, { id: "g1", cause: "x", mesures: ["A"], hypothese: { source: "agent", preuves: [], question: "q" } }, ["A"]).erreurs);
  assert.ok(ecrirePerimetre(racine, { id: "g1", mesures: ["A"], hypothese: hyp }, ["A"]).erreurs);
  assert.ok(ecrirePerimetre(racine, { id: "G 1", cause: "x", mesures: ["A"], hypothese: hyp }, ["A"]).erreurs);
  assert.ok(ecrirePerimetre(racine, { id: "g1", cause: "x", mesures: ["A"] }, ["A"]).erreurs, "hypothèse obligatoire");
  assert.ok(!fs.existsSync(path.join(racine, "spec/perimetre.yml")), "rien d'écrit en cas de refus");
});

test("ecrirePerimetre : un groupe tranché n'est pas réécrit ; un groupe proposé peut être complété", () => {
  const { racine } = neuf();
  ecrirePerimetre(racine, { id: "g1", cause: "x", mesures: ["A"], hypothese: hyp }, ["A"]);
  assert.deepEqual(ecrirePerimetre(racine, { id: "g1", cause: "x2", mesures: ["A", "B"], hypothese: hyp }, ["B"]), { ok: true });
  const f = path.join(racine, "spec/perimetre.yml");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("valide: false", "valide: true"));
  assert.match(ecrirePerimetre(racine, { id: "g1", cause: "x3", mesures: ["A"], hypothese: hyp }, ["A"]).erreurs.join(), /tranchée/);
});

test("ecrirePerimetre : le commentaire du fichier est conservé à la réécriture", () => {
  const { racine } = neuf();
  ecrirePerimetre(racine, { id: "g1", cause: "x", mesures: ["A"], hypothese: hyp }, ["A"]);
  ecrirePerimetre(racine, { id: "g2", cause: "y", mesures: ["B"], hypothese: hyp }, ["B"]);
  const t = fs.readFileSync(path.join(racine, "spec/perimetre.yml"), "utf8");
  assert.match(t, /^# Mesures du dashboard/);
  assert.equal(lire(racine).groupes.length, 2);
});
```

- [ ] **Step 2 : constater l'échec**

Run: `node --test tests/perimetre-maquette.test.mjs`
Expected: FAIL (`candidatsPerimetre is not a function`, `ecrirePerimetre` absent).

- [ ] **Step 3 : `candidatsPerimetre` dans `tools/espace.mjs`**

Après la fonction `couverture` (ne la modifie pas), ajoute :

```js
  /* Mesures candidates au périmètre : statut « none », ni hors périmètre ni déjà dans un groupe (quel que soit son état). */
  function candidatsPerimetre() {
    const { ctx } = evaluate();
    return JSON.parse(JSON.stringify(vm.runInContext(`(()=>{ const cat=CAT(), cov=COV(), hors=horsPerimetre(), deja=new Set();
      (S.st.perimetre||[]).forEach(g=>(g.mesures||[]).forEach(n=>{ const m=cat.resolve(String(n)); deja.add(m?m.name:String(n)); }));
      const vus=new Set(), out=[];
      cat.list.forEach(m=>{ if(vus.has(m.name)||hors.has(m.name)||deja.has(m.name)) return; const c=cov.get(m.id); if(c.s!=="none") return; vus.add(m.name); out.push({mesure:m.name,manque:(c.miss||[]).slice()}); });
      return out; })()`, ctx)));
  }
```

Ajoute `candidatsPerimetre` à l'objet retourné (ligne `return { apercuQuestion, …, couverture, … }`), juste après `couverture`.

- [ ] **Step 4 : `ecrirePerimetre` dans `server/agent/specs.mjs`**

À la fin du fichier, après `ecrireRelation` (réutilise `preparer`, `chemin`, `lireYaml`, `racineMap`, `sequence`, `trouver`, `hypotheseNette`, `hypExistante`, `erreursPii`, `fusionnerListe`, `poser`, `ecrire`, `str`, `obj`, `sauf` déjà définis dans le fichier) :

```js
/* ───── périmètre ───── */
export function ecrirePerimetre(racine, entree, autorises) {
  const p = preparer(entree); if (p.erreurs) return p;
  const e = p.e, f = chemin(racine, "perimetre.yml"), errs = [];
  const existe = fs.existsSync(f), doc = existe ? lireYaml(f) : new YAML.Document({});
  if (!existe) doc.commentBefore = " Mesures du dashboard de référence écartées chez cet adhérent, groupées par cause";
  const map = racineMap(doc), seq = sequence(doc, map, "groupes"), item = trouver(seq, "id", e.id);
  const ex = item ? item.toJSON() : {}, m = { ...ex, ...e };
  for (const k of ["cause", "titre", "contexte"]) if (m[k] !== undefined && !str(m[k])) errs.push(`${k} : texte attendu`);
  if (!str(m.cause)) errs.push("cause obligatoire");
  if (!Array.isArray(m.mesures) || !m.mesures.length || m.mesures.length > 60 || !m.mesures.every(str)) errs.push("mesures : liste de 1 à 60 noms");
  else { const ok = new Set([...autorises, ...(ex.mesures || [])]);
    m.mesures.filter(n => !ok.has(n)).forEach(n => errs.push(`mesure « ${n} » : pas un candidat (seules les mesures sans aucune donnée, hors groupe existant, peuvent être écartées)`)); }
  const h = hypotheseNette(e.hypothese, errs, "hypothese", hypExistante(item));
  if (errs.length) return { erreurs: errs };
  const v = Object.fromEntries(["cause", "mesures", "titre", "contexte"].filter(k => m[k] !== undefined).map(k => [k, m[k]]));
  v.hypothese = h;
  const dsDir = path.join(racine, "spec/datasets");
  const tous = fs.existsSync(dsDir) ? fs.readdirSync(dsDir).filter(x => /\.ya?ml$/.test(x)).map(x => sauf(() => YAML.parse(fs.readFileSync(path.join(dsDir, x), "utf8")))).filter(obj) : [];
  const pii = erreursPii(racine, { ...v }, tous);
  if (pii.length) return { erreurs: pii };
  const noeud = fusionnerListe(doc, seq, "id", e.id, {});
  Object.entries(v).forEach(([k, x]) => poser(doc, noeud, k, x));
  ecrire(f, doc); return { ok: true };
}
```

Si `obj`/`str`/`sauf` ne sont pas utilisables tels quels (signature différente), lis leur définition en tête de `specs.mjs` et adapte l'appel, sans changer leur définition.

- [ ] **Step 5 : tests verts**

Run: `node --test tests/perimetre-maquette.test.mjs` → PASS (6 tests). Puis `npm test` → tout vert.

---

### Task 2: Outils de l'agent, boucle et prompt

**Files:**
- Modify: `server/agent/maquette-outils.mjs`
- Modify: `server/agent/maquette-agent.mjs`
- Modify: `tests/maquette-agent.test.mjs` (liste `NOMS`, ligne ~15)
- Test: `tests/perimetre-maquette.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `espace.candidatsPerimetre()`, `ecrirePerimetre(racine, entree, autorises)` (Task 1) ; `tache`, `suivi`, `bilan`, `creerBudget`, `creerOutilsMaquette` existants.
- Produces: outils `lire_candidats_perimetre` (`{}` → `{candidats:[{mesure, manque}]}`) et `ecrire_perimetre` ; `proposerPerimetre({ espace, racine, llm, rapporter, budget }) → {ok:true, boucles, jetons} | {erreurs, boucles, jetons}`.

- [ ] **Step 1 : tests qui échouent** (ajoute à `tests/perimetre-maquette.test.mjs`)

Ajoute en tête les imports `import { creerOutilsMaquette } from "../server/agent/maquette-outils.mjs"; import { proposerPerimetre, creerBudget, SYSTEME_MAQUETTE } from "../server/agent/maquette-agent.mjs"; import { fauxLlm, appelOutil } from "./aide/faux-llm.mjs";` puis :

```js
test("outil ecrire_perimetre : refuse un non-candidat, accepte un candidat, force valide:false", async () => {
  const { racine, espace } = neuf(), o = creerOutilsMaquette({ espace, racine });
  const nom = (await o.lire_candidats_perimetre.executer({})).candidats[0].mesure;
  assert.ok((await o.ecrire_perimetre.executer({ id: "g1", cause: "x", mesures: ["Inconnue"], hypothese: hyp })).erreurs);
  assert.deepEqual(await o.ecrire_perimetre.executer({ id: "g1", cause: "x", mesures: [nom], hypothese: { ...hyp, valide: true } }), { ok: true });
  assert.equal(lire(racine).groupes[0].hypothese.valide, false);
});

test("prompt : l'agent connaît la règle du périmètre", () => {
  assert.match(SYSTEME_MAQUETTE, /ecrire_perimetre/);
  assert.match(SYSTEME_MAQUETTE, /branchement/);
});

test("proposerPerimetre : sans candidat, aucune boucle, aucun appel au LLM", async () => {
  const { racine, espace } = neuf();
  espace.candidatsPerimetre = () => [];
  const llm = fauxLlm([]);
  const r = await proposerPerimetre({ espace, racine, llm, budget: creerBudget() });
  assert.equal(r.ok, true); assert.deepEqual(r.boucles, []);
  assert.ok(!fs.existsSync(path.join(racine, "spec/perimetre.yml")));
});

test("proposerPerimetre : l'agent écrit un groupe proposé puis termine", async () => {
  const { racine, espace } = neuf();
  const nom = espace.candidatsPerimetre()[0].mesure;
  const llm = fauxLlm([
    appelOutil("lire_candidats_perimetre", {}),
    appelOutil("ecrire_perimetre", { id: "g1", cause: "Aucune donnée de ce type", mesures: [nom], titre: "Retirer cet indicateur ?", contexte: "Vos exports n'en contiennent pas.", hypothese: hyp }),
    appelOutil("terminer", { resume: "un groupe" }),
  ]);
  const r = await proposerPerimetre({ espace, racine, llm, budget: creerBudget() });
  assert.equal(r.ok, true); assert.equal(r.boucles.length, 1);
  assert.equal(lire(racine).groupes[0].hypothese.valide, false);
  assert.ok(!ouvrirEspace(racine).candidatsPerimetre().some(x => x.mesure === nom), "pas reproposée à la relance");
});
```

Avant d'écrire ces tests, lis `tests/aide/faux-llm.mjs` (`fauxLlm`, `appelOutil`) et `tests/maquette-agent.test.mjs` pour reprendre exactement la forme de leurs usages (signature, une réponse par tour) ; adapte les appels ci-dessus à cette forme sans changer l'intention.

Dans `tests/maquette-agent.test.mjs`, ajoute `"lire_candidats_perimetre"` et `"ecrire_perimetre"` à `NOMS`.

- [ ] **Step 2 : constater l'échec** — `node --test tests/perimetre-maquette.test.mjs tests/maquette-agent.test.mjs` : échecs attendus (outils absents, `proposerPerimetre` absent).

- [ ] **Step 3 : outils** dans `server/agent/maquette-outils.mjs`

Importe `ecrirePerimetre` (ligne d'import de `specs.mjs`). Dans la liste `o`, après `lire_couverture`, ajoute :

```js
    outil("lire_candidats_perimetre", "Mesures du dashboard sans aucune donnée (candidates au retrait) avec leurs catégories manquantes. Seules ces mesures peuvent être écartées.", {}, [],
      () => ({ candidats: espace.candidatsPerimetre() })),
```

et après `ecrire_relation` :

```js
    ecriture("ecrire_perimetre", "Propose un groupe de mesures non applicables chez l'adhérent : id (g1, g2…), cause, mesures (noms issus de lire_candidats_perimetre), titre et contexte en langage d'exploitant, hypothese (source, preuves = exports lus et pourquoi ils ne portent pas la donnée, question). L'adhérent tranche.",
      (r, a) => ecrirePerimetre(r, a, espace.candidatsPerimetre().map(x => x.mesure))),
```

- [ ] **Step 4 : règle de prompt et boucle** dans `server/agent/maquette-agent.mjs`

Dans `SYSTEME_MAQUETTE`, ajoute avant la ligne « Si une écriture est refusée » :

```
- Pour le périmètre : ne propose un groupe (ecrire_perimetre) que si, après lecture des exports (lire_dataset), aucune donnée ne permet la mesure. Si la donnée existe mais n'est pas branchée, c'est un branchement à faire : n'écris rien. Regroupe par cause métier (ex. suivi des véhicules), avec titre et contexte sans nom de colonne ni jargon ; les preuves disent quels exports tu as lus et pourquoi ils ne portent pas la donnée.
```

Ajoute en fin de fichier :

```js
/* Une boucle : l'agent décide, pour les mesures sans donnée, lesquelles ne s'appliquent pas à l'adhérent. Sans candidat : aucun appel. */
export async function proposerPerimetre({ espace, racine, llm, rapporter = () => {}, budget = creerBudget() }) {
  const candidats = espace.candidatsPerimetre(), boucles = [];
  if (!candidats.length) return bilan(boucles, budget);
  rapporter({ etape: "perimetre", i: 1, n: 1 });
  const outils = creerOutilsMaquette({ espace, racine });
  const r = await tache({ llm, outils, budget, utilisateur: `${candidats.length} mesures du dashboard n'ont aucune donnée (lire_candidats_perimetre). Pour chaque ensemble, lis les datasets utiles (lire_dataset) : si la donnée existe mais n'est pas branchée, n'écris rien ; si aucun export ne la porte, regroupe par cause et écris le groupe avec ecrire_perimetre. Termine par terminer.` });
  if (r.erreurs) return bilan(boucles, budget, r.erreurs);
  suivi(boucles, "perimetre", r);
  return bilan(boucles, budget);
}
```

- [ ] **Step 5 : tests verts** — `node --test tests/perimetre-maquette.test.mjs tests/maquette-agent.test.mjs`, puis `npm test`.

---

### Task 3: Branchement dans la maquette, relance, documentation

**Files:**
- Modify: `server/maquette.mjs` (après l'étape flux, ~l.183-184)
- Test: `tests/perimetre-maquette.test.mjs` (ajouts), puis `tests/maquette.test.mjs`, `tests/serveur-maquette.test.mjs`, `tests/vue-maquette.test.mjs` si impactés
- Modify: `AGENTS.md`, `deploy/LISEZMOI.md`, `.cursor/commands/seance.md` (vérifier, ne corriger que si faux)

**Interfaces:**
- Consumes: `proposerPerimetre` (Task 2).

- [ ] **Step 1 : étape dans `lancerMaquette`**

Importe `proposerPerimetre` avec les autres (ligne 10). Après le bloc `const f = await ecrireFluxEtControles(…)… if (f.erreurs) return echec(f.erreurs, "flux");`, ajoute :

```js
    if (coupe()) return interrompu();
    const pm = await proposerPerimetre({ espace, racine, llm: llmCoupe, rapporter: etapeAgent, budget }); boucles("perimetre", pm);
    if (pm.erreurs) return echec(pm.erreurs, "perimetre");
```

Lis `etapeAgent`, `boucles` et `echec` dans `server/maquette.mjs` pour vérifier qu'ils acceptent une étape nouvelle (libellés d'étapes, listes blanches, vue admin `viewer/` ou `server/` qui afficherait les étapes) : si une liste d'étapes existe quelque part (`rg -n '"flux"' server viewer tools`), ajoute « perimetre » avec un libellé de même style (« Périmètre du tableau de bord »). Dans ce cas seulement, tu peux modifier le fichier concerné.

- [ ] **Step 2 : tests de bout en bout** (ajoute à `tests/perimetre-maquette.test.mjs`)

Reprends dans `tests/maquette.test.mjs` la façon de lancer `lancerMaquette` avec un faux LLM et d'attendre sa fin (helpers, racine). Ajoute :
- un test « maquette complète » dont le faux LLM écrit, dans l'étape périmètre, un groupe : `spec/perimetre.yml` existe, groupe `valide: false`, `check` sans erreur ;
- un test « relance » : un groupe déjà `valide: true` dans `spec/perimetre.yml` n'est pas modifié après une 2e maquette, et ses mesures ne sont pas reproposées (`candidatsPerimetre` ne les contient pas) ;
- un test « sans LLM » : `lancerMaquette` avec `llm` absent n'écrit pas `spec/perimetre.yml` (comportement existant : échec explicite).

Si des tests existants de maquette échouent parce que le faux LLM scripté n'a plus de réponse pour la nouvelle boucle, complète leur script avec un `terminer` pour l'étape périmètre (ou garde-les inchangés si l'exemple n'a aucun candidat), sans affaiblir leurs assertions.

- [ ] **Step 3 : documentation**

- `AGENTS.md`, section « Mode maquette » : ajoute un paragraphe : la maquette propose aussi des groupes de mesures non applicables (`spec/perimetre.yml`, outil `ecrire_perimetre`, candidats = mesures sans aucune donnée), toujours `valide: false` ; sans LLM, aucun groupe ; relance idempotente.
- `deploy/LISEZMOI.md` et `.cursor/commands/seance.md` : lis-les ; ajoute une phrase seulement s'ils décrivent la liste des étapes de la maquette.

- [ ] **Step 4 : vérification finale**

Run: `npm test` → tout vert. Note le nombre de tests dans le rapport.
