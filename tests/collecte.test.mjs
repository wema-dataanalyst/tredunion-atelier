import { test } from "node:test";
import assert from "node:assert/strict";
import { configSftp, argsSftp, scriptSftp, erreurSftp, validerSociete } from "../tools/collecte.mjs";

const env = { SFTP_HOST: "sftp.exemple.fr", SFTP_USER: "u", SFTP_PASSWORD: "p", SFTP_DIR: "/DOSSIER/" };

test("configSftp liste les variables manquantes", () => {
  assert.throws(() => configSftp({ SFTP_HOST: "h" }), /SFTP_USER, SFTP_PASSWORD, SFTP_DIR/);
});

test("configSftp met le port 22 par défaut et retire la barre finale", () => {
  const c = configSftp(env);
  assert.equal(c.port, "22");
  assert.equal(c.dir, "/DOSSIER");
});

test("argsSftp force le mot de passe sans mode batch", () => {
  const a = argsSftp(configSftp({ ...env, SFTP_PORT: "9222" }));
  assert.deepEqual(a.slice(0, 2), ["-P", "9222"]);
  assert.equal(a.at(-1), "u@sftp.exemple.fr");
  assert.ok(!a.includes("-b"));
});

test("scriptSftp télécharge le dossier dans le répertoire local", () => {
  assert.equal(scriptSftp(configSftp(env), "/tmp/dl"), 'lcd "/tmp/dl"\nget -r "/DOSSIER"\n');
});

test("erreurSftp détecte un statut non nul ou une erreur de transfert, sans le mot de passe", () => {
  assert.equal(erreurSftp({ status: 0, stderr: "Fetching /D/ to /tmp" }), null);
  assert.match(erreurSftp({ status: 1, stderr: "" }), /code 1/);
  for (const s of ["remote open(\"/D\"): No such file: not found", "Permission denied (password).", "Couldn't stat remote file", "Transfer FAILURE"])
    assert.ok(erreurSftp({ status: 0, stderr: `${s}\nmot de passe p` }));
  assert.ok(!erreurSftp({ status: 1, stderr: "Permission denied, mdp=secret" }, "secret").includes("secret"));
});

test("validerSociete exige un id propre déclaré dans le projet", () => {
  const soc = [{ id: "etc" }];
  assert.doesNotThrow(() => validerSociete("etc", soc));
  assert.throws(() => validerSociete("../x", soc), /invalide/);
  assert.throws(() => validerSociete("autre", soc), /spec\/projet\.yml/);
  assert.throws(() => validerSociete(null, soc), /--societe/);
});
