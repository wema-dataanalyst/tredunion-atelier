import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { monter, get, post, registre } from "./aide/multi.mjs";

test("sans session : / redirige, /api/state et /events refusent", async t => {
  const m = await monter(t);
  const r = await get(m, "/"); assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/connexion");
  assert.equal((await get(m, "/api/state")).status, 401); assert.equal((await get(m, "/events")).status, 401);
  assert.equal((await post(m, "/api/reponse", "", { id: "x" })).status, 401);
  assert.equal((await get(m, "/connexion")).status, 200);
});

test("connexion : cookie HttpOnly SameSite=Strict ; mauvais mot de passe : 401 au message unique", async t => {
  const m = await monter(t);
  const ok = await m.connecter("alpha"); assert.equal(ok.r.status, 200);
  assert.match(ok.r.headers.get("set-cookie"), /HttpOnly/); assert.match(ok.r.headers.get("set-cookie"), /SameSite=Strict/);
  const a = await m.connecter("alpha", "faux"), b = await m.connecter("inconnu", "faux");
  assert.deepEqual([a.r.status, b.r.status], [401, 401]); assert.deepEqual(await a.r.json(), await b.r.json());
});

test("limitation : 429 après 5 échecs, même avec le bon mot de passe ensuite", async t => {
  const m = await monter(t);
  for (let i = 0; i < 5; i++) assert.equal((await m.connecter("alpha", "faux")).r.status, 401);
  assert.equal((await m.connecter("alpha")).r.status, 429);
});

test("isolation : alpha écrit chez alpha seulement, ?adherent=beta est ignoré", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  const r = await post(m, "/api/reponse?adherent=beta", cookie, { id: "compta_balance#q1", saisie: { texte: "Réponse alpha" } });
  assert.equal(r.status, 200);
  assert.equal(registre(m, "alpha").length, 1); assert.equal(registre(m, "beta").length, 0);
  const st = await (await get(m, "/api/state?adherent=beta", cookie)).json();
  assert.equal(st.state.reponses.length, 1); assert.equal(st.vue.role, "adherent");
});

test("admin : choisit l'adhérent, voit la liste ; un id piégé donne 404", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("admin-michel");
  const st = await (await get(m, "/api/state?adherent=beta", cookie)).json();
  assert.deepEqual(st.vue.adherents, ["alpha", "beta"]); assert.equal(st.vue.role, "admin");
  for (const id of ["gamma", "..%2Falpha", "alpha%2F..%2F..%2Fetc"]) assert.equal((await get(m, `/api/state?adherent=${id}`, cookie)).status, 404);
});

test("l'adhérent ne peut pas écrire la disposition du schéma (admin seulement)", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  assert.equal((await post(m, "/api/layout", cookie, { kind: "ds", id: "x", x: 1, y: 1 })).status, 403);
  const adm = await m.connecter("admin-michel");
  assert.equal((await post(m, "/api/layout?adherent=alpha", adm.cookie, { kind: "ds", id: "x", x: 1, y: 1 })).status, 204);
});

test("POST d'une autre origine refusé (403), rien au registre", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  const r = await post(m, "/api/reponse", cookie, { id: "compta_balance#q1", saisie: { texte: "x" } }, { origin: "http://evil.example" });
  assert.equal(r.status, 403); assert.equal(registre(m, "alpha").length, 0);
});

test("deux réponses simultanées : deux entrées intactes", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  const rs = await Promise.all(["Une", "Deux"].map(x => post(m, "/api/reponse", cookie, { id: "compta_balance#q1", saisie: { texte: x } })));
  assert.deepEqual(rs.map(r => r.status), [200, 200]);
  assert.deepEqual(registre(m, "alpha").map(e => e.reponse).sort(), ["Deux", "Une"]);
});

test("page d'un adhérent : data-role=adherent ; déconnexion invalide la session", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  assert.match(await (await get(m, "/", cookie)).text(), /<body data-role="adherent">/);
  assert.equal((await post(m, "/api/deconnexion", cookie, {})).status, 204);
  assert.equal((await get(m, "/api/state", cookie)).status, 401);
});

