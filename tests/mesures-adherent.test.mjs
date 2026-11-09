import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import YAML from "yaml";
import { ouvrirEspace } from "../tools/espace.mjs";
import { ecrireProposition } from "../server/agent/specs.mjs";
import { creerOutilsMaquette } from "../server/agent/maquette-outils.mjs";
import { proposerMesures, creerBudget, SYSTEME_MAQUETTE } from "../server/agent/maquette-agent.mjs";
import { racineExemple } from "./aide/racine.mjs";
import { fauxLlm, appelOutil } from "./aide/faux-llm.mjs";

const ctx = racine => ouvrirEspace(racine).evaluate().ctx;
const evalJs = (racine, js) => JSON.parse(JSON.stringify(vm.runInContext(js, ctx(racine))));

const prop = (extra = {}) => ({
  id: "p1",
  titre: "Suivre le CA froid ?",
  contexte: "c",
  codes: [{ cod: "CA FROID", lib: "Chiffre d'affaires froid" }],
  mesures: [
    { gabarit: "somme", nom: "CA froid", categories: ["CA FROID"], periodes: ["reel", "m1", "n1", "budget"] },
    { gabarit: "ratio", nom: "% froid du CA", num: "CA froid", den: "CA Réel" },
  ],
  feuille: "Mes indicateurs",
  hypothese: { source: "agent", preuves: ["x"], question: "q", valide: false, refuse: false },
  ...extra,
});

const mesuresYml = (racine, props) =>
  fs.writeFileSync(path.join(racine, "spec/mesures.yml"), "# Mesures de l'adhérent\n" + YAML.stringify({ propositions: props }));

test("noms produits par les gabarits", () => {
  const racine = racineExemple();
  assert.deepEqual(evalJs(racine, `nomsProposition(${JSON.stringify(prop())})`), [
    "CA froid",
    "CA froid M-1",
    "CA froid N-1",
    "Budget CA froid",
    "% froid du CA",
  ]);
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
  const n1 = /^CA froid N-1\n([\s\S]*?)\n\n/m.exec(txt)[1];
  assert.ok(n1.includes("vSET_N-1") && n1.includes("vMaxAnneeVar-1") && n1.includes("vMaxAnnee-1") && n1.includes("MontantReel"));
  const bu = /^Budget CA froid\n([\s\S]*?)\n\n/m.exec(txt)[1];
  assert.ok(bu.includes("BudgetNextN") && bu.includes("vSET_N-1"));
  assert.match(txt, /^% froid du CA\n\s+\(\[CA froid\] \/ \[CA Réel\]\)/m);
});

test("le texte généré est accepté par l'analyseur du catalogue (aucune anomalie, aucune référence inconnue)", () => {
  const racine = racineExemple();
  const r = evalJs(
    racine,
  `(()=>{ const p=${JSON.stringify(prop())}; const cat=analyseCatalogue(parseCatalogue(S.st.catalogue+"\\n"+texteCatalogue(p)),new Set(S.st.categories.map(c=>c.cod).concat(["CA FROID"]))); return cat.list.filter(m=>${JSON.stringify(["CA froid", "CA froid M-1", "CA froid N-1", "Budget CA froid", "% froid du CA"])}.includes(m.name)).map(m=>({n:m.name,bad:m.issues.filter(i=>i.sev==="bad").length,refs:m.refs.map(x=>!!cat.resolve(x))})); })()`
  );
  assert.equal(r.length, 5);
  r.forEach(m => {
    assert.equal(m.bad, 0, m.n);
    m.refs.forEach(ok => assert.ok(ok, m.n));
  });
});

test("ecart : formule (a - b)", () => {
  const p = prop({ mesures: [{ gabarit: "ecart", nom: "Ecart froid", a: "CA Réel", b: "CA Réel N-1" }], codes: [] });
  assert.match(
    evalJs(racineExemple(), `texteCatalogue(${JSON.stringify(p)})`),
    /^Ecart froid\n\s+\(\[CA Réel\] - \[CA Réel N-1\]\)/m
  );
});

