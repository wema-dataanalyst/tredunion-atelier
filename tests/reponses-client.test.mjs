import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, etatCaTotal, colonne } from "./aide/moteur.mjs";

const etat = (reponses = [], extra = {}) => { const s = etatCaTotal({ source: "agent", question: "Le montant est-il HT ?" }, { reponses, ...extra });
  s.datasets[0].columns.push(colonne("statut")); s.datasets[0].rows = [["02/01/2025", "600", "L"], ["15/02/2025", "400", "A"]];
  s.datasets[0].questions = [{ id: "q4", text: "statut : valeurs L, A. Que signifie chacune ?", done: false, reponse_type: "codes" }, { id: "q5", text: "Export complet ?", done: false }]; return s; };
const question = (m, id) => m.run(`listeQuestions().find(q=>q.id===${JSON.stringify(id)})`);

test("type par défaut : confirmer pour une hypothèse, fichier pour un non lu, libre sinon", () => {
  const m = chargerMoteur(etat([], { nonLus: [{ societe: "s1", fichier: "x.pdf", raison: "pdf" }] }));
  assert.deepEqual(["tms.montant", "non_lu:x.pdf", "tms#q5", "tms#q4"].map(id => question(m, id).type), ["confirmer", "fichier", "libre", "codes"]);
});

test("formulaire codes : valeurs de la colonne et aperçu des données", () => {
  const q = question(chargerMoteur(etat()), "tms#q4");
  assert.equal(q.formulaire.cible, "tms.statut");
  assert.deepEqual(q.formulaire.valeurs, [{ code: "L", n: 1, libelle: "", suggestion: "" }, { code: "A", n: 1, libelle: "", suggestion: "" }]);
  assert.match(q.apercu, /2 valeurs distinctes · 0 % vides · fréquentes : L \(1\), A \(1\)/);
});

test("formulaire codes : toutes les valeurs nettoyées, puis les codes absents des données", () => {
  const s = etat(); s.datasets[0].rows = ["A", "A ", "B", "C", "D", "E", "F", "G", "H", "I", ""].map(v => ["02/01/2025", "1", v]);
  s.datasets[0].columns[2].codes = { A: "Annulée", Z: "Zéro" };
  const v = question(chargerMoteur(s), "tms#q4").formulaire.valeurs;
  assert.equal(v.length, 10);
  assert.deepEqual([v[0], v[9]], [{ code: "A", n: 2, libelle: "Annulée", suggestion: "" }, { code: "Z", n: 0, libelle: "Zéro", suggestion: "" }]);
});

test("formulaire codes : un code connu hors des 60 valeurs les plus fréquentes reste proposé, avec son compte", () => {
  const s = etat(); s.datasets[0].rows = ["A", "A", ...Array.from({ length: 61 }, (_, i) => "V" + i)].map(v => ["02/01/2025", "1", v]);
  s.datasets[0].columns[2].codes = { V60: "Soixante" };
  const v = question(chargerMoteur(s), "tms#q4").formulaire.valeurs;
  assert.deepEqual([v.length, v[0].code, v[60]], [61, "A", { code: "V60", n: 1, libelle: "Soixante", suggestion: "" }]);
});

test("réponse codes : entrée construite, puis appliquée au rechargement", () => {
  const { entree } = chargerMoteur(etat()).run("entreeReponse('tms#q4',{codes:{L:'Livrée',A:'Annulée'},exclus:['A']},'Exploitation','2026-11-12T14:03:00')");
  assert.deepEqual(entree.modifs, [{ op: "codes", cible: "tms.statut", valeur: { L: "Livrée", A: "Annulée" } }, { op: "exclure", cible: "tms", sql: "statut not in ('A')", text: "Exclure statut A" }]);
  assert.deepEqual([entree.id, entree.origine, entree.par, entree.reponse, entree.date], ["tms#q4", "client", "Exploitation", "L Livrée, A Annulée ; à exclure : A", "2026-11-12T14:03:00"]);
  const m = chargerMoteur(etat([entree]));
  assert.equal(question(m, "tms#q4").statut, "traitee");
  assert.equal(m.run("buildFaits().stats.f1.total"), 600);
});

test("réponse confirmer : l'hypothèse devient confirmée", () => {
  const { entree } = chargerMoteur(etat()).run("entreeReponse('tms.montant',{oui:true,precision:'hors péages'},'','2026-11-12T14:00:00')");
  assert.deepEqual(entree.modifs, [{ op: "valider", cible: "tms.montant", valeur: true }]);
  assert.equal(entree.reponse, "Oui. hors péages"); assert.equal("par" in entree, false);
  assert.equal(chargerMoteur(etat([entree])).run("listeHypotheses()[0].confiance"), "confirme");
});

