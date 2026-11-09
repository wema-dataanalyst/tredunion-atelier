import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ouvrirEspace } from "../tools/espace.mjs";
import { ecrirePerimetre } from "../server/agent/specs.mjs";
import { creerOutilsMaquette } from "../server/agent/maquette-outils.mjs";
import { proposerPerimetre, creerBudget, SYSTEME_MAQUETTE } from "../server/agent/maquette-agent.mjs";
import { spawnSync } from "node:child_process";
import { racineExemple, ATELIER } from "./aide/racine.mjs";
import { fauxLlm, appelOutil } from "./aide/faux-llm.mjs";
import { lancerMaquette } from "../server/maquette.mjs";

const hyp = { source: "agent", preuves: ["3 exports lus, aucune colonne de kilomètres"], question: "Ces indicateurs ne s'appliquent-ils pas à vous ?" };
const neuf = () => { const racine = racineExemple(), espace = ouvrirEspace(racine); return { racine, espace }; };
const lire = (racine) => YAML.parse(fs.readFileSync(path.join(racine, "spec/perimetre.yml"), "utf8"));
const now = () => new Date("2026-11-08T10:00:00");
const neufMaquette = () => {
  const { racine, espace } = neuf();
  for (const soc of ["kf", "rl"]) {
    const src = path.join(racine, "data/bronze", soc), dst = path.join(racine, "data/raw", soc);
    fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(src).filter(f => f.endsWith(".csv")).forEach(f => fs.copyFileSync(path.join(src, f), path.join(dst, f)));
  }
  return { racine, espace };
};
const llmTermine = (jetons = 10) => ({ async discuter() { return { message: { role: "assistant", content: null, tool_calls: appelOutil("terminer", { resume: "rien" }).tool_calls }, usage: { total_tokens: jetons } }; } });
const llmEcritPerimetre = (nom) => {
  let apresEcriture = false;
  return { async discuter(requete) {
    const u = String(requete.messages?.at(-1)?.content || "");
    if (!apresEcriture && /n'ont aucune donnée|lire_candidats_perimetre/.test(u)) {
      return { message: { role: "assistant", content: null, tool_calls: appelOutil("ecrire_perimetre", { id: "g1", cause: "Aucune donnée de ce type", mesures: [nom], titre: "Retirer cet indicateur ?", contexte: "Vos exports n'en contiennent pas.", hypothese: hyp }).tool_calls }, usage: { total_tokens: 10 } };
    }
    if (!apresEcriture && requete.messages?.some(m => m.role === "tool" && String(m.content || "").includes('"ok":true'))) apresEcriture = true;
    return { message: { role: "assistant", content: null, tool_calls: appelOutil("terminer", { resume: "périmètre" }).tool_calls }, usage: { total_tokens: 10 } };
  } };
};

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

test("maquette complète : l'étape périmètre écrit un groupe proposé, check vert", async () => {
  const { racine, espace } = neufMaquette();
  const nom = espace.candidatsPerimetre()[0].mesure;
  const r = await lancerMaquette({ racine, espace, llm: llmEcritPerimetre(nom), rapporter() {}, now });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.ok(fs.existsSync(path.join(racine, "spec/perimetre.yml")));
  const g = lire(racine).groupes.find(x => x.id === "g1");
  assert.ok(g); assert.equal(g.hypothese.valide, false);
  const c = spawnSync(process.execPath, [ATELIER, "check"], { env: { ...process.env, ATELIER_ROOT: racine }, encoding: "utf8" });
  assert.equal(c.status, 0, c.stdout + c.stderr);
});

test("maquette relance : un groupe tranché n'est pas modifié ni reproposé", async () => {
  const { racine, espace } = neufMaquette();
  const nom = espace.candidatsPerimetre()[0].mesure;
  ecrirePerimetre(racine, { id: "g1", cause: "x", mesures: [nom], hypothese: hyp }, [nom]);
  const f = path.join(racine, "spec/perimetre.yml");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("valide: false", "valide: true"));
  const avant = fs.readFileSync(f, "utf8");
  const r = await lancerMaquette({ racine, espace: ouvrirEspace(racine), llm: llmTermine(), rapporter() {}, now });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.equal(fs.readFileSync(f, "utf8"), avant);
  assert.ok(!ouvrirEspace(racine).candidatsPerimetre().some(x => x.mesure === nom));
});

test("maquette sans LLM : spec/perimetre.yml absent", async () => {
  const { racine, espace } = neufMaquette();
  const r = await lancerMaquette({ racine, espace, llm: null, rapporter() {}, now });
  assert.equal(r.ok, false);
  assert.ok(!fs.existsSync(path.join(racine, "spec/perimetre.yml")));
});
