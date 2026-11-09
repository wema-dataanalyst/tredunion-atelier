import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// contexte sans eval ni new Function, comme sous la CSP de la plateforme
const ctx = vm.createContext({ console, Intl, Date, Math, JSON }, { codeGeneration: { strings: false, wasm: false } });
["core/engine.js", "core/mesures.js", "core/model.js"].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));
const d = { columns: ["a", "b", "c"].map(name => ({ name })) };
const calc = (expr, o) => vm.runInContext(`(function(e,d,o){ const f=compileVal(e,d); return f?f(o):"refus"; })`, ctx)(expr, d, o);

test("compileVal calcule sans eval (CSP)", () => {
  assert.equal(calc("a - b", { a: 10, b: 4 }), 6);
  assert.equal(calc("a / 1.2", { a: 120 }), 100);
  assert.equal(calc("(a + b) * c", { a: 1, b: 2, c: 3 }), 9);
  assert.equal(calc("-a + 2 * b", { a: 1, b: 3 }), 5);
  assert.equal(calc("a - b", { a: 10 }), 10);
  assert.equal(calc("a / b", { a: 1, b: 0 }), null);
});
test("compileVal refuse colonne inconnue et syntaxe invalide", () => {
  assert.equal(calc("a + zz", {}), "refus");
  assert.equal(calc("a +", {}), "refus");
  assert.equal(calc("(a", {}), "refus");
  assert.equal(calc("a b", {}), "refus");
});
