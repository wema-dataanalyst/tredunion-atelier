import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { monter, get } from "./aide/multi.mjs";

const ui = fs.readFileSync("viewer/ui.js", "utf8"), css = fs.readFileSync("viewer/style.css", "utf8");

test("viewer : panneau « Données concernées » à droite de la carte", () => {
  for (const m of ["/api/apercu-question", "Données concernées", "qapercu", "qcorps", "apercus", "aucun", "Aperçu indisponible", "Chargement…", "c.concerne", "c.pii"]) assert.ok(ui.includes(m), m);
  assert.match(css, /\.qcorps\.qa\{display:grid/);
  assert.match(css, /\.qapercu\{position:sticky/);
  assert.match(css, /@media \(max-width:1100px\)/);
  assert.ok(css.includes(".qcomp"));
});

test("viewer : texte du serveur toujours échappé dans l'aperçu", () => {
  const bloc = ui.slice(ui.indexOf("function tableApq"), ui.indexOf("async function chargerApq"));
  for (const v of ["a.dataset", "a.societe", "c.name", "l[i]", "a.raison||"]) assert.ok(bloc.includes(`esc(${v}`), v);
});

test("viewer : formulaire, carte d'interprétation et formQ conservés", () => {
  assert.match(ui, /\$\{edit\?formQ\(q\)\+blocComp\(q\):""\}/);
  assert.ok(ui.includes("formQ(q)") && ui.includes("blocComp") && ui.includes("data-qc"));
});

test("serveur : la page embarque l'aperçu et la route répond", async t => {
  const m = await monter(t); const { cookie } = await m.connecter("alpha");
  const page = await (await get(m, "/", cookie)).text();
  assert.ok(page.includes("/api/apercu-question") && page.includes("qapercu"));
});

test("viewer : aperçu paresseux, 3 requêtes au plus, cache et repli", () => {
  assert.ok(ui.includes("IntersectionObserver") && ui.includes('"IntersectionObserver" in window'));
  assert.match(ui, /apqActifs<3/);
  assert.match(ui, /if\(apq\[id\]&&!force\) return/);
  assert.ok(ui.includes('addEventListener("toggle"'));
  assert.ok(!ui.includes('forEach(d=>chargerApq(d.dataset.apqId));\n  $("#qv").querySelectorAll(".qform")'), "plus de chargement systématique");
});

test("viewer : file d'aperçus simulée (DOM minimal) : 3 simultanées, cache", async () => {
  const src = ui.slice(ui.indexOf("const apqFile"), ui.indexOf("/* Chargement paresseux"));
  let enCours = 0, max = 0, appels = [];
  const fetch = () => { enCours++; max = Math.max(max, enCours); appels.push(1); return new Promise(r => setTimeout(() => { enCours--; r({ ok: true, json: async () => ({}) }); }, 5)); };
  const f = new Function("apq", "urlApq", "majApq", "fetch", src + "; return chargerApq;");
  const apq = {}, charger = f(apq, id => id, () => {}, fetch);
  for (let i = 0; i < 10; i++) charger("q" + i);
  charger("q0");
  await new Promise(r => setTimeout(r, 100));
  assert.equal(max, 3); assert.equal(appels.length, 10);
  assert.ok(Object.values(apq).every(a => a.etat === "ok"));
});
