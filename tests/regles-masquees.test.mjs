import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, dataset, colonne } from "./aide/moteur.mjs";

const etat = rules => ({
  datasets: [dataset("bal", [colonne("compte", { type: "text" }), colonne("mois", { type: "date" }), colonne("montant", { type: "decimal" })], [["7061", "2026-07-31", "10"], ["706", "2026-07-31", "5"]])],
  flux: [{ id: "f1", ds: "bal", codMode: "regles", codCol: "compte", rules, valeur: "montant", agg: "sum", champ: "MontantReel", unite: "€", date: "mois",
    cod: "", lib: "", libCol: "", vehicule: "", chauffeur: "", site: "", client: "", collaborateur: "", filtre: "", note: "" }],
  categories: [{ cod: "CA TOTAL", note: "" }, { cod: "CA TPS", note: "" }],
});
const masquees = st => chargerMoteur(st).run("checkSpec()").filter(x => /jamais atteinte/.test(x.msg));

test("check : une règle placée après un préfixe plus court qui la couvre est signalée", () => {
  const c = masquees(etat([{ prefix: "706", cod: "CA TOTAL", lib: "CA" }, { prefix: "7061", cod: "CA TPS", lib: "CA transport" }]));
  assert.deepEqual(c.map(x => [x.niv, x.fichier]), [["alerte", "spec/flux/f1.yml"]]);
  assert.match(c[0].msg, /7061.*706/);
});

test("check : préfixes longs d'abord, aucune alerte", () => {
  assert.equal(masquees(etat([{ prefix: "7061", cod: "CA TPS", lib: "CA transport" }, { prefix: "706", cod: "CA TOTAL", lib: "CA" }])).length, 0);
});