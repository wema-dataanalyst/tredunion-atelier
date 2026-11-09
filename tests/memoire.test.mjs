import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cheminMemoire, lireMemoire, ecrireMemoire } from "../tools/memoire.mjs";

test("cheminMemoire prend TREDUNION_MEMOIRE, sinon le dossier voisin", () => {
  assert.equal(cheminMemoire("/a/vibe", {}), path.resolve("/a/tredunion-memoire"));
  assert.equal(cheminMemoire("/a/vibe", { TREDUNION_MEMOIRE: "/m" }), "/m");
});

test("lireMemoire renvoie des listes vides si le dossier manque", () => {
  const m = lireMemoire("/nulle/part");
  assert.equal(m.existe, false);
  assert.deepEqual([m.logiciels, m.comptes, m.colonnes], [[], [], []]);
});

test("ecrireMemoire n'écrit que les fichiers demandés", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mem-"));
  fs.writeFileSync(path.join(dir, "logiciels.yml"), "# à garder\n[]\n");
  ecrireMemoire({ dir, logiciels: [], comptes: [{ id: "706", cod: "CA TPS", confirme_chez: ["x"], contredit_chez: [] }], colonnes: [] }, ["comptes"]);
  assert.deepEqual(lireMemoire(dir).comptes[0].confirme_chez, ["x"]);
  assert.equal(fs.readFileSync(path.join(dir, "logiciels.yml"), "utf8"), "# à garder\n[]\n");
});

test("lireMemoire nomme le fichier d'un YAML invalide ou dont la racine n'est pas une liste", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mem-"));
  fs.writeFileSync(path.join(dir, "comptes.yml"), "- id: [\n");
  assert.throws(() => lireMemoire(dir), /comptes\.yml/);
  fs.writeFileSync(path.join(dir, "comptes.yml"), "id: 706\n");
  assert.throws(() => lireMemoire(dir), /comptes\.yml.*liste/);
});
