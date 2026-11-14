import { test } from "node:test";
import assert from "node:assert/strict";
import { decouperLigne } from "../tools/lecteurs/commun.mjs";
import { planComptes } from "../tools/plan-comptes.mjs";

export const FEC_CSV = [
  "journal_code;journal_lib;ecriture_num;ecriture_date;compte_num;compte_lib;debit;credit",
  "VT;Ventes;1;20260705;411000;Clients;1200,00;0,00",
  "VT;Ventes;1;20260705;706100;Transport national;0,00;1000,00",
  "VT;Ventes;1;20260705;445710;TVA collectée;0,00;200,00",
  "AC;Achats;2;20260810;606100;Gazole;500,40;0,00",
  "AC;Achats;2;20260810;401000;Fournisseurs;0,00;500,40",
  "OD;Opérations diverses;3;20260831;706100;Transport national;100,00;0,00",
  "VT;Ventes;4;20260902;706100;\"Transport; national\";0,00;300,00",
].join("\n") + "\n";

test("decouperLigne : guillemets, séparateur à l'intérieur, guillemet doublé", () => {
  assert.deepEqual(decouperLigne('a;"b;c";"d""e"', ";"), ["a", "b;c", 'd"e']);
  assert.deepEqual(decouperLigne("a\tb", "\t"), ["a", "b"]);
});

test("planComptes : comptes 6/7, mois, journaux, net crédit − débit", () => {
  const p = planComptes(FEC_CSV);
  assert.equal(p.lignes, 7);
  assert.deepEqual(p.periode, { du: "2026-07", au: "2026-09" });
  assert.deepEqual(p.mois, [
    { mois: "2026-07", lignes: 3, produits: 1000, charges: 0 },
    { mois: "2026-08", lignes: 3, produits: -100, charges: 500 },
    { mois: "2026-09", lignes: 1, produits: 300, charges: 0 },
  ]);
  assert.deepEqual(p.journaux, [{ code: "VT", lignes: 4 }, { code: "AC", lignes: 2 }, { code: "OD", lignes: 1 }]);
  assert.deepEqual(p.comptes, [
    { compte: "606100", lib: "Gazole", lignes: 1, net: -500, journaux: ["AC"] },
    { compte: "706100", lib: "Transport national", lignes: 3, net: 1200, journaux: ["VT", "OD"] },
  ]);
  assert.equal(p.sans_date, undefined);
});

test("planComptes : autres classes, libellé personnel retiré", () => {
  assert.deepEqual(planComptes(FEC_CSV, { classes: "4" }).comptes.map(c => c.compte), ["401000", "411000", "445710"]);
  assert.ok(planComptes(FEC_CSV, { libPersonnel: true }).comptes.every(c => !("lib" in c)));
});

test("planComptes : montant et sens, lignes sans date, CSV qui n'est pas un FEC", () => {
  const p = planComptes("compte_num;montant;sens\n706100;100;C\n606100;40,5;D\n");
  assert.deepEqual(p.comptes.map(c => [c.compte, c.net]), [["606100", -41], ["706100", 100]]);
  assert.equal(p.sans_date, 2); assert.equal(p.periode, null);
  assert.ok(planComptes("immat;km\nAB123CD;10\n").erreur);
});