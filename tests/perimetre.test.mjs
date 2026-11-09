import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import YAML from "yaml";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";
import { chargerMoteur, etatCaTotal } from "./aide/moteur.mjs";

const CATALOGUE = "CA Réel\n    Sum({<[%COD_CATEGORIE]={'CA TOTAL'}>} MontantReel)\n\nGazole\n    Sum({<[%COD_CATEGORIE]={'GO'}>} MontantReel)\n\nPart gazole\n    [Gazole] / [CA Réel]\n";
const groupe = (valide, refuse = false) => ({ id: "g1", cause: "Pas de carburant", mesures: ["Gazole"], titre: "Retirer le gazole ?", contexte: "Aucune donnée.", hypothese: { source: "agent", preuves: ["Aucune ligne GO"], question: "Le gazole ne s'applique pas ?", valide, refuse } });
const moteur = (perimetre) => chargerMoteur(etatCaTotal(undefined, { catalogue: CATALOGUE, ...(perimetre ? { perimetre } : {}) }));
const noms = m => m.run("[...horsPerimetre()].sort()");

test("sans perimetre, aucune mesure n'est hors périmètre", () => {
  assert.deepEqual(noms(moteur()), []);
});

test("un groupe proposé ne retire rien", () => {
  assert.deepEqual(noms(moteur([groupe(false)])), []);
});

test("un groupe refusé ne retire rien", () => {
  assert.deepEqual(noms(moteur([groupe(false, true)])), []);
});

test("un groupe validé retire ses mesures et celles qui en dépendent", () => {
  assert.deepEqual(noms(moteur([groupe(true)])), ["Gazole", "Part gazole"]);
});

test("une dépendance circulaire ne boucle pas", () => {
  const circ = "A\n    [B] + 1\n\nB\n    [A] + 1\n";
  const m = chargerMoteur(etatCaTotal(undefined, { catalogue: circ, perimetre: [{ ...groupe(true), mesures: ["A"] }] }));
  assert.deepEqual(noms(m), ["A", "B"]);
});

test("statutMesure et measureCounts : hors sort du total", () => {
  const m = moteur([groupe(true)]);
  assert.equal(m.run("statutMesure(CAT().resolve('Gazole'))"), "hors");
  assert.equal(m.run("statutMesure(CAT().resolve('CA Réel'))"), "ok");
  const c = m.run("measureCounts()");
  assert.equal(c.hors, 2);
  assert.equal(c.ok + c.part + c.none + c.err + c.hors, 3);
});

test("filtrerFeuilles : objet vide retiré, objet partiel gardé, feuille vide retirée", () => {
  const sheets = [
    { id: "a", title: "A", objs: [
      { t: "kb", items: [{ m: "X" }, { m: "Y" }] },
      { t: "chart", measures: [{ m: "X" }] },
      { t: "gauge", m: "X" },
      { t: "costdonut" },
    ] },
    { id: "b", title: "B", objs: [{ t: "pie", measures: [{ m: "X" }] }] },
  ];
  const r = moteur().run(`filtrerFeuilles(${JSON.stringify(sheets)}, n => n === "X")`);
  assert.deepEqual(r.map(s => s.id), ["a"]);
  assert.deepEqual(r[0].objs, [{ t: "kb", items: [{ m: "Y" }] }, { t: "costdonut" }]);
});

const docSeance = m => m.run(`buildFiles().find(f => f.path === "docs/seance.md").body`);

const CAT_DOUBLON =
  "CA Réel\n    Sum({<[%COD_CATEGORIE]={'CA TOTAL'}>} MontantReel)\n\nGazole\n    Sum({<[%COD_CATEGORIE]={'GO'}>} MontantReel)\n\nX\n    Sum({<[%COD_CATEGORIE]={'CA TOTAL'}>} MontantReel)\n\nX\n    [Gazole] + 1\n\nY\n    [X]\n";

test("doublon de nom : toute définition d'un nom hors est hors", () => {
  const m = chargerMoteur(etatCaTotal(undefined, { catalogue: CAT_DOUBLON, perimetre: [{ ...groupe(true), mesures: ["Gazole"] }] }));
  assert.deepEqual(noms(m), ["Gazole", "X", "Y"]);
});

test("cycle non trivial : point fixe par nom, Z ancré sur les faits", () => {
  const circ =
    "C\n    [D] + [Z]\n\nD\n    [C]\n\nZ\n    Sum({<[%COD_CATEGORIE]={'GO'}>} MontantReel)\n";
  const m = chargerMoteur(etatCaTotal(undefined, { catalogue: circ, perimetre: [{ ...groupe(true), id: "gz", mesures: ["Z"], cause: "Retirer Z", titre: "?", contexte: "—" }] }));
  assert.deepEqual(noms(m), ["C", "D", "Z"]);
});

test("casse : nom de groupe en minuscules résolu sur le catalogue", () => {
  const m = moteur([{ ...groupe(true), mesures: ["gazole"] }]);
  assert.deepEqual(noms(m), ["Gazole", "Part gazole"]);
});

test("filtrerFeuilles ne modifie pas ses entrées", () => {
  const sheets = [
    { id: "a", title: "A", objs: [{ t: "gauge", m: "Gazole" }] },
  ];
  const avant = JSON.parse(JSON.stringify(sheets));
  moteur([groupe(true)]).run(`filtrerFeuilles(${JSON.stringify(sheets)}, n => horsPerimetre().has(n))`);
  assert.deepEqual(sheets, avant);
});

