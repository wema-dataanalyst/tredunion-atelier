import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// La collecte d'un adhérent n'utilise que son .env, jamais celui de l'application.
test("avec ATELIER_ROOT, seuls les identifiants SFTP de l'adhérent comptent", () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "adh-env-"));
  try {
    fs.mkdirSync(path.join(racine, "spec"), { recursive: true });
    fs.writeFileSync(path.join(racine, "spec/projet.yml"), "adherent: T\nsocietes:\n  - id: soc\n    name: Soc\ncases: []\n");
    fs.writeFileSync(path.join(racine, ".env"), "SFTP_HOST=h.invalide\n");
    const r = spawnSync(process.execPath, ["tools/atelier.mjs", "collecte", "--societe", "soc"], { env: { PATH: process.env.PATH, ATELIER_ROOT: racine }, encoding: "utf8" });
    const msg = r.stderr + r.stdout;
    assert.match(msg, /Variables manquantes/);
    assert.ok(!/SFTP_HOST/.test(msg.split("manquantes")[1] || ""), "SFTP_HOST vient de l'adhérent");
    assert.match(msg, /SFTP_USER/);
  } finally { fs.rmSync(racine, { recursive: true, force: true }); }
});
