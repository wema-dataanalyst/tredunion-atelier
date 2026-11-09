import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { snake, cellule, entetesUniques, ecrireCsv } from "../tools/lecteurs/commun.mjs";

test("snake reproduit les noms de colonnes de la spec", () => {
  assert.equal(snake("Montant HT €"), "montant_ht");
  assert.equal(snake("N° Ordre"), "n_ordre");
  assert.equal(snake("Kms parcourus \n Péage"), "kms_parcourus_peage");
  assert.equal(snake("1er relevé"), "c_1er_releve");
});

test("cellule formate dates, nombres, booléens et textes", () => {
  assert.equal(cellule(new Date(Date.UTC(2025, 0, 2))), "02/01/2025");
  assert.equal(cellule(new Date(Date.UTC(2025, 0, 2, 8, 30))), "2025-01-02T08:30:00");
  assert.equal(cellule(1234.5), "1234.5");
  assert.equal(cellule(0.1 + 0.2), "0.3");
  assert.equal(cellule(42), "42");
  assert.equal(cellule(true), "true");
  assert.equal(cellule("  deux\nlignes "), "deux lignes");
  assert.equal(cellule(null), "");
});

test("entetesUniques numérote les doublons et nomme les vides", () => {
  assert.deepEqual(entetesUniques(["N°Carte import", "Chauffeur", "N°Carte import", ""]), ["n_carte_import", "chauffeur", "n_carte_import_2", "col_4"]);
});

test("ecrireCsv sépare par point-virgule et protège les champs", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "csv-")), "t.csv");
  ecrireCsv(f, ["a", "b"], [["1", "x;y"], ["2", 'dit "oui"']]);
  assert.equal(fs.readFileSync(f, "utf8"), 'a;b\n1;"x;y"\n2;"dit ""oui"""\n');
});