test("réponse choix et exclure : l'option ou la condition préparée par l'agent", () => {
  const s = etat(); s.datasets[0].questions.push({ id: "q6", text: "montant : HT ou TTC ?", done: false, reponse_type: "choix", reponse_cible: "flux:f1.valeur", options: [{ libelle: "HT", valeur: "montant" }, { libelle: "TTC", valeur: "montant / 1.2" }] },
    { id: "q7", text: "Faut-il exclure les ordres annulés ?", done: false, reponse_type: "exclure", sql: "statut <> 'A'" });
  const m = chargerMoteur(s);
  assert.deepEqual(m.run("entreeReponse('tms#q6',{option:1},'','d').entree.modifs"), [{ op: "definir", cible: "flux:f1.valeur", valeur: "montant / 1.2" }]);
  assert.deepEqual(m.run("entreeReponse('tms#q7',{exclure:true},'','d').entree.modifs"), [{ op: "exclure", cible: "tms", sql: "statut <> 'A'", text: "Faut-il exclure les ordres annulés ?" }]);
  assert.deepEqual(m.run("entreeReponse('tms#q7',{exclure:false},'','d').entree.modifs"), [{ op: "noter" }]);
  assert.match(m.run("entreeReponse('tms#q6',{option:'constructor'},'','d').erreurs[0]"), /choisir une option/);
});

test("entreeReponse refuse une question inconnue, une saisie incomplète, une donnée personnelle", () => {
  const s = etat(); s.datasets[0].columns.push(colonne("nom", { pii: true })); s.datasets[0].rows.forEach(r => r.push("Durandel"));
  const m = chargerMoteur(s);
  assert.match(m.run("entreeReponse('tms#q9',{texte:'x'},'','d').erreurs[0]"), /introuvable/);
  assert.match(m.run("entreeReponse('tms.montant',{},'','d').erreurs[0]"), /oui ou non/);
  assert.match(m.run("entreeReponse('tms#q4',{codes:{}},'','d').erreurs[0]"), /table code/);
  assert.match(m.run("entreeReponse('tms#q5',{texte:'Demander à Durandel'},'','d').erreurs[0]"), /donnée personnelle/);
  assert.match(m.run("entreeReponse('tms#q5',{texte:'Oui'},'Durandel','d').erreurs[0]"), /donnée personnelle/);
  assert.deepEqual(m.run("entreeReponse('tms#q4',{autre:true,texte:'Voir avec la compta'},'','d').entree.modifs"), [{ op: "noter" }]);
});

test("la garde pii ne teste que la nouvelle entrée, pas les anciennes de la même question", () => {
  const s = etat([{ id: "tms#q5", question: "Export complet ?", reponse: "Voir Durandel", date: "d0", modifs: [{ op: "noter" }] }]);
  s.datasets[0].columns.push(colonne("nom", { pii: true })); s.datasets[0].rows.forEach(r => r.push("Durandel"));
  const m = chargerMoteur(s);
  assert.equal(m.run("entreeReponse('tms#q5',{texte:'Oui, complet'},'','d').entree.reponse"), "Oui, complet");
  assert.match(m.run("entreeReponse('tms#q5',{texte:'Demander à Durandel'},'','d').erreurs[0]"), /donnée personnelle/);
});

test("une question dont la réponse est orpheline le signale", () => {
  const q = question(chargerMoteur(etat([{ id: "tms#q4", question: "statut : valeurs L, A. Que signifie chacune ?", reponse: "r", date: "d", modifs: [{ op: "codes", cible: "tms.disparue", valeur: { L: "x" } }] }])), "tms#q4");
  assert.deepEqual([q.statut, q.orpheline], ["traitee", true]);
});

test("formulaire codes : libellé suggéré par une autre colonne texte, seulement s'il est sans ambiguïté", () => {
  const s = etat(); s.datasets[0].columns.push(colonne("libelle"));
  s.datasets[0].rows = [["L", "Livrée"], ["L", "Livrée"], ["A", "Annulée"], ["A", "Annulée"], ["R", "Refusée"], ["R", "Autre"]].map(([c, l]) => ["02/01/2025", "1", c, l]);
  const fo = question(chargerMoteur(s), "tms#q4").formulaire;
  assert.deepEqual(fo.valeurs.map(v => [v.code, v.suggestion]), [["L", "Livrée"], ["A", "Annulée"], ["R", ""]]);
  assert.equal(fo.suggestionDe, "libelle");
});

test("formulaire codes : une colonne de dates ou unique n'est jamais une suggestion", () => {
  const fo = question(chargerMoteur(etat()), "tms#q4").formulaire;
  assert.deepEqual([fo.valeurs.map(v => v.suggestion), fo.suggestionDe], [["", ""], undefined]);
});

test("titre clair : la question de profil est reformulée sans jargon, un titre de la maquette l'emporte", () => {
  const q = question(chargerMoteur(etat()), "tms#q4");
  assert.match(q.titre, /^Que représente chacune de ces 2 valeurs \?$/);
  assert.match(q.intro, /votre fichier « Tms » , colonne « statut »|colonne « statut »/);
  const s = etat(); s.datasets[0].questions[0].titre = "Que veut dire chaque statut d'ordre ?"; s.datasets[0].questions[0].contexte = "Export du TMS.";
  const q2 = question(chargerMoteur(s), "tms#q4"); assert.deepEqual([q2.titre, q2.intro], ["Que veut dire chaque statut d'ordre ?", "Export du TMS."]);
});
