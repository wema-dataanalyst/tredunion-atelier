import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";

const ID = "compta_balance#q1";
const interp = ops => ({ interpretation: { texte: "ok", comprehension: "ok", operations: ops } });

test("réponse : une opération qui porte du Jinja ({ ou }) est refusée", () => {
  const e = ouvrirEspace(racineExemple()), v = ops => e.previsualiser({ id: ID, saisie: interp(ops) });
  assert.ok(v([{ op: "exclure", cible: "compta_balance", sql: `compte <> '{{ run_query("select 1") }}'`, text: "x" }]).erreurs);
  assert.ok(v([{ op: "classer", cible: "flux:f1.rules[0]", valeur: { cod: `{{ env_var("HOME") }}`, lib: "x" } }]).erreurs);
  assert.ok(v([{ op: "classer", cible: "flux:f1.rules[0]", valeur: { cod: "CA TPS", lib: `{% set x = run_query("select 7") %}` } }]).erreurs);
  assert.ok(v([{ op: "codes", cible: "compta_balance.compte", valeur: { "{{ x }}": "Libellé" } }]).erreurs);
  assert.ok(!v([{ op: "exclure", cible: "compta_balance", sql: "compte <> 'a'", text: "x" }]).erreurs);
});

test("build : une spec éditée à la main avec du Jinja hors source()/ref() est refusée", () => {
  const root = racineExemple(), f = path.join(root, "spec/datasets/compta_balance.yml");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("rules: []", `rules:\n  - text: x\n    sql: "compte <> '{{ run_query(\\"select 1\\") }}'"`));
  const r = ouvrirEspace(root).construire();
  assert.equal(r.ok, false);
  assert.ok(r.erreurs.some(x => /Jinja/.test(x.msg)), JSON.stringify(r.erreurs));
  assert.equal(fs.existsSync(path.join(root, "generated")), false);
});

test("build : la spec d'exemple, avec ses source()/ref(), passe toujours", () => {
  assert.equal(ouvrirEspace(racineExemple()).construire().ok, true);
});
