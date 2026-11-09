import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, etatCaTotal, colonne } from "./aide/moteur.mjs";

// Chaque appel construit un état neuf : hydrate modifie les objets reçus.
const etat = (reponses = []) => { const s = etatCaTotal({ source: "agent", question: "Le montant est-il HT ?" }, { reponses });
  s.datasets[0].columns.push(colonne("statut")); s.datasets[0].rows = [["02/01/2025", "600", "L"], ["15/02/2025", "400", "A"]]; return s; };
const entree = (id, modifs, extra = {}) => ({ id, reponse: "r", date: "2026-11-12T14:00:00", origine: "client", modifs, ...extra });

test("valider confirme l'hypothèse ciblée", () => {
  const m = chargerMoteur(etat([entree("tms.montant", [{ op: "valider", cible: "tms.montant", valeur: true }], { reponse: "Oui, HT" })]));
  assert.deepEqual(m.run("[listeHypotheses()[0].confiance, listeHypotheses()[0].reponse]"), ["confirme", "Oui, HT"]);
});

test("codes et exclure s'appliquent au silver et à FAITS", () => {
  const m = chargerMoteur(etat([entree("tms#q4", [{ op: "codes", cible: "tms.statut", valeur: { L: "Livrée", A: "Annulée" } }, { op: "exclure", cible: "tms", sql: "statut <> 'A'", text: "Exclure les annulées" }])]));
  assert.equal(m.run("silverRows(DS('tms')).dropped"), 1);
  assert.equal(m.run("silverRows(DS('tms')).rows[0].statut_libelle"), "Livrée");
  assert.equal(m.run("buildFaits().stats.f1.total"), 600);
});

test("definir change un champ de flux", () => {
  assert.equal(chargerMoteur(etat([entree("flux:f1", [{ op: "definir", cible: "flux:f1.valeur", valeur: "montant / 2" }])])).run("buildFaits().stats.f1.total"), 500);
});

test("la dernière entrée d'une question l'emporte", () => {
  const m = chargerMoteur(etat([entree("tms#q4", [{ op: "codes", cible: "tms.statut", valeur: { L: "Livrée" } }]), entree("tms#q4", [{ op: "codes", cible: "tms.statut", valeur: { L: "Chargée" } }])]));
  assert.deepEqual(m.run("DS('tms').columns.find(c=>c.name==='statut').codes"), { L: "Chargée" });
});

test("la réponse la plus récente l'emporte sur toute cible", () => {
  const m = chargerMoteur(etat([
    entree("tms#q4", [{ op: "codes", cible: "tms.statut", valeur: { L: "Livrée" } }]),
    entree("tms.statut", [{ op: "codes", cible: "tms.statut", valeur: { L: "Chargée" } }]),
    entree("tms#q4", [{ op: "codes", cible: "tms.statut", valeur: { L: "Refusée" } }]),
  ]));
  assert.deepEqual(m.run("DS('tms').columns.find(c=>c.name==='statut').codes"), { L: "Refusée" });
});

test("une entrée plus récente sans modifs masque les modifs d'une entrée plus ancienne", () => {
  const m = chargerMoteur(etat([entree("tms#q4", [{ op: "codes", cible: "tms.statut", valeur: { L: "Livrée" } }]), entree("tms#q4", undefined)]));
  assert.equal(m.run("DS('tms').columns.find(c=>c.name==='statut').codes"), null);
});

test("une modification écrite à la main est revalidée au chargement : orpheline, sans effet", () => {
  const m = chargerMoteur(etat([
    entree("a", [{ op: "definir", cible: "tms.statut.pii", valeur: true }]),
    entree("b", [{ op: "definir", cible: "flux:f1.rules", valeur: [] }]),
    entree("c", [{ op: "codes", cible: "tms.statut", valeur: "L" }]),
    entree("d", [{ op: "definir", cible: "tms.date_chgt.format", valeur: "DD/MM/YYYY'); drop" }]),
    entree("e", [null, "x", { op: "valider", cible: {} }, { op: "exclure", cible: "tms", sql: 42 }]),
  ]));
  assert.deepEqual(m.run("[...new Set(S.st._orphelines.map(o=>o.id))]"), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(m.run("DS('tms').columns.map(c=>[c.pii,c.codes,c.format])"), [[false, null, ""], [false, null, ""], [false, null, ""]]);
  assert.equal(m.run("FX('f1').rules.length"), 0);
});

test("le chargement ne lève jamais : id non scalaire ignoré, modification illisible orpheline", () => {
  const m = chargerMoteur(etat([entree("a", [{ op: "codes", cible: { toString: 1 }, valeur: { L: "x" } }]), entree({ toString: 1 }, [{ op: "noter" }])]));
  assert.deepEqual(m.run("S.st._orphelines.map(o=>[o.id,o.msg])"), [["a", "modification illisible"]]);
  assert.ok(Array.isArray(m.run("listeQuestions()")));
  assert.ok(Array.isArray(m.run("checkSpec()")));
});

test("orphelines et formulaires inutilisables ne recopient pas la valeur saisie", () => {
  const s = etat([entree("a", [{ op: "definir", cible: "tms.date_chgt.format", valeur: "DD 'Durandel'" }]), entree("b", [{ op: "exclure", cible: "tms", sql: "nom ~ Durandel" }])]);
  s.datasets[0].columns.push(colonne("nom", { pii: true })); s.datasets[0].rows.forEach(r => r.push("Durandel"));
  s.datasets[0].questions = [{ id: "q1", text: "Unité ?", done: false, reponse_type: "choix", reponse_cible: "flux:f1.unite", options: [{ libelle: "Personne", valeur: "durandel" }] }];
  const m = chargerMoteur(s), f = m.run("checkSpec()");
  assert.deepEqual(m.run("S.st._orphelines.map(o=>o.id)"), ["a", "b"]);
  assert.ok(f.some(x => /formulaire inutilisable/.test(x.msg)));
  assert.ok(!JSON.stringify([f, m.run("S.st._orphelines")]).toLowerCase().includes("durandel"));
});

test("une modification dont la cible a disparu est une réponse orpheline", () => {
  const f = chargerMoteur(etat([entree("tms#q4", [{ op: "codes", cible: "tms.disparue", valeur: { L: "Livrée" } }])])).run("checkSpec()");
  assert.ok(f.some(x => x.niv === "alerte" && x.fichier === "spec/reponses.yml" && /réponse orpheline tms#q4/.test(x.msg)));
});

test("erreursModifs refuse les opérations et les champs hors liste", () => {
  const m = chargerMoteur(etat());
  const e = js => m.run(`erreursModifs(${js})`);
  assert.match(e("[{op:'supprimer'}]")[0], /opération inconnue/);
  assert.match(e("[{op:'definir',cible:'flux:f1.note',valeur:'x'}]")[0], /non modifiable/);
  assert.match(e("[{op:'definir',cible:'flux:f1.champ',valeur:'Autre'}]")[0], /champ inconnu/);
  assert.match(e("[{op:'valider',cible:'tms.montant',valeur:'oui'}]")[0], /true ou false/);
  assert.match(e("[{op:'exclure',cible:'tms',sql:'statut ~ 1'}]")[0], /condition non reconnue/);
  assert.match(e("[{op:'codes',cible:'tms.statut',valeur:{}}]")[0], /table code/);
  assert.match(e("[]")[0], /aucune modification/);
  assert.deepEqual(e("[{op:'codes',cible:'tms.statut',valeur:{L:'Livrée'}},{op:'definir',cible:'tms.montant.decimalComma',valeur:true},{op:'noter'}]"), []);
});
