import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, etatCaTotal, colonne } from "./aide/moteur.mjs";

const etat = (hypothese = { source: "agent", question: "Le montant est-il HT ?" }, extra = {}) => {
  const s = etatCaTotal(hypothese, extra);
  s.datasets[0].questions = [
    { id: "q1", text: "montant : valeurs négatives, avoirs ?", done: false },
    { id: "q2", text: "date_chgt : date réelle ou prévue ?", done: true, answer: "Date de chargement réelle" },
    { id: "q3", text: "Export complet ?", done: false },
  ];
  return s;
};
const liste = s => chargerMoteur(s).run("listeQuestions()");
const par = (l, id) => l.find(q => q.id === id);

test("la liste rassemble questions de profil et hypothèses, avec élément, lot et impact", () => {
  const l = liste(etat()).filter(q => q.lot !== "besoins");
  assert.deepEqual(l.map(q => q.id), ["tms.montant", "tms#q1", "tms#q3", "tms#q2"]);
  assert.deepEqual(par(l, "tms#q1"), { ...par(l, "tms#q1"), source: "profil", lot: "tms", element: "tms.montant", fichier: "spec/datasets/tms.yml", statut: "ouverte", mesures: ["CA Réel"] });
  assert.equal(par(l, "tms#q3").element, "tms");
  assert.deepEqual(par(l, "tms.montant").mesures, ["CA Réel"]);
  assert.equal(par(l, "tms.montant").source, "hypothese");
});

test("une question traitée garde sa réponse, depuis la source ou depuis le registre", () => {
  assert.equal(par(liste(etat()), "tms#q2").reponse, "Date de chargement réelle");
  const v = par(liste(etat({ source: "agent", question: "HT ?", valide: true, reponse: "Oui, HT" })), "tms.montant");
  assert.deepEqual([v.statut, v.reponse], ["traitee", "Oui, HT"]);
  const r = par(liste(etat(undefined, { reponses: [{ id: "tms.montant", reponse: "HT", date: "2026-11-07T10:00:00", effet: "montant confirmé" }] })), "tms.montant");
  assert.deepEqual([r.statut, r.reponse, r.date, r.effet], ["traitee", "HT", "2026-11-07T10:00:00", "montant confirmé"]);
});

test("une réponse du registre dont la question a disparu reste listée", () => {
  const o = par(liste(etat(undefined, { reponses: [{ id: "flux:f9", question: "Ancienne question", element: "flux:f9", reponse: "Oui", date: "2026-11-07T09:00:00" }] })), "flux:f9");
  assert.deepEqual([o.statut, o.question, o.reponse, o.retiree, o.source], ["traitee", "Ancienne question", "Oui", true, "registre"]);
});

test("une réponse dont le texte de question diffère ne se greffe pas et reste listée comme retirée", () => {
  const l = liste(etat(undefined, { reponses: [{ id: "tms#q1", question: "Autre texte", reponse: "R", date: "2026-11-07" }] }));
  assert.equal(l.find(q => q.id === "tms#q1" && q.source === "profil").statut, "ouverte");
  assert.ok(l.some(q => q.id === "tms#q1" && q.source === "registre" && q.retiree && q.reponse === "R"));
});

test("deux réponses pour la même question : la dernière se greffe, les précédentes forment l'historique", () => {
  const l = liste(etat(undefined, { reponses: [{ id: "tms.montant", reponse: "A", date: "2026-11-07", par: "Compta" }, { id: "tms.montant", reponse: "B", date: "2026-11-08" }] }));
  const q = l.find(q => q.id === "tms.montant");
  assert.deepEqual([q.reponse, q.historique], ["B", [{ reponse: "A", date: "2026-11-07", par: "Compta" }]]);
  assert.ok(!l.some(q => q.retiree));
});

test("le compteur de questions ouvertes du résumé est celui de la liste", () => {
  const m = chargerMoteur(etat());
  assert.equal(m.run("summary().questionsOuvertes"), m.run("listeQuestions().filter(q=>q.statut==='ouverte').length"));
});

test("contrôles en écart, fichiers non lus et valeurs hors recette sont des questions", () => {
  const s = etat(undefined, { controles: [{ id: "c1", type: "mensuel", libelle: "Dates", ds: "tms", date: "", porte_sur: ["tms.montant"] }],
    nonLus: [{ societe: "s1", fichier: "Péage/x.pdf", raison: "format .pdf non pris en charge" }] });
  s.datasets[0].meta = { hors_recette: 3 };
  const l = liste(s);
  assert.deepEqual([par(l, "controle:c1").lot, par(l, "controle:c1").statut, par(l, "controle:c1").mesures], ["tms", "ouverte", ["CA Réel"]]);
  assert.equal(par(l, "non_lu:Péage/x.pdf").lot, "fichiers");
  assert.equal(par(l, "hors_recette:tms").source, "hors_recette");
  s.controles[0].reponse = "Normal, bloc annuel";
  assert.deepEqual([par(liste(s), "controle:c1").statut, par(liste(s), "controle:c1").reponse], ["traitee", "Normal, bloc annuel"]);
});

