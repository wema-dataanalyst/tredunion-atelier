import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";

const NOMS = ["Fournier", "Muller", "Schmitt", "Weber", "Klein", "Meyer", "Lang", "Becker"], CARTES = /1000062703526043|1000042496274085/;
const espaceTmp = t => { const root = racineExemple(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return { root, e: ouvrirEspace(root) }; };
const lire = (root, f) => fs.readFileSync(path.join(root, f), "utf8");
const ecrire = (root, f, s) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s); };
const sansPii = v => { const s = JSON.stringify(v); NOMS.forEach(n => assert.ok(!s.includes(n), "nom en clair")); assert.ok(!CARTES.test(s), "carte en clair"); };

test("colonne d'un dataset : colonnes concernées d'abord, pii masquée, 10 lignes au plus", t => {
  const { e } = espaceTmp(t), r = e.apercuQuestion("tms_conducteurs#q1");
  assert.equal(r.dataset, "tms_conducteurs"); assert.equal(r.societe, "kf"); assert.equal(r.total, 14);
  assert.deepEqual(r.colonnes[0], { name: "date_entree", pii: false, concerne: true });
  assert.deepEqual(r.colonnes.filter(c => c.pii).map(c => c.name).sort(), ["nom", "prenom"]);
  assert.equal(r.lignes.length, 10); assert.equal(r.lignes[0].length, r.colonnes.length);
  const i = r.colonnes.findIndex(c => c.name === "nom"); assert.equal(r.lignes[0][i], "•••");
  sansPii(r);
});

test("une colonne pii mal déclarée dans un autre dataset reste masquée", t => {
  const { root, e } = espaceTmp(t);
  ecrire(root, "spec/datasets/paie_salaries.yml", lire(root, "spec/datasets/paie_salaries.yml").replace(/    pii: true\n/g, ""));
  const r = e.apercuQuestion("paie_salaries#q3");
  assert.deepEqual(r.colonnes.filter(c => c.pii).map(c => c.name).sort(), ["nom", "prenom"]); // nom et prenom restent pii dans tms_conducteurs
  assert.equal(r.colonnes.find(c => c.name === "num_carte_conducteur").pii, false);
  const s = JSON.stringify(r); assert.ok(!s.includes("Becker") && !s.includes("Julien"));
});

test("au plus 8 colonnes (concernées d'abord) et valeurs tronquées à 80 caractères", t => {
  const { root, e } = espaceTmp(t);
  const r = e.apercuQuestion("tms_missions#q5");
  assert.equal(r.colonnes.length, 8); assert.equal(r.colonnes[0].name, "statut"); assert.equal(r.total, 420);
  ecrire(root, "data/bronze/kf/tms_vehicules.csv", lire(root, "data/bronze/kf/tms_vehicules.csv").replace(/\n[^;]*;/, "\n" + "x".repeat(200) + ";"));
  const v = e.apercuQuestion("tms_vehicules#q1"); assert.ok(v.lignes.flat().some(x => x === "x".repeat(80) + "…")); assert.ok(v.lignes.flat().every(x => x.length <= 81));
});

test("flux : dataset du flux, colonnes du flux d'abord", t => {
  const { root, e } = espaceTmp(t);
  ecrire(root, "spec/flux/f2.yml", lire(root, "spec/flux/f2.yml") + "hypothese:\n  source: agent\n  question: Le CA total est-il hors taxe ?\n  valide: false\n");
  const r = e.apercuQuestion("flux:f2");
  assert.equal(r.dataset, "compta_balance");
  assert.deepEqual(r.colonnes.filter(c => c.concerne).map(c => c.name).sort(), ["compte", "etablissement", "montant", "periode"]);
  assert.ok(r.colonnes.slice(0, 4).every(c => c.concerne));
});

test("contrôle : les deux datasets, colonnes de chaque côté", t => {
  const { root, e } = espaceTmp(t);
  ecrire(root, "spec/controles.yml", `- id: c1
  type: ecart_somme
  libelle: CA TMS contre comptes 70
  annee: 2025
  tolerance: 0.05
  reponse: à voir
  a: {ds: tms_missions, valeur: ca_ht, date: date_charg}
  b: {ds: compta_balance, valeur: montant, filtre: "compte like '70%'"}
`);
  const r = e.apercuQuestion("controle:c1");
  assert.deepEqual(r.apercus.map(x => x.dataset), ["tms_missions", "compta_balance"]);
  assert.deepEqual(r.apercus[0].colonnes.filter(c => c.concerne).map(c => c.name).sort(), ["ca_ht", "date_charg"]);
  assert.ok(r.apercus[1].colonnes.some(c => c.name === "compte" && c.concerne));
});

test("fichier non lu : aucun dataset ; question inconnue : null", t => {
  const { root, e } = espaceTmp(t);
  ecrire(root, "data/bronze/kf/_non_lus.json", JSON.stringify([{ fichier: "vieux.xls", raison: "format illisible" }]));
  const r = e.apercuQuestion("non_lu:vieux.xls"); assert.equal(r.aucun, true); assert.match(r.raison, /non lu/);
  assert.equal(e.apercuQuestion("tms_missions#q99"), null); assert.equal(e.apercuQuestion("n'importe quoi"), null);
});
