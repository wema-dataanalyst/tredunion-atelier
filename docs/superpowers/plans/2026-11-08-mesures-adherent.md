# Mesures et catégories propres à l'adhérent — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un adhérent peut avoir des codes catégorie nouveaux (CA froid…) et les mesures qui les utilisent, proposés par l'agent ou demandés en texte libre, validés par lui, sans modifier le catalogue de base.

**Architecture:** `spec/mesures.yml` porte des propositions (codes + mesures par gabarits fermés `somme`/`ratio`/`ecart` + feuille + hypothèse). Un module `core/mesures.js` valide et traduit les propositions validées en texte de catalogue (même syntaxe que le catalogue de base) ajouté à `CAT()`/`DCAT()` ; les codes validés entrent dans `st.categories`. La maquette propose, l'adhérent valide (`valider` sur `mesures:<id>`) ou demande en texte libre (opération `mesure` du registre).

**Tech Stack:** Node ESM, `core/*.js` exécutés dans `vm` (aussi concaténés dans le viewer), `yaml`, `node:test`.

Design : `docs/superpowers/specs/2026-11-08-mesures-adherent-design.md`.

## Global Constraints

- Textes en français. Pas de git : un `npm test` vert remplace le commit.
- Ne modifie jamais le catalogue de base (`spec/catalogue/elements_principaux.txt`) ni le `spec/` racine du dépôt (gabarit) ; n'écris pas dans `adherents/`. Les tests utilisent `racineExemple()` (copie temporaire).
- Formules : gabarits fermés uniquement (`somme`, `ratio`, `ecart`). Aucune formule libre.
- Une proposition écrite par l'agent a toujours `valide: false`, `refuse: false` ; une proposition tranchée n'est jamais réécrite.
- Proposée ou refusée : aucun effet (ni catégories, ni catalogue, ni dashboard, ni export). Validée : effets complets.
- Plafonds : 8 mesures et 3 codes nouveaux par proposition, 5 propositions ouvertes (ni validées ni refusées) dans le fichier.
- Code nouveau : `^[A-Z0-9][A-Z0-9 ]{1,18}[A-Z0-9]$` (3 à 20 caractères), absent du référentiel. Nom de mesure : 1 à 60 caractères, sans `[ ] { } ' " $` ni saut de ligne, absent du catalogue de base et des autres propositions (insensible à la casse).
- Les fonctions de `core/` restent utilisables dans le navigateur : pas de `import`, pas d'API Node. Tout nouveau fichier de `core/` doit être ajouté aux listes `CORE` de `tools/espace.mjs` et `tests/aide/moteur.mjs` (après `core/engine.js`).
- Aucune valeur pii dans les textes écrits. Garde les commentaires YAML.
- Un adhérent sans `spec/mesures.yml` se comporte exactement comme avant (suite existante verte).

## Fichiers

| Fichier | Rôle |
|---|---|
| `core/mesures.js` (nouveau) | validation, génération du texte, propositions actives, feuilles |
| `core/model.js`, `core/calque.js`, `core/hypotheses.js`, `core/questions.js`, `core/check.js` | intégration moteur |
| `tools/espace.mjs` | chargement, aperçu, `erreursProposition`, `reponsesAdherent`, `nomsCatalogueBase` |
| `viewer/dash.js` | `DCAT`, feuilles de l'adhérent |
| `server/agent/specs.mjs`, `maquette-outils.mjs`, `maquette-agent.mjs`, `interpreter.mjs`, `outils.mjs` | écriture, outils, boucle, prompts |
| `server/maquette.mjs`, `viewer/ui.js` | étape « propositions » |
| `tests/mesures-adherent.test.mjs` (nouveau) | tests de ce plan |
| `AGENTS.md`, `.cursor/rules/spec-format.mdc`, `deploy/LISEZMOI.md` | doc |

---

### Task 1: Module `core/mesures.js` (validation et génération)

**Files:**
- Create: `core/mesures.js`
- Modify: `tools/espace.mjs:13` et `tests/aide/moteur.mjs:7` (liste `CORE`)
- Create: `tests/mesures-adherent.test.mjs`

**Interfaces:**
- Produces (globales du contexte `vm`) :
  - `erreursProposition(p, st) → string[]` (vide = valide). `p = {id, titre, contexte?, codes?:[{cod,lib}], mesures:[…], feuille?, hypothese?}`.
  - `nomsProposition(p) → string[]` : noms de mesures produits.
  - `texteCatalogue(p) → string` : texte de catalogue (nom en ligne non indentée, formule indentée de 4 espaces, blocs séparés par une ligne vide).
  - `propositionsActives() → proposition[]` : `st.propositions` dont `hypothese.valide` est vrai et sans erreur.
  - `extensionCatalogue() → string` : `"\n"+texte` des propositions actives, `""` si aucune (mis en cache avec `cached("extcat",…)`).
  - `feuillesAdherent() → sheets[]` : feuilles de dashboard au format de `SHEETS`.
  - `nomsMesuresAdherent() → Set<string>`.

- [ ] **Step 1 : tests qui échouent**

Crée `tests/mesures-adherent.test.mjs`. Avant, lis `tests/libelles-categories.test.mjs` (helpers `ctx`, `evalJs` basés sur `ouvrirEspace(racine).evaluate().ctx` et `vm.runInContext`) et reprends-les. Ajoute un helper `prop = (extra={}) => ({ id:"p1", titre:"Suivre le CA froid ?", contexte:"c", codes:[{cod:"CA FROID",lib:"Chiffre d'affaires froid"}], mesures:[{gabarit:"somme",nom:"CA froid",categories:["CA FROID"],periodes:["reel","m1","n1","budget"]},{gabarit:"ratio",nom:"% froid du CA",num:"CA froid",den:"CA Réel"}], feuille:"Mes indicateurs", hypothese:{source:"agent",preuves:["x"],question:"q",valide:false,refuse:false}, ...extra })`. Tests :