test("une réponse à un contrôle se greffe par id, même si le texte de la question a changé", () => {
  const l = liste(etat(undefined, { controles: [{ id: "c1", type: "mensuel", libelle: "Dates", ds: "tms", date: "" }], reponses: [{ id: "controle:c1", question: "Dates : 3 mois", reponse: "Normal", date: "2026-11-07" }] }));
  assert.deepEqual([par(l, "controle:c1").statut, par(l, "controle:c1").reponse], ["traitee", "Normal"]);
  assert.ok(!l.some(q => q.retiree));
});

test("lot = domaine du dataset ; une hypothèse de flux prend le domaine de son dataset", () => {
  const m = chargerMoteur(etat());
  assert.equal(m.run("lotDe('carburant_cofi_table1')"), "carburant");
  assert.equal(m.run("datasetDe('flux:f1#7061')"), "tms");
  assert.equal(m.run("datasetDe('DIM_SITE.%LIB_SITE')"), null);
});

const check = s => chargerMoteur(s).run("checkSpec()");

test("le registre doit être une liste d'entrées avec id et réponse", () => {
  assert.ok(check(etat(undefined, { reponses: { id: "x" } })).some(f => f.niv === "erreur" && /reponses\.yml doit être une liste/.test(f.msg)));
  assert.ok(check(etat(undefined, { reponses: [{ id: "tms#q1" }] })).some(f => f.niv === "alerte" && /tms#q1.*reponse manquant/.test(f.msg)));
});

test("la garde pii couvre questions de profil, réponses du registre, des hypothèses et des contrôles", () => {
  const st = extra => { const s = etat({ source: "agent", reponse: extra.hyp || "" }, extra.ex || {}); s.datasets[0].columns.push(colonne("nom", { pii: true })); s.datasets[0].rows = [["02/01/2025", "600", "Durandel"]]; return s; };
  const pii = (s, cible) => { const f = check(s).filter(x => x.niv === "erreur" && /personnelle/.test(x.msg)); assert.ok(f.some(x => cible.test(x.msg)), cible); assert.ok(f.every(x => !x.msg.includes("Durandel"))); };
  const q = st({}); q.datasets[0].questions[0].text = "nom : valeurs Durandel"; pii(q, /tms#q1/);
  pii(st({ ex: { reponses: [{ id: "tms#q1", reponse: "Durandel est intérimaire", date: "2026-11-07" }] } }), /reponse:tms#q1/);
  pii(st({ hyp: "Seul Durandel" }), /tms\.montant/);
  pii(st({ ex: { controles: [{ id: "c1", type: "mensuel", libelle: "Dates", ds: "tms", date: "", reponse: "voir Durandel" }] } }), /controle:c1/);
  const fuite = st({ ex: { reponses: [{ id: "flux:f9", question: "Durandel ?", reponse: "Durandel", effet: "Durandel", date: "2026-11-07" }] } });
  fuite.datasets[0].questions[0].text = "nom : valeurs Durandel"; fuite.datasets[0].questions[1].answer = "Durandel";
  const l = liste(fuite);
  assert.ok(!JSON.stringify(l).includes("Durandel"));
  assert.match(par(l, "tms#q1").question, /texte masqué/);
  assert.match(par(l, "tms#q2").reponse, /réponse masquée/);
  const sql = st({ ex: { reponses: [{ id: "tms#q3", reponse: "Oui", date: "2026-11-07", modifs: [{ op: "exclure", cible: "tms", sql: "nom <> 'Durandel'" }] }] } });
  Object.assign(sql.datasets[0].questions[0], { reponse_type: "exclure", sql: "nom = 'Durandel'" });
  pii(sql, /tms#q1/); pii(sql, /reponse:tms#q3/);
  const opt = st({}); opt.datasets[0].questions[0].options = [{ libelle: "Durandel", valeur: "montant" }]; pii(opt, /tms#q1/);
  const hyp = st({}); hyp.datasets[0].columns[1].hypothese.options = [{ libelle: "Personne", valeur: "Durandel" }]; pii(hyp, /tms\.montant/);
  const hsql = st({}); hsql.datasets[0].columns[1].hypothese.sql = "nom = 'Durandel'"; pii(hsql, /tms\.montant/);
});

test("check signale les formulaires inutilisables", () => {
  const s = etat(); Object.assign(s.datasets[0].questions[0], { reponse_type: "choix", reponse_cible: "flux:f1.rules", options: [{ libelle: "Vide", valeur: [] }] });
  Object.assign(s.datasets[0].questions[2], { reponse_type: "exclure", sql: "montant ~ 3" });
  const f = check(s).filter(x => x.niv === "alerte" && /formulaire inutilisable/.test(x.msg));
  assert.deepEqual(f.map(x => [x.fichier, /tms#q1/.test(x.msg), /tms#q3/.test(x.msg)]), [["spec/datasets/tms.yml", true, false], ["spec/datasets/tms.yml", false, true]]);
  const codes = etat(); Object.assign(codes.datasets[0].questions[0], { reponse_type: "codes", reponse_cible: "tms.disparue" });
  assert.ok(check(codes).some(x => /formulaire inutilisable/.test(x.msg) && /tms#q1/.test(x.msg)));
});
