import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import YAML from "yaml";
import { racineExemple, ATELIER } from "./aide/racine.mjs";

const portLibre = () => new Promise(ok => { const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); }); });

async function serveur(root, essais = 5) {
  try { return await demarrer(root); } catch (e) { if (essais > 1 && /EADDRINUSE/.test(e.message)) return serveur(root, essais - 1); throw e; }
}
async function demarrer(root) {
  const port = await portLibre();
  const p = spawn(process.execPath, [ATELIER, "serve", "--port", String(port)], { env: { ...process.env, ATELIER_ROOT: root } });
  let err = ""; p.stderr.on("data", d => { err += d; });
  await new Promise((ok, ko) => { p.stdout.on("data", d => { if (/Prévisualisation/.test(d)) ok(); }); p.on("exit", c => ko(new Error("serveur arrêté : " + c + "\n" + err))); });
  return { url: `http://127.0.0.1:${port}`, stop: () => p.kill() };
}
const post = (s, corps) => fetch(s.url + "/api/reponse", { method: "POST", headers: { "content-type": "application/json" }, body: typeof corps === "string" ? corps : JSON.stringify(corps) });
const registre = root => fs.readFileSync(path.join(root, "spec/reponses.yml"), "utf8");

test("POST /api/reponse ajoute l'entrée au registre, avec son effet", async t => {
  const root = racineExemple(); const s = await serveur(root); t.after(s.stop);
  assert.equal((await fetch(s.url + "/")).status, 200);
  const r = await post(s, { id: "compta_balance#q1", saisie: { texte: "Date de clôture réelle" }, par: "Comptabilité" });
  assert.equal(r.status, 200);
  assert.match((await r.json()).entree.effet, /mesures alimentées \d+ → \d+/);
  const reg = YAML.parse(registre(root));
  assert.deepEqual([reg.length, reg[0].id, reg[0].reponse, reg[0].par, reg[0].origine, reg[0].modifs], [1, "compta_balance#q1", "Date de clôture réelle", "Comptabilité", "client", [{ op: "noter" }]]);
  assert.match(registre(root), /^# Registre/);
});

test("un second POST ajoute à la suite : le registre précédent reste un préfixe exact", async t => {
  const root = racineExemple(); const s = await serveur(root); t.after(s.stop);
  assert.equal((await post(s, { id: "compta_balance#q1", saisie: { texte: "Première" } })).status, 200); const un = registre(root);
  assert.equal((await post(s, { id: "compta_balance#q1", saisie: { texte: "Seconde" } })).status, 200); const deux = registre(root);
  assert.ok(deux.startsWith(un) && deux.length > un.length);
  assert.deepEqual(YAML.parse(deux).map(r => r.reponse), ["Première", "Seconde"]);
});

test("POST /api/reponse refuse d'écrire quand le registre est illisible", async t => {
  const root = racineExemple(); fs.appendFileSync(path.join(root, "spec/reponses.yml"), "- id: [\n"); const avant = registre(root);
  const s = await serveur(root); t.after(s.stop);
  const r = await post(s, { id: "compta_balance#q1", saisie: { texte: "x" } });
  assert.equal(r.status, 400); assert.match((await r.json()).erreurs[0], /registre spec\/reponses\.yml illisible/);
  assert.equal(registre(root), avant);
});

test("POST /api/reponse refuse une question inconnue ou un corps illisible, sans rien écrire", async t => {
  const root = racineExemple(); const s = await serveur(root); t.after(s.stop);
  const r1 = await post(s, { id: "compta_balance#q99", saisie: { texte: "x" } });
  assert.equal(r1.status, 400); assert.match((await r1.json()).erreurs[0], /introuvable/);
  assert.equal((await post(s, "pas du json")).status, 400);
  assert.equal(YAML.parse(registre(root)), null);
});

test("POST /api/reponse refuse un corps hors JSON ou trop gros, et le serveur reste en vie", async t => {
  const root = racineExemple(); const avant = registre(root); const s = await serveur(root); t.after(s.stop);
  const texte = await fetch(s.url + "/api/reponse", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ id: "compta_balance#q1", saisie: { texte: "x" } }) });
  assert.equal(texte.status, 415);
  assert.equal((await post(s, JSON.stringify({ id: "compta_balance#q1", saisie: { texte: "x".repeat(70000) } }))).status, 413);
  assert.equal((await fetch(s.url + "/")).status, 200);
  assert.equal(registre(root), avant);
});
