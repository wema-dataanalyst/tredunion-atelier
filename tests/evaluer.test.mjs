import { test } from "node:test";
import assert from "node:assert/strict";
import { comparer } from "../tools/evaluer.mjs";

test("comparer compte les flux et les décodages du corrigé retrouvés", () => {
  const corrige = {
    flux: [{ ds: "bal", codMode: "regles", rules: [{ prefix: "7061", cod: "CA TPS" }, { prefix: "6061", cod: "GO" }] }, { ds: "tele", codMode: "fixe", valeur: "distance_km", cod: "DISTANCE" }],
    datasets: [{ id: "tms", columns: [{ name: "statut", codes: { L: "Livrée", A: "Annulée" } }] }],
  };
  const spec = {
    flux: [{ ds: "bal", codMode: "regles", rules: [{ prefix: "7061", cod: "CA TPS" }] }, { ds: "tele", codMode: "fixe", valeur: "distance_km", cod: "DISTANCE" }],
    datasets: [{ id: "tms", columns: [{ name: "statut", codes: { L: "Livré" } }] }],
  };
  const r = comparer(spec, corrige);
  assert.deepEqual(r.flux, { attendus: 3, trouves: 2, taux: 2 / 3, manquants: ["bal|6061|GO|MontantReel"], en_plus: [] });
  assert.deepEqual(r.codes, { attendus: 2, trouves: 1, taux: 0.5, manquants: ["tms.statut.A"], en_plus: [] });
});

test("une règle de compte plus précise que le corrigé est retrouvée, pas une autre catégorie", () => {
  const corrige = { flux: [{ ds: "bal", codMode: "regles", rules: [{ prefix: "7061", cod: "CA TPS" }, { prefix: "6061", cod: "GO" }] }] };
  const spec = { flux: [{ ds: "bal", codMode: "regles", rules: [{ prefix: "706100", cod: "CA TPS" }, { prefix: "606110", cod: "ENTR" }] }] };
  const r = comparer(spec, corrige).flux;
  assert.equal(r.trouves, 1);
  assert.deepEqual(r.manquants, ["bal|6061|GO|MontantReel"]);
});

test("un flux du corrigé sur un autre champ n'est pas retrouvé", () => {
  const corrige = { flux: [{ ds: "bal", codMode: "regles", rules: [{ prefix: "7061", cod: "CA TPS" }] }, { ds: "bal", codMode: "regles", champ: "BudgetNextN", rules: [{ prefix: "7061", cod: "CA TPS" }] }] };
  const spec = { flux: [{ ds: "bal", codMode: "regles", champ: "MontantReel", rules: [{ prefix: "7061", cod: "CA TPS" }] }] };
  assert.deepEqual(comparer(spec, corrige).flux.manquants, ["bal|7061|CA TPS|BudgetNextN"]);
});
