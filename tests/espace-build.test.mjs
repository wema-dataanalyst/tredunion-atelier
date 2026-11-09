import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";

const ls = d => fs.existsSync(d) ? fs.readdirSync(d).sort() : [];

test("construire : écrit generated/, le statut, sans résidu", () => {
  const root = racineExemple(), e = ouvrirEspace(root);
  const r = e.construire(); assert.equal(r.ok, true); assert.ok(r.fichiers > 0);
  assert.equal(ls(path.join(root, "generated")).length > 0, true);
  assert.deepEqual(ls(root).filter(n => /\.(tmp|old)-/.test(n)), []);
  const st = e.lireStatut(); assert.equal(st.ok, true); assert.match(st.dernierBuild, /^\d{4}-\d\d-\d\dT/); assert.equal(st.fichiers, r.fichiers);
});

test("construire : une spec en erreur laisse generated/ intact et garde dernierBuild", () => {
  const root = racineExemple(), e = ouvrirEspace(root);
  e.construire(); const avant = e.livrables(), dernier = e.lireStatut().dernierBuild;
  fs.writeFileSync(path.join(root, "spec/relations.yml"), "[\n");
  const r = e.construire(); assert.equal(r.ok, false); assert.ok(r.erreurs.length > 0);
  assert.deepEqual(e.livrables(), avant);
  const st = e.lireStatut(); assert.equal(st.ok, false); assert.equal(st.dernierBuild, dernier); assert.ok(st.nbErreurs > 0 && st.erreurs.length <= 20);
  assert.deepEqual(ls(root).filter(n => /\.(tmp|old)-/.test(n)), []);
});

test("apercu : questions, mesures, build ; libres compte les textes libres en attente", () => {
  const root = racineExemple(), e = ouvrirEspace(root);
  const a = e.apercu(); // l'exemple a déjà une question traitée
  const base = a.questions.traitees;
  assert.ok(a.questions.total > 0);
  assert.ok(a.mesures.total >= a.mesures.ok);
  assert.equal(a.libres, 0); assert.equal(a.dernierBuild, null); assert.equal(a.buildOk, null);
  assert.ok(!e.repondre({ id: "compta_balance#q1", saisie: { texte: "Date de clôture" }, par: "Compta" }).erreurs);
  e.construire(); const b = e.apercu();
  assert.equal(b.questions.traitees, base + 1); assert.equal(b.libres, 1); assert.equal(b.buildOk, true); assert.ok(b.dernierBuild);
});

test("livrables / lireLivrable : liste, contenu, refus des chemins hors liste", () => {
  const root = racineExemple(), e = ouvrirEspace(root); assert.deepEqual(e.livrables(), []);
  e.construire(); const l = e.livrables(); assert.ok(l.length > 0 && l.every(x => x.taille >= 0 && !x.path.includes("\\")));
  assert.ok(e.lireLivrable(l[0].path) instanceof Buffer);
  for (const p of ["../spec/projet.yml", "../../etc/passwd", "/etc/passwd", "inconnu.txt", "", undefined]) assert.equal(e.lireLivrable(p), null);
});

test("construire : supprime les résidus d'un échange interrompu", () => {
  const root = racineExemple(), e = ouvrirEspace(root);
  for (const n of ["generated.tmp-999", "generated.old-999"]) { fs.mkdirSync(path.join(root, n)); fs.writeFileSync(path.join(root, n, "x.txt"), "x"); }
  assert.equal(e.construire().ok, true);
  assert.deepEqual(ls(root).filter(n => /\.(tmp|old)-/.test(n)), []);
});

test("construire : récupère l'ancien livrable après une coupure, même si la spec est en erreur", () => {
  const root = racineExemple(), e = ouvrirEspace(root);
  fs.mkdirSync(path.join(root, "generated.old-123")); fs.writeFileSync(path.join(root, "generated.old-123/a.txt"), "ancien");
  fs.writeFileSync(path.join(root, "spec/relations.yml"), "[\n");
  assert.equal(e.construire().ok, false);
  assert.equal(fs.readFileSync(path.join(root, "generated/a.txt"), "utf8"), "ancien");
  assert.deepEqual(ls(root).filter(n => /\.(tmp|old)-/.test(n)), []);
});

test("lireStatut : un statut corrompu n'empêche pas de construire", () => {
  const root = racineExemple(), e = ouvrirEspace(root);
  fs.mkdirSync(path.join(root, ".atelier")); fs.writeFileSync(path.join(root, ".atelier/statut.json"), "{pas du json");
  assert.deepEqual(e.lireStatut(), {});
  assert.equal(e.construire().ok, true);
  assert.equal(e.lireStatut().ok, true);
});
