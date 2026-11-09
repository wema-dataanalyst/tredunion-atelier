import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";

const ID = "compta_balance#q1";
const interp = (ops, texte = "Date de clôture réelle", comprehension = "Vous confirmez la date.") => ({ interpretation: { texte, comprehension, operations: ops } });

test("saisie.interpretation : entrée client avec texte, opérations et compréhension", () => {
  const e = ouvrirEspace(racineExemple());
  const r = e.previsualiser({ id: ID, saisie: interp([{ op: "noter" }]), par: "Compta" });
  assert.ok(!r.erreurs, JSON.stringify(r));
  assert.deepEqual([r.entree.reponse, r.entree.origine, r.entree.interprete, r.entree.modifs, r.entree.par], ["Date de clôture réelle", "client", "Vous confirmez la date.", [{ op: "noter" }], "Compta"]);
  assert.match(r.entree.effet, /mesures alimentées \d+ → \d+/);
});

test("previsualiser n'écrit jamais au registre ; repondre avec interpretation l'ajoute", () => {
  const root = racineExemple(), e = ouvrirEspace(root), reg = path.join(root, "spec/reponses.yml"), avant = fs.readFileSync(reg, "utf8");
  e.previsualiser({ id: ID, saisie: interp([{ op: "noter" }]) });
  assert.equal(fs.readFileSync(reg, "utf8"), avant);
  const r = e.repondre({ id: ID, saisie: interp([{ op: "noter" }]) }); assert.ok(!r.erreurs);
  assert.match(fs.readFileSync(reg, "utf8"), /interprete: Vous confirmez la date\./);
});

test("saisie.interpretation : opérations inconnues, invalides, trop nombreuses, vides, texte vide ou pii refusés", () => {
  const e = ouvrirEspace(racineExemple()), v = s => e.previsualiser({ id: ID, saisie: s });
  assert.ok(v(interp([{ op: "supprimer" }])).erreurs);
  assert.ok(v(interp([{ op: "codes", cible: "inconnu.col", valeur: { A: "x" } }])).erreurs);
  assert.ok(v(interp(Array.from({ length: 11 }, () => ({ op: "noter" })))).erreurs);
  assert.ok(v(interp([])).erreurs);
  assert.ok(v(interp([{ op: "noter" }], "  ")).erreurs);
  assert.ok(v({ interpretation: { texte: "x", comprehension: "y", operations: "pas un tableau" } }).erreurs);
});

test("saisie.interpretation : une compréhension qui cite une valeur pii est refusée", () => {
  const root = racineExemple(), e = ouvrirEspace(root);
  const csv = fs.readFileSync(path.join(root, "data/bronze/kf/tms_conducteurs.csv"), "utf8").split("\n");
  const col = csv[0].split(";").indexOf("nom"), valeur = csv.slice(1).map(l => l.split(";")[col]).find(x => x && x.length >= 4);
  assert.ok(valeur, "valeur pii de l'exemple introuvable");
  assert.ok(e.previsualiser({ id: ID, saisie: interp([{ op: "noter" }], "Date réelle", `Vous parlez de ${valeur}.`) }).erreurs);
});

test("contexteAgent : question, dataset et colonnes sans pii ; null si inconnue", () => {
  const e = ouvrirEspace(racineExemple()); assert.equal(e.contexteAgent("inconnu#q9"), null);
  const c = e.contexteAgent(ID); assert.equal(c.id, ID); assert.ok(c.question && c.dataset);
  assert.ok(c.colonnes.length > 0); assert.ok(c.colonnes.every(x => x.nom && Array.isArray(x.frequentes) && typeof x.distinctes === "number"));
  const rh = e.contexteAgent("tms_conducteurs#q1");
  assert.ok(rh && rh.colonnes.length > 0);
  for (const nom of ["nom", "prenom"]) assert.ok(!rh.colonnes.some(x => x.nom === nom), `colonne pii exposée : ${nom}`);
});

test("memoireColonne : filtre par nom, remplace les noms d'adhérents par des nombres", () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || "/tmp"), "mem-"));
  fs.writeFileSync(path.join(dir, "colonnes.yml"), "- id: statut\n  nom: statut\n  sens: statut de l'ordre\n  confirme_chez: [alpha, beta]\n  contredit_chez: [gamma]\n- id: autre\n  nom: autre\n  sens: x\n  confirme_chez: []\n  contredit_chez: []\n");
  const avant = process.env.TREDUNION_MEMOIRE; process.env.TREDUNION_MEMOIRE = dir;
  try { const l = ouvrirEspace(racineExemple()).memoireColonne("statut"); assert.equal(l.length, 1); assert.equal(l[0].confirme_chez, "moins de 3 adhérents"); assert.equal(l[0].contredit_chez, "moins de 3 adhérents"); assert.ok(!JSON.stringify(l).includes("alpha")); }
  finally { if (avant === undefined) delete process.env.TREDUNION_MEMOIRE; else process.env.TREDUNION_MEMOIRE = avant; }
});