test("mot de passe de 5000 caractères : 401 au même message que le mauvais mot de passe", async t => {
  const m = await monter(t);
  const a = await m.connecter("alpha", "x".repeat(5000)), b = await m.connecter("alpha", "faux");
  assert.equal(a.r.status, 401); assert.deepEqual(await a.r.json(), await b.r.json());
});

test("limiteur par IP : 30 échecs d'ids différents → 429 au suivant", async t => {
  const m = await monter(t);
  for (let i = 0; i < 30; i++) assert.equal((await m.connecter(`inconnu${i}`, "faux")).r.status, 401);
  assert.equal((await m.connecter("alpha")).r.status, 429);
});

test("id invalide (non chaîne, > 40 caractères) : 401 même message", async t => {
  const m = await monter(t);
  const r = await post(m, "/api/connexion", "", { id: { a: 1 }, mdp: "x" }), r2 = await m.connecter("a".repeat(41), "x");
  assert.deepEqual([r.status, r2.r.status], [401, 401]); assert.deepEqual(await r.json(), await r2.r.json());
});

test("trustProxy : X-Forwarded-For distingue les IP ; ignoré sans trustProxy", async t => {
  const m = await monter(t, { trustProxy: true });
  for (let i = 0; i < 5; i++) await m.connecter("alpha", "faux", { "x-forwarded-for": "1.1.1.1" });
  assert.equal((await m.connecter("alpha", undefined, { "x-forwarded-for": "1.1.1.1" })).r.status, 429);
  assert.equal((await m.connecter("alpha", undefined, { "x-forwarded-for": "2.2.2.2" })).r.status, 200);
  const n = await monter(t);
  for (let i = 0; i < 5; i++) await n.connecter("alpha", "faux", { "x-forwarded-for": `3.3.3.${i}` });
  assert.equal((await n.connecter("alpha", undefined, { "x-forwarded-for": "9.9.9.9" })).r.status, 429);
});

test("en-têtes de sécurité sur /connexion et sur un 401", async t => {
  const m = await monter(t);
  for (const r of [await get(m, "/connexion"), await get(m, "/api/state")]) {
    assert.equal(r.headers.get("x-frame-options"), "DENY"); assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("referrer-policy"), "no-referrer"); assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  }
});

test("/api/layout : x et y non numériques → 400", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("admin-michel");
  assert.equal((await post(m, "/api/layout?adherent=alpha", cookie, { kind: "ds", id: "x", x: "a", y: 1 })).status, 400);
});

test("mémoire commune : l'adhérent ne voit ni les autres adhérents ni le chemin disque, l'admin voit tout", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mem-")), avant = process.env.TREDUNION_MEMOIRE;
  fs.writeFileSync(path.join(dir, "comptes.yml"), YAML.stringify([{ id: "706", cat: "CA", confirme_chez: ["alpha", "beta"], contredit_chez: ["gamma"] }]));
  process.env.TREDUNION_MEMOIRE = dir; t.after(() => { if (avant === undefined) delete process.env.TREDUNION_MEMOIRE; else process.env.TREDUNION_MEMOIRE = avant; fs.rmSync(dir, { recursive: true, force: true }); });
  const m = await monter(t);
  const adh = await (await get(m, "/api/state", (await m.connecter("alpha")).cookie)).text();
  assert.ok(!adh.includes("beta") && !adh.includes("gamma") && !adh.includes(dir));
  const e = JSON.parse(adh).state.memoire.comptes[0]; assert.deepEqual(e.confirme_chez, []); assert.equal(e.confirme_peu, true); assert.deepEqual(e.contredit_chez, []); assert.equal(e.contredit_peu, true); assert.equal(e.peu, true);
  const adm = (await (await get(m, "/api/state", (await m.connecter("admin-michel")).cookie)).json()).state.memoire;
  assert.deepEqual(adm.comptes[0].confirme_chez, ["alpha", "beta"]); assert.equal(adm.dir, dir);
});
