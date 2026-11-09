import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import YAML from "yaml";
import { ouvrirEspace } from "../tools/espace.mjs";
import { ecrireLibelles } from "../server/agent/specs.mjs";
import { creerOutilsMaquette } from "../server/agent/maquette-outils.mjs";
import { proposerLibelles, creerBudget, SYSTEME_MAQUETTE } from "../server/agent/maquette-agent.mjs";
import { racineExemple } from "./aide/racine.mjs";
import { fauxLlm, appelOutil } from "./aide/faux-llm.mjs";

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
  const msgs = evalJs(racine, `checkSpec().map(x=>x.msg||x.message||x.txt||JSON.stringify(x))`);
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
