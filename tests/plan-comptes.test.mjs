import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { decouperLigne } from "../tools/lecteurs/commun.mjs";
import { planComptes } from "../tools/plan-comptes.mjs";
import { ouvrirEspace } from "../tools/espace.mjs";
import { creerOutilsMaquette } from "../server/agent/maquette-outils.mjs";
import { SYSTEME_MAQUETTE } from "../server/agent/maquette-agent.mjs";
import { racineExemple } from "./aide/racine.mjs";

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
  assert.deepEqual(planComptes(FEC_CSV, { classes: "4" }).comptes.map(c => c.compte), ["606100", "706100"]);
  const p27 = planComptes(FEC_CSV, { classes: "247" });
  assert.equal(p27.classes, "27"); assert.ok(p27.comptes.every(c => !c.compte.startsWith("4")));
  assert.deepEqual(planComptes(FEC_CSV.replace(/\n$/, "\nHA;Achats;5;20260710;218200;Matériel de transport;1000,00;0,00\n"), { classes: "2" }).comptes, [{ compte: "218200", lignes: 1, net: -1000, journaux: ["HA"] }]);
  assert.ok(planComptes(FEC_CSV, { libPersonnel: true }).comptes.every(c => !("lib" in c)));
});

test("planComptes : montant et sens, lignes sans date, CSV qui n'est pas un FEC", () => {
  const p = planComptes("compte_num;montant;sens\n706100;100;C\n606100;40,5;D\n");
  assert.deepEqual(p.comptes.map(c => [c.compte, c.net]), [["606100", -41], ["706100", 100]]);
  assert.equal(p.sans_date, 2); assert.equal(p.periode, null);
  assert.ok(planComptes("immat;km\nAB123CD;10\n").erreur);
});

const COLONNES = ["journal_code", "journal_lib", "ecriture_num", "ecriture_date", "compte_num", "compte_lib", "debit", "credit"];
function racineFec({ libPii = false } = {}) {
  const racine = racineExemple();
  fs.writeFileSync(path.join(racine, "data/bronze/kf/fec_test.csv"), FEC_CSV);
  fs.writeFileSync(path.join(racine, "spec/datasets/fec_test.yml"), `id: fec_test\nsociete: kf\nfile: data/bronze/kf/fec_test.csv\ncolumns:\n${COLONNES.map(n => `  - name: ${n}\n    type: text\n${n === "compte_lib" && libPii ? "    pii: true\n" : ""}`).join("")}`);
  const espace = ouvrirEspace(racine);
  return { racine, espace, o: creerOutilsMaquette({ espace, racine }) };
}

test("espace.planComptes : fichier entier, classes, libellé personnel", () => {
  const { espace } = racineFec();
  const p = espace.planComptes("fec_test");
  assert.equal(p.dataset, "fec_test");
  assert.deepEqual(p.comptes.map(c => c.compte), ["606100", "706100"]);
  assert.deepEqual(espace.planComptes("fec_test", "abc").classes, "67");
  assert.equal(espace.planComptes("fec_test", "4").comptes.length, 2);
  const { racine: r2, espace: e2 } = racineFec();
  fs.writeFileSync(path.join(r2, "spec/datasets/casse.yml"), "id: [");
  assert.equal(e2.planComptes("fec_test").comptes.length, 2);
  assert.equal(espace.planComptes("inconnu"), null);
  assert.ok(espace.planComptes("tms_missions").erreur);
  assert.ok(racineFec({ libPii: true }).espace.planComptes("fec_test").comptes.every(c => !("lib" in c)));
});

test("outil lire_plan_comptes et invitation dans le profil", async () => {
  const { o } = racineFec();
  assert.equal((await o.lire_plan_comptes.executer({ id: "fec_test", classes: "7" })).comptes.length, 1);
  for (const id of ["../../etc/passwd", "inconnu", "", undefined]) assert.ok((await o.lire_plan_comptes.executer({ id })).erreur, String(id));
  assert.match((await o.lire_dataset.executer({ id: "fec_test" })).plan_comptes, /lire_plan_comptes/);
  assert.equal((await o.lire_dataset.executer({ id: "tms_missions" })).plan_comptes, undefined);
  assert.match(SYSTEME_MAQUETTE, /lire_plan_comptes/);
});