```js
test("noms produits par les gabarits", () => {
  const racine = racineExemple();
  assert.deepEqual(evalJs(racine, `nomsProposition(${JSON.stringify(prop())})`), ["CA froid", "CA froid M-1", "CA froid N-1", "Budget CA froid", "% froid du CA"]);
});

test("somme reel : même structure que « CA Réel » du catalogue de base, avec un autre code", () => {
  const racine = racineExemple();
  const base = fs.readFileSync("spec/catalogue/elements_principaux.txt", "utf8").replace(/\r/g, "");
  const blocBase = /^CA Réel\n((?:    .*\n|\n(?=    ))+)/m.exec(base)[1].replace(/'CA TOTAL'/g, "'CA FROID'").trimEnd();
  const txt = evalJs(racine, `texteCatalogue(${JSON.stringify(prop())})`);
  const bloc = /^CA froid\n((?:    .*\n|\n(?=    ))+)/m.exec(txt)[1].trimEnd();
  assert.equal(bloc.replace(/\s+/g, ""), blocBase.replace(/\s+/g, ""));
});

test("m1, n1, budget : variables et champ attendus", () => {
  const txt = evalJs(racineExemple(), `texteCatalogue(${JSON.stringify(prop())})`);
  assert.match(txt, /^CA froid M-1\n\s+sum\(\{<[^>]*\$\(vSET_M-1\)[^>]*'CA FROID'[^>]*>\}MontantReel\)/m);
  const n1 = /^CA froid N-1\n([\s\S]*?)\n\n/m.exec(txt)[1]; assert.ok(n1.includes("vSET_N-1") && n1.includes("vMaxAnneeVar-1") && n1.includes("vMaxAnnee-1") && n1.includes("MontantReel"));
  const bu = /^Budget CA froid\n([\s\S]*?)\n\n/m.exec(txt)[1]; assert.ok(bu.includes("BudgetNextN") && bu.includes("vSET_N-1"));
  assert.match(txt, /^% froid du CA\n\s+\(\[CA froid\] \/ \[CA Réel\]\)/m);
});

test("le texte généré est accepté par l'analyseur du catalogue (aucune anomalie, aucune référence inconnue)", () => {
  const racine = racineExemple();
  const r = evalJs(racine, `(()=>{ const p=${JSON.stringify(prop())}; const cat=analyseCatalogue(parseCatalogue(S.st.catalogue+"\\n"+texteCatalogue(p)),new Set(S.st.categories.map(c=>c.cod).concat(["CA FROID"]))); return cat.list.filter(m=>${JSON.stringify(["CA froid", "CA froid M-1", "CA froid N-1", "Budget CA froid", "% froid du CA"])}.includes(m.name)).map(m=>({n:m.name,bad:m.issues.filter(i=>i.sev==="bad").length,refs:m.refs.map(x=>!!cat.resolve(x))})); })()`);
  assert.equal(r.length, 5); r.forEach(m => { assert.equal(m.bad, 0, m.n); m.refs.forEach(ok => assert.ok(ok, m.n)); });
});

test("ecart : formule (a - b)", () => {
  const p = prop({ mesures: [{ gabarit: "ecart", nom: "Ecart froid", a: "CA Réel", b: "CA Réel N-1" }], codes: [] });
  assert.match(evalJs(racineExemple(), `texteCatalogue(${JSON.stringify(p)})`), /^Ecart froid\n\s+\(\[CA Réel\] - \[CA Réel N-1\]\)/m);
});

test("erreursProposition : proposition valide sans erreur", () => {
  assert.deepEqual(evalJs(racineExemple(), `erreursProposition(${JSON.stringify(prop())},S.st)`), []);
});

test("erreursProposition : refus (code existant, code mal formé, gabarit inconnu, nom pris, référence inconnue, plafonds, caractères)", () => {
  const racine = racineExemple(), e = p => evalJs(racine, `erreursProposition(${JSON.stringify(p)},S.st)`);
  const cod = evalJs(racine, "S.st.categories[0].cod");
  assert.ok(e(prop({ codes: [{ cod, lib: "x" }] })).length, "code déjà au référentiel");
  assert.ok(e(prop({ codes: [{ cod: "ab", lib: "x" }] })).length, "code mal formé");
  assert.ok(e(prop({ mesures: [{ gabarit: "libre", nom: "X", expr: "sum(1)" }] })).length, "gabarit inconnu");
  assert.ok(e(prop({ mesures: [{ gabarit: "somme", nom: "CA Réel", categories: ["CA FROID"], periodes: ["reel"] }] })).length, "nom du catalogue de base");
  assert.ok(e(prop({ mesures: [{ gabarit: "ratio", nom: "R", num: "Inconnue", den: "CA Réel" }] })).length, "référence inconnue");
  assert.ok(e(prop({ mesures: [{ gabarit: "somme", nom: "Z", categories: ["PAS_UN_CODE"], periodes: ["reel"] }] })).length, "catégorie inconnue");
  assert.ok(e(prop({ mesures: [{ gabarit: "somme", nom: "Z", categories: ["CA FROID"], periodes: ["zz"] }] })).length, "période inconnue");
  assert.ok(e(prop({ mesures: [{ gabarit: "somme", nom: "Z'] ; drop", categories: ["CA FROID"], periodes: ["reel"] }] })).length, "caractères interdits dans le nom");
  assert.ok(e(prop({ titre: "" })).length, "titre vide");
  assert.ok(e(prop({ mesures: Array.from({ length: 9 }, (_, i) => ({ gabarit: "somme", nom: "M" + i, categories: ["CA FROID"], periodes: ["reel"] })) })).length, "plus de 8 mesures");
  assert.ok(e(prop({ codes: ["AAA", "BBB", "CCC", "DDD"].map(c => ({ cod: c, lib: "x" })) })).length, "plus de 3 codes");
  assert.ok(e(prop({ id: "P 1" })).length, "id invalide");
});

test("propositionsActives et extensionCatalogue : seulement les propositions validées", () => {
  const racine = racineExemple(), v = prop({ hypothese: { ...prop().hypothese, valide: true } });
  const js = `(()=>{ S.st.propositions=[${JSON.stringify(prop())}]; S.ver++; const a=[propositionsActives().length, extensionCatalogue()];
    S.st.propositions=[${JSON.stringify(v)}]; S.ver++; return [...a, propositionsActives().length, extensionCatalogue().includes("CA froid M-1")]; })()`;
  assert.deepEqual(evalJs(racine, js), [0, "", 1, true]);
});

test("feuillesAdherent : une feuille nommée, une tuile par mesure", () => {
  const racine = racineExemple(), v = prop({ hypothese: { ...prop().hypothese, valide: true } });
  const f = evalJs(racine, `(()=>{ S.st.propositions=[${JSON.stringify(v)}]; S.ver++; return feuillesAdherent(); })()`);
  assert.equal(f.length, 1); assert.equal(f[0].title, "Mes indicateurs"); assert.equal(f[0].objs.length, 2);
  assert.deepEqual(f[0].objs[0].items.map(i => i.m), ["CA froid", "CA froid M-1", "CA froid N-1", "Budget CA froid"]);
  assert.deepEqual(evalJs(racine, `feuillesAdherent()`), [], "aucune proposition : aucune feuille");
});
```

Imports en tête : `test`, `assert/strict`, `fs`, `path`, `vm`, `YAML`, `ouvrirEspace`, `racineExemple` (comme `tests/libelles-categories.test.mjs`).

- [ ] **Step 2 : constater l'échec** — `node --test tests/mesures-adherent.test.mjs` : échecs (fonctions absentes).

- [ ] **Step 3 : `core/mesures.js`**

