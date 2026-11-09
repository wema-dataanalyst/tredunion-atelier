import { test } from "node:test";
import assert from "node:assert/strict";
import { correspond, lirePositions, lireMeta } from "../tools/lecteurs/positions.mjs";
import { recetteTest, sageTest } from "./aide/sage.mjs";

test("correspond exige tous les textes de la signature", () => {
  assert.equal(correspond(sageTest, recetteTest), true);
  assert.equal(correspond(sageTest, { ...recetteTest, signature: ["Sage 100", "Balance des tiers"] }), false);
});

test("lirePositions garde les lignes de données et retire en-têtes, totaux et répétitions de page", () => {
  const t = lirePositions(sageTest, recetteTest);
  assert.deepEqual(t.entetes, ["numero_compte", "intitule", "debit", "credit"]);
  assert.deepEqual(t.lignes, [["70610000", "Transport", "100", "2500.5"], ["70620000", "Logistique", "", "800"]]);
  assert.equal(t.horsRecette, 0);
});

test("lirePositions compte les valeurs hors des colonnes de la recette", () => {
  const t = lirePositions([...sageTest, ["70630000", null, "Affrètement", null, null, null, 10, null, 99]], recetteTest);
  assert.equal(t.horsRecette, 1);
});

test("lireMeta lit la période et la date de tirage", () => {
  assert.deepEqual(lireMeta(sageTest), { periode_du: "2025-01-01", periode_au: "2025-12-31", tirage: "2026-01-15" });
  assert.deepEqual(lireMeta([["x"]]), {});
});

test("lirePositions refuse un requis absent des colonnes", () => {
  assert.throws(() => lirePositions(sageTest, { ...recetteTest, requis: ["inconnue"] }), /inconnue/);
});
