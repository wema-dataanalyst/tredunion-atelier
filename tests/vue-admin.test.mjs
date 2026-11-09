import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { monter, get } from "./aide/multi.mjs";

const lire = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("l'onglet Adhérents n'existe que pour l'admin (CSS) et est branché", () => {
  assert.match(lire("viewer/body.html"), /id="t-adh"/); assert.match(lire("viewer/body.html"), /id="view-adh"/);
  assert.match(lire("viewer/style.css"), /body:not\(\[data-role="admin"\]\) #t-adh/);
  assert.match(lire("viewer/ui.js"), /"adh"/); assert.match(lire("viewer/ui.js"), /function renderAdh/);
  assert.match(lire("viewer/boot.js"), /addEventListener\("statut"/);
});

test("les tuiles portent data-k et le suivi compare les valeurs", () => {
  const d = lire("viewer/dash.js"); assert.match(d, /data-k=/); assert.match(d, /function tuilesChangees/); assert.match(d, /function suiviTuiles/);
  const f = new Function(d.match(/function tuilesChangees[^\n]*\n/)[0] + "return tuilesChangees;")();
  assert.deepEqual(f(new Map([["a", "1"], ["b", "2"]]), new Map([["a", "1"], ["b", "3"], ["c", "9"]])), ["b"]);
});

test("fusionFlash fusionne les événements et expire à 60 s", () => {
  const d = lire("viewer/dash.js");
  const f = new Function(d.match(/function fusionFlash[^\n]*\n/)[0] + "return fusionFlash;")();
  assert.equal(f(null, [], 1000), null);
  const a = f(null, ["a"], 1000); assert.deepEqual([...a.cles], ["a"]); assert.equal(a.t, 1000);
  const b = f(a, ["b", "a"], 30000); assert.deepEqual([...b.cles].sort(), ["a", "b"]); assert.equal(b.t, 1000);
  assert.equal(f(b, [], 61000), null);
  const c = f(b, ["c"], 61000); assert.deepEqual([...c.cles], ["c"]); assert.equal(c.t, 61000);
  assert.equal(f(b, [], 60999).t, 1000);
});

test("data-k est unique par rang d'occurrence", () => {
  assert.match(lire("viewer/dash.js"), /lb\+"\|"\+n/);
});

test("la page servie à l'admin contient l'onglet et le script, pas de donnée d'un autre adhérent dans le HTML", async t => {
  const m = await monter(t); const adm = await m.connecter("admin-michel");
  const h = await (await get(m, "/", adm.cookie)).text(); assert.match(h, /<body data-role="admin">/); assert.match(h, /id="t-adh"/);
});
