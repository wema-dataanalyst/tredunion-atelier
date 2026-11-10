import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collecter, dossierSociete, configSftp } from "../tools/collecte.mjs";

const MDP = "mdp-secret-9x";

// Faux `sftp` : lit le script sur stdin, copie <racine distante><dossier demandé> dans le `lcd`.
function monde(t, distants) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "collecte-multi-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const racine = path.join(tmp, "distant");
  for (const f of distants) { fs.mkdirSync(path.join(racine, path.dirname(f)), { recursive: true }); fs.writeFileSync(path.join(racine, f), "x"); }
  const faux = path.join(tmp, "sftp");
  fs.writeFileSync(faux, `#!/bin/sh
while IFS= read -r l; do
  case "$l" in
    lcd*) lcd=$(printf '%s' "$l" | sed 's/^lcd "\\(.*\\)"$/\\1/');;
    get*) d=$(printf '%s' "$l" | sed 's/^get -r "\\(.*\\)"$/\\1/')
      if [ -d "${racine}$d" ]; then cp -r "${racine}$d" "$lcd/"; else echo "File \\"$d\\" not found." >&2; fi;;
  esac
done
`, { mode: 0o755 });
  return { tmp, faux, cible: path.join(tmp, "raw", "s") };
}
const cfg = dir => configSftp({ SFTP_HOST: "h", SFTP_USER: "u", SFTP_PASSWORD: MDP, SFTP_DIR: dir });

test("une société : le dossier distant est téléchargé tel quel", t => {
  const m = monde(t, ["DOSSIER/a.csv"]);
  const dir = dossierSociete("/DOSSIER", [{ id: "s" }], "s");
  assert.equal(dir, "/DOSSIER");
  assert.equal(collecter(cfg(dir), m.cible, { sftp: m.faux }), 1);
  assert.ok(fs.existsSync(path.join(m.cible, "a.csv")));
});

test("une collecte remplace le dossier brut : un ancien téléchargement n'y reste pas", t => {
  const m = monde(t, ["DOSSIER/a.csv"]);
  fs.mkdirSync(path.join(m.cible, "ANCIEN_SFTP"), { recursive: true }); fs.writeFileSync(path.join(m.cible, "ANCIEN_SFTP", "b.csv"), "x");
  collecter(cfg("/DOSSIER"), m.cible, { sftp: m.faux });
  assert.deepEqual(fs.readdirSync(m.cible), ["a.csv"]);
});

test("plusieurs sociétés : le sous-dossier de la société est téléchargé", t => {
  const m = monde(t, ["DOSSIER/s/a.csv", "DOSSIER/t/b.csv"]);
  const dir = dossierSociete("/DOSSIER", [{ id: "s" }, { id: "t" }], "s");
  assert.equal(dir, "/DOSSIER/s");
  assert.equal(collecter(cfg(dir), m.cible, { sftp: m.faux, sousDossier: "s" }), 1);
  assert.deepEqual(fs.readdirSync(m.cible), ["a.csv"]);
});

test("plusieurs sociétés, sous-dossier absent : erreur claire sans secret", t => {
  const m = monde(t, ["DOSSIER/t/b.csv"]);
  const dir = dossierSociete("/DOSSIER/", [{ id: "s" }, { id: "t" }], "s");
  assert.throws(() => collecter(cfg(dir), m.cible, { sftp: m.faux, sousDossier: "s" }),
    e => /sous-dossier s introuvable dans \/DOSSIER/.test(e.message) && !e.message.includes(MDP));
  assert.ok(!fs.existsSync(m.cible));
});

test("id de société hostile refusé avant tout téléchargement", () => {
  const soc = [{ id: "s" }, { id: "../x" }];
  for (const id of ["../x", "a/b", "", "s t"]) assert.throws(() => dossierSociete("/DOSSIER", soc, id), /invalide/);
});
