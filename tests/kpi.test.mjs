import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, CATALOGUE, etatCaTotal } from "./aide/moteur.mjs";

test("questionsKpi retourne les questions du thème coché avec données", () => {
  const base = etatCaTotal();
  // Flux avec plusieurs règles pour déclencher kpi:activites
  base.flux = [{
    id: "f1", ds: "compta", codMode: "regles", codCol: "compte",
    rules: [{ prefix: "7061", cod: "CA TPS", lib: "CA transport" }, { prefix: "7062", cod: "CA AFF", lib: "CA affrètement" }],
    valeur: "montant", agg: "sum", champ: "MontantReel", unite: "€", date: "date"
  }];
  const m = chargerMoteur({ ...base, besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] } });
  const qs = m.run("questionsKpi()");
  assert.ok(qs.length >= 1);
  assert.ok(qs.some(q => q.theme === "accueil"));
});

test("questionsKpi ne retourne rien si thème non coché", () => {
  const m = chargerMoteur({
    ...etatCaTotal(),
    besoins: { themes: [{ id: "accueil", choisi: false }], libres: [] }
  });
  const qs = m.run("questionsKpi()");
  assert.equal(qs.filter(q => q.theme === "accueil").length, 0);
});

test("questionsKpi ne retourne rien si pas de données pour le thème", () => {
  const m = chargerMoteur({
    besoins: { themes: [{ id: "masse", choisi: true }], libres: [] },
    flux: [] // pas de flux paie
  });
  const qs = m.run("questionsKpi()");
  assert.equal(qs.filter(q => q.theme === "masse").length, 0);
});

test("lot kpi apparaît dans questions()", () => {
  const base = etatCaTotal();
  base.flux = [{
    id: "f1", ds: "compta", codMode: "regles", codCol: "compte",
    rules: [{ prefix: "7061", cod: "CA TPS" }, { prefix: "7062", cod: "CA AFF" }],
    valeur: "montant", agg: "sum", champ: "MontantReel", unite: "€", date: "date"
  }];
  const m = chargerMoteur({ ...base, besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] } });
  const qs = m.run("questions().filter(q => q.lot === 'kpi')");
  assert.ok(qs.length >= 1);
});

test("opération kpi ne plante pas (propositions vides pour l'instant)", () => {
  const base = etatCaTotal();
  base.flux = [{
    id: "f1", ds: "compta", codMode: "regles", codCol: "compte",
    rules: [{ prefix: "7061", cod: "CA TPS" }, { prefix: "7062", cod: "CA AFF" }],
    valeur: "montant", agg: "sum", champ: "MontantReel", unite: "€", date: "date"
  }];
  const m = chargerMoteur({
    ...base,
    besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] },
    reponses: [{
      id: "kpi:activites",
      modifs: [{ op: "kpi", cible: "kpi:activites", valeur: "Transport et affrètement séparés" }]
    }]
  });
  const props = m.run("S.st.propositions || []");
  assert.ok(Array.isArray(props));
});

test("check signale une proposition KPI sans flux", () => {
  const m = chargerMoteur({
    besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] },
    propositions: [{
      id: "p1", codes: [{ cod: "CA TEST" }], mesures: [],
      hypothese: { source: "kpi:activites", valide: true }
    }],
    flux: []
  });
  const errs = m.run("check()");
  assert.ok(Array.isArray(errs));
  // On vérifie qu'il y a au moins une alerte sur p1
  assert.ok(errs.some(e => e.niveau === "alerte" && e.message.includes("p1")));
});
