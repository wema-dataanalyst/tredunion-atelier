import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { racineExemple } from "./aide/racine.mjs";

test("ecrireBesoins écrit spec/besoins.yml", async () => {
  const racine = racineExemple();
  fs.mkdirSync(path.join(racine, "spec"), { recursive: true });
  const { ecrireBesoins } = await import("../server/agent/specs.mjs");
  ecrireBesoins(racine, { themes: [{ id: "ca", choisi: true }], libres: [] });
  const contenu = YAML.parse(fs.readFileSync(path.join(racine, "spec/besoins.yml"), "utf8"));
  assert.deepEqual(contenu.themes, [{ id: "ca", choisi: true }]);
});
