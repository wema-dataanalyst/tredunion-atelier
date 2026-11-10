import { test } from "node:test";
import assert from "node:assert/strict";
import { creerLlm, llmDepuisEnv } from "../server/agent/llm.mjs";
import { serveurFauxLlm } from "./aide/faux-llm.mjs";

const rep = (message, usage = { total_tokens: 12 }) => ({ choices: [{ message }], usage });

test("requête : URL, en-têtes, corps OpenAI avec outils", async t => {
  const s = await serveurFauxLlm(() => rep({ role: "assistant", content: "ok" })); t.after(s.fermer);
  const llm = creerLlm({ baseUrl: s.url + "/", cle: "sk-secret", modele: "mon-alias" });
  const r = await llm.discuter({ systeme: "SYS", messages: [{ role: "user", content: "bonjour" }], outils: [{ type: "function", function: { name: "f", description: "d", parameters: { type: "object", properties: {} } } }] });
  assert.equal(r.message.content, "ok"); assert.equal(r.usage.total_tokens, 12);
  const a = s.appels[0]; assert.equal(a.chemin, "/v1/chat/completions"); assert.equal(a.entetes.authorization, "Bearer sk-secret");
  assert.equal(a.corps.model, "mon-alias"); assert.equal(a.corps.messages[0].role, "system"); assert.equal(a.corps.messages[0].content, "SYS"); assert.equal(a.corps.messages[1].content, "bonjour");
  assert.equal(a.corps.tools[0].function.name, "f"); assert.equal(a.corps.tool_choice, "auto"); assert.equal(a.corps.temperature, 0);
});

test("appels d'outils renvoyés tels quels", async t => {
  const tc = [{ id: "c1", type: "function", function: { name: "lire_question", arguments: "{}" } }];
  const s = await serveurFauxLlm(() => rep({ role: "assistant", content: null, tool_calls: tc })); t.after(s.fermer);
  const r = await creerLlm({ baseUrl: s.url, cle: "k", modele: "m" }).discuter({ systeme: "s", messages: [], outils: [] });
  assert.deepEqual(r.message.tool_calls, tc);
});

test("erreur HTTP : message sans la clé ni le corps", async t => {
  const s = await serveurFauxLlm(() => ({ __statut: 401, error: "clé sk-secret invalide" })); t.after(s.fermer);
  await assert.rejects(creerLlm({ baseUrl: s.url, cle: "sk-secret", modele: "m" }).discuter({ systeme: "s", messages: [], outils: [] }), e => /HTTP 401/.test(e.message) && !e.message.includes("sk-secret"));
});

test("réponse illisible ou vide, passerelle injoignable, délai : erreurs nettes sans la clé", async t => {
  const s = await serveurFauxLlm(() => ({ __brut: "pas du json" })); t.after(s.fermer);
  await assert.rejects(creerLlm({ baseUrl: s.url, cle: "sk-secret", modele: "m" }).discuter({ systeme: "s", messages: [], outils: [] }), /réponse illisible/);
  const v = await serveurFauxLlm(() => ({ choices: [] })); t.after(v.fermer);
  await assert.rejects(creerLlm({ baseUrl: v.url, cle: "k", modele: "m" }).discuter({ systeme: "s", messages: [], outils: [] }), /réponse vide/);
  await assert.rejects(creerLlm({ baseUrl: "http://127.0.0.1:1", cle: "sk-secret", modele: "m" }).discuter({ systeme: "s", messages: [], outils: [] }), e => /injoignable/.test(e.message) && !e.message.includes("sk-secret"));
  const l = await serveurFauxLlm(() => new Promise(() => {})); t.after(l.fermer);
  await assert.rejects(creerLlm({ baseUrl: l.url, cle: "k", modele: "m", delaiMs: 100 }).discuter({ systeme: "s", messages: [], outils: [] }), /délai dépassé/);
});

test("llmDepuisEnv : actif seulement avec clé et modèle", () => {
  assert.equal(llmDepuisEnv({}), null); assert.equal(llmDepuisEnv({ LLM_API_KEY: "k" }), null); assert.equal(llmDepuisEnv({ LLM_MODEL: "m" }), null);
  assert.ok(llmDepuisEnv({ LLM_API_KEY: "k", LLM_MODEL: "m" }));
});

test("modèle par étape : parEtape l'emporte pour l'étape nommée, modele sinon", async t => {
  const s = await serveurFauxLlm(() => rep({ role: "assistant", content: "ok" })); t.after(s.fermer);
  const llm = creerLlm({ baseUrl: s.url, cle: "k", modele: "sonnet", parEtape: { datasets: "haiku" } });
  await llm.discuter({ systeme: "s", messages: [], outils: [], etape: "datasets" });
  await llm.discuter({ systeme: "s", messages: [], outils: [], etape: "flux" });
  await llm.discuter({ systeme: "s", messages: [], outils: [] });
  assert.deepEqual(s.appels.map(a => a.corps.model), ["haiku", "sonnet", "sonnet"]);
});

test("reessais : un incident réseau transitoire est retenté, pas une erreur HTTP ni un délai dépassé", async () => {
  let appels = 0;
  const fetchImpl = async () => { appels++; if (appels === 1) throw new Error("fetch failed"); return { ok: true, json: async () => ({ choices: [{ message: { role: "assistant", content: "ok" } }], usage: {} }) }; };
  const r = await creerLlm({ cle: "k", modele: "m", fetchImpl, reessais: 1, reessaiDelaiMs: 0 }).discuter({ systeme: "s", messages: [], outils: [] });
  assert.equal(appels, 2); assert.equal(r.message.content, "ok");
});

test("reessais : épuisés → l'erreur d'origine remonte", async () => {
  let appels = 0;
  const fetchImpl = async () => { appels++; throw new Error("fetch failed"); };
  await assert.rejects(creerLlm({ cle: "k", modele: "m", fetchImpl, reessais: 2, reessaiDelaiMs: 0 }).discuter({ systeme: "s", messages: [], outils: [] }), /injoignable/);
  assert.equal(appels, 3);
});

test("reessais : jamais sur un délai dépassé (le budget de temps de l'appelant n'est pas dépassé en douce)", async () => {
  let appels = 0;
  const fetchImpl = (u, init) => { appels++; return new Promise((_, ko) => init.signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "TimeoutError"; ko(e); })); };
  await assert.rejects(creerLlm({ cle: "k", modele: "m", fetchImpl, delaiMs: 20, reessais: 2, reessaiDelaiMs: 0 }).discuter({ systeme: "s", messages: [], outils: [] }), /délai dépassé/);
  assert.equal(appels, 1);
});

test("llmDepuisEnv : un réessai activé par défaut", () => {
  assert.equal(llmDepuisEnv({ LLM_API_KEY: "k", LLM_MODEL: "m" }) !== null, true);
});
