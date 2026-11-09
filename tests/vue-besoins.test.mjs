import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE = ["core/engine.js", "core/mesures.js", "core/model.js", "core/check.js", "core/controles.js", "core/hypotheses.js", "core/questions.js", "core/calque.js"];
const SHEETS_MIN = [
  { id: "accueil", title: "Accueil", objs: [{ t: "kb", items: [{ m: "CA Réel" }, { m: "Budget" }] }] },
];

test("pageBesoins génère des cases à cocher par thème", () => {
  const ctx = vm.createContext({ console, Intl, Date, Math, JSON });
  vm.runInContext(`const SHEETS = ${JSON.stringify(SHEETS_MIN)};`, ctx);
  CORE.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));
  // Lire viewer/ui.js et extraire pageBesoins
  const uiSrc = fs.readFileSync(path.join(ROOT, "viewer/ui.js"), "utf8");
  const match = uiSrc.match(/function pageBesoins\(\)[^]*?(?=\nfunction )/);
  assert.ok(match, "pageBesoins non trouvée");
  // Ajouter esc() si absent
  if (!vm.runInContext("typeof esc !== 'undefined'", ctx)) vm.runInContext("function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;'); }", ctx);
  vm.runInContext(match[0], ctx);
  vm.runInContext(`S.st = { besoins: { themes: [], libres: [] }, categories: [], catalogue: "", flux: [], perimetre: { groupes: [] } }; S.ver++;`, ctx);
  const html = vm.runInContext("pageBesoins()", ctx);
  assert.ok(html.includes("accueil"));
  assert.ok(html.includes('type="checkbox"'));
});

test("jauge affiche mesures choisies et alimentées", () => {
  const ctx = vm.createContext({ console, Intl, Date, Math, JSON });
  vm.runInContext(`const SHEETS = ${JSON.stringify(SHEETS_MIN)};`, ctx);
  CORE.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));
  vm.runInContext(`S.st = { besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] }, categories: [], catalogue: "CA Réel\\n    1\\n", flux: [], perimetre: { groupes: [] } };`, ctx);
  vm.runInContext("S.ver++;", ctx);
  const counts = vm.runInContext("measureCounts()", ctx);
  // Avec un thème coché, hors ne doit pas inclure CA Réel
  const hors = vm.runInContext("[...horsPerimetre()]", ctx);
  assert.ok(!hors.includes("CA Réel"));
});
