import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { adherentsConnus, racineDe, creerCompte } from "../server/adherents.mjs";
import { lireComptes, verifier } from "../server/auth.mjs";

function base() {
  const b = fs.mkdtempSync(path.join(os.tmpdir(), "adh-"));
  for (const id of ["alpha", "beta"]) fs.mkdirSync(path.join(b, id, "spec"), { recursive: true });
  fs.mkdirSync(path.join(b, "Pas Valide", "spec"), { recursive: true }); fs.mkdirSync(path.join(b, "sans-spec"));
  return b;
}

test("adherentsConnus ne garde que les dossiers conformes avec spec/", () => {
  assert.deepEqual(adherentsConnus(base()), ["alpha", "beta"]);
});

test("racineDe refuse l'inconnu, les chemins relatifs et les ids hors format", () => {
  const b = base();
  assert.equal(racineDe(b, "alpha"), path.join(b, "alpha"));
  for (const id of ["gamma", "../alpha", "alpha/..", "", "Pas Valide", undefined]) assert.throws(() => racineDe(b, id), /adhérent inconnu/);
});

test("creerCompte : mot de passe renvoyé une fois, haché au fichier, remplacé si l'id existe", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cpt-")), "comptes.json");
  const { mdp } = creerCompte({ fichier: f, id: "alpha", role: "adherent", nom: "Alpha" });
  assert.equal(verifier(mdp, lireComptes(f)[0].mdp), true); assert.notEqual(lireComptes(f)[0].mdp, mdp);
  const { mdp: m2 } = creerCompte({ fichier: f, id: "alpha", role: "adherent", nom: "Alpha" });
  assert.equal(lireComptes(f).length, 1); assert.equal(verifier(m2, lireComptes(f)[0].mdp), true);
});

function envMulti() {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "multi-"));
  return { t, env: { ...process.env, ADHERENTS_ROOT: path.join(t, "adh"), COMPTES_FILE: path.join(t, "comptes.json") } };
}
const atelier = (env, ...a) => spawnSync(process.execPath, ["tools/atelier.mjs", ...a], { env, encoding: "utf8" });

test("exemple --multi crée alpha et beta et 3 comptes, refuse de relancer (même avec --force)", () => {
  const { t, env } = envMulti();
  const r = atelier(env, "exemple", "--multi");
  assert.equal(r.status, 0, r.stderr);
  const nom = id => fs.readFileSync(path.join(t, "adh", id, "spec/projet.yml"), "utf8").match(/^adherent: (.*)$/m)[1];
  assert.notEqual(nom("alpha"), nom("beta"));
  assert.deepEqual(lireComptes(env.COMPTES_FILE).map(c => c.id).sort(), ["admin-michel", "alpha", "beta"]);
  assert.equal(atelier(env, "exemple", "--multi").status, 1);
  assert.equal(atelier(env, "exemple", "--multi", "--force").status, 1);
});

for (const existant of ["alpha", "beta"]) test(`exemple --multi refuse si ${existant} existe seul, sans rien toucher`, () => {
  const { t, env } = envMulti();
  const d = path.join(t, "adh", existant); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "mien.txt"), "intact");
  for (const args of [["--multi"], ["--multi", "--force"]]) assert.equal(atelier(env, "exemple", ...args).status, 1);
  assert.equal(fs.readFileSync(path.join(d, "mien.txt"), "utf8"), "intact");
  assert.deepEqual(fs.readdirSync(d), ["mien.txt"]);
  assert.deepEqual(fs.readdirSync(path.join(t, "adh")), [existant]);
  assert.equal(fs.existsSync(env.COMPTES_FILE), false);
});

test("compte --admin refuse un nom sans caractère valide", () => {
  const { env } = envMulti();
  const r = atelier(env, "compte", "--admin", "!!!");
  assert.equal(r.status, 1); assert.match(r.stderr, /nom d'administrateur invalide/);
  assert.equal(fs.existsSync(env.COMPTES_FILE), false);
  assert.equal(atelier(env, "compte", "--admin", "x".repeat(40)).status, 1);
  assert.equal(atelier(env, "compte", "--admin", "Marie").status, 0);
});

test("creerCompte crée le dossier parent du fichier de comptes", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cpt-")), "a", "b", "comptes.json");
  creerCompte({ fichier: f, id: "alpha", role: "adherent", nom: "Alpha" });
  assert.equal(lireComptes(f).length, 1);
});
