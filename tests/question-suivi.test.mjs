import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";
import { monter, post, registre } from "./aide/multi.mjs";
import { fauxLlm, appelOutil } from "./aide/faux-llm.mjs";
import { decrire } from "../server/agent/outils.mjs";

const ID = "compta_balance#q1", DS = "compta_balance";
const interp = ops => ({ interpretation: { texte: "Date de clôture réelle", comprehension: "Vous confirmez la date.", operations: ops } });
const Q = (text, extra = {}) => ({ op: "question", cible: DS, valeur: { text, ...extra } });
const suivis = (e, ds = DS) => vm.runInContext(`DS(${JSON.stringify(ds)}).questions.filter(q=>q.suivi)`, e.evaluate().ctx).map(q => ({ ...q }));
const v = (e, ops) => e.previsualiser({ id: ID, saisie: interp(ops) });

test("validation : dataset, texte, type, choix, exclure", () => {
  const e = ouvrirEspace(racineExemple());
  assert.ok(!v(e, [Q("Les avoirs sont-ils inclus ?")]).erreurs);
  assert.ok(v(e, [{ op: "question", cible: "inconnu", valeur: { text: "Les avoirs sont-ils inclus ?" } }]).erreurs);
  assert.ok(v(e, [Q("abc")]).erreurs);
  assert.ok(v(e, [Q("x".repeat(301))]).erreurs);
  assert.ok(v(e, [Q("Deux\nlignes ici")]).erreurs);
  assert.ok(v(e, [{ op: "question", cible: DS }]).erreurs);
  assert.ok(v(e, [Q("Question valide ?", { reponse_type: "inconnu" })]).erreurs);
  assert.ok(v(e, [Q("Question valide ?", { reponse_type: "choix" })]).erreurs);
  assert.ok(v(e, [Q("Question valide ?", { reponse_type: "choix", reponse_cible: "x.y.format", options: [{ libelle: "A", valeur: "DD/MM/YYYY" }] })]).erreurs === undefined);
  assert.ok(v(e, [Q("Question valide ?", { reponse_type: "exclure" })]).erreurs);
  assert.ok(v(e, [Q("Question valide ?", { reponse_type: "exclure", sql: "n'importe quoi (" })]).erreurs);
  assert.ok(!v(e, [Q("Question valide ?", { reponse_type: "libre" })]).erreurs);
});

test("application : id qN suivant, done false, suivi true, effet affiché", () => {
  const root = racineExemple(), e = ouvrirEspace(root);
  const r = v(e, [Q("Les avoirs sont-ils inclus ?", { titre: "Les avoirs sont-ils comptés ?" })]);
  assert.match(r.entree.effet, /questions ouvertes (\d+) → (\d+)/);
  const [a, b] = r.entree.effet.match(/questions ouvertes (\d+) → (\d+)/).slice(1).map(Number); assert.equal(b, a, "q1 fermée, une question ouverte de plus");
  assert.equal(e.repondre({ id: ID, saisie: interp([Q("Les avoirs sont-ils inclus ?", { titre: "Les avoirs sont-ils comptés ?" })]) }).erreurs, undefined);
  const [q] = suivis(e), max = Math.max(...vm.runInContext(`DS("${DS}").questions.map(q=>+String(q.id).replace(/\\D/g,""))`, e.evaluate().ctx));
  assert.equal(q.id, `q${max}`); assert.equal(q.done, false); assert.equal(q.suivi, true); assert.equal(q.titre, "Les avoirs sont-ils comptés ?");
});

test("idempotence : rejeu du registre sans doublon, même texte rejoué ignoré", () => {
  const e = ouvrirEspace(racineExemple());
  e.repondre({ id: ID, saisie: interp([Q("Les avoirs sont-ils inclus ?")]) });
  e.repondre({ id: ID, saisie: interp([Q("Les avoirs sont-ils inclus ?")]) });
  assert.equal(suivis(e).length, 1);
  assert.equal(e.evaluate().errors.filter(x => x.niv === "erreur").length, 0);
});

