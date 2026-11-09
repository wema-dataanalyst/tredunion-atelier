import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { monter, get, post, registre } from "./aide/multi.mjs";
import { fauxLlm, appelOutil } from "./aide/faux-llm.mjs";

const ID = "compta_balance#q1";
const propose = (txt = "Vous donnez la date de clôture.") => [appelOutil("proposer", { comprehension: txt, operations: [{ op: "noter" }] })];

test("sans passerelle configurée : 503 et vue.agent faux", async t => {
  const m = await monter(t, { llm: null }); const { cookie } = await m.connecter("alpha");
  assert.equal((await post(m, "/api/interpreter", cookie, { id: ID, texte: "x" })).status, 503);
  assert.equal((await (await get(m, "/api/state", cookie)).json()).vue.agent, false);
});

test("auth : 401 sans session, 403 d'une autre origine, 415 hors JSON", async t => {
  const m = await monter(t, { llm: fauxLlm([]) }); const { cookie } = await m.connecter("alpha");
  assert.equal((await post(m, "/api/interpreter", "", { id: ID, texte: "x" })).status, 401);
  assert.equal((await post(m, "/api/interpreter", cookie, { id: ID, texte: "x" }, { origin: "http://evil.example" })).status, 403);
  assert.equal((await fetch(m.url + "/api/interpreter", { method: "POST", headers: { cookie, "content-type": "text/plain" }, body: "x" })).status, 415);
});

test("interprétation : renvoie la compréhension et n'écrit rien ; « C'est bien ça » applique", async t => {
  const m = await monter(t, { llm: fauxLlm(propose()) }); const { cookie } = await m.connecter("alpha");
  const r = await post(m, "/api/interpreter", cookie, { id: ID, texte: "Date de clôture réelle" }); assert.equal(r.status, 200);
  const j = await r.json(); assert.equal(j.comprehension, "Vous donnez la date de clôture."); assert.ok(j.lignes.length && j.effet && !("meta" in j));
  assert.equal(registre(m, "alpha").length, 0); assert.equal(fs.existsSync(path.join(m.adherents, "alpha/generated")), false);
  const ok = await post(m, "/api/reponse", cookie, { id: ID, saisie: { interpretation: { texte: "Date de clôture réelle", comprehension: j.comprehension, operations: j.operations } } });
  assert.equal(ok.status, 200); await m.srv.attendreFile("alpha");
  assert.equal(registre(m, "alpha")[0].interprete, j.comprehension); assert.ok(fs.existsSync(path.join(m.adherents, "alpha/generated")));
});

test("« C'est bien ça » revalide : une opération falsifiée est refusée", async t => {
  const m = await monter(t, { llm: fauxLlm([]) }); const { cookie } = await m.connecter("alpha");
  const r = await post(m, "/api/reponse", cookie, { id: ID, saisie: { interpretation: { texte: "x", comprehension: "y", operations: [{ op: "codes", cible: "../../etc.passwd", valeur: { A: "x" } }] } } });
  assert.equal(r.status, 400); assert.equal(registre(m, "alpha").length, 0);
});

test("texte à donnée personnelle ou vide : 400 sans appel à la passerelle", async t => {
  const llm = fauxLlm([]); const m = await monter(t, { llm }); const { cookie } = await m.connecter("alpha");
  assert.equal((await post(m, "/api/interpreter", cookie, { id: ID, texte: "" })).status, 400);
  assert.equal((await post(m, "/api/interpreter", cookie, { id: "inconnu#q9", texte: "x" })).status, 400);
  assert.equal(llm.appels.length, 0);
});

test("précision demandée : 200 {precision} ; passerelle en échec : 502 sans fuite", async t => {
  const m = await monter(t, { llm: fauxLlm([appelOutil("demander_precision", { question: "Quel statut ?" })]) }); const { cookie } = await m.connecter("alpha");
  assert.deepEqual(await (await post(m, "/api/interpreter", cookie, { id: ID, texte: "hum" })).json(), { precision: "Quel statut ?" });
  const casse = { async discuter() { throw new Error("passerelle LLM : HTTP 500"); } };
  const m2 = await monter(t, { llm: casse }); const c2 = (await m2.connecter("alpha")).cookie;
  const r = await post(m2, "/api/interpreter", c2, { id: ID, texte: "hum" }); assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { erreurs: ["interprétation indisponible"] });
  const l = JSON.parse(fs.readFileSync(path.join(m2.adherents, "alpha/.atelier/agent.jsonl"), "utf8").trim()); assert.equal(l.issue, "passerelle");
});

test("journal : une ligne par appel, sans le texte du client ; limite de 10 par session ; une seule à la fois", async t => {
  const lent = { async discuter() { await new Promise(r => setTimeout(r, 150)); return { message: appelOutil("demander_precision", { question: "?" }), usage: { total_tokens: 5 } }; } };
  const m = await monter(t, { llm: lent }); const { cookie } = await m.connecter("alpha");
  const [a, b] = await Promise.all([post(m, "/api/interpreter", cookie, { id: ID, texte: "SECRET-TEXTE" }), post(m, "/api/interpreter", cookie, { id: ID, texte: "SECRET-TEXTE" })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 429]);
  const log = fs.readFileSync(path.join(m.adherents, "alpha/.atelier/agent.jsonl"), "utf8"); assert.ok(!log.includes("SECRET-TEXTE"));
  const l = JSON.parse(log.trim().split("\n")[0]); assert.deepEqual(Object.keys(l).sort(), ["date", "id", "issue", "jetons", "ms", "tours"]);
  const rapide = { async discuter() { return { message: appelOutil("demander_precision", { question: "?" }), usage: {} }; } };
  const m2 = await monter(t, { llm: rapide }); const c2 = (await m2.connecter("alpha")).cookie; let dernier;
  for (let i = 0; i < 11; i++) dernier = await post(m2, "/api/interpreter", c2, { id: ID, texte: "x" });
  assert.equal(dernier.status, 429);
});