test("erreursProposition : proposition valide sans erreur", () => {
  assert.deepEqual(evalJs(racineExemple(), `erreursProposition(${JSON.stringify(prop())},S.st)`), []);
});

test("erreursProposition : refus (code existant, code mal formé, gabarit inconnu, nom pris, référence inconnue, plafonds, caractères)", () => {
  const racine = racineExemple(),
    e = p => evalJs(racine, `erreursProposition(${JSON.stringify(p)},S.st)`);
  const cod = evalJs(racine, "S.st.categories[0].cod");
  assert.ok(e(prop({ codes: [{ cod, lib: "x" }] })).length, "code déjà au référentiel");
  assert.ok(e(prop({ codes: [{ cod: "ab", lib: "x" }] })).length, "code mal formé");
  assert.ok(e(prop({ mesures: [{ gabarit: "libre", nom: "X", expr: "sum(1)" }] })).length, "gabarit inconnu");
  assert.ok(
    e(prop({ mesures: [{ gabarit: "somme", nom: "CA Réel", categories: ["CA FROID"], periodes: ["reel"] }] })).length,
    "nom du catalogue de base"
  );
  assert.ok(e(prop({ mesures: [{ gabarit: "ratio", nom: "R", num: "Inconnue", den: "CA Réel" }] })).length, "référence inconnue");
  assert.ok(
    e(prop({ mesures: [{ gabarit: "somme", nom: "Z", categories: ["PAS_UN_CODE"], periodes: ["reel"] }] })).length,
    "catégorie inconnue"
  );
  assert.ok(e(prop({ mesures: [{ gabarit: "somme", nom: "Z", categories: ["CA FROID"], periodes: ["zz"] }] })).length, "période inconnue");
  assert.ok(
    e(prop({ mesures: [{ gabarit: "somme", nom: "Z'] ; drop", categories: ["CA FROID"], periodes: ["reel"] }] })).length,
    "caractères interdits dans le nom"
  );
  assert.ok(e(prop({ titre: "" })).length, "titre vide");
  assert.ok(
    e(prop({ mesures: Array.from({ length: 9 }, (_, i) => ({ gabarit: "somme", nom: "M" + i, categories: ["CA FROID"], periodes: ["reel"] })) })).length,
    "plus de 8 mesures"
  );
  assert.ok(e(prop({ codes: ["AAA", "BBB", "CCC", "DDD"].map(c => ({ cod: c, lib: "x" })) })).length, "plus de 3 codes");
  assert.ok(e(prop({ id: "P 1" })).length, "id invalide");
});

test("propositionsActives et extensionCatalogue : seulement les propositions validées", () => {
  const racine = racineExemple(),
    v = prop({ hypothese: { ...prop().hypothese, valide: true } });
  const js = `(()=>{ S.st.propositions=[${JSON.stringify(prop())}]; S.ver++; const a=[propositionsActives().length, extensionCatalogue()];
    S.st.propositions=[${JSON.stringify(v)}]; S.ver++; return [...a, propositionsActives().length, extensionCatalogue().includes("CA froid M-1")]; })()`;
  assert.deepEqual(evalJs(racine, js), [0, "", 1, true]);
});

test("feuillesAdherent : une feuille nommée, une tuile par mesure", () => {
  const racine = racineExemple(),
    v = prop({ hypothese: { ...prop().hypothese, valide: true } });
  const f = evalJs(racine, `(()=>{ S.st.propositions=[${JSON.stringify(v)}]; S.ver++; return feuillesAdherent(); })()`);
  assert.equal(f.length, 1);
  assert.equal(f[0].title, "Mes indicateurs");
  assert.equal(f[0].objs.length, 2);
  assert.deepEqual(f[0].objs[0].items.map(i => i.m), ["CA froid", "CA froid M-1", "CA froid N-1", "Budget CA froid"]);
  assert.deepEqual(evalJs(racine, `feuillesAdherent()`), [], "aucune proposition : aucune feuille");
});

