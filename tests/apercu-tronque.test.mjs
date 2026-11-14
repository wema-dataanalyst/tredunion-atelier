import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";

function racineAvec(n) {
  const racine = racineExemple();
  fs.writeFileSync(path.join(racine, "data/bronze/kf/gros.csv"), "a;b\n" + Array.from({ length: n }, (_, i) => `${i};1`).join("\n") + "\n");
  fs.writeFileSync(path.join(racine, "spec/datasets/gros.yml"), "id: gros\nsociete: kf\nfile: data/bronze/kf/gros.csv\ncolumns:\n  - name: a\n    type: int\n  - name: b\n    type: int\n");
  return ouvrirEspace(racine);
}
const alertes = e => e.evaluate().findings.filter(f => f.fichier === "spec/datasets/gros.yml" && /^aperçu limité aux/.test(f.msg));

test("plus de 50 000 lignes : aperçu tronqué signalé", () => {
  const e = racineAvec(50001);
  assert.equal(alertes(e).length, 1);
  assert.equal(alertes(e)[0].niv, "alerte");
  assert.equal(e.profilDataset("gros").tronque, true);
  assert.equal(e.profilDataset("tms_missions").tronque, false);
});

test("50 000 lignes tout juste : rien à signaler", () => {
  const e = racineAvec(50000);
  assert.equal(alertes(e).length, 0);
  assert.equal(e.profilDataset("gros").tronque, false);
});