```js
/* ───────────── mesures propres à l'adhérent : propositions de spec/mesures.yml, gabarits fermés ───────────── */
const GABARITS_M=["somme","ratio","ecart"];
const PERIODES_M=["reel","m1","n1","budget"];
const COD_NOUVEAU=/^[A-Z0-9][A-Z0-9 ]{1,18}[A-Z0-9]$/;
const NOM_MESURE=/^[^\[\]{}'"$\n\r]{1,60}$/;
const ID_PROP=/^[a-z0-9_]+$/;
const MAX_MESURES_P=8, MAX_CODES_P=3;
const sansCasse=s=>String(s).trim().toLowerCase();
function nomsMesureGabarit(g){
  if(!g||g.gabarit!=="somme") return [String(g&&g.nom)];
  const ps=Array.isArray(g.periodes)&&g.periodes.length?g.periodes:["reel"];
  return ps.map(k=>k==="m1"?`${g.nom} M-1`:k==="n1"?`${g.nom} N-1`:k==="budget"?`Budget ${g.nom}`:String(g.nom));
}
function nomsProposition(p){ return (p&&Array.isArray(p.mesures)?p.mesures:[]).flatMap(nomsMesureGabarit); }
function nomsBaseCatalogue(st){ return new Set(parseCatalogue(st.catalogue||"").map(m=>sansCasse(m.name))); }
function erreursProposition(p,st=S.st){
  const e=[]; if(!p||typeof p!=="object") return ["proposition illisible"];
  if(typeof p.id!=="string"||!ID_PROP.test(p.id)) e.push("id invalide (minuscules, chiffres, _)");
  if(typeof p.titre!=="string"||!p.titre.trim()) e.push("titre manquant");
  const codes=Array.isArray(p.codes)?p.codes:[], mesures=Array.isArray(p.mesures)?p.mesures:[];
  if(!mesures.length) e.push("aucune mesure"); if(mesures.length>MAX_MESURES_P) e.push(`${MAX_MESURES_P} mesures au plus`);
  if(codes.length>MAX_CODES_P) e.push(`${MAX_CODES_P} codes nouveaux au plus`);
  if(p.feuille!==undefined&&(typeof p.feuille!=="string"||!p.feuille.trim()||p.feuille.length>40||/[\n\r]/.test(p.feuille))) e.push("feuille : texte de 1 à 40 caractères sur une ligne");
  const existants=new Set((st.categories||[]).filter(c=>c.ajoute!==p.id).map(c=>c.cod));
  const autres=(st.propositions||[]).filter(x=>x&&x.id!==p.id);
  const codesAutres=new Set(autres.flatMap(x=>(x.codes||[]).map(c=>c&&c.cod)));
  const propres=new Set();
  codes.forEach(c=>{ if(!c||typeof c.cod!=="string"||!COD_NOUVEAU.test(c.cod)) return e.push("code nouveau mal formé (3 à 20 caractères : majuscules, chiffres, espaces)");
    if(existants.has(c.cod)) e.push(`code « ${c.cod} » déjà au référentiel`); if(codesAutres.has(c.cod)) e.push(`code « ${c.cod} » déjà proposé ailleurs`); propres.add(c.cod);
    if(typeof c.lib!=="string"||!c.lib.trim()||c.lib.length>60||/[\n\r]/.test(c.lib)) e.push(`code « ${c.cod} » : libellé de 1 à 60 caractères sur une ligne`); });
  const admis=c=>existants.has(c)||propres.has(c);
  const base=nomsBase(st), pris=new Set([...base]); autres.forEach(x=>nomsProposition(x).forEach(n=>pris.add(sansCasse(n))));
  const propresNoms=new Set(); mesures.forEach(g=>nomsMesureGabarit(g).forEach(n=>propresNoms.add(sansCasse(n))));
  const connue=n=>typeof n==="string"&&(base.has(sansCasse(n))||propresNoms.has(sansCasse(n)));
  const vus=new Set();
  mesures.forEach((g,i)=>{ const ou=`mesure ${i+1}`;
    if(!g||typeof g!=="object"||!GABARITS_M.includes(g.gabarit)) return e.push(`${ou} : gabarit inconnu (${GABARITS_M.join(", ")})`);
    if(typeof g.nom!=="string"||!NOM_MESURE.test(g.nom)) return e.push(`${ou} : nom de 1 à 60 caractères, sans [ ] { } ' " $`);
    nomsMesureGabarit(g).forEach(n=>{ const k=sansCasse(n); if(pris.has(k)) e.push(`${ou} : le nom « ${n} » existe déjà`); if(vus.has(k)) e.push(`${ou} : nom « ${n} » en double`); vus.add(k); });
    if(g.gabarit==="somme"){ const cs=g.categories; if(!Array.isArray(cs)||!cs.length||cs.length>6||!cs.every(c=>typeof c==="string"&&c&&!/['\n\r]/.test(c))) e.push(`${ou} : 1 à 6 catégories attendues`); else cs.filter(c=>!admis(c)).forEach(c=>e.push(`${ou} : catégorie inconnue « ${c} »`));
      if(g.periodes!==undefined&&(!Array.isArray(g.periodes)||!g.periodes.length||!g.periodes.every(k=>PERIODES_M.includes(k)))) e.push(`${ou} : périodes parmi ${PERIODES_M.join(", ")}`); }
    else { const [a,b]=g.gabarit==="ratio"?[g.num,g.den]:[g.a,g.b]; [a,b].forEach(r=>{ if(!connue(r)) e.push(`${ou} : mesure inconnue « ${r} »`); }); } });
  return e;
}
const nomsBase=nomsBaseCatalogue;
/* trois niveaux (mois sélectionné, année sélectionnée, année max), comme les mesures du catalogue de base */
function formuleTrois(cods,champ,vm,vy,vx){ const f=`{${cods.map(c=>`'${c}'`).join(",")}}`;
  const bloc=v=>`        sum(\n    {<\n        [%COD_CATEGORIE] = ${f},\n        $(${v})\n    >}\n    ${champ})`;
  return `    If(\n        GetSelectedCount(MoisVar) > 0,\n    // Si un mois est sélectionné -> Calculer pour le mois\n${bloc(vm)},\n    // Si une année est sélectionnée -> Calculer l'année\n    If(\n        GetSelectedCount(AnneeVar) > 0,\n${bloc(vy)},\n    // Sinon afficher l'année max\n${bloc(vx)}\n    ))`; }
