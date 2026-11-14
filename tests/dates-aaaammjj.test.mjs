import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, dataset, colonne } from "./aide/moteur.mjs";

const lignes = [["20260701", "7060010009", "1200,50"], ["20260915", "604", "300,00"]];
const etat = (cols, extra = {}) => ({ datasets: [dataset("fec", cols, lignes)], ...extra });

test("profil : AAAAMMJJ est une date YYYYMMDD ; un entier de 8 chiffres hors calendrier reste un entier", () => {
  const m = chargerMoteur(etat([colonne("ecriture_date"), colonne("compte_num"), colonne("debit")]));
  assert.deepEqual(m.run("[DS('fec')._prof.ecriture_date.guess, DS('fec')._prof.ecriture_date.fmt]"), ["date", "YYYYMMDD"]);
  const n = chargerMoteur({ datasets: [dataset("x", [colonne("code")], [["20261399"], ["20260101"]])] });
  assert.equal(n.run("DS('x')._prof.code.guess"), "int");
});

test("silver : une colonne date YYYYMMDD est lue en date, en aperçu et en SQL", () => {
  const m = chargerMoteur(etat([colonne("ecriture_date", { type: "date", format: "YYYYMMDD" }), colonne("compte_num", { type: "text" }), colonne("debit", { type: "decimal", decimalComma: true })]));
  assert.deepEqual(m.run("silverRows(DS('fec')).rows.map(o=>[o.ecriture_date.getFullYear(),o.ecriture_date.getMonth()+1,o.ecriture_date.getDate()])"), [[2026, 7, 1], [2026, 9, 15]]);
  assert.match(m.run("silverSql(DS('fec'))"), /to_date\(nullif\(trim\(src\.ecriture_date\), ''\), 'YYYYMMDD'\) as ecriture_date/);
});

test("FAITS : un flux daté en YYYYMMDD produit des lignes mensuelles", () => {
  const m = chargerMoteur(etat([colonne("ecriture_date", { type: "date", format: "YYYYMMDD" }), colonne("compte_num", { type: "text" }), colonne("debit", { type: "decimal", decimalComma: true })], {
    flux: [{ id: "f1", ds: "fec", codMode: "fixe", cod: "CA TOTAL", lib: "CA total", valeur: "debit", agg: "sum", champ: "MontantReel", unite: "€", date: "ecriture_date",
      rules: [], codCol: "", libCol: "", vehicule: "", chauffeur: "", site: "", client: "", collaborateur: "", filtre: "", note: "" }],
    categories: [{ cod: "CA TOTAL", note: "" }] }));
  assert.deepEqual(m.run("(s=>[s.noDate,s.n])(buildFaits().stats.f1)"), [0, 2]);
});
test("silver : une date AAAAMMJJ impossible est nulle (Postgres la refuserait)", () => {
  const m = chargerMoteur({ datasets: [dataset("fec", [colonne("ecriture_date", { type: "date", format: "YYYYMMDD" })], [["20260231"], ["20260228"]])] });
  assert.deepEqual(m.run("silverRows(DS('fec')).rows.map(o=>o.ecriture_date===null)"), [true, false]);
});
