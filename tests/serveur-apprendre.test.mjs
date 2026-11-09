import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { monter, get, post } from "./aide/multi.mjs";

/* Mémoire temporaire : jamais la vraie. Chaque test repart d'un dossier neuf. */
const MEM = fs.mkdtempSync(path.join(os.tmpdir(), "memoire-")); process.env.TREDUNION_MEMOIRE = MEM; process.env.TREDUNION_SEL = "sel-de-test";
const fichier = f => path.join(MEM, f);
const vider = () => { fs.rmSync(MEM, { recursive: true, force: true }); fs.mkdirSync(MEM, { recursive: true }); };
const instantane = () => fs.readdirSync(MEM).sort().map(f => [f, fs.readFileSync(fichier(f), "utf8")]);
const APPR = "/api/apprendre?adherent=alpha";
const etat = async (m, cookie) => (await (await get(m, "/api/state?adherent=alpha", cookie)).json()).vue;
const journal = m => path.join(m.adherents, "alpha/.atelier/apprentissage.jsonl");
/* Une colonne validée par l'adhérent = un fait à apprendre. */
function trancher(m, id = "alpha") {
  const f = path.join(m.adherents, id, "spec/datasets/budget_n1.yml"), t = fs.readFileSync(f, "utf8");
  fs.writeFileSync(f, t.replace("    desc: Code catégorie du référentiel\n", "    desc: Code catégorie du référentiel\n    hypothese: {source: agent, valide: true}\n"));
}

test("aperçu admin : faits sans société, rien d'écrit ; absent pour un adhérent", async t => {
  vider(); const m = await monter(t); trancher(m);
  const admin = (await m.connecter("admin-michel")).cookie, alpha = (await m.connecter("alpha")).cookie, avant = instantane();
  const v = (await etat(m, admin)).apprentissage;
  assert.deepEqual(v.faits, [{ type: "colonnes", cle: "code_categorie", effet: "confirmé" }]);
  assert.ok(!JSON.stringify(v).includes("kf"), "pas de société en clair");
  assert.deepEqual(instantane(), avant, "l'aperçu n'écrit pas la mémoire");
  assert.equal(fs.existsSync(fichier(".sel")), false);
  assert.equal("apprentissage" in (await etat(m, alpha)), false);
});

test("application : mémoire écrite en pseudonyme, journal sans donnée, réapercu vide", async t => {
  vider(); const m = await monter(t); trancher(m); const admin = (await m.connecter("admin-michel")).cookie;
  const r = await post(m, APPR, admin, {}); assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).faits, [{ type: "colonnes", cle: "code_categorie", effet: "confirmé" }]);
  const mem = fs.readFileSync(fichier("colonnes.yml"), "utf8");
  assert.match(mem, /code_categorie/); assert.match(mem, /p:[0-9a-f]{16}/); assert.ok(!/\bkf\b/.test(mem));
  const l = fs.readFileSync(journal(m), "utf8").trim().split("\n"); assert.equal(l.length, 1);
  const e = JSON.parse(l[0]); assert.deepEqual(Object.keys(e).sort(), ["adherent", "admin", "date", "details", "faits"]); assert.equal(e.faits, 1);
  assert.deepEqual([e.admin, e.adherent], ["admin-michel", "alpha"]); assert.deepEqual(e.details, [{ type: "colonnes", cle: "code_categorie", effet: "confirmé" }]); assert.ok(!JSON.stringify(e).includes("kf"));
  assert.deepEqual((await etat(m, admin)).apprentissage.faits, [], "déjà appris : plus rien à appliquer (cache invalidé)");
});

test("droits, origine, session, adhérent inconnu", async t => {
  vider(); const m = await monter(t); trancher(m); const admin = (await m.connecter("admin-michel")).cookie, alpha = (await m.connecter("alpha")).cookie, avant = instantane();
  assert.equal((await post(m, "/api/apprendre", alpha, {})).status, 403);
  assert.equal((await post(m, APPR, admin, {}, { origin: "http://evil.example" })).status, 403);
  assert.equal((await post(m, APPR, "", {})).status, 401);
  assert.equal((await post(m, "/api/apprendre?adherent=inconnu", admin, {})).status, 404);
  assert.deepEqual(instantane(), avant); assert.equal(fs.existsSync(journal(m)), false);
});

test("double clic : 409 pour les clics concurrents, un seul apprentissage", async t => {
  vider(); const m = await monter(t); trancher(m); const admin = (await m.connecter("admin-michel")).cookie;
  const st = (await Promise.all(Array.from({ length: 5 }, () => post(m, APPR, admin, {}))).then(rs => rs.map(r => r.status)));
  assert.ok(st.includes(200)); assert.ok(st.every(s => s === 200 || s === 409), st.join());
  assert.equal(fs.readFileSync(journal(m), "utf8").trim().split("\n").length, st.filter(s => s === 200).length);
  assert.equal((await post(m, APPR, admin, {})).status, 200, "le verrou est relâché");
});

test("erreurs de spec : 400, mémoire intacte", async t => {
  vider(); const m = await monter(t); trancher(m); const admin = (await m.connecter("admin-michel")).cookie;
  fs.writeFileSync(path.join(m.adherents, "alpha/spec/flux/zz.yml"), "id: zz\nds: inexistant\ncod: X\nvaleur: a\ndate: d\n");
  const avant = instantane(), r = await post(m, APPR, admin, {});
  assert.equal(r.status, 400); assert.match((await r.json()).erreurs[0], /erreur/);
  assert.deepEqual(instantane(), avant); assert.equal(fs.existsSync(journal(m)), false);
});

test("événement SSE apprentissage à la fin", async t => {
  vider(); const m = await monter(t); trancher(m); const admin = (await m.connecter("admin-michel")).cookie;
  const ctl = new AbortController(); t.after(() => ctl.abort());
  const sse = await get(m, "/events?adherent=alpha", admin, { signal: ctl.signal }), lecteur = sse.body.getReader(), dec = new TextDecoder(); let texte = "";
  assert.equal((await post(m, APPR, admin, {})).status, 200);
  const fin = Date.now() + 5000;
  while (!texte.includes("event: apprentissage") && Date.now() < fin) { const { value, done } = await lecteur.read(); if (done) break; texte += dec.decode(value); }
  assert.match(texte, /event: apprentissage/);
});