function mesuresGabarit(g){
  if(g.gabarit==="ratio") return [{nom:g.nom,expr:`    ([${g.num}] / [${g.den}])`}];
  if(g.gabarit==="ecart") return [{nom:g.nom,expr:`    ([${g.a}] - [${g.b}])`}];
  const ps=Array.isArray(g.periodes)&&g.periodes.length?g.periodes:["reel"], f=`{${g.categories.map(c=>`'${c}'`).join(",")}}`;
  return ps.map(k=>k==="m1"?{nom:`${g.nom} M-1`,expr:`    sum({<\t\t\t$(vSET_M-1),    [%COD_CATEGORIE]=${f}>}MontantReel)`}
    :k==="n1"?{nom:`${g.nom} N-1`,expr:formuleTrois(g.categories,"MontantReel","vSET_N-1","vMaxAnneeVar-1","vMaxAnnee-1")}
    :k==="budget"?{nom:`Budget ${g.nom}`,expr:formuleTrois(g.categories,"BudgetNextN","vSET_N-1","vMaxAnneeVar-1","vMaxAnnee-1")}
    :{nom:g.nom,expr:formuleTrois(g.categories,"MontantReel","vSET_M","vMaxAnneeVar","vMaxAnnee")});
}
function texteCatalogue(p){ return (p.mesures||[]).flatMap(mesuresGabarit).map(m=>`${m.nom}\n${m.expr}\n`).join("\n"); }
function propositionsActives(){ return (S.st.propositions||[]).filter(p=>p&&p.hypothese&&p.hypothese.valide&&!erreursProposition(p,S.st).length); }
function extensionCatalogue(){ return cached("extcat",()=>{ const t=propositionsActives().map(texteCatalogue).join("\n"); return t?"\n"+t:""; }); }
function nomsMesuresAdherent(){ return new Set(propositionsActives().flatMap(nomsProposition)); }
const FEUILLE_DEFAUT="Mes indicateurs";
function feuillesAdherent(){
  const par=new Map();
  propositionsActives().forEach(p=>{ const t=(p.feuille&&p.feuille.trim())||FEUILLE_DEFAUT; if(!par.has(t)) par.set(t,[]);
    p.mesures.forEach(g=>{ if(g.gabarit==="somme"){ const L={reel:"Réel",m1:"M-1",n1:"N-1",budget:"Budget"}, ps=g.periodes&&g.periodes.length?g.periodes:["reel"], noms=nomsMesureGabarit(g);
        par.get(t).push({t:"kb",title:g.nom,span:6,items:ps.map((k,i)=>({m:noms[i],label:L[k]}))}); }
      else par.get(t).push({t:"stack",span:3,items:[{m:g.nom}]}); }); });
  return [...par.entries()].map(([title,objs],i)=>({id:`adh${i+1}`,title,objs}));
}
```

(Si `cached` ou `parseCatalogue` ne sont pas visibles depuis ce fichier dans le `vm`, c'est qu'ils sont déclarés dans `core/model.js`/`engine.js` : l'ordre de `CORE` garantit leur existence à l'exécution ; ne change pas leur définition. `nomsBase` est un alias déclaré APRÈS son usage dans `erreursProposition` : c'est sans risque car évalué à l'appel ; si ton linter s'en plaint, déplace l'alias avant la fonction.)

Ajoute `"core/mesures.js"` aux deux listes `CORE` (après `core/engine.js`).

- [ ] **Step 4 : tests verts** — `node --test tests/mesures-adherent.test.mjs`, puis `npm test` (tout vert ; les tests qui comptent des fichiers `core/` doivent rester verts).

---

### Task 2: Moteur — chargement, catégories, catalogue, réponses, dashboard

**Files:**
- Modify: `tools/espace.mjs` (chargement, `apercuQuestion`, nouvelles méthodes, `candidatsPerimetre`)
- Modify: `core/model.js` (`hydrate`, `CAT`)
- Modify: `core/calque.js` (`OPS_REPONSE`, `porteurHypothese`, `erreurModif`, `appliquerModif`)
- Modify: `core/hypotheses.js`, `core/questions.js`, `core/check.js`
- Modify: `viewer/dash.js` (`DCAT`, `renderPrev`)
- Test: `tests/mesures-adherent.test.mjs` (ajouts)

**Interfaces:**
- Consumes: Task 1 (`erreursProposition`, `texteCatalogue`, `propositionsActives`, `extensionCatalogue`, `feuillesAdherent`, `nomsMesuresAdherent`).
- Produces: `st.propositions` ; `st.categories` enrichi (`{cod, note:"", lib, ajoute:<idProposition>}`) pour les propositions actives ; cible d'hypothèse `mesures:<id>` ; opération de registre `mesure` (`{op:"mesure", cible:<id>, valeur:<proposition sans id ni hypothèse>}`) ; `espace.erreursProposition(p) → string[]`, `espace.reponsesAdherent() → [{id,question,reponse}]`, `espace.nomsCatalogueBase() → string[]`.

- [ ] **Step 1 : tests qui échouent** (ajoute ; helper `mesuresYml = (racine, props) => fs.writeFileSync(path.join(racine,"spec/mesures.yml"), "# Mesures de l'adhérent\n"+YAML.stringify({propositions:props}))`)

```js
test("chargement : mesures.yml absent -> aucune proposition ; mal formé -> pas d'exception", () => {
  const racine = racineExemple();
  assert.deepEqual(evalJs(racine, "S.st.propositions"), []);
  fs.writeFileSync(path.join(racine, "spec/mesures.yml"), "propositions: [null, 3, {id: p1}]\n");
  assert.ok(Array.isArray(evalJs(racine, "S.st.propositions")));
  fs.writeFileSync(path.join(racine, "spec/mesures.yml"), "::: pas du yaml [");
  assert.ok(Array.isArray(evalJs(racine, "S.st.propositions")));
});

test("proposée : aucun effet ; validée : codes, catalogue, couverture, dashboard", () => {
  const racine = racineExemple(), avant = evalJs(racine, "[S.st.categories.length, CAT().list.length]");
  mesuresYml(racine, [prop()]);
  assert.deepEqual(evalJs(racine, "[S.st.categories.length, CAT().list.length]"), avant, "proposée : rien ne change");
  assert.equal(evalJs(racine, "S.st.propositions.length"), 1);
  mesuresYml(racine, [prop({ hypothese: { ...prop().hypothese, valide: true } })]);
  const apres = evalJs(racine, "[S.st.categories.length, CAT().list.length, S.st.categories.find(c=>c.cod==='CA FROID')]");
  assert.equal(apres[0], avant[0] + 1); assert.equal(apres[1], avant[1] + 5); assert.equal(apres[2].ajoute, "p1"); assert.equal(apres[2].lib, "Chiffre d'affaires froid");
  assert.equal(evalJs(racine, "libelleCat('CA FROID')"), "Chiffre d'affaires froid");
  assert.ok(evalJs(racine, "COV().get(CAT().list.find(m=>m.name==='CA froid').id).s") !== "ok", "sans flux : non alimentée");
  assert.ok(evalJs(racine, "DCAT().list.some(m=>m.name==='% froid du CA')"));
});

test("refusée : aucun effet", () => {
  const racine = racineExemple(), avant = evalJs(racine, "CAT().list.length");
  mesuresYml(racine, [prop({ hypothese: { ...prop().hypothese, refuse: true } })]);
  assert.equal(evalJs(racine, "CAT().list.length"), avant);
});

test("proposition invalide validée : ignorée, signalée par check", () => {
  const racine = racineExemple(), avant = evalJs(racine, "CAT().list.length");
  mesuresYml(racine, [prop({ mesures: [{ gabarit: "libre", nom: "X" }], hypothese: { ...prop().hypothese, valide: true } })]);
  assert.equal(evalJs(racine, "CAT().list.length"), avant);
  assert.ok(evalJs(racine, "runCheck().some(x=>JSON.stringify(x).includes('p1'))"));
});

