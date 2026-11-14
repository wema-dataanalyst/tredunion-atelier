import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { ecrireDataset, ecrireFlux, ecrireControle, ecrireRelation, lireReferentiel, masquerFuitesPii, MASQUE } from "../server/agent/specs.mjs";
import { racineExemple, ATELIER } from "./aide/racine.mjs";

const lire = (r, f) => fs.readFileSync(path.join(r, f), "utf8");
const hyp = (extra = {}) => ({ source: "agent", preuves: ["10 596 ordres"], question: "Le montant est-il hors taxe ?", valide: true, refuse: true, ...extra });
const check = r => spawnSync("node", [ATELIER, "check"], { env: { ...process.env, ATELIER_ROOT: r }, encoding: "utf8" });

test("référentiel : liste les codes de spec/referentiel.yml", () => {
  const codes = lireReferentiel(racineExemple());
  assert.ok(codes.includes("CA TPS") && codes.includes("DISTANCE"));
});

test("ecrireDataset : fusionne, garde commentaires et ordre, force valide/refuse à false", () => {
  const r = racineExemple(); const f = "spec/datasets/tms_missions.yml";
  const avant = lire(r, f);
  const res = ecrireDataset(r, { id: "tms_missions", desc: "Ordres du TMS (nouvelle desc)",
    colonnes: [{ name: "ca_ht", desc: "Chiffre d'affaires de l'ordre", role: "measure", type: "decimal", decimalComma: true, hypothese: hyp() }],
    regles: [{ text: "Exclure les annulés", sql: "statut <> 'A'" }] });
  assert.equal(res.ok, true);
  const apres = lire(r, f);
  assert.match(apres, /^# Dataset bronze tms_missions\n/);
  assert.ok(apres.indexOf("name: num_ot") < apres.indexOf("name: ca_ht"));
  assert.ok(apres.indexOf("id: tms_missions") < apres.indexOf("desc: Ordres du TMS"));
  assert.notEqual(avant, apres);
  const d = YAML.parse(apres); const c = d.columns.find(x => x.name === "ca_ht");
  assert.equal(c.role, "measure"); assert.equal(c.hypothese.valide, false); assert.equal(c.hypothese.refuse, false);
  assert.equal(d.grain, "Une ligne par ordre de transport"); assert.equal(d.rules.length, 1);
  assert.equal(d.columns.length, 9);
});

test("ecrireDataset : colonne inconnue, rôle ou type invalide, source d'hypothèse invalide refusés", () => {
  const r = racineExemple();
  assert.ok(ecrireDataset(r, { id: "tms_missions", colonnes: [{ name: "inconnue", desc: "x" }] }).erreurs);
  assert.ok(ecrireDataset(r, { id: "tms_missions", colonnes: [{ name: "ca_ht", role: "pirate" }] }).erreurs);
  assert.ok(ecrireDataset(r, { id: "tms_missions", colonnes: [{ name: "ca_ht", type: "money" }] }).erreurs);
  assert.ok(ecrireDataset(r, { id: "tms_missions", colonnes: [{ name: "ca_ht", hypothese: hyp({ source: "internet" }) }] }).erreurs);
  assert.ok(ecrireDataset(r, { id: "tms_missions", colonnes: [{ name: "ca_ht", hypothese: { source: "agent", preuves: ["a"] } }] }).erreurs);
  assert.ok(ecrireDataset(r, { id: "tms_missions", colonnes: [{ name: "ca_ht", hypothese: hyp({ preuves: "pas une liste" }) }] }).erreurs);
  assert.ok(ecrireDataset(r, { id: "inexistant", desc: "x" }).erreurs);
});

test("ecrireDataset : questions couvertes retirées, autres typées, type de réponse invalide refusé", () => {
  const r = racineExemple(); const f = "spec/datasets/tms_missions.yml";
  assert.ok(ecrireDataset(r, { id: "tms_missions", questions: [{ id: "q1", reponse_type: "magie" }] }).erreurs);
  const res = ecrireDataset(r, { id: "tms_missions", questions: [{ id: "q1", couverte: true }, { id: "q2", reponse_type: "confirmer" }] });
  assert.equal(res.ok, true);
  const q = YAML.parse(lire(r, f)).questions;
  assert.ok(!q.some(x => x.id === "q1")); assert.equal(q.find(x => x.id === "q2").reponse_type, "confirmer");
  assert.ok(ecrireDataset(r, { id: "tms_missions", questions: [{ id: "q99", reponse_type: "libre" }] }).erreurs);
});

test("pii : une valeur d'une colonne personnelle dans un texte est refusée, sans la répéter", () => {
  const r = racineExemple();
  const csv = lire(r, "data/bronze/kf/tms_conducteurs.csv").split("\n")[1].split(";");
  const nom = csv[1];
  assert.ok(nom.length >= 4);
  const res = ecrireDataset(r, { id: "tms_conducteurs", desc: `Conducteurs dont ${nom} le chef` });
  assert.ok(res.erreurs); assert.ok(!JSON.stringify(res).includes(nom));
  assert.ok(ecrireDataset(r, { id: "tms_conducteurs", colonnes: [{ name: "code_cond", hypothese: hyp({ preuves: [`vu ${nom.toUpperCase()}`] }) }] }).erreurs);
  assert.equal(ecrireDataset(r, { id: "tms_conducteurs", desc: "Référentiel des conducteurs" }).ok, true);
});

test("ecrireFlux : crée un flux valide, check reste à 0 erreur", () => {
  const r = racineExemple();
  const res = ecrireFlux(r, { id: "f9", ds: "tms_missions", codMode: "fixe", cod: "DISTANCE", lib: "Km prévus", valeur: "km_prevus", agg: "sum", champ: "MontantReel", unite: "km", date: "date_charg", hypothese: hyp() });
  assert.equal(res.ok, true);
  const fl = YAML.parse(lire(r, "spec/flux/f9.yml"));
  assert.equal(fl.hypothese.valide, false); assert.equal(fl.cod, "DISTANCE");
  const c = check(r); assert.equal(c.status, 0, c.stdout + c.stderr);
});

test("ecrireFlux : fusion sur flux existant garde les commentaires et les règles", () => {
  const r = racineExemple(); const f = "spec/flux/f1.yml";
  const res = ecrireFlux(r, { id: "f1", note: "Balance au mois", rules: [{ prefix: "7061", cod: "CA TPS", lib: "CA transport (maj)" }, { prefix: "7064", cod: "CA TOTAL", lib: "CA divers" }] });
  assert.equal(res.ok, true);
  const t = lire(r, f); assert.match(t, /^# Flux f1/);
  const fl = YAML.parse(t); assert.equal(fl.rules.find(x => x.prefix === "7061").lib, "CA transport (maj)");
  assert.ok(fl.rules.some(x => x.prefix === "7064")); assert.ok(fl.rules.some(x => x.prefix === "6041")); assert.equal(fl.note, "Balance au mois");
});

test("ecrireFlux : une règle plus longue est insérée avant la règle courte qui la masquerait", () => {
  const r = racineExemple();
  assert.equal(ecrireFlux(r, { id: "f1", rules: [{ prefix: "706", cod: "CA TOTAL", lib: "CA total" }, { prefix: "70611", cod: "CA LOG", lib: "CA détaillé" }] }).ok, true);
  const px = YAML.parse(lire(r, "spec/flux/f1.yml")).rules.map(x => String(x.prefix));
  assert.ok(px.indexOf("70611") < px.indexOf("7061"), px.join(","));
  assert.ok(px.indexOf("7061") < px.indexOf("706"), px.join(","));
  assert.ok(!/jamais atteinte/.test(check(r).stdout));
});

test("ecrireFlux : code hors référentiel, dataset ou colonne inconnus, agg invalide refusés", () => {
  const r = racineExemple();
  const base = { id: "f9", ds: "tms_missions", codMode: "fixe", cod: "DISTANCE", lib: "Km", valeur: "km_prevus", date: "date_charg" };
  assert.ok(ecrireFlux(r, { ...base, cod: "INVENTE" }).erreurs);
  assert.ok(ecrireFlux(r, { id: "f1", rules: [{ prefix: "9999", cod: "INVENTE", lib: "x" }] }).erreurs);
  assert.ok(ecrireFlux(r, { ...base, ds: "nulle_part" }).erreurs);
  assert.ok(ecrireFlux(r, { ...base, date: "colonne_fantome" }).erreurs);
  assert.ok(ecrireFlux(r, { ...base, agg: "median" }).erreurs);
  assert.ok(ecrireFlux(r, { ...base, champ: "Autre" }).erreurs);
  assert.ok(ecrireFlux(r, { ...base, filtre: "1=1; drop table x" }).erreurs);
  assert.ok(!fs.existsSync(path.join(r, "spec/flux/f9.yml")));
});

test("ecrireControle : crée spec/controles.yml, vérifie type et datasets", () => {
  const r = racineExemple();
  assert.ok(ecrireControle(r, { id: "c1", type: "bizarre" }).erreurs);
  assert.ok(ecrireControle(r, { id: "c1", type: "mensuel", ds: "nulle_part", date: "x" }).erreurs);
  assert.ok(ecrireControle(r, { id: "c1", type: "rapprochement", from: "tms_missions.code_cond", to: "tms_conducteurs.nope", norm: "none" }).erreurs);
  const ok = ecrireControle(r, { id: "c1", type: "rapprochement", libelle: "Conducteurs retrouvés", from: "tms_missions.code_cond", to: "tms_conducteurs.code_cond", norm: "none", seuil: 0.9 });
  assert.deepEqual(ok, { ok: true });
  const ok2 = ecrireControle(r, { id: "c2", type: "ecart_somme", annee: 2025, tolerance: 0.05, a: { ds: "tms_missions", valeur: "ca_ht", date: "date_livr" }, b: { ds: "compta_balance", valeur: "montant", filtre: "compte like '70%'" } });
  assert.deepEqual(ok2, { ok: true });
  assert.equal(YAML.parse(lire(r, "spec/controles.yml")).length, 2);
  assert.deepEqual(ecrireControle(r, { id: "c1", libelle: "Renommé" }), { ok: true });
  const l = YAML.parse(lire(r, "spec/controles.yml")); assert.equal(l.length, 2); assert.equal(l[0].libelle, "Renommé"); assert.equal(l[0].type, "rapprochement");
});

test("ecrireRelation : ajoute, fusionne par id, refuse colonne inconnue", () => {
  const r = racineExemple();
  assert.ok(ecrireRelation(r, { id: "r9", from: "tms_missions.fantome", to: "tms_vehicules.immat", kind: "equal", norm: "none" }).erreurs);
  assert.ok(ecrireRelation(r, { id: "r9", from: "tms_missions.immat_tracteur", to: "tms_vehicules.immat", kind: "equal", norm: "rot13" }).erreurs);
  assert.deepEqual(ecrireRelation(r, { id: "r9", from: "tms_missions.immat_tracteur", to: "tms_vehicules.immat", kind: "equal", norm: "alnum_upper", note: "Avec ou sans tirets", hypothese: hyp() }), { ok: true });
  const t = lire(r, "spec/relations.yml"); assert.match(t, /^# Relations entre colonnes/);
  assert.deepEqual(ecrireRelation(r, { id: "r9", note: "Note revue" }), { ok: true });
  const l = YAML.parse(lire(r, "spec/relations.yml")); assert.equal(l.filter(x => x.id === "r9").length, 1);
  assert.equal(l.find(x => x.id === "r9").note, "Note revue"); assert.equal(l.find(x => x.id === "r9").hypothese.valide, false);
});

test("hypothèse déjà tranchée par l'adhérent : non réécrite", () => {
  const r = racineExemple();
  ecrireRelation(r, { id: "r9", from: "tms_missions.immat_tracteur", to: "tms_vehicules.immat", kind: "equal", norm: "none", hypothese: hyp() });
  const f = path.join(r, "spec/relations.yml");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("valide: false", "valide: true"));
  assert.ok(ecrireRelation(r, { id: "r9", hypothese: hyp({ question: "Autre ?" }) }).erreurs);
});

test("ids et chemins malveillants, entrées trop grosses refusés ; rien n'est écrit hors spec/", () => {
  const r = racineExemple();
  for (const id of ["../x", "a/b", "A", "", "f1.yml", "x y", "..", null, 5]) {
    assert.ok(ecrireFlux(r, { id, ds: "tms_missions", codMode: "fixe", cod: "DISTANCE", valeur: "km_prevus", date: "date_charg" }).erreurs, String(id));
    assert.ok(ecrireDataset(r, { id, desc: "x" }).erreurs, String(id));
    assert.ok(ecrireControle(r, { id, type: "mensuel", ds: "tms_missions", date: "date_charg" }).erreurs, String(id));
    assert.ok(ecrireRelation(r, { id, from: "a.b", to: "c.d" }).erreurs, String(id));
  }
  assert.ok(ecrireDataset(r, { id: "tms_missions", desc: "x".repeat(21 * 1024) }).erreurs);
  assert.ok(ecrireDataset(r, "pas un objet").erreurs);
  assert.ok(ecrireDataset(r, { id: "tms_missions", file: "../../etc/passwd", desc: "x" }).ok);
  assert.equal(YAML.parse(lire(r, "spec/datasets/tms_missions.yml")).file, "data/bronze/kf/tms_missions.csv");
  assert.deepEqual(fs.readdirSync(path.dirname(r)).filter(f => f === "x.yml"), []);
  assert.deepEqual(fs.readdirSync(path.join(r, "spec")).filter(f => f.includes(".tmp")), []);
});

test("après des écritures valides, npm run check reste à 0 erreur", () => {
  const r = racineExemple();
  ecrireDataset(r, { id: "tms_missions", desc: "Ordres", colonnes: [{ name: "ca_ht", desc: "CA HT", hypothese: hyp() }], questions: [{ id: "q4", reponse_type: "libre" }] });
  ecrireFlux(r, { id: "f9", ds: "tms_missions", codMode: "fixe", cod: "DISTANCE", lib: "Km", valeur: "km_prevus", unite: "km", date: "date_charg", hypothese: hyp() });
  ecrireControle(r, { id: "c1", type: "mensuel", ds: "tms_missions", date: "date_charg" });
  ecrireRelation(r, { id: "r9", from: "tms_missions.immat_tracteur", to: "tms_vehicules.immat", kind: "equal", norm: "alnum_upper" });
  const c = check(r); assert.equal(c.status, 0, c.stdout + c.stderr);
});

test("masquerFuitesPii : une valeur personnelle citée dans un autre dataset est masquée, le SQL et le registre ne bougent pas", () => {
  const r = racineExemple(), nom = lire(r, "data/bronze/kf/tms_conducteurs.csv").split("\n")[1].split(";")[1];
  const f = path.join(r, "spec/datasets/tms_missions.yml"), d = YAML.parseDocument(lire(r, "spec/datasets/tms_missions.yml"));
  d.setIn(["columns", 0, "desc"], `Ordre saisi par ${nom}`); fs.writeFileSync(f, d.toString());
  const reg = lire(r, "spec/reponses.yml");
  assert.match(check(r).stdout, /colonne personnelle/);
  assert.ok(masquerFuitesPii(r) >= 1);
  assert.equal(YAML.parse(lire(r, "spec/datasets/tms_missions.yml")).columns[0].desc, `Ordre saisi par ${MASQUE}`);
  assert.doesNotMatch(check(r).stdout, /colonne personnelle/); assert.equal(lire(r, "spec/reponses.yml"), reg);
  assert.equal(masquerFuitesPii(r), 0);
});

test("ecrireDataset : colonnes/regles/questions qui ne sont pas des listes → erreur propre, jamais une exception", () => {
  const r = racineExemple();
  for (const champ of ["colonnes", "regles", "questions"]) {
    const res = ecrireDataset(r, { id: "tms_conducteurs", [champ]: { oups: true } });
    assert.match(res.erreurs?.[0] || "", new RegExp(`${champ} : liste attendue`), champ);
  }
});

test("ecrireDataset : tolère « nom » à la place de « name » pour une colonne", () => {
  const r = racineExemple();
  const res = ecrireDataset(r, { id: "tms_conducteurs", colonnes: [{ nom: "type_contrat", desc: "Type de contrat" }] });
  assert.equal(res.ok, true);
  assert.match(lire(r, "spec/datasets/tms_conducteurs.yml"), /desc: Type de contrat/);
});
