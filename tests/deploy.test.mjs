import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const lire = f => fs.readFileSync(new URL("../deploy/" + f, import.meta.url), "utf8");

test("le service systemd pose les variables de production", () => {
  const s = lire("tredunion.service");
  for (const v of ["ADHERENTS_ROOT=", "COMPTES_FILE=", "PORT=4400", "COOKIE_SECURE=1", "TRUST_PROXY=1", "EnvironmentFile=-/srv/tredunion/llm.env", "ExecStart=", "server/app.mjs", "NoNewPrivileges=true"]) assert.ok(s.includes(v), v);
});

test("le Caddyfile relaie vers le port 4400 en local", () => {
  assert.match(lire("Caddyfile"), /reverse_proxy 127\.0\.0\.1:4400/);
});

test("sauvegarde.sh : syntaxe valide, n'embarque que adherents et comptes.json, garde 14 jours", () => {
  const f = new URL("../deploy/sauvegarde.sh", import.meta.url).pathname, t = lire("sauvegarde.sh");
  assert.equal(spawnSync("bash", ["-n", f]).status, 0);
  assert.match(t, /adherents/); assert.match(t, /comptes\.json/); assert.match(t, /-mtime \+14/);
  assert.doesNotMatch(t, /rm -rf \//);
});

test("LISEZMOI documente la maquette automatique", () => {
  const t = lire("LISEZMOI.md");
  for (const s of ["Maquette automatique", "adherents/<id>/.env", "tredunion", "maquette.jsonl", "spec-avant", "400 000", "409", "restaurée automatiquement"]) assert.ok(t.includes(s), s);
});

test("LISEZMOI et AGENTS documentent l'apprentissage en un clic, le sel et la pseudonymisation", () => {
  const t = lire("LISEZMOI.md"), a = fs.readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");
  for (const s of ["Mémoire commune", "POST /api/apprendre", "TREDUNION_SEL", ".sel", "--pseudonymiser", "apprentissage.jsonl", "409"]) assert.ok(t.includes(s), s);
  for (const s of ["/api/apprendre", "pseudonymis", "--pseudonymiser", "question", "mode local"]) assert.ok(a.includes(s), s);
});