test("chargement : mesures.yml absent -> aucune proposition ; mal formé -> pas d'exception", () => {
  const racine = racineExemple();
  assert.deepEqual(evalJs(racine, "S.st.propositions"), []);
  fs.writeFileSync(path.join(racine, "spec/mesures.yml"), "propositions: [null, 3, {id: p1}]\n");
  assert.ok(Array.isArray(evalJs(racine, "S.st.propositions")));
  fs.writeFileSync(path.join(racine, "spec/mesures.yml"), "::: pas du yaml [");
  assert.ok(Array.isArray(evalJs(racine, "S.st.propositions")));
});

test("proposée : aucun effet ; validée : codes, catalogue, couverture, dashboard", () => {
  const racine = racineExemple(),
    avant = evalJs(racine, "[S.st.categories.length, CAT().list.length]");
  mesuresYml(racine, [prop()]);
  assert.deepEqual(evalJs(racine, "[S.st.categories.length, CAT().list.length]"), avant, "proposée : rien ne change");
  assert.equal(evalJs(racine, "S.st.propositions.length"), 1);
  mesuresYml(racine, [prop({ hypothese: { ...prop().hypothese, valide: true } })]);
  const apres = evalJs(racine, "[S.st.categories.length, CAT().list.length, S.st.categories.find(c=>c.cod==='CA FROID')]");
  assert.equal(apres[0], avant[0] + 1);
  assert.equal(apres[1], avant[1] + 5);
  assert.equal(apres[2].ajoute, "p1");
  assert.equal(apres[2].lib, "Chiffre d'affaires froid");
  assert.equal(evalJs(racine, "libelleCat('CA FROID')"), "Chiffre d'affaires froid");
  assert.ok(evalJs(racine, "COV().get(CAT().list.find(m=>m.name==='CA froid').id).s") !== "ok", "sans flux : non alimentée");
  assert.ok(evalJs(racine, "CAT().list.some(m=>m.name==='% froid du CA')"));
});

test("refusée : aucun effet", () => {
  const racine = racineExemple(),
    avant = evalJs(racine, "CAT().list.length");
  mesuresYml(racine, [prop({ hypothese: { ...prop().hypothese, refuse: true } })]);
  assert.equal(evalJs(racine, "CAT().list.length"), avant);
});

test("proposition invalide validée : ignorée, signalée par check", () => {
  const racine = racineExemple(),
    avant = evalJs(racine, "CAT().list.length");
  mesuresYml(racine, [prop({ mesures: [{ gabarit: "libre", nom: "X" }], hypothese: { ...prop().hypothese, valide: true } })]);
  assert.equal(evalJs(racine, "CAT().list.length"), avant);
  assert.ok(evalJs(racine, "checkSpec().some(x=>JSON.stringify(x).includes('p1'))"));
});

test("hypothèse mesures:<id> : listée, lot adherent, valider l'applique", () => {
  const racine = racineExemple();
  mesuresYml(racine, [prop()]);
  assert.equal(evalJs(racine, `listeHypotheses().filter(h=>h.cible==="mesures:p1").length`), 1);
  const q = evalJs(racine, `listeQuestions().find(q=>q.id==="mesures:p1")`);
  assert.equal(q.lot, "adherent");
  assert.ok(q.titre || q.question !== undefined);
  const r = ouvrirEspace(racine).repondre({ id: "mesures:p1", saisie: { oui: true }, par: "" });
  assert.ok(!r.erreurs, JSON.stringify(r));
  assert.ok(evalJs(racine, "CAT().list.some(m=>m.name==='CA froid')"));
});

