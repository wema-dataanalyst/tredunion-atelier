const D = (a, m, j) => new Date(Date.UTC(a, m - 1, j));
export const recetteTest = {
  id: "test_balance", logiciel: "Sage 100 Comptabilité", signature: ["Sage 100", "Balance des comptes"], lecteur: "positions",
  requis: ["numero_compte"], ignorer: ["^Numéro de compte$"],
  colonnes: [{ col: 1, nom: "numero_compte" }, { col: 3, nom: "intitule" }, { col: 5, nom: "debit" }, { col: 7, nom: "credit" }],
};
export const sageTest = [
  [null],
  ["ACME", null, null, "Balance des comptes", null, "Période du", D(2025, 1, 1)],
  [null, null, null, null, null, "au", D(2025, 12, 31)],
  ["© Sage - Sage 100 Comptabilité", null, null, "Date de tirage", D(2026, 1, 15)],
  ["Numéro de compte", null, null, "Mouvements"],
  [null, null, null, "Débit", "Crédit"],
  ["70610000", null, "Transport", null, 100, null, 2500.5],
  [null, null, null, null, null, "Total classe 7", 2500.5],
  ["ACME", null, null, "Balance des comptes"],
  ["70620000", null, "Logistique", null, null, null, 800],
];
