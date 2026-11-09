import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, colonne, dataset } from "./aide/moteur.mjs";

const tms = () => dataset("tms", [colonne("date_chgt"), colonne("montant"), colonne("plaque")],
  [["02/01/2025", "600", "AB-123-CD"], ["15/02/2025", "400", "EF-456-GH"], ["20/12/2024", "999", "AB-123-CD"]]);
const balance = credit => dataset("balance", [colonne("numero_compte"), colonne("credit")], [["70610000", String(credit)], ["60610000", "50"]],
  { meta: { periode_du: "2025-01-01", periode_au: "2025-12-31" } });
const parc = () => dataset("parc", [colonne("immat")], [["AB123CD"], ["EF456GH"]]);
const c1 = { id: "c1", type: "ecart_somme", libelle: "CA TMS contre comptes 70", annee: 2025, tolerance: 0.05,
  a: { ds: "tms", valeur: "montant", date: "date_chgt" }, b: { ds: "balance", valeur: "credit", filtre: "numero_compte like '70%'" }, porte_sur: ["tms.montant"] };
const resultats = (datasets, controles) => chargerMoteur({ datasets, controles }).run("CTRL()");

test("ecart_somme : ok dans la tolérance, sur l'année demandée", () => {
  const [r] = resultats([tms(), balance(1020)], [c1]);
  assert.equal(r.statut, "ok"); assert.equal(r.a, 1000); assert.equal(r.b, 1020);
});

test("ecart_somme : écart au-delà de la tolérance", () => {
  assert.equal(resultats([tms(), balance(2000)], [c1])[0].statut, "ecart");
});

test("rapprochement : taux après normalisation", () => {
  const c = { id: "c4", type: "rapprochement", from: "tms.plaque", to: "parc.immat", seuil: 0.9 };
  assert.equal(resultats([tms(), parc()], [{ ...c, norm: "alnum_upper" }])[0].statut, "ok");
  assert.equal(resultats([tms(), parc()], [c])[0].statut, "ecart");
});

test("mensuel : une source sans date par ligne est en écart, avec sa période", () => {
  const [r] = resultats([balance(1)], [{ id: "c5", type: "mensuel", ds: "balance" }]);
  assert.equal(r.statut, "ecart"); assert.match(r.msg, /2025-01-01/);
  const [m] = resultats([tms()], [{ id: "c6", type: "mensuel", ds: "tms", date: "date_chgt" }]);
  assert.equal(m.statut, "ok"); assert.equal(m.mois, 3);
});

test("type inconnu ou id manquant : erreur", () => {
  assert.equal(resultats([], [{ id: "c9", type: "autre" }])[0].statut, "erreur");
  assert.equal(resultats([], [{ type: "mensuel" }])[0].statut, "erreur");
});

test("checkSpec remonte les écarts en alerte sur spec/controles.yml", () => {
  const f = chargerMoteur({ datasets: [tms(), balance(2000)], controles: [c1] }).run("checkSpec()");
  assert.ok(f.some(x => x.fichier === "spec/controles.yml" && x.niv === "alerte" && x.msg.startsWith("c1")));
});

test("ecart_somme : aucune ligne retenue d'un côté, ou deux sommes nulles : erreur", () => {
  const vide = { ...c1, b: { ...c1.b, filtre: "numero_compte like '99%'" } };
  const [r] = resultats([tms(), balance(1020)], [vide]);
  assert.equal(r.statut, "erreur"); assert.match(r.msg, /aucune ligne retenue/);
  const zero = { ...c1, a: { ...c1.a, filtre: "montant = 0" }, b: { ...c1.b, valeur: "credit - credit" } };
  assert.equal(resultats([tms(), balance(1020)], [zero])[0].statut, "erreur");
  assert.equal(resultats([dataset("tms", [colonne("date_chgt"), colonne("montant")], [["02/01/2025", "0"]]), balance(0)], [c1])[0].statut, "erreur");
});

test("porte_sur en texte : erreur sur controles.yml ; cible sans hypothèse : alerte", () => {
  const f = chargerMoteur({ datasets: [tms(), balance(1020)], controles: [{ ...c1, porte_sur: "tms.montant" }, { ...c1, id: "c3", porte_sur: ["tms.inconnu"] }] }).run("checkSpec()");
  assert.ok(f.some(x => x.niv === "erreur" && /^c1 .*porte_sur/.test(x.msg)));
  assert.ok(f.some(x => x.niv === "alerte" && /c3.*tms\.inconnu/.test(x.msg)));
});