test("opération de registre mesure : appliquée comme validée ; opération invalide refusée", () => {
  const racine = racineExemple(),
    { id, hypothese, ...valeur } = prop();
  assert.equal(evalJs(racine, `erreurModif({op:"mesure",cible:"p9",valeur:${JSON.stringify(valeur)}})`), null);
  assert.ok(evalJs(racine, `erreurModif({op:"mesure",cible:"p9",valeur:{titre:"t",mesures:[{gabarit:"libre",nom:"X"}]}})`));
  fs.writeFileSync(
    path.join(racine, "spec/reponses.yml"),
    YAML.stringify([
      {
        id: "projet#q2",
        question: "q",
        reponse: "Je veux le CA froid",
        origine: "client",
        date: "2026-11-08T10:00:00",
        modifs: [{ op: "mesure", cible: "p9", valeur: valeur }],
      },
    ])
  );
  assert.ok(evalJs(racine, "CAT().list.some(m=>m.name==='CA froid')"));
  assert.ok(evalJs(racine, "S.st.categories.some(c=>c.cod==='CA FROID')"));
});

test("check : code d'une proposition admis pour un flux, même non validée", () => {
  const racine = racineExemple();
  mesuresYml(racine, [prop()]);
  const ds = evalJs(racine, "S.st.datasets[0].id");
  fs.writeFileSync(
    path.join(racine, "spec/flux/zz.yml"),
    `id: zz\nds: ${ds}\ncodMode: fixe\ncod: CA FROID\nlib: CA froid\nvaleur: montant\nagg: sum\nchamp: MontantReel\nunite: €\ndate: periode\n`
  );
  const msgs = evalJs(racine, "checkSpec().map(x=>JSON.stringify(x))");
  assert.ok(!msgs.some(m => /CA FROID/.test(m) && /absent de spec\/referentiel/.test(m)), msgs.join("\n"));
});

test("check : doublons de nom entre propositions", () => {
  const racine = racineExemple();
  mesuresYml(racine, [prop(), prop({ id: "p2", codes: [] })]);
  assert.ok(evalJs(racine, "checkSpec().some(x=>/existe déjà|double|déjà proposé/.test(JSON.stringify(x)))"));
});

test("espace : erreursProposition, reponsesAdherent, nomsCatalogueBase ; apercu sans dataset", () => {
  const racine = racineExemple(),
    e = ouvrirEspace(racine);
  assert.deepEqual(e.erreursProposition(prop()), []);
  assert.ok(e.nomsCatalogueBase().includes("CA Réel"));
  assert.deepEqual(e.reponsesAdherent(), []);
  mesuresYml(racine, [prop()]);
  const a = ouvrirEspace(racine).apercuQuestion("mesures:p1");
  assert.equal(a.aucun, true);
  assert.doesNotMatch(a.raison, /dataset introuvable/);
});

test("candidatsPerimetre : les mesures de l'adhérent ne sont jamais candidates", () => {
  const racine = racineExemple();
  mesuresYml(racine, [prop({ hypothese: { ...prop().hypothese, valide: true } })]);
  assert.ok(!ouvrirEspace(racine).candidatsPerimetre().some(x => /froid/i.test(x.mesure)));
});

test("dashboard : DCAT inclut l'extension, renderPrev ajoute les feuilles de l'adhérent", () => {
  const dash = fs.readFileSync("viewer/dash.js", "utf8");
  assert.match(dash, /extensionCatalogue\(\)/);
  assert.match(dash, /feuillesAdherent\(\)/);
});

