import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { monter, get } from "./aide/multi.mjs";
import { racineExemple, ATELIER } from "./aide/racine.mjs";

const NOMS = ["Fournier", "Muller", "Schmitt", "Weber", "Klein", "Meyer", "Lang", "Becker"];
const sansPii = s => NOMS.forEach(n => assert.ok(!s.includes(n), "nom en clair"));
const q = id => `/api/apercu-question?id=${encodeURIComponent(id)}`;

test("plateforme : sans session 401 ; adhérent : aperçu masqué, no-store ; question inconnue 404", async t => {
  const m = await monter(t);
  assert.equal((await get(m, q("tms_conducteurs#q1"))).status, 401);
  const { cookie } = await m.connecter("alpha");
  const r = await get(m, q("tms_conducteurs#q1"), cookie); assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "no-store");
  const txt = await r.text(), j = JSON.parse(txt);
  assert.equal(j.dataset, "tms_conducteurs"); assert.equal(j.lignes.length, 10); assert.ok(j.colonnes.length <= 8); sansPii(txt);
  for (const id of ["tms_conducteurs#q99", "", "x".repeat(300)]) assert.equal((await get(m, q(id), cookie)).status, 404);
  assert.equal((await get(m, "/api/apercu-question", cookie)).status, 404);
});

test("plateforme : un adhérent ne lit que son espace, l'admin choisit avec ?adherent=", async t => {
  const m = await monter(t);
  fs.rmSync(path.join(m.adherents, "beta/spec/datasets/tms_conducteurs.yml")); // question présente chez alpha seulement
  const a = await m.connecter("alpha"), b = await m.connecter("beta"), admin = await m.connecter("admin-michel");
  assert.equal((await get(m, q("tms_conducteurs#q1"), a.cookie)).status, 200);
  assert.equal((await get(m, q("tms_conducteurs#q1") + "&adherent=beta", a.cookie)).status, 200); // ?adherent= ignoré pour un adhérent
  assert.equal((await get(m, q("tms_conducteurs#q1") + "&adherent=beta", b.cookie)).status, 404);
  assert.equal((await get(m, q("tms_conducteurs#q1") + "&adherent=beta", admin.cookie)).status, 404);
  const r = await get(m, q("tms_conducteurs#q1") + "&adherent=alpha", admin.cookie); assert.equal(r.status, 200); sansPii(await r.text());
});

test("plateforme : fichier non lu → aucun ; contrôle → deux datasets", async t => {
  const m = await monter(t), alpha = path.join(m.adherents, "alpha");
  fs.writeFileSync(path.join(alpha, "data/bronze/kf/_non_lus.json"), JSON.stringify([{ fichier: "vieux.xls", raison: "format illisible" }]));
  fs.writeFileSync(path.join(alpha, "spec/controles.yml"), "- id: c1\n  type: ecart_somme\n  libelle: CA\n  annee: 2025\n  tolerance: 0.05\n  reponse: x\n  a: {ds: tms_missions, valeur: ca_ht, date: date_charg}\n  b: {ds: compta_balance, valeur: montant}\n");
  const { cookie } = await m.connecter("alpha");
  assert.equal((await (await get(m, q("non_lu:vieux.xls"), cookie)).json()).aucun, true);
  assert.equal((await (await get(m, q("controle:c1"), cookie)).json()).apercus.length, 2);
});

test("mode local : même route, masquée, 404 sur question inconnue", async t => {
  const root = racineExemple(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const port = await new Promise(ok => { const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); }); });
  const p = spawn(process.execPath, [ATELIER, "serve", "--port", String(port)], { env: { ...process.env, ATELIER_ROOT: root } }); t.after(() => p.kill());
  await new Promise((ok, ko) => { p.stdout.on("data", d => /Prévisualisation/.test(d) && ok()); p.on("exit", c => ko(new Error("serveur arrêté : " + c))); });
  const r = await fetch(`http://127.0.0.1:${port}` + q("tms_conducteurs#q1")); assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "no-store");
  const txt = await r.text(); assert.equal(JSON.parse(txt).dataset, "tms_conducteurs"); sansPii(txt);
  assert.equal((await fetch(`http://127.0.0.1:${port}` + q("zzz#q1"))).status, 404);
});

test("plateforme : 429 au-delà de 60 aperçus par minute et par compte", async t => {
  const m = await monter(t), a = await m.connecter("alpha"), b = await m.connecter("beta");
  for (let i = 0; i < 60; i++) assert.equal((await get(m, q("tms_conducteurs#q1"), a.cookie)).status, 200);
  assert.equal((await get(m, q("tms_conducteurs#q1"), a.cookie)).status, 429);
  assert.equal((await get(m, q("tms_conducteurs#q1"), b.cookie)).status, 200);
});

test("plateforme : cache de 5 s par question, invalidé quand la spec change", async t => {
  const m = await monter(t), alpha = path.join(m.adherents, "alpha"), { cookie } = await m.connecter("alpha");
  const csv = path.join(alpha, "data/bronze/kf/tms_vehicules.csv"), marque = async () => { const j = await (await get(m, q("tms_vehicules#q1"), cookie)).json(); return j.lignes[0][j.colonnes.findIndex(c => c.name === "marque")]; };
  const avant = await marque();
  fs.writeFileSync(csv, fs.readFileSync(csv, "utf8").replace(";DAF;", ";ZZZZ;"));
  assert.equal(await marque(), avant); // servi par le cache
  const f = path.join(alpha, "spec/projet.yml"); fs.writeFileSync(f, fs.readFileSync(f, "utf8") + "\n# touche\n");
  await new Promise(ok => setTimeout(ok, 600));
  assert.equal(await marque(), "ZZZZ");
});