test("plafond de 3 questions de suivi ouvertes par dataset", () => {
  const e = ouvrirEspace(racineExemple());
  /* la dernière entrée d'une question l'emporte : un suivi par question répondue */
  ["q1", "q2", "q3"].forEach((q, i) => assert.equal(e.repondre({ id: `${DS}#${q}`, saisie: interp([Q(["Première question ?", "Deuxième question ?", "Troisième question ?"][i])]) }).erreurs, undefined));
  assert.equal(suivis(e).length, 3);
  assert.ok(v(e, [Q("Quatrième question ?")]).erreurs);
  assert.ok(!e.previsualiser({ id: `${DS}#q1`, saisie: interp([Q("Première question ?")]) }).erreurs, "texte déjà présent : pas une nouvelle question");
  assert.ok(ouvrirEspace(racineExemple()).previsualiser({ id: ID, saisie: interp([Q("Une question ?"), Q("Deux questions ?"), Q("Trois questions ?"), Q("Quatre questions ?")]) }).erreurs);
});

test("pii : texte, titre ou contexte citant une valeur personnelle refusé", () => {
  const root = racineExemple(), e = ouvrirEspace(root);
  const csv = fs.readFileSync(path.join(root, "data/bronze/kf/tms_conducteurs.csv"), "utf8").split("\n");
  const col = csv[0].split(";").indexOf("nom"), val = csv.slice(1).map(l => l.split(";")[col]).find(x => x && x.length >= 4);
  assert.ok(val);
  assert.ok(v(e, [Q(`Que fait ${val} ici ?`)]).erreurs);
  assert.ok(v(e, [Q("Question valide ?", { titre: `Pour ${val} ?` })]).erreurs);
  assert.ok(v(e, [Q("Question valide ?", { contexte: `Cas de ${val}.` })]).erreurs);
});

test("rejeu du registre : entrée dont le dataset a disparu signalée orpheline", () => {
  const root = racineExemple(), e = ouvrirEspace(root);
  e.repondre({ id: ID, saisie: interp([Q("Les avoirs sont-ils inclus ?")]) });
  const reg = path.join(root, "spec/reponses.yml");
  fs.writeFileSync(reg, fs.readFileSync(reg, "utf8").replace(`cible: ${DS}\n`, "cible: disparu\n"));
  const o = vm.runInContext("S.st._orphelines", e.evaluate().ctx);
  assert.deepEqual([o.length, o[0].op, o[0].cible], [1, "question", "disparu"]);
});

test("decrire : « Je vous poserai ensuite »", () => {
  assert.match(decrire(Q("Les avoirs sont-ils inclus ?")), /^Je vous poserai ensuite : Les avoirs sont-ils inclus \?/);
});

test("de bout en bout : faux LLM propose une question, « C'est bien ça » l'ajoute", async t => {
  const op = Q("Les avoirs sont-ils inclus ?");
  const m = await monter(t, { llm: fauxLlm([appelOutil("proposer", { comprehension: "Vous donnez la date.", operations: [{ op: "noter" }, op] })]) });
  const { cookie } = await m.connecter("alpha");
  const j = await (await post(m, "/api/interpreter", cookie, { id: ID, texte: "Date de clôture réelle" })).json();
  assert.ok(j.lignes.some(l => /Je vous poserai ensuite/.test(l)), JSON.stringify(j));
  assert.match(j.effet, /questions ouvertes \d+ → \d+/);
  assert.equal(registre(m, "alpha").length, 0);
  const ok = await post(m, "/api/reponse", cookie, { id: ID, saisie: { interpretation: { texte: "Date de clôture réelle", comprehension: j.comprehension, operations: j.operations } } });
  assert.equal(ok.status, 200); await m.srv.attendreFile("alpha");
  assert.ok(registre(m, "alpha")[0].modifs.some(x => x.op === "question"));
});