test("sessionMd : sans périmètre validé, synthèse couverture inchangée", () => {
  const body = docSeance(moteur());
  const bloc = body.split("## Couverture du catalogue de mesures")[1]?.split("##")[0] ?? "";
  assert.ok(!/hors périmètre/i.test(bloc.split("| Mesure")[0]));
  assert.ok(!bloc.includes("| Hors périmètre |"));
});

test("sessionMd : avec périmètre validé, hors périmètre dans la synthèse et le tableau", () => {
  const body = docSeance(moteur([groupe(true)]));
  const bloc = body.split("## Couverture du catalogue de mesures")[1]?.split("##")[0] ?? "";
  assert.match(bloc.split("| Mesure")[0], /hors périmètre/i);
  assert.match(bloc, /\| Gazole \| Hors périmètre \|/);
});

const liste = m => m.run("listeQuestions()");
const constats = m => m.run("checkSpec()").filter(c => c.fichier === "spec/perimetre.yml");

test("un groupe est une question de l'adhérent, avec le titre et le contexte du groupe", () => {
  const q = liste(moteur([groupe(false)])).find(x => x.id === "perimetre:g1");
  assert.deepEqual([q.source, q.lot, q.fichier, q.statut, q.type], ["hypothese", "adherent", "spec/perimetre.yml", "ouverte", "confirmer"]);
  assert.equal(q.titre, "Retirer le gazole ?");
  assert.equal(q.intro, "Aucune donnée.");
});

test("le lot adherent passe en tête quand un groupe est ouvert", () => {
  const s = etatCaTotal(undefined, { catalogue: CATALOGUE, perimetre: [groupe(false)] });
  s.datasets[0].questions = [{ id: "q1", text: "montant : valeurs négatives, avoirs ?", done: false }];
  assert.equal(liste(chargerMoteur(s))[0].id, "perimetre:g1");
});

test("check : id manquant, id en double, cause vide, hypothèse absente, mesure inconnue", () => {
  const g = (o) => ({ ...groupe(false), ...o });
  const c = constats(moteur([g({ id: "" }), g({ id: "g2" }), g({ id: "g2" }), g({ id: "g3", cause: "" }), g({ id: "g4", hypothese: null }), g({ id: "g5", mesures: ["Inconnue"] })]));
  const msgs = c.map(x => `${x.niv}:${x.msg}`);
  assert.ok(msgs.some(m => /^erreur:.*id manquant/.test(m)), msgs.join("\n"));
  assert.ok(msgs.some(m => /^erreur:.*g2.*en double/.test(m)));
  assert.ok(msgs.some(m => /^erreur:.*g3.*cause manquante/.test(m)));
  assert.ok(msgs.some(m => /^erreur:.*g4.*hypothèse manquante/.test(m)));
  assert.ok(msgs.some(m => /^alerte:.*g5.*Inconnue/.test(m)));
  assert.deepEqual(constats(moteur([groupe(false)])), []);
});

const racineAvecGroupe = () => {
  const racine = racineExemple(), e0 = ouvrirEspace(racine);
  const nom = vm.runInContext("CAT().list[0].name", e0.evaluate().ctx);
  fs.writeFileSync(path.join(racine, "spec/perimetre.yml"), YAML.stringify({ groupes: [{ ...groupe(false), mesures: [nom] }] }));
  return { racine, nom, e: ouvrirEspace(racine) };
};

test("de bout en bout : perimetre.yml chargé, réponse oui au registre, mesure hors périmètre", () => {
  const { racine, nom, e } = racineAvecGroupe();
  assert.equal(e.loadState(e.makeCtx()).state.perimetre[0].id, "g1");
  assert.deepEqual([...vm.runInContext("[...horsPerimetre()]", e.evaluate().ctx)], []);
  const r = e.repondre({ id: "perimetre:g1", saisie: { oui: true }, par: "Dirigeant" });
  assert.ok(!r.erreurs, JSON.stringify(r));
  const reg = YAML.parse(fs.readFileSync(path.join(racine, "spec/reponses.yml"), "utf8"));
  assert.deepEqual([reg.at(-1).id, reg.at(-1).modifs[0].op, reg.at(-1).modifs[0].valeur], ["perimetre:g1", "valider", true]);
  assert.ok(vm.runInContext("[...horsPerimetre()]", e.evaluate().ctx).includes(nom));
  assert.equal(YAML.parse(fs.readFileSync(path.join(racine, "spec/perimetre.yml"), "utf8")).groupes[0].hypothese.valide, false, "perimetre.yml n'est pas modifié");
});

test("réponse non : la mesure reste, groupe refusé", () => {
  const { e } = racineAvecGroupe();
  const r = e.repondre({ id: "perimetre:g1", saisie: { oui: false }, par: "Dirigeant" });
  assert.ok(!r.erreurs, JSON.stringify(r));
  assert.deepEqual([...vm.runInContext("[...horsPerimetre()]", e.evaluate().ctx)], []);
});

test("l'aperçu d'un groupe ne parle pas de dataset introuvable", () => {
  const { e } = racineAvecGroupe();
  const r = e.apercuQuestion("perimetre:g1");
  assert.equal(r.aucun, true);
  assert.doesNotMatch(r.raison, /introuvable/);
});

test("un perimetre.yml mal formé ne casse pas le chargement", () => {
  const racine = racineExemple();
  fs.writeFileSync(path.join(racine, "spec/perimetre.yml"), YAML.stringify({ groupes: [null, "texte", { id: "g1", cause: "x", mesures: "pas une liste" }] }));
  const e = ouvrirEspace(racine);
  assert.deepEqual(e.loadState(e.makeCtx()).state.perimetre.map(g => g.id), ["g1"]);
  assert.deepEqual(e.loadState(e.makeCtx()).state.perimetre[0].mesures, []);
});
