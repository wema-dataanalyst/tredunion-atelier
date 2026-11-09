import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";
import { chargerMoteur, etatCaTotal } from "./aide/moteur.mjs";

const QA = { id: "q1", text: "Activités à suivre séparément", titre: "Quelles sont vos activités principales ?", contexte: "Votre comptabilité distingue du transport et de l'affrètement." };
const etat = (extra = {}) => etatCaTotal(undefined, { questions: [QA], ...extra });
const liste = s => chargerMoteur(s).run("listeQuestions()");
const par = (l, id) => l.find(q => q.id === id);

test("une question d'adhérent est listée avec la source projet et le lot adherent", () => {
  const q = par(liste(etat()), "projet#q1");
  assert.deepEqual([q.source, q.lot, q.fichier, q.statut, q.type], ["projet", "adherent", "spec/projet.yml", "ouverte", "libre"]);
  assert.equal(q.titre, "Quelles sont vos activités principales ?");
  assert.equal(q.intro, "Votre comptabilité distingue du transport et de l'affrètement.");
  assert.deepEqual(q.mesures, []);
});

test("le lot adherent passe en tête tant qu'il reste une question ouverte", () => {
  const s = etat();
  s.datasets[0].questions = [{ id: "q1", text: "montant : valeurs négatives, avoirs ?", done: false }];
  assert.equal(liste(s)[0].id, "projet#q1");
});

test("sans question d'adhérent, aucune entrée projet et l'ordre existant est conservé", () => {
  const s = etatCaTotal(undefined, {});
  s.datasets[0].questions = [{ id: "q1", text: "montant : valeurs négatives, avoirs ?", done: false }];
  const l = liste(s).filter(q => q.lot !== "besoins");
  assert.ok(!l.some(q => q.source === "projet"));
  assert.equal(l[0].id, "tms#q1");
});

test("une réponse du registre se greffe : question traitée", () => {
  const q = par(liste(etat({ reponses: [{ id: "projet#q1", reponse: "Transport, affrètement", date: "2026-11-08T17:00:00", modifs: [{ op: "noter" }] }] })), "projet#q1");
  assert.deepEqual([q.statut, q.reponse], ["traitee", "Transport, affrètement"]);
});

test("la réponse d'une question disparue reste listée comme retirée", () => {
  const l = liste(etatCaTotal(undefined, { reponses: [{ id: "projet#q1", question: "Activités à suivre séparément", reponse: "X", date: "2026-11-08" }] }));
  const o = par(l, "projet#q1");
  assert.deepEqual([o.source, o.retiree, o.statut], ["registre", true, "traitee"]);
});

const constats = s => chargerMoteur(s).run("checkSpec()").filter(c => c.fichier === "spec/projet.yml");

test("check : id manquant, texte manquant, id en double", () => {
  const c = constats(etat({ questions: [{ id: "", text: "A" }, { id: "q2", text: "" }, { id: "q3", text: "B" }, { id: "q3", text: "C" }] }));
  assert.deepEqual(c.map(x => x.niv), ["erreur", "erreur", "erreur"]);
  assert.match(c[0].msg, /id manquant/);
  assert.match(c[1].msg, /q2.*texte manquant/);
  assert.match(c[2].msg, /q3.*en double/);
  assert.deepEqual(constats(etat()), []);
});

test("de bout en bout : projet.yml, liste, réponse au registre", () => {
  const racine = racineExemple(), f = path.join(racine, "spec/projet.yml");
  const projet = YAML.parse(fs.readFileSync(f, "utf8"));
  projet.questions = [QA];
  fs.writeFileSync(f, YAML.stringify(projet));
  const e = ouvrirEspace(racine);
  assert.equal(e.loadState(e.makeCtx()).state.questions[0].titre, QA.titre);
  const r = e.repondre({ id: "projet#q1", saisie: { texte: "Transport et affrètement" }, par: "Dirigeant" });
  assert.ok(!r.erreurs, JSON.stringify(r));
  const reg = YAML.parse(fs.readFileSync(path.join(racine, "spec/reponses.yml"), "utf8"));
  assert.deepEqual([reg.at(-1).id, reg.at(-1).reponse], ["projet#q1", "Transport et affrètement"]);
  assert.equal(YAML.parse(fs.readFileSync(f, "utf8")).questions.length, 1, "projet.yml n'est pas modifié");
});

test("projet.yml avec entrées questions invalides : seules les objets sont chargés", () => {
  const racine = racineExemple(), f = path.join(racine, "spec/projet.yml");
  const projet = YAML.parse(fs.readFileSync(f, "utf8"));
  projet.questions = [null, "texte", { id: "q1", text: "Une vraie question" }];
  fs.writeFileSync(f, YAML.stringify(projet));
  const e = ouvrirEspace(racine);
  assert.deepEqual(
    e.loadState(e.makeCtx()).state.questions.map(q => q.id),
    ["q1"],
  );
});

test("l'aperçu d'une question d'adhérent dit qu'il n'y a pas de données, sans parler de dataset introuvable", () => {
  const racine = racineExemple(), f = path.join(racine, "spec/projet.yml");
  const projet = YAML.parse(fs.readFileSync(f, "utf8"));
  projet.questions = [QA];
  fs.writeFileSync(f, YAML.stringify(projet));
  const r = ouvrirEspace(racine).apercuQuestion("projet#q1");
  assert.equal(r.aucun, true);
  assert.doesNotMatch(r.raison, /introuvable/);
  assert.match(r.raison, /activité|adhérent|données/i);
});
