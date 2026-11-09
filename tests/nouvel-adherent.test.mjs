import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validerNouvelAdherent, creerAdherent, ligneEnv } from "../server/nouvel-adherent.mjs";
import { adherentsConnus } from "../server/adherents.mjs";
import { lireComptes, verifier } from "../server/auth.mjs";

const ATELIER = path.resolve("tools/atelier.mjs");
const tmp = t => { const b = fs.mkdtempSync(path.join(os.tmpdir(), "nouvel-")); t.after(() => fs.rmSync(b, { recursive: true, force: true })); return { racine: path.join(b, "adherents"), comptes: path.join(b, "comptes.json"), b }; };
const SFTP = { host: "sftp.exemple.fr", user: "transco", password: "p$ss\"w'rd#1\\n", dir: "/export/tms" };
const base = (o = {}) => ({ nom: "Transports Test", id: "test", societes: [{ id: "tt", name: "Transports Test SA", source: "TMS" }], ...o });

test("valide : valeur normalisée, port 22 par défaut, sftp facultatif", () => {
  const r = validerNouvelAdherent(base({ sftp: SFTP, maquette: true }));
  assert.equal(r.ok, true); assert.equal(r.valeur.sftp.port, 22); assert.equal(r.valeur.maquette, true);
  assert.equal(validerNouvelAdherent(base()).valeur.sftp, null);
});

test("valeurs hostiles refusées, avec le nom du champ", () => {
  const champs = e => (validerNouvelAdherent(e).erreurs || []).map(x => x.champ);
  for (const id of ["../x", "a b", "x\ny", ".", "..", "admin", "admin-michel", "exemple", "A", "", "a".repeat(41)]) assert.ok(champs(base({ id })).includes("id"), id);
  assert.ok(champs(base({ societes: [] })).includes("societes"));
  assert.ok(champs(base({ societes: [{ id: "a", name: "A" }, { id: "a", name: "B" }] })).includes("societes[1].id"));
  assert.ok(champs(base({ societes: [{ id: "../x", name: "A" }] })).includes("societes[0].id"));
  for (const host of ["-oProxyCommand=x", "a b", "x\ny", "h;rm", ""]) assert.ok(champs(base({ sftp: { ...SFTP, host } })).includes("sftp.host"), host);
  for (const port of [0, 65536, "abc", 1.5, true, [22], {}]) assert.ok(champs(base({ sftp: { ...SFTP, port } })).includes("sftp.port"), String(port));
  for (const user of ["-oProxyCommand=x", "a b", "x\ny"]) assert.ok(champs(base({ sftp: { ...SFTP, user } })).includes("sftp.user"), user);
  for (const dir of ['/a"b', "/a\nb", "x".repeat(201), "", "/", "//", "a'b`c"]) assert.ok(champs(base({ sftp: { ...SFTP, dir } })).includes("sftp.dir"), dir);
  for (const password of ["a\nb", "x".repeat(201), "", "a'b`c"]) assert.ok(champs(base({ sftp: { ...SFTP, password } })).includes("sftp.password"), password);
  assert.ok(champs(base({ nom: "" })).includes("nom"));
});

test("ligneEnv : $, guillemets, apostrophe, # et \\n lus à l'identique par loadEnvFile", t => {
  const f = path.join(tmp(t).b, "x.env");
  const saved = process.env.TEST_NA; t.after(() => { if (saved === undefined) delete process.env.TEST_NA; else process.env.TEST_NA = saved; });
  for (const v of ["p$ss\"w'rd#1\\n", "a'b$c#d\\n", "a`b\"c$d", "${HOME} $(id) # fin", "a\\nb"]) {
    fs.writeFileSync(f, ligneEnv("TEST_NA", v)); delete process.env.TEST_NA; process.loadEnvFile(f);
    assert.equal(process.env.TEST_NA, v);
  }
});

