import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, etatCaTotal } from "./aide/moteur.mjs";

test("la fiche classe les hypothèses à valider et liste les fichiers non lus", () => {
  const md = chargerMoteur(etatCaTotal({ source: "agent", preuves: ["somme 2025 : 1 000 €"], question: "Le montant des ordres est-il HT ?" },
    { nonLus: [{ societe: "s1", fichier: "Péage/export.pdf", raison: "format .pdf non pris en charge" }] })).run("ficheSeanceMd()");
  assert.match(md, /## 1\. Le montant des ordres est-il HT \?/);
  assert.match(md, /Mesures concernées \(1\) : CA Réel/);
  assert.match(md, /Preuve : somme 2025 : 1 000 €/);
  assert.match(md, /Péage\/export\.pdf/);
});

test("la fiche exclut les hypothèses confirmées", () => {
  assert.match(chargerMoteur(etatCaTotal({ source: "agent", valide: true })).run("ficheSeanceMd()"), /0 point à valider/);
});

test("le build produit la fiche", () => {
  assert.ok(chargerMoteur(etatCaTotal({ source: "agent" })).run("buildFiles().map(f=>f.path)").includes("fiche_seance.md"));
});

test("la fiche liste les valeurs hors recette, par dataset, seulement s'il y en a", () => {
  const st = etatCaTotal({ source: "agent" });
  st.datasets[0].meta = { hors_recette: 3 };
  assert.match(chargerMoteur(st).run("ficheSeanceMd()"), /## Valeurs hors recette\n\n- tms : 3/);
  st.datasets[0].meta = { hors_recette: 0 };
  assert.doesNotMatch(chargerMoteur(st).run("ficheSeanceMd()"), /hors recette/);
});
