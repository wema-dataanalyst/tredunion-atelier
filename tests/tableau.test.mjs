import { test } from "node:test";
import assert from "node:assert/strict";
import { detecterEntete, lireTableau } from "../tools/lecteurs/tableau.mjs";

const D = (a, m, j) => new Date(Date.UTC(a, m - 1, j));
const cofi = [
  ["Consommations TIPP", D(2025, 10, 15)],
  ["Sous-titre"],
  ["Période", "du", "au"],
  ["Date", "Véhicule", "Pays", "Montant HT €"],
  [D(2025, 1, 2), "AB-123-CD", "FRANCE", 12.5],
  [D(2025, 1, 3), "EF-456-GH", "FRANCE", 20],
  ["Nombre de lignes :", null, null, 2],
];

test("detecterEntete prend la ligne de texte la plus large", () => {
  assert.equal(detecterEntete(cofi), 3);
});

test("lireTableau renvoie les en-têtes en snake_case et les lignes formatées", () => {
  const t = lireTableau(cofi, { ignorer: ["^Nombre de lignes\\s*:"] });
  assert.equal(t.ligneEntete, 4);
  assert.deepEqual(t.entetes, ["date", "vehicule", "pays", "montant_ht"]);
  assert.deepEqual(t.lignes, [["02/01/2025", "AB-123-CD", "FRANCE", "12.5"], ["03/01/2025", "EF-456-GH", "FRANCE", "20"]]);
});

test("lireTableau garde la ligne de pied sans motif à ignorer", () => {
  assert.equal(lireTableau(cofi).lignes.length, 3);
});

test("lireTableau refuse les valeurs sous des colonnes sans en-tête", () => {
  const sage = [["Numéro de compte", null, "Intitulé", "Débit"], ["706", null, "Transport", null, 100]];
  assert.match(lireTableau(sage).erreur, /sans en-tête/);
});

test("lireTableau signale l'absence d'en-tête", () => {
  assert.match(lireTableau([[1, 2], [3, 4]]).erreur, /en-tête/);
});
