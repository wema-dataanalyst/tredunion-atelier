import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { monter, get, post } from "./aide/multi.mjs";

test("une réponse déclenche le build de son adhérent seulement, et un statut est écrit", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  assert.equal((await post(m, "/api/reponse", cookie, { id: "compta_balance#q1", saisie: { texte: "Date de clôture" } })).status, 200);
  await m.srv.attendreFile("alpha");
  const st = JSON.parse(fs.readFileSync(path.join(m.adherents, "alpha/.atelier/statut.json"), "utf8"));
  assert.equal(st.ok, true); assert.ok(fs.readdirSync(path.join(m.adherents, "alpha/generated")).length > 0);
  assert.equal(fs.existsSync(path.join(m.adherents, "beta/generated")), false);
});

test("plusieurs réponses rapprochées : le build reste cohérent et le dernier état est construit", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  await Promise.all(["Un", "Deux", "Trois"].map(x => post(m, "/api/reponse", cookie, { id: "compta_balance#q1", saisie: { texte: x } })));
  await m.srv.attendreFile("alpha");
  const reg = YAML.parse(fs.readFileSync(path.join(m.adherents, "alpha/spec/reponses.yml"), "utf8")); assert.equal(reg.length, 3);
  const st = JSON.parse(fs.readFileSync(path.join(m.adherents, "alpha/.atelier/statut.json"), "utf8"));
  assert.equal(st.ok, true); assert.ok(st.dernierBuild); assert.ok(fs.readdirSync(path.join(m.adherents, "alpha/generated")).length > 0);
  });

test("construireAuto: false ne construit rien", async t => {
  const m = await monter(t, { construireAuto: false }); const { cookie } = await m.connecter("alpha");
  await post(m, "/api/reponse", cookie, { id: "compta_balance#q1", saisie: { texte: "x" } }); await m.srv.attendreFile("alpha");
  assert.equal(fs.existsSync(path.join(m.adherents, "alpha/generated")), false);
});

test("/api/adherents : admin seulement, un objet par adhérent", async t => {
  const m = await monter(t);
  assert.equal((await get(m, "/api/adherents")).status, 401);
  const a = await m.connecter("alpha"); assert.equal((await get(m, "/api/adherents", a.cookie)).status, 403);
  const adm = await m.connecter("admin-michel"); const r = await get(m, "/api/adherents", adm.cookie); assert.equal(r.status, 200);
  const l = await r.json(); assert.deepEqual(l.map(x => x.id), ["alpha", "beta"]);
  for (const x of l) assert.deepEqual(Object.keys(x).sort(), ["buildOk", "dernierBuild", "erreurs", "id", "libres", "mesures", "nom", "nonLus", "questions"]);
});

test("livrables : liste et téléchargement pour l'admin, refus pour l'adhérent, rien hors liste", async t => {
  const m = await monter(t); const a = await m.connecter("alpha"), adm = await m.connecter("admin-michel");
  await post(m, "/api/reponse", a.cookie, { id: "compta_balance#q1", saisie: { texte: "x" } }); await m.srv.attendreFile("alpha");
  assert.equal((await get(m, "/api/livrables?adherent=alpha", a.cookie)).status, 403);
  const liste = await (await get(m, "/api/livrables?adherent=alpha", adm.cookie)).json(); assert.ok(liste.length > 0);
  const f = await get(m, `/api/livrable?adherent=alpha&f=${encodeURIComponent(liste[0].path)}`, adm.cookie);
  assert.equal(f.status, 200); assert.match(f.headers.get("content-disposition"), /^attachment; filename="/); assert.match(f.headers.get("content-type"), /text\/plain/);
  assert.equal((await get(m, `/api/livrable?adherent=alpha&f=${encodeURIComponent(liste[0].path)}`, a.cookie)).status, 403);
  for (const p of ["../../comptes.json", "..%2F..%2Fcomptes.json", "inconnu"]) assert.equal((await get(m, `/api/livrable?adherent=alpha&f=${p}`, adm.cookie)).status, 404);
  assert.equal((await get(m, "/api/livrable?adherent=gamma&f=x", adm.cookie)).status, 404);
});

test("/api/adherents : une réponse invalide le cache, un adhérent cassé n'empêche pas la liste", async t => {
  const m = await monter(t, { construireAuto: false }); const a = await m.connecter("alpha"), adm = await m.connecter("admin-michel");
  fs.writeFileSync(path.join(m.adherents, "beta/spec/relations.yml"), "- id: [\n  : :");
  const avant = (await (await get(m, "/api/adherents", adm.cookie)).json())[0].questions.traitees;
  await post(m, "/api/reponse", a.cookie, { id: "compta_balance#q1", saisie: { texte: "x" } });
  const apres = (await (await get(m, "/api/adherents", adm.cookie)).json())[0].questions.traitees;
  assert.equal(apres, avant + 1);
  const l = await (await get(m, "/api/adherents", adm.cookie)).json();
  assert.deepEqual(l.map(x => x.id), ["alpha", "beta"]); assert.ok(l[1].erreur || l[1].erreurs > 0);
});

test("fermer juste après une réponse : pas de crash, la fermeture aboutit", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  await post(m, "/api/reponse", cookie, { id: "compta_balance#q1", saisie: { texte: "x" } });
  await new Promise(ok => m.srv.close(ok));
});

test("/api/reponse : la 31e réponse d'une session reçoit 429", async t => {
  const m = await monter(t, { construireAuto: false }); const { cookie } = await m.connecter("alpha");
  for (let i = 0; i < 30; i++) assert.equal((await post(m, "/api/reponse", cookie, { id: "compta_balance#q1", saisie: { texte: String(i) } })).status, 200);
  assert.equal((await post(m, "/api/reponse", cookie, { id: "compta_balance#q1", saisie: { texte: "31" } })).status, 429);
});
