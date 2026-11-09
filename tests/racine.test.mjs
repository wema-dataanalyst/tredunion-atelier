import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { racineExemple, ATELIER } from "./aide/racine.mjs";

test("ATELIER_ROOT : la CLI lit la spec et les données d'un autre dossier que le code", () => {
  const root = racineExemple();
  const r = spawnSync(process.execPath, [ATELIER, "check", "--json"], { env: { ...process.env, ATELIER_ROOT: root }, encoding: "utf8" });
  assert.equal(JSON.parse(r.stdout).summary.datasets, 8);
});
