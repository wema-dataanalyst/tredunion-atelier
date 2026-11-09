import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { monter, get, post } from "./aide/multi.mjs";
import { appelOutil } from "./aide/faux-llm.mjs";

const termine = (jetons = 10, attente = 0) => ({ async discuter() { if (attente) await new Promise(r => setTimeout(r, attente)); return { message: { role: "assistant", content: null, tool_calls: appelOutil("terminer", { resume: "rien" }).tool_calls }, usage: { total_tokens: jetons } }; } });
const AUCUN = "/api/maquette?adherent=alpha";
/* Les adhérents d'exemple n'ont pas de data/raw : on y copie les CSV pour que « normaliser » tourne sans SFTP. */
function brut(m, id) {
  const racine = path.join(m.adherents, id);
  for (const soc of ["kf", "rl"]) { const src = path.join(racine, "data/bronze", soc), dst = path.join(racine, "data/raw", soc); fs.mkdirSync(dst, { recursive: true }); fs.readdirSync(src).filter(f => f.endsWith(".csv")).forEach(f => fs.copyFileSync(path.join(src, f), path.join(dst, f))); }
}
const etat = async (m, cookie, id = "alpha") => (await (await get(m, `/api/state?adherent=${id}`, cookie)).json()).vue;
const statutDisque = (m, id) => JSON.parse(fs.readFileSync(path.join(m.adherents, id, ".atelier/maquette.json"), "utf8"));

test("admin : 202, run en fond, statut ok dans vue.maquette ; absent pour un adhérent", async t => {
  const m = await monter(t, { llm: termine() }); brut(m, "alpha");
  const admin = (await m.connecter("admin-michel")).cookie, alpha = (await m.connecter("alpha")).cookie;
  assert.equal((await etat(m, admin)).maquette, null);
  const r = await post(m, AUCUN, admin, {}); assert.equal(r.status, 202); assert.deepEqual(await r.json(), { ok: true });
  assert.equal((await etat(m, admin)).maquette.fin, null, "en cours dès la réponse");
  await m.srv.attendreMaquette("alpha");
  const v = (await etat(m, admin)).maquette; assert.equal(v.ok, true, JSON.stringify(v.erreurs)); assert.equal(v.etape, "fin"); assert.ok(v.debut && v.fin && v.resume);
  assert.equal("maquette" in (await etat(m, alpha)), false);
  assert.equal(statutDisque(m, "alpha").ok, true);
});

test("non-admin 403, sans LLM 503, origine refusée 403, adhérent inconnu 404, sans session 401", async t => {
  const m = await monter(t, { llm: termine() }); const admin = (await m.connecter("admin-michel")).cookie, alpha = (await m.connecter("alpha")).cookie;
  assert.equal((await post(m, "/api/maquette", alpha, {})).status, 403);
  assert.equal((await post(m, AUCUN, admin, {}, { origin: "http://evil.example" })).status, 403);
  assert.equal((await post(m, "/api/maquette?adherent=inconnu", admin, {})).status, 404);
  assert.equal((await post(m, AUCUN, "", {})).status, 401);
  assert.equal(fs.existsSync(path.join(m.adherents, "alpha/.atelier/maquette.json")), false);
  const m2 = await monter(t, { llm: null }); const a2 = (await m2.connecter("admin-michel")).cookie;
  assert.equal((await post(m2, AUCUN, a2, {})).status, 503);
});

test("double lancement 429 ; au plus 2 runs sur le serveur", async t => {
  const m = await monter(t, { llm: termine(10, 300) }); ["alpha", "beta"].forEach(i => brut(m, i));
  fs.cpSync(path.join(m.adherents, "alpha"), path.join(m.adherents, "gamma"), { recursive: true });
  const admin = (await m.connecter("admin-michel")).cookie, lancer = i => post(m, `/api/maquette?adherent=${i}`, admin, {});
  assert.equal((await lancer("alpha")).status, 202);
  assert.equal((await lancer("alpha")).status, 429);
  assert.equal((await lancer("beta")).status, 202);
  const r = await lancer("gamma"); assert.equal(r.status, 429); assert.match((await r.json()).erreurs[0], /Trop de maquettes/);
  await Promise.all(["alpha", "beta"].map(i => m.srv.attendreMaquette(i)));
  assert.equal((await lancer("gamma")).status, 202); await m.srv.attendreMaquette("gamma");
});

test("événement SSE maquette reçu pendant le run", async t => {
  const m = await monter(t, { llm: termine(10, 100) }); brut(m, "alpha"); const admin = (await m.connecter("admin-michel")).cookie;
  const ctl = new AbortController(); t.after(() => ctl.abort());
  const sse = await get(m, "/events?adherent=alpha", admin, { signal: ctl.signal }); assert.equal(sse.status, 200);
  const lecteur = sse.body.getReader(); let texte = ""; const dec = new TextDecoder();
  assert.equal((await post(m, AUCUN, admin, {})).status, 202);
  const fin = Date.now() + 15000;
  while (!texte.includes("event: maquette") && Date.now() < fin) { const { value, done } = await lecteur.read(); if (done) break; texte += dec.decode(value); }
  assert.match(texte, /event: maquette/); await m.srv.attendreMaquette("alpha");
});

