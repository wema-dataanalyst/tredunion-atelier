import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { monter, get, post } from "./aide/multi.mjs";
import { appelOutil } from "./aide/faux-llm.mjs";

const SFTP = { host: "sftp.exemple.fr", user: "transco", password: "S3cr$t\"Zz'#9", dir: "/export" };
const corps = (o = {}) => ({ nom: "Transports Neufs", id: "neuf", societes: [{ id: "nf", name: "Neufs SA" }], ...o });
const termine = { async discuter() { return { message: { role: "assistant", content: null, tool_calls: appelOutil("terminer", { resume: "rien" }).tool_calls }, usage: { total_tokens: 1 } }; } };
const admin = async m => (await m.connecter("admin-michel")).cookie;

/* Capture console.error/log pendant `fn` (les journaux ne doivent contenir aucun secret). */
async function capter(fn) {
  const lignes = [], e = console.error, l = console.log; console.error = console.log = (...a) => lignes.push(a.join(" "));
  try { return { r: await fn(), journal: lignes.join("\n") }; } finally { console.error = e; console.log = l; }
}

test("admin : 201 {id, mdp, maquette}, compte utilisable, fichiers créés, SFTP absent de la réponse et de /api/state", async t => {
  const m = await monter(t, { llm: null }), ck = await admin(m);
  const { r, journal } = await capter(() => post(m, "/api/adherents", ck, corps({ sftp: SFTP })));
  assert.equal(r.status, 201); const txt = await r.text(), o = JSON.parse(txt);
  assert.deepEqual(Object.keys(o).sort(), ["id", "maquette", "mdp"]); assert.equal(o.id, "neuf"); assert.equal(o.maquette, "non-demandee");
  assert.equal(txt.includes(SFTP.password), false); assert.equal(journal.includes(SFTP.password) || journal.includes(o.mdp), false);
  assert.equal(fs.statSync(path.join(m.adherents, "neuf/.env")).mode & 0o777, 0o600);
  const c = await m.connecter("neuf", o.mdp); assert.equal(c.r.status, 200);
  const etat = await (await get(m, "/api/state?adherent=neuf", c.cookie)).text(); assert.equal(etat.includes(SFTP.password), false);
  const etatAdmin = await (await get(m, "/api/state?adherent=neuf", ck)).text(); assert.equal(etatAdmin.includes(SFTP.password), false);
  const liste = await (await get(m, "/api/adherents", ck)).text(); assert.ok(liste.includes('"neuf"')); assert.equal(liste.includes(SFTP.password), false);
  assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(m.adherents, "../comptes.json"), "utf8"))).includes(SFTP.password), false);
});

test("non-admin 403, sans session 401, origine refusée 403, rien créé", async t => {
  const m = await monter(t, { llm: null }), alpha = (await m.connecter("alpha")).cookie, ck = await admin(m);
  assert.equal((await post(m, "/api/adherents", alpha, corps())).status, 403);
  assert.equal((await post(m, "/api/adherents", "", corps())).status, 401);
  assert.equal((await post(m, "/api/adherents", ck, corps(), { origin: "http://evil.example" })).status, 403);
  assert.equal(fs.existsSync(path.join(m.adherents, "neuf")), false);
});

test("doublon 409, hostiles 400 avec le champ, corps trop gros 413", async t => {
  const m = await monter(t, { llm: null }), ck = await admin(m);
  assert.equal((await post(m, "/api/adherents", ck, corps({ id: "alpha" }))).status, 409);
  for (const id of ["../x", "a b", "x\ny", "admin-x"]) { const r = await post(m, "/api/adherents", ck, corps({ id })); assert.equal(r.status, 400, id); assert.equal((await r.json()).erreurs[0].champ, "id"); }
  const r = await post(m, "/api/adherents", ck, corps({ sftp: { ...SFTP, host: "-oProxyCommand=touch /tmp/x" } })); assert.equal(r.status, 400);
  const txt = JSON.stringify(await r.json()); assert.equal(txt.includes(SFTP.password), false);
  assert.equal((await post(m, "/api/adherents", ck, corps({ nom: "x".repeat(70000) }))).status, 413);
  assert.deepEqual(fs.readdirSync(m.adherents).sort(), ["alpha", "beta"]);
});

test("échec de l'écriture des comptes : 500 générique, dossier supprimé, aucun secret", async t => {
  const m = await monter(t, { llm: null }), ck = await admin(m), comptes = path.join(m.adherents, "../comptes.json");
  const sauve = fs.readFileSync(comptes); fs.rmSync(comptes); fs.mkdirSync(comptes);
  t.after(() => { fs.rmSync(comptes, { recursive: true, force: true }); fs.writeFileSync(comptes, sauve); });
  const { r, journal } = await capter(() => post(m, "/api/adherents", ck, corps({ sftp: SFTP })));
  assert.equal(r.status, 500); const txt = await r.text(); assert.equal(txt, JSON.stringify({ erreurs: ["erreur interne"] }));
  assert.equal(journal.includes(SFTP.password), false);
  assert.deepEqual(fs.readdirSync(m.adherents).sort(), ["alpha", "beta"]);
});

test("maquette demandée : indisponible sans LLM, lancée avec LLM", async t => {
  const m = await monter(t, { llm: null }), ck = await admin(m);
  const r = await post(m, "/api/adherents", ck, corps({ maquette: true })); assert.equal(r.status, 201); assert.equal((await r.json()).maquette, "indisponible");
  const m2 = await monter(t, { llm: termine }), c2 = await admin(m2);
  const r2 = await post(m2, "/api/adherents", c2, corps({ maquette: true })); assert.equal(r2.status, 201); assert.equal((await r2.json()).maquette, "lancee");
  await m2.srv.attendreMaquette("neuf");
  assert.ok(fs.existsSync(path.join(m2.adherents, "neuf/.atelier/maquette.json")));
});

test("limiteur : 429 après 10 créations par session", async t => {
  const m = await monter(t, { llm: null }), ck = await admin(m);
  for (let i = 0; i < 10; i++) assert.equal((await post(m, "/api/adherents", ck, corps({ id: "alpha" }))).status, 409);
  assert.equal((await post(m, "/api/adherents", ck, corps())).status, 429);
});

test("limiteur : indexé sur le compte, une reconnexion ne remet pas le compteur à zéro", async t => {
  const m = await monter(t, { llm: null }), ck = await admin(m);
  for (let i = 0; i < 10; i++) assert.equal((await post(m, "/api/adherents", ck, corps({ id: "alpha" }))).status, 409);
  const ck2 = await admin(m);
  assert.equal((await post(m, "/api/adherents", ck2, corps())).status, 429);
});