test("ecrireProposition : écrit une proposition non validée, conserve le commentaire", () => {
  const racine = racineExemple(),
    { hypothese, ...p } = prop();
  assert.deepEqual(ecrireProposition(racine, { ...p, hypothese: { ...hypothese, valide: true } }, []), { ok: true });
  const t = fs.readFileSync(path.join(racine, "spec/mesures.yml"), "utf8"),
    d = YAML.parse(t);
  assert.match(t, /^# Mesures/);
  assert.equal(d.propositions[0].hypothese.valide, false);
  assert.equal(d.propositions[0].codes[0].cod, "CA FROID");
});

test("ecrireProposition : refuse sans preuves, avec erreurs métier, au-delà de 5 ouvertes, une proposition tranchée ; atomique", () => {
  const racine = racineExemple(),
    { hypothese, ...p } = prop(),
    f = path.join(racine, "spec/mesures.yml");
  assert.ok(ecrireProposition(racine, { ...p, hypothese: { source: "agent", preuves: [], question: "q" } }, []).erreurs);
  assert.ok(ecrireProposition(racine, { ...p, hypothese }, ["code déjà au référentiel"]).erreurs);
  assert.ok(!fs.existsSync(f), "rien d'écrit en cas de refus");
  for (let i = 1; i <= 5; i++) assert.deepEqual(ecrireProposition(racine, { ...p, id: "p" + i, hypothese }, []), { ok: true });
  assert.match(ecrireProposition(racine, { ...p, id: "p6", hypothese }, []).erreurs.join(), /ouvertes/);
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("valide: false", "valide: true"));
  assert.match(ecrireProposition(racine, { ...p, id: "p1", titre: "Autre", hypothese }, []).erreurs.join(), /tranchée/);
});

test("outils maquette : lecture des réponses, des mesures de base ; écriture contrôlée par le moteur", async () => {
  const racine = racineExemple(),
    espace = ouvrirEspace(racine),
    o = creerOutilsMaquette({ espace, racine }),
    { hypothese, ...p } = prop();
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
  const racine = racineExemple(),
    espace = ouvrirEspace(racine),
    { hypothese, ...p } = prop();
  const r0 = await proposerMesures({ espace, racine, llm: fauxLlm([]), budget: creerBudget() });
  assert.equal(r0.ok, true);
  assert.deepEqual(r0.boucles, []);
  assert.ok(!fs.existsSync(path.join(racine, "spec/mesures.yml")));
  fs.writeFileSync(
    path.join(racine, "spec/reponses.yml"),
    YAML.stringify([
      {
        id: "projet#q1",
        question: "Activités ?",
        reponse: "Transport frigorifique et affrètement",
        origine: "client",
        date: "2026-11-08T10:00:00",
        modifs: [{ op: "noter" }],
      },
    ])
  );
  const e2 = ouvrirEspace(racine);
  const llm = fauxLlm([
    appelOutil("lire_reponses_adherent", {}),
    appelOutil("ecrire_proposition", { ...p, hypothese }),
    appelOutil("terminer", { resume: "ok" }),
  ]);
  const r = await proposerMesures({ espace: e2, racine, llm, budget: creerBudget() });
  assert.equal(r.ok, true);
  assert.equal(r.boucles.length, 1);
  assert.equal(YAML.parse(fs.readFileSync(path.join(racine, "spec/mesures.yml"), "utf8")).propositions.length, 1);
});

test("bout en bout : proposition de la maquette, validation par l'adhérent, effet sur le catalogue et la couverture", () => {
  const racine = racineExemple(),
    { hypothese, ...p } = prop();
  assert.deepEqual(ecrireProposition(racine, { ...p, hypothese }, ouvrirEspace(racine).erreursProposition(p)), { ok: true });
  const e = ouvrirEspace(racine),
    avant = e.couverture().mesures;
  assert.equal(evalJs(racine, "CAT().list.some(m=>m.name==='CA froid')"), false);
  const r = e.repondre({ id: "mesures:p1", saisie: { oui: true }, par: "" });
  assert.ok(!r.erreurs, JSON.stringify(r));
  assert.equal(evalJs(racine, "CAT().list.some(m=>m.name==='CA froid')"), true);
  const apres = ouvrirEspace(racine).couverture().mesures;
  assert.equal(apres.ok + apres.part + apres.none + apres.err + apres.hors, avant.ok + avant.part + avant.none + avant.err + avant.hors + 5);
  const gen = evalJs(racine, "faitsSql()");
  assert.match(gen, /LIB_LISIBLE/);
});