test("création complète : dossiers, spec valide (check 0 erreur), .env 600, compte utilisable", t => {
  const { racine, comptes } = tmp(t);
  const entree = base({ sftp: { ...SFTP, port: 2222 }, societes: [{ id: "tt", name: "Transports Test SA" }, { id: "t2", name: "Seconde" }] });
  const { id, mdp } = creerAdherent({ racine, comptes, entree });
  assert.equal(id, "test"); assert.ok(mdp.length >= 12);
  const d = path.join(racine, "test");
  assert.deepEqual(adherentsConnus(racine), ["test"]); assert.deepEqual(fs.readdirSync(racine), ["test"], "aucun dossier temporaire");
  for (const s of ["tt", "t2"]) for (const k of ["raw", "bronze"]) assert.ok(fs.statSync(path.join(d, "data", k, s)).isDirectory());
  assert.ok(fs.statSync(path.join(d, ".atelier")).isDirectory());
  assert.equal(fs.statSync(path.join(d, ".env")).mode & 0o777, 0o600);
  const projet = fs.readFileSync(path.join(d, "spec/projet.yml"), "utf8"); assert.match(projet, /Transports Test/); assert.match(projet, /id: t2/);
  assert.equal(fs.readdirSync(path.join(d, "spec/datasets")).filter(f => f.endsWith(".yml")).length, 0);
  assert.equal(fs.readdirSync(path.join(d, "spec/flux")).filter(f => f.endsWith(".yml")).length, 0);
  assert.ok(fs.existsSync(path.join(d, "spec/catalogue/elements_principaux.txt")) && fs.existsSync(path.join(d, "spec/referentiel.yml")));
  const env = fs.readFileSync(path.join(d, ".env"), "utf8"); assert.match(env, /SFTP_PORT='2222'/);
  const c = lireComptes(comptes); assert.equal(c.length, 1); assert.equal(c[0].role, "adherent"); assert.equal(verifier(mdp, c[0].mdp), true);
  assert.equal(JSON.stringify(c).includes(mdp), false); assert.equal(JSON.stringify(c).includes(SFTP.password), false);
  const r = spawnSync(process.execPath, [ATELIER, "check"], { env: { ...process.env, ATELIER_ROOT: d }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /0 erreur\(s\)/);
});

test("sans SFTP : pas de .env", t => {
  const { racine, comptes } = tmp(t); creerAdherent({ racine, comptes, entree: base() });
  assert.equal(fs.existsSync(path.join(racine, "test/.env")), false);
});

test("doublon : refusé (dossier ou compte existant), rien n'est modifié", t => {
  const { racine, comptes } = tmp(t); creerAdherent({ racine, comptes, entree: base() });
  const avant = fs.readFileSync(comptes, "utf8");
  assert.throws(() => creerAdherent({ racine, comptes, entree: base() }), x => x.code === "existe");
  assert.equal(fs.readFileSync(comptes, "utf8"), avant);
  fs.rmSync(path.join(racine, "test"), { recursive: true });
  assert.throws(() => creerAdherent({ racine, comptes, entree: base() }), x => x.code === "existe", "compte seul");
});

test("invalide : lève avec les erreurs, rien n'est créé", t => {
  const { racine, comptes } = tmp(t);
  assert.throws(() => creerAdherent({ racine, comptes, entree: base({ id: "../x" }) }), x => x.code === "invalide" && x.erreurs[0].champ === "id");
  assert.equal(fs.existsSync(racine), false);
});

test("rollback : échec du gabarit ou du compte → dossier supprimé, comptes.json inchangé", t => {
  const { racine, comptes, b } = tmp(t);
  assert.throws(() => creerAdherent({ racine, comptes, entree: base(), gabarit: () => { throw new Error("boum"); } }), /boum/);
  assert.deepEqual(fs.readdirSync(racine), []);
  // le fichier de comptes est un dossier : l'écriture échoue après le renommage
  fs.mkdirSync(comptes); fs.writeFileSync(path.join(comptes, "garde"), "x");
  assert.throws(() => creerAdherent({ racine, comptes, entree: base({ sftp: SFTP }) }));
  assert.deepEqual(fs.readdirSync(racine), [], "ni dossier final ni temporaire");
  assert.deepEqual(fs.readdirSync(comptes), ["garde"]);
  fs.readdirSync(b).filter(f => f.endsWith(".tmp")).forEach(f => fs.rmSync(path.join(b, f), { force: true }));
});

test("adherentsConnus ignore un dossier .nouveau-…", t => {
  const { racine } = tmp(t); fs.mkdirSync(path.join(racine, ".nouveau-x-ab", "spec"), { recursive: true }); fs.mkdirSync(path.join(racine, "ok/spec"), { recursive: true });
  assert.deepEqual(adherentsConnus(racine), ["ok"]);
});