test("hypothèse mesures:<id> : listée, lot adherent, valider l'applique", () => {
  const racine = racineExemple(); mesuresYml(racine, [prop()]);
  assert.equal(evalJs(racine, `listeHypotheses().filter(h=>h.cible==="mesures:p1").length`), 1);
  const q = evalJs(racine, `listeQuestions().find(q=>q.id==="mesures:p1")`);
  assert.equal(q.lot, "adherent"); assert.equal(q.titre || q.question !== undefined, true);
  const r = ouvrirEspace(racine).repondre({ id: "mesures:p1", saisie: { oui: true }, par: "" });
  assert.ok(!r.erreurs, JSON.stringify(r));
  assert.ok(evalJs(racine, "CAT().list.some(m=>m.name==='CA froid')"));
});

test("opération de registre mesure : appliquée comme validée ; opération invalide refusée", () => {
  const racine = racineExemple(), { id, hypothese, ...valeur } = prop();
  assert.equal(evalJs(racine, `erreurModif({op:"mesure",cible:"p9",valeur:${JSON.stringify(valeur)}})`), null);
  assert.ok(evalJs(racine, `erreurModif({op:"mesure",cible:"p9",valeur:{titre:"t",mesures:[{gabarit:"libre",nom:"X"}]}})`));
  fs.writeFileSync(path.join(racine, "spec/reponses.yml"), YAML.stringify([{ id: "projet#q2", question: "q", reponse: "Je veux le CA froid", origine: "client", date: "2026-11-08T10:00:00", modifs: [{ op: "mesure", cible: "p9", valeur: valeur }] }]));
  assert.ok(evalJs(racine, "CAT().list.some(m=>m.name==='CA froid')"));
  assert.ok(evalJs(racine, "S.st.categories.some(c=>c.cod==='CA FROID')"));
});

test("check : code d'une proposition admis pour un flux, même non validée", () => {
  const racine = racineExemple(); mesuresYml(racine, [prop()]);
  fs.writeFileSync(path.join(racine, "spec/flux/zz.yml"), "id: zz\nds: " + evalJs(racine, "S.st.datasets[0].id") + "\ncodMode: fixe\ncod: CA FROID\nlib: CA froid\nvaleur: 1\nagg: sum\nchamp: MontantReel\nunite: €\ndate: x\n");
  const msgs = evalJs(racine, "runCheck().map(x=>JSON.stringify(x))");
  assert.ok(!msgs.some(m => /CA FROID/.test(m) && /absent de spec\/referentiel/.test(m)), msgs.join("\n"));
});

test("check : doublons de nom entre propositions", () => {
  const racine = racineExemple(); mesuresYml(racine, [prop(), prop({ id: "p2", codes: [] })]);
  assert.ok(evalJs(racine, "runCheck().some(x=>/existe déjà|double|déjà proposé/.test(JSON.stringify(x)))"));
});

test("espace : erreursProposition, reponsesAdherent, nomsCatalogueBase ; apercu sans dataset", () => {
  const racine = racineExemple(), e = ouvrirEspace(racine);
  assert.deepEqual(e.erreursProposition(prop()), []);
  assert.ok(e.nomsCatalogueBase().includes("CA Réel"));
  assert.deepEqual(e.reponsesAdherent(), []);
  mesuresYml(racine, [prop()]);
  const a = ouvrirEspace(racine).apercuQuestion("mesures:p1"); assert.equal(a.aucun, true); assert.doesNotMatch(a.raison, /dataset introuvable/);
});

test("candidatsPerimetre : les mesures de l'adhérent ne sont jamais candidates", () => {
  const racine = racineExemple(); mesuresYml(racine, [prop({ hypothese: { ...prop().hypothese, valide: true } })]);
  assert.ok(!ouvrirEspace(racine).candidatsPerimetre().some(x => /froid/i.test(x.mesure)));
});

test("dashboard : DCAT inclut l'extension, renderPrev ajoute les feuilles de l'adhérent", () => {
  const dash = fs.readFileSync("viewer/dash.js", "utf8");
  assert.match(dash, /extensionCatalogue\(\)/); assert.match(dash, /feuillesAdherent\(\)/);
});
```

Adapte `runCheck` au vrai nom de la fonction de contrôle (comme dans `tests/libelles-categories.test.mjs`). La structure d'un flux `zz.yml` doit suivre `spec/flux/*.yml` de l'exemple (lis-en un) : ajuste les champs obligatoires.

- [ ] **Step 2 : échec** — `node --test tests/mesures-adherent.test.mjs`.

- [ ] **Step 3 : chargement (`tools/espace.mjs`)**

Après le chargement du périmètre (`const perimetre = safe(…)`), ajoute :

```js
    const propositions = safe(P("spec/mesures.yml"), [], () => { const doc = readYaml(P("spec/mesures.yml"), {}); const l = doc && Array.isArray(doc.propositions) ? doc.propositions : [];
      const obj = x => x && typeof x === "object" && !Array.isArray(x);
      return l.filter(obj).map(p => ({ id: String(p.id ?? ""), titre: String(p.titre || ""), contexte: String(p.contexte || ""), feuille: p.feuille === undefined ? undefined : String(p.feuille),
        codes: Array.isArray(p.codes) ? p.codes.filter(obj).map(c => ({ cod: String(c.cod ?? ""), lib: String(c.lib ?? "") })) : [],
        mesures: Array.isArray(p.mesures) ? p.mesures.filter(obj).map(g => ({ ...g })) : [], hypothese: obj(p.hypothese) ? p.hypothese : undefined })); });
```

(`readYaml` peut lever sur un YAML cassé : `safe` doit retomber sur `[]` ; vérifie avec le test « pas du yaml ».) Ajoute `propositions` à l'objet `state` retourné (à côté de `perimetre`). `apercuQuestion` : branche `else if (el.startsWith("mesures:")) raison = "question sur votre tableau de bord : pas de données à afficher";` à côté de celle de `perimetre:`. Nouvelles méthodes (et à l'objet retourné) :

```js
  /* Erreurs de validation d'une proposition, par le moteur (même règles que check). */
  function erreursProposition(p) { const { ctx } = evaluate(); ctx.__p = JSON.parse(JSON.stringify(p)); return JSON.parse(JSON.stringify(vm.runInContext("erreursProposition(__p,S.st)", ctx))); }
  /* Dernière réponse de l'adhérent à chaque question de projet (activités, KPI attendus). */
  function reponsesAdherent() { const { ctx } = evaluate(); return JSON.parse(JSON.stringify(vm.runInContext(`(()=>{ const m=new Map(); (S.st.reponses||[]).forEach(r=>{ if(r&&typeof r.id==="string"&&r.id.startsWith("projet#")&&typeof r.reponse==="string"&&r.reponse.trim()) m.set(r.id,{id:r.id,question:String(r.question||""),reponse:r.reponse.trim().slice(0,1000)}); }); return [...m.values()]; })()`, ctx))); }
  function nomsCatalogueBase() { const { ctx } = evaluate(); return JSON.parse(JSON.stringify(vm.runInContext(`parseCatalogue(S.st.catalogue||"").map(m=>m.name)`, ctx))); }
