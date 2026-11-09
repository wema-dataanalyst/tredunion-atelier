// tests/besoins.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { racineExemple } from "./aide/racine.mjs";
import { chargerMoteur, CATALOGUE } from "./aide/moteur.mjs";

test("lecture de besoins.yml", async () => {
  const racine = racineExemple();
  fs.mkdirSync(path.join(racine, "spec"), { recursive: true });
  fs.writeFileSync(path.join(racine, "spec/besoins.yml"), YAML.stringify({
    themes: [{ id: "ca", choisi: true }, { id: "marge", choisi: false }],
    libres: [{ text: "taux de sinistralité" }]
  }));
  const { ouvrirEspace } = await import("../tools/espace.mjs");
  const esp = ouvrirEspace(racine);
  assert.deepEqual(esp.besoins.themes, [{ id: "ca", choisi: true }, { id: "marge", choisi: false }]);
  assert.deepEqual(esp.besoins.libres, [{ text: "taux de sinistralité" }]);
});

test("besoins.yml absent → défaut vide", async () => {
  const racine = racineExemple();
  fs.mkdirSync(path.join(racine, "spec"), { recursive: true });
  const { ouvrirEspace } = await import("../tools/espace.mjs");
  const esp = ouvrirEspace(racine);
  assert.deepEqual(esp.besoins, { themes: [], libres: [] });
});

test("THEMES liste les feuilles avec leurs mesures", () => {
  const m = chargerMoteur({ catalogue: CATALOGUE });
  const themes = m.run("THEMES()");
  assert.ok(themes.length >= 6);
  const ca = themes.find(t => t.id === "accueil");
  assert.ok(ca);
  assert.ok(ca.mesures.includes("CA Réel"));
});

test("mesuresTheme retourne les mesures d'un thème", () => {
  const m = chargerMoteur({ catalogue: CATALOGUE });
  const mesures = m.run("mesuresTheme('accueil')");
  assert.ok(mesures.includes("CA Réel"));
  assert.ok(mesures.includes("Budget"));
});

test("mesures d'un thème non coché sont hors périmètre", () => {
  const m = chargerMoteur({
    catalogue: CATALOGUE,
    besoins: { themes: [{ id: "accueil", choisi: false }], libres: [] }
  });
  const hors = m.run("[...horsPerimetre()]");
  assert.ok(hors.includes("CA Réel"));
  assert.ok(hors.includes("Budget"));
});

test("mesures d'un thème coché ne sont pas hors", () => {
  const m = chargerMoteur({
    catalogue: CATALOGUE,
    besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] }
  });
  const hors = m.run("[...horsPerimetre()]");
  assert.ok(!hors.includes("CA Réel"));
});

test("sans besoins.yml, rien n'est exclu par thème", () => {
  const m = chargerMoteur({ catalogue: CATALOGUE });
  const hors = m.run("[...horsPerimetre()]");
  assert.ok(!hors.includes("CA Réel"));
});

test("lot besoins génère une question par thème non tranché", () => {
  const m = chargerMoteur({ catalogue: CATALOGUE, besoins: { themes: [], libres: [] } });
  const qs = m.run("questions().filter(q => q.lot === 'besoins')");
  assert.ok(qs.length >= 6);
  assert.ok(qs.some(q => q.id === "theme:accueil"));
});

test("thème déjà choisi → pas de question", () => {
  const m = chargerMoteur({
    catalogue: CATALOGUE,
    besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] }
  });
  const qs = m.run("questions().filter(q => q.id === 'theme:accueil')");
  assert.equal(qs.length, 0);
});

test("opération classer modifie une règle de flux", () => {
  const m = chargerMoteur({
    flux: [{
      id: "f1", ds: "tms", codMode: "regles", codCol: "compte",
      rules: [{ prefix: "706", cod: "CA TPS", lib: "CA transport" }],
      valeur: "montant", agg: "sum", champ: "MontantReel", unite: "€", date: "date"
    }],
    reponses: [{
      id: "r1",
      reponse: "r",
      date: "2026-11-08",
      modifs: [{
        cible: "flux:f1.rules[0]",
        op: "classer",
        valeur: { cod: "CA LOC", lib: "CA location", nouveau: false }
      }]
    }]
  });
  const flux = m.run("S.st.flux.find(f => f.id === 'f1')");
  assert.equal(flux.rules[0].cod, "CA LOC");
  assert.equal(flux.rules[0].lib, "CA location");
});

test("opération classer modifie un flux codMode fixe", () => {
  const m = chargerMoteur({
    flux: [{
      id: "f2", ds: "tms", codMode: "fixe", cod: "CA TPS", lib: "CA transport",
      valeur: "montant", agg: "sum", champ: "MontantReel", unite: "€", date: "date"
    }],
    reponses: [{
      id: "r2",
      reponse: "r",
      date: "2026-11-08",
      modifs: [{
        cible: "flux:f2",
        op: "classer",
        valeur: { cod: "CA LOC", lib: "CA location", nouveau: false }
      }]
    }]
  });
  const flux = m.run("S.st.flux.find(f => f.id === 'f2')");
  assert.equal(flux.cod, "CA LOC");
  assert.equal(flux.lib, "CA location");
});

test("check signale un thème coché sans mesure alimentée", () => {
  const m = chargerMoteur({
    catalogue: CATALOGUE,
    besoins: { themes: [{ id: "accueil", choisi: true }], libres: [] },
    flux: [] // aucun flux → aucune mesure alimentée
  });
  const errs = m.run("check()");
  assert.ok(errs.some(e => e.niveau === "erreur" && e.message.includes("accueil") && e.message.includes("aucune mesure")));
});

test("check signale un besoin libre sans proposition", () => {
  const m = chargerMoteur({
    catalogue: CATALOGUE,
    besoins: { themes: [], libres: [{ text: "taux de sinistralité" }] },
    propositions: []
  });
  const errs = m.run("check()");
  assert.ok(errs.some(e => e.niveau === "alerte" && e.message.includes("sinistralité")));
});