test("échec du run : l'erreur du statut ne contient aucun secret", async t => {
  const m = await monter(t, { llm: { async discuter() { throw new Error("HTTP 500 Authorization: Bearer sk-secret-123456"); } } }); brut(m, "alpha");
  const admin = (await m.connecter("admin-michel")).cookie;
  const r = await post(m, AUCUN, admin, {}); assert.equal(r.status, 202); assert.ok(!JSON.stringify(await r.json()).includes("sk-secret"));
  await m.srv.attendreMaquette("alpha");
  const v = (await etat(m, admin)).maquette; assert.equal(v.ok, false); assert.ok(!JSON.stringify(v).includes("sk-secret-123456"));
});

test("démarrage : un run « en cours » périmé est marqué interrompu et spec/ restaurée", async t => {
  const m = await monter(t, { llm: termine() }); const racine = path.join(m.adherents, "alpha");
  fs.cpSync(path.join(racine, "spec"), path.join(racine, ".atelier/spec-avant"), { recursive: true });
  fs.writeFileSync(path.join(racine, "spec/flux/zz.yml"), "id: zz\n");
  fs.writeFileSync(path.join(racine, ".atelier/maquette.json"), JSON.stringify({ etape: "flux", debut: "2026-11-08T10:00:00", fin: null, ok: null, erreurs: [], resume: null }));
  const srv2 = (await import("../server/app.mjs")).creerApp({ adherents: m.adherents, comptes: path.join(path.dirname(m.adherents), "comptes.json"), llm: null });
  t.after(() => srv2.close());
  assert.equal(statutDisque(m, "alpha").etape, "interrompu"); assert.equal(statutDisque(m, "alpha").ok, false);
  assert.equal(fs.existsSync(path.join(racine, "spec/flux/zz.yml")), false);
});

test("pendant un run : /api/reponse et /api/interpreter de cet adhérent → 409, l'autre adhérent n'est pas bloqué", async t => {
  const m = await monter(t, { llm: termine(10, 400) }); brut(m, "alpha");
  const admin = (await m.connecter("admin-michel")).cookie, alpha = (await m.connecter("alpha")).cookie, beta = (await m.connecter("beta")).cookie;
  assert.equal((await post(m, AUCUN, admin, {})).status, 202);
  for (const c of ["/api/reponse", "/api/interpreter"]) {
    const r = await post(m, c, alpha, { id: "x", saisie: {} }); assert.equal(r.status, 409);
    assert.match((await r.json()).erreurs[0], /Une maquette est en cours, réessayez dans quelques minutes/);
  }
  assert.notEqual((await post(m, "/api/reponse", beta, { id: "x", saisie: {} })).status, 409);
  await m.srv.attendreMaquette("alpha");
  assert.notEqual((await post(m, "/api/reponse", alpha, { id: "x", saisie: {} })).status, 409);
});

test("arrêt : le run est annulé, aucune écriture dans spec/ après close", async t => {
  const m = await monter(t, { llm: termine(10, 800) }); brut(m, "alpha");
  const admin = (await m.connecter("admin-michel")).cookie, spec = path.join(m.adherents, "alpha/spec");
  const lire = d => { const o = {}; const p = (x, pre) => fs.readdirSync(x, { withFileTypes: true }).forEach(e => e.isDirectory() ? p(path.join(x, e.name), pre + e.name + "/") : o[pre + e.name] = fs.readFileSync(path.join(x, e.name), "utf8")); p(d, ""); return o; };
  const avant = lire(spec);
  assert.equal((await post(m, AUCUN, admin, {})).status, 202);
  await new Promise(ok => setTimeout(ok, 300));
  await new Promise(ok => m.srv.close(ok));
  assert.deepEqual(lire(spec), avant);
  assert.equal(JSON.parse(fs.readFileSync(path.join(m.adherents, "alpha/.atelier/maquette.json"), "utf8")).etape, "interrompu");
  await new Promise(ok => setTimeout(ok, 1200));
  assert.deepEqual(lire(spec), avant);
});

test("GET /api/maquette : état léger avec journal, admin seul", async t => {
  const m = await monter(t, { llm: termine(10, 200) }); brut(m, "alpha");
  const admin = (await m.connecter("admin-michel")).cookie, alpha = (await m.connecter("alpha")).cookie;
  assert.equal((await get(m, AUCUN, alpha)).status, 403);
  assert.equal((await post(m, AUCUN, admin, {})).status, 202);
  const r = await get(m, AUCUN, admin); assert.equal(r.status, 200);
  const j = await r.json(); assert.equal(j.enCours, true); assert.equal(j.maquette.fin, null);
  await m.srv.attendreMaquette("alpha");
  const f = await (await get(m, AUCUN, admin)).json(); assert.equal(f.enCours, false); assert.equal(f.maquette.ok, true);
  assert.ok(f.maquette.journal.length > 3, "le journal est transmis");
  assert.ok(f.maquette.journal.some(l => /Collecte/.test(l.texte)));
});