```

Dans `candidatsPerimetre` (code vm), après `const vus=new Set(), out=[];` ajoute `const adh=nomsMesuresAdherent();` et, dans la condition d'exclusion, `||adh.has(m.name)`.

- [ ] **Step 4 : `core/model.js`**

`hydrate` : ajoute `st.propositions=st.propositions||[];` (même ligne que `st.perimetre`). Après `appliquerCalque(st);` ajoute `appliquerPropositions(st);`. Définis (dans `core/mesures.js`, c'est son rôle — ajoute-la à ce fichier) :

```js
/* codes des propositions validées : entrés dans les catégories (marqués ajoute:<id>), libellé repris */
function appliquerPropositions(st){
  (st.propositions||[]).filter(p=>p&&p.hypothese&&p.hypothese.valide&&!erreursProposition(p,st).length).forEach(p=>(p.codes||[]).forEach(c=>{
    if(!st.categories.some(x=>x.cod===c.cod)) st.categories.push({cod:c.cod,note:"",lib:c.lib,ajoute:p.id}); }));
  return st;
}
```

`CAT()` (l.202) : `const raw=(S.st.catalogue||"")+extensionCatalogue();`.

- [ ] **Step 5 : `core/calque.js`**

`OPS_REPONSE` : ajoute `"mesure"`. `porteurHypothese` : avant la ligne `perimetre:` ajoute `m=/^mesures:(.+)$/.exec(cible); if(m) return (st.propositions||[]).find(p=>String(p.id)===m[1])||null;`. `erreurModif`, juste avant `if(m.op==="fichier")` :

```js
  if(m.op==="mesure"){ if(typeof m.cible!=="string"||!/^[a-z0-9_]+$/.test(m.cible)) return "mesure : id de proposition invalide";
    if(!m.valeur||typeof m.valeur!=="object"||Array.isArray(m.valeur)) return "mesure : proposition attendue";
    const e=erreursProposition({...m.valeur,id:m.cible},st); return e.length?`proposition : ${e[0]}`:null; }
```

`appliquerModif`, avant `return null;` final :

```js
  if(m.op==="mesure"){ const p={...JSON.parse(JSON.stringify(m.valeur)),id:m.cible,hypothese:{source:"client",preuves:[String(entree.reponse||"")].filter(Boolean),question:String(m.valeur.titre||""),valide:true,refuse:false}};
    st.propositions=(st.propositions||[]).filter(x=>x.id!==m.cible).concat([p]); }
```

Attention : `appliquerPropositions` s'exécute après `appliquerCalque`, donc voit les propositions du registre. `erreurModif` appelé pendant `appliquerCalque` voit `st.categories` sans les codes ajoutés : normal (le code est « nouveau »).

- [ ] **Step 6 : hypothèses, questions, check**

`core/hypotheses.js`, après la ligne `categorie:` du cycle précédent :

```js
  (S.st.propositions||[]).forEach(p=>push(`mesures:${p.id}`,"spec/mesures.yml",`Mesures de l'adhérent : ${p.titre||p.id}`,p.hypothese&&{...p.hypothese,titre:p.hypothese.titre||p.titre,contexte:p.hypothese.contexte||p.contexte}));
```

`core/questions.js` : regexp de `datasetDe` : ajoute `mesures:` ; lot de l'hypothèse : `h.cible.startsWith("perimetre:")||h.cible.startsWith("mesures:")?"adherent":…` (conserve la branche `categorie:`). Une proposition issue du registre (déjà validée, fichier `spec/reponses.yml`) n'a pas de question ouverte : c'est normal, `traitee` suit `h.valide`.

`core/check.js` : ligne 7 : `const codes=new Set(st.categories.map(c=>c.cod).concat((st.propositions||[]).flatMap(p=>(p.codes||[]).map(c=>c&&c.cod))));`. Après la boucle des libellés du cycle 3, ajoute :

```js
  const idsProp=new Set();
  (st.propositions||[]).forEach(p=>{ const f="spec/mesures.yml";
    if(!p.id) return add("erreur",f,"proposition de mesures : id manquant");
    if(idsProp.has(p.id)) add("erreur",f,`proposition ${p.id} : id en double`); idsProp.add(p.id);
    if(!p.hypothese) add("erreur",f,`proposition ${p.id} : hypothèse manquante`);
    erreursProposition(p,st).forEach(m=>add("erreur",f,`proposition ${p.id} : ${m}`)); });
