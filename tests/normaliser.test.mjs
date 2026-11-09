import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { idDataset, lireFeuille, normaliserSociete, planProfil } from "../tools/normaliser.mjs";
import { recetteTest, sageTest } from "./aide/sage.mjs";

test("idDataset combine domaine, fichier et feuille", () => {
  assert.equal(idDataset("TMS", "/x/Akanea donnees.xlsx", "Activités ventes"), "tms_akanea_donnees_activites_ventes");
  assert.equal(idDataset("Comptabilité", "/x/Balance.xlsx", ""), "comptabilite_balance");
  assert.equal(idDataset("", "/x/tms_missions.csv", ""), "tms_missions");
});

test("lireFeuille applique la recette reconnue, sinon le lecteur tableau", () => {
  assert.equal(lireFeuille(sageTest, [recetteTest]).lecteur, "test_balance");
  assert.deepEqual(lireFeuille(sageTest, [recetteTest]).meta, { periode_du: "2025-01-01", periode_au: "2025-12-31", tirage: "2026-01-15" });
  assert.equal(lireFeuille([["a", "b"], ["1", "2"]], [recetteTest]).lecteur, "tableau");
  assert.ok(lireFeuille([[1, 2]], [recetteTest]).erreur);
});

test("normaliserSociete copie les CSV et liste les formats non pris en charge", async () => {
  const brut = fs.mkdtempSync(path.join(os.tmpdir(), "brut-"));
  const bronze = `${brut}-bronze`;
  fs.mkdirSync(path.join(brut, "TMS"));
  fs.writeFileSync(path.join(brut, "TMS", "Missions.csv"), "a;b\n1;2\n");
  fs.writeFileSync(path.join(brut, "notice.pdf"), "x");
  const r = await normaliserSociete({ brut, bronze, logiciels: [] });
  assert.deepEqual(r.ecrits.map(e => e.id), ["tms_missions"]);
  assert.equal(fs.readFileSync(path.join(bronze, "tms_missions.csv"), "utf8"), "a;b\n1;2\n");
  assert.equal(JSON.parse(fs.readFileSync(path.join(bronze, "tms_missions.meta.json"), "utf8")).lignes, 1);
  assert.deepEqual(r.nonLus, [{ fichier: "notice.pdf", raison: "format .pdf non pris en charge" }]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(bronze, "_non_lus.json"), "utf8")), r.nonLus);
});

test("planProfil : saute le fichier déjà profilé, préfixe l'id pris par un autre fichier", () => {
  const ex = [{ id: "export", file: "data/bronze/a/export.csv" }];
  assert.equal(planProfil(ex, "data/bronze/a/export.csv", "a"), null);
  assert.deepEqual(planProfil(ex, "data/bronze/b/export.csv", "b"), { id: "b_export" });
  assert.deepEqual(planProfil(ex, "data/bronze/b/autre.csv", "b"), {});
});