```

(Les doublons de nom entre propositions sortent de `erreursProposition`, qui compare aux autres propositions.)

- [ ] **Step 7 : dashboard (`viewer/dash.js`)**

`DCAT` (l.15) : `parseCatalogue((S.st.catalogue??CAT_SRC)+extensionCatalogue()+"\n"+DASH_EXTRA)`. Dans `renderPrev`, remplace `filtrerFeuilles(SHEETS,` par `filtrerFeuilles([...SHEETS,...feuillesAdherent()],`. Pour le format d'une tuile de ratio, cherche dans `viewer/dash.js` les valeurs de `fmt` déjà gérées (`rg -n "fmt" viewer/dash.js`) : si un format pourcentage existe, ajoute `fmt:"pct"` (ou son nom réel) aux tuiles `stack` des `ratio` dans `feuillesAdherent` (`core/mesures.js`) ; sinon laisse sans format.

- [ ] **Step 8 : tests verts** — `node --test tests/mesures-adherent.test.mjs`, puis `npm test` entier.

---

### Task 3: Maquette et interprétation

**Files:**
- Modify: `server/agent/specs.mjs` (ajout `ecrireProposition`)
- Modify: `server/agent/maquette-outils.mjs`, `server/agent/maquette-agent.mjs`, `server/agent/interpreter.mjs`, `server/agent/outils.mjs`
- Modify: `server/maquette.mjs`, `viewer/ui.js` (`etapeMaquette`)
- Modify: `tests/maquette-agent.test.mjs` (liste `NOMS` : `lire_reponses_adherent`, `lire_mesures_base`, `ecrire_proposition`)
- Test: `tests/mesures-adherent.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `espace.erreursProposition`, `espace.reponsesAdherent`, `espace.nomsCatalogueBase`.
- Produces: `ecrireProposition(racine, entree, erreursMetier: string[]) → {ok:true}|{erreurs}` ; outils `lire_reponses_adherent` (`{}` → `{reponses}`), `lire_mesures_base` (`{}` → `{mesures: string[]}`), `ecrire_proposition` ; `proposerMesures({espace, racine, llm, rapporter, budget})`.

- [ ] **Step 1 : tests qui échouent**

Lis `tests/aide/faux-llm.mjs` et `tests/perimetre-maquette.test.mjs` (forme de `fauxLlm`, `appelOutil`). Ajoute :

```js
test("ecrireProposition : écrit une proposition non validée, conserve le commentaire", () => {
  const racine = racineExemple(), { hypothese, ...p } = prop();
  assert.deepEqual(ecrireProposition(racine, { ...p, hypothese: { ...hypothese, valide: true } }, []), { ok: true });
  const t = fs.readFileSync(path.join(racine, "spec/mesures.yml"), "utf8"), d = YAML.parse(t);
  assert.match(t, /^# Mesures/); assert.equal(d.propositions[0].hypothese.valide, false); assert.equal(d.propositions[0].codes[0].cod, "CA FROID");
});

test("ecrireProposition : refuse sans preuves, avec erreurs métier, au-delà de 5 ouvertes, une proposition tranchée ; atomique", () => {
  const racine = racineExemple(), { hypothese, ...p } = prop(), f = path.join(racine, "spec/mesures.yml");
  assert.ok(ecrireProposition(racine, { ...p, hypothese: { source: "agent", preuves: [], question: "q" } }, []).erreurs);
  assert.ok(ecrireProposition(racine, { ...p, hypothese }, ["code déjà au référentiel"]).erreurs);
  assert.ok(!fs.existsSync(f), "rien d'écrit en cas de refus");
  for (let i = 1; i <= 5; i++) assert.deepEqual(ecrireProposition(racine, { ...p, id: "p" + i, hypothese }, []), { ok: true });
  assert.match(ecrireProposition(racine, { ...p, id: "p6", hypothese }, []).erreurs.join(), /ouvertes/);
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("valide: false", "valide: true"));
  assert.match(ecrireProposition(racine, { ...p, id: "p1", titre: "Autre", hypothese }, []).erreurs.join(), /tranchée/);
});

test("outils maquette : lecture des réponses, des mesures de base ; écriture contrôlée par le moteur", async () => {
  const racine = racineExemple(), espace = ouvrirEspace(racine), o = creerOutilsMaquette({ espace, racine }), { hypothese, ...p } = prop();
  assert.deepEqual(await o.lire_reponses_adherent.executer({}), { reponses: [] });
  assert.ok((await o.lire_mesures_base.executer({})).mesures.includes("CA Réel"));
  assert.ok((await o.ecrire_proposition.executer({ ...p, mesures: [{ gabarit: "libre", nom: "X" }], hypothese })).erreurs);
  assert.deepEqual(await o.ecrire_proposition.executer({ ...p, hypothese: { ...hypothese, valide: true } }), { ok: true });
  assert.equal(YAML.parse(fs.readFileSync(path.join(racine, "spec/mesures.yml"), "utf8")).propositions[0].hypothese.valide, false);
  assert.match(SYSTEME_MAQUETTE, /ecrire_proposition/);
  assert.match(fs.readFileSync("server/agent/interpreter.mjs", "utf8"), /mesure \(cible/);
  assert.match(fs.readFileSync("server/agent/outils.mjs", "utf8"), /"mesure"/);
});

test("proposerMesures : sans réponse de l'adhérent, aucun appel LLM ; avec réponse, une boucle et une proposition", async () => {
  const racine = racineExemple(), espace = ouvrirEspace(racine), { hypothese, ...p } = prop();
  const r0 = await proposerMesures({ espace, racine, llm: fauxLlm([]), budget: creerBudget() });
  assert.equal(r0.ok, true); assert.deepEqual(r0.boucles, []); assert.ok(!fs.existsSync(path.join(racine, "spec/mesures.yml")));
  fs.writeFileSync(path.join(racine, "spec/reponses.yml"), YAML.stringify([{ id: "projet#q1", question: "Activités ?", reponse: "Transport frigorifique et affrètement", origine: "client", date: "2026-11-08T10:00:00", modifs: [{ op: "noter" }] }]));
  const e2 = ouvrirEspace(racine);
  const llm = fauxLlm([appelOutil("lire_reponses_adherent", {}), appelOutil("ecrire_proposition", { ...p, hypothese }), appelOutil("terminer", { resume: "ok" })]);
  const r = await proposerMesures({ espace: e2, racine, llm, budget: creerBudget() });
  assert.equal(r.ok, true); assert.equal(r.boucles.length, 1);
  assert.equal(YAML.parse(fs.readFileSync(path.join(racine, "spec/mesures.yml"), "utf8")).propositions.length, 1);
});
```

Imports : `ecrireProposition` (specs), `creerOutilsMaquette`, `proposerMesures`, `creerBudget`, `SYSTEME_MAQUETTE`, `fauxLlm`, `appelOutil`. Ajoute les trois noms d'outils à `NOMS` dans `tests/maquette-agent.test.mjs`. Ajoute aussi, dans `tests/maquette.test.mjs` ou `tests/vue-maquette.test.mjs` (comme aux plans précédents) : étape « propositions » exécutée dans `lancerMaquette` quand une réponse existe, rien sans réponse ; relance : une proposition tranchée n'est pas touchée ; complète les scripts de faux LLM existants si la boucle s'y insère, sans affaiblir leurs assertions.

- [ ] **Step 2 : échec** — `node --test tests/mesures-adherent.test.mjs tests/maquette-agent.test.mjs`.

- [ ] **Step 3 : `ecrireProposition` (`server/agent/specs.mjs`, fin de fichier)** — mêmes helpers que `ecrirePerimetre` (`preparer`, `chemin`, `lireYaml`, `racineMap`, `sequence`, `trouver`, `hypotheseNette`, `hypExistante`, `erreursPii`, `fusionnerListe`, `poser`, `ecrire`, `str`, `obj`, `sauf`) :

```js
/* ───── mesures de l'adhérent ───── */
const MAX_OUVERTES = 5;
export function ecrireProposition(racine, entree, erreursMetier) {
  const p = preparer(entree); if (p.erreurs) return p;
  const e = p.e, f = chemin(racine, "mesures.yml"), errs = [...(erreursMetier || [])];
  const existe = fs.existsSync(f), doc = existe ? lireYaml(f) : new YAML.Document({});
  if (!existe) doc.commentBefore = " Mesures et codes catégorie propres à cet adhérent, par proposition";
  const map = racineMap(doc), seq = sequence(doc, map, "propositions"), item = trouver(seq, "id", e.id);
  const h = hypotheseNette(e.hypothese, errs, "hypothese", hypExistante(item));
  if (!item) { const ouvertes = seq.items.filter(x => YAML.isMap(x) && !(x.get("hypothese")?.get?.("valide") || x.get("hypothese")?.get?.("refuse"))).length;
    if (ouvertes >= MAX_OUVERTES) errs.push(`${MAX_OUVERTES} propositions ouvertes au plus : attendre la réponse de l'adhérent`); }
  if (errs.length) return { erreurs: errs };
  const v = Object.fromEntries(["titre", "contexte", "codes", "mesures", "feuille"].filter(k => e[k] !== undefined).map(k => [k, e[k]])); v.hypothese = h;
  const dsDir = path.join(racine, "spec/datasets");
  const tous = fs.existsSync(dsDir) ? fs.readdirSync(dsDir).filter(x => /\.ya?ml$/.test(x)).map(x => sauf(() => YAML.parse(fs.readFileSync(path.join(dsDir, x), "utf8")))).filter(obj) : [];
  const pii = erreursPii(racine, { ...v }, tous); if (pii.length) return { erreurs: pii };
  const noeud = fusionnerListe(doc, seq, "id", e.id, {});
  Object.entries(v).forEach(([k, x]) => poser(doc, noeud, k, x));
  ecrire(f, doc); return { ok: true };
}
```

Le message d'erreur d'une proposition tranchée contient « tranchée » (fourni par `hypotheseNette`). Les erreurs métier du moteur précèdent le reste.

- [ ] **Step 4 : outils, boucle, prompts**

`maquette-outils.mjs` : importe `ecrireProposition` ; dans la liste :

```js
    outil("lire_reponses_adherent", "Réponses de l'adhérent aux questions sur son activité et les KPI attendus (activités principales…).", {}, [], () => ({ reponses: espace.reponsesAdherent() })),
    outil("lire_mesures_base", "Noms des mesures du catalogue de base, utilisables dans un ratio ou un écart.", {}, [], () => ({ mesures: espace.nomsCatalogueBase() })),
    ecriture("ecrire_proposition", "Propose des codes catégorie nouveaux et des mesures pour l'adhérent : id (p1, p2…), titre et contexte en langage d'exploitant, codes[{cod, lib}], mesures[{gabarit: somme|ratio|ecart, nom, categories+periodes (somme : reel,m1,n1,budget) | num+den (ratio) | a+b (ecart)}], feuille, hypothese (source, preuves, question). Aucune formule libre. L'adhérent tranche.",
      (r, a) => ecrireProposition(r, a, espace.erreursProposition({ ...a, hypothese: undefined }))),
```

`maquette-agent.mjs` : dans `SYSTEME_MAQUETTE`, avant « Si une écriture est refusée », ajoute :

```
- Pour les mesures de l'adhérent : ne propose que ce que ses réponses (lire_reponses_adherent) et ses exports justifient ; chaque proposition est une question unique pour l'adhérent (titre et contexte sans jargon, sans nom de colonne). Un code nouveau (3 à 20 caractères en majuscules) n'existe que dans une proposition ; un flux qui l'alimente s'écrit séparément avec ecrire_flux. Utilise uniquement les gabarits somme, ratio, ecart.
```

et en fin de fichier :

```js
/* Une boucle : des mesures et codes propres à l'adhérent, d'après ses réponses. Sans réponse de l'adhérent : aucun appel. */
export async function proposerMesures({ espace, racine, llm, rapporter = () => {}, budget = creerBudget() }) {
  const boucles = [];
  if (!espace.reponsesAdherent().length) return bilan(boucles, budget);
  rapporter({ etape: "propositions", i: 1, n: 1 });
  const outils = creerOutilsMaquette({ espace, racine });
  const r = await tache({ llm, outils, budget, utilisateur: "Lis les réponses de l'adhérent sur son activité (lire_reponses_adherent) et les mesures de base (lire_mesures_base). Si elles décrivent une activité ou un indicateur que le catalogue de base ne mesure pas (ex. un chiffre d'affaires spécifique), propose-le avec ecrire_proposition (au plus 3 propositions). Sinon n'écris rien. Termine par terminer." });
  if (r.erreurs) return bilan(boucles, budget, r.erreurs);
  suivi(boucles, "propositions", r);
  return bilan(boucles, budget);
}
```

`interpreter.mjs` (ligne 7) : ajoute à l'énumération des opérations, après `question (…)` : ` mesure (cible = id de proposition p1, p2…, valeur = {titre, contexte, codes[{cod, lib}], mesures[{gabarit: somme|ratio|ecart, nom, …}], feuille} : seulement quand le client demande un indicateur ou une activité que le dashboard ne mesure pas ; jamais de formule libre ; le moteur applique la proposition comme validée par le client).` `outils.mjs` : ajoute `"mesure"` à l'énumération de `PARAM_OPS` (l.11) et une branche d'étiquette (l.6) : `if (o.op === "mesure") return \`Ajouter les mesures « ${...} »\`` en reprenant le style des autres lignes (titre de `o.valeur` si présent).

- [ ] **Step 5 : branchement** — `server/maquette.mjs` : importe `proposerMesures` ; après le bloc `libelles` du cycle précédent :

```js
    if (coupe()) return interrompu();
    const pr = await proposerMesures({ espace, racine, llm: llmCoupe, rapporter: etapeAgent, budget }); boucles("propositions", pr);
    if (pr.erreurs) return echec(pr.erreurs, "propositions");
```

`viewer/ui.js` `etapeMaquette` : ajoute `propositions:"Mesures propres à l'adhérent…"`.

- [ ] **Step 6 : tests verts** — `npm test` entier.

---

### Task 4: Documentation et règle des codes

**Files:**
- Modify: `AGENTS.md`, `.cursor/rules/spec-format.mdc`, `.cursor/rules/data-builder.mdc` (seulement si la règle « code seulement si Michel le valide » y figure), `deploy/LISEZMOI.md` (seulement si l'étape y figure)
- Test: `tests/mesures-adherent.test.mjs` (un test de bout en bout)

- [ ] **Step 1 : test de bout en bout** (réponse libre interprétée, comme aux plans précédents)

```js
test("bout en bout : proposition de la maquette, validation par l'adhérent, effet sur le catalogue et la couverture", () => {
  const racine = racineExemple(), { hypothese, ...p } = prop();
  assert.deepEqual(ecrireProposition(racine, { ...p, hypothese }, ouvrirEspace(racine).erreursProposition(p)), { ok: true });
  const e = ouvrirEspace(racine), avant = e.couverture().mesures;
  assert.equal(evalJs(racine, "CAT().list.some(m=>m.name==='CA froid')"), false);
  const r = e.repondre({ id: "mesures:p1", saisie: { oui: true }, par: "" }); assert.ok(!r.erreurs, JSON.stringify(r));
  assert.equal(evalJs(racine, "CAT().list.some(m=>m.name==='CA froid')"), true);
  const apres = ouvrirEspace(racine).couverture().mesures;
  assert.equal(apres.ok + apres.part + apres.none + apres.err + apres.hors, avant.ok + avant.part + avant.none + avant.err + avant.hors + 5);
  const gen = evalJs(racine, "faitsSql()"); assert.match(gen, /LIB_LISIBLE/);
});
```

(Si `repondre` ne suffit pas à rejouer le calque dans le même processus, rouvre l'espace avant l'assertion, comme dans les tests précédents.)

- [ ] **Step 2 : documentation**

- `AGENTS.md` : section `spec/mesures.yml` (format du design, gabarits, états proposée/validée/refusée, cible de réponse `mesures:<id>`, opération de registre `mesure`) ; dans « Règles », remplace la consigne de création de codes (« Ajoute un code seulement si Michel le valide », section `spec/referentiel.yml`) par : « un code nouveau n'entre dans les catégories que par une proposition de `spec/mesures.yml` validée par l'adhérent ; Michel garde la main sur le catalogue de base et sur l'apprentissage vers la mémoire commune » ; dans « Mode maquette », une phrase sur l'étape de propositions (réponses de l'adhérent requises ; sans réponse ni LLM, rien n'est écrit ; relance idempotente) ; dans la table des fichiers, `spec/mesures.yml`. Ajoute `mesure` à la liste des opérations du registre.
- `.cursor/rules/spec-format.mdc` : même ajout, concis. `data-builder.mdc` / `deploy/LISEZMOI.md` : seulement si la règle ou l'étape y figure ; sinon laisse tels quels.

- [ ] **Step 3 : vérification finale** — `npm test` entier ; note le nombre de tests.
