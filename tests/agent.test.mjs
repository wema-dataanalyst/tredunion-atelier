import { test } from "node:test";
import assert from "node:assert/strict";
import { boucle } from "../server/agent/boucle.mjs";
import { creerOutils, decrire } from "../server/agent/outils.mjs";
import { interpreter } from "../server/agent/interpreter.mjs";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";
import { fauxLlm, appelOutil } from "./aide/faux-llm.mjs";

const outilEcho = { nom: "echo", description: "renvoie x", parametres: { type: "object", properties: { x: { type: "string" } } }, executer: a => ({ x: a.x }) };
const outilFin = { nom: "fin", description: "termine", parametres: { type: "object", properties: {} }, executer: () => ({ final: "proposition", donnees: { v: 1 } }) };

test("boucle : exécute un outil, renvoie son résultat au modèle, puis termine sur un outil final", async () => {
  const llm = fauxLlm([appelOutil("echo", { x: "a" }), appelOutil("fin", {})]);
  const r = await boucle({ llm, systeme: "S", utilisateur: "U", outils: { echo: outilEcho, fin: outilFin } });
  assert.deepEqual([r.issue, r.v, r.tours], ["proposition", 1, 2]);
  const second = llm.appels[1].messages; assert.equal(second.at(-1).role, "tool"); assert.match(second.at(-1).content, /"x":"a"/);
  assert.equal(llm.appels[0].outils[0].function.name, "echo");
});

test("boucle : outil inconnu et arguments illisibles renvoyés au modèle, qui peut se corriger", async () => {
  const llm = fauxLlm([appelOutil("rm_rf", {}), appelOutil("echo", "pas du json"), appelOutil("fin", {})]);
  const r = await boucle({ llm, systeme: "S", utilisateur: "U", outils: { echo: outilEcho, fin: outilFin } });
  assert.equal(r.issue, "proposition");
  assert.match(llm.appels[1].messages.at(-1).content, /outil inconnu/); assert.match(llm.appels[2].messages.at(-1).content, /arguments illisibles/);
});

test("boucle : une exception d'outil devient une erreur d'outil, la réponse texte est une précision", async () => {
  const casse = { ...outilEcho, nom: "casse", executer: () => { throw new Error("secret interne"); } };
  const llm = fauxLlm([appelOutil("casse", {}), { content: "Pouvez-vous préciser le statut ?" }]);
  const r = await boucle({ llm, systeme: "S", utilisateur: "U", outils: { casse } });
  assert.deepEqual([r.issue, r.precision], ["precision", "Pouvez-vous préciser le statut ?"]);
  assert.ok(!llm.appels[1].messages.at(-1).content.includes("secret interne"));
});

test("boucle : plafonds de tours, de jetons et de temps", async () => {
  const boucleInfinie = n => fauxLlm(Array.from({ length: n }, () => appelOutil("echo", { x: "a" })));
  assert.equal((await boucle({ llm: boucleInfinie(10), systeme: "S", utilisateur: "U", outils: { echo: outilEcho }, tours: 3 })).issue, "tours");
  const gros = fauxLlm(Array.from({ length: 5 }, () => ({ ...appelOutil("echo", { x: "a" }), usage: { total_tokens: 9000 } })));
  assert.equal((await boucle({ llm: gros, systeme: "S", utilisateur: "U", outils: { echo: outilEcho }, jetonsMax: 20000 })).issue, "jetons");
  let t = 0; const lent = fauxLlm(Array.from({ length: 5 }, () => () => { t += 20000; return appelOutil("echo", { x: "a" }); }));
  assert.equal((await boucle({ llm: lent, systeme: "S", utilisateur: "U", outils: { echo: outilEcho }, delaiMs: 30000, now: () => t })).issue, "delai");
});

test("decrire : une ligne lisible par opération", () => {
  assert.match(decrire({ op: "codes", cible: "tms.statut", valeur: { A: "Annulée" } }), /A.*Annulée/);
  assert.match(decrire({ op: "exclure", cible: "tms", sql: "statut <> 'A'" }), /statut <> 'A'/);
  assert.match(decrire({ op: "definir", cible: "flux:f1.unite", valeur: "km" }), /km/);
  assert.match(decrire({ op: "valider", cible: "flux:f1", valeur: true }), /onfirm/);
  assert.match(decrire({ op: "noter" }), /réponse/i);
});

const ID = "compta_balance#q1";
const fin = (comprehension, operations) => appelOutil("proposer", { comprehension, operations });

test("outils : profil_colonnes sans pii et limité au dataset de la question ; lire_question", async () => {
  const espace = ouvrirEspace(racineExemple()), contexte = espace.contexteAgent(ID);
  const o = creerOutils({ espace, id: ID, texte: "t", contexte });
  assert.deepEqual(Object.keys(o).sort(), ["demander_precision", "lire_memoire", "lire_question", "profil_colonnes", "proposer", "verifier_operations"]);
  assert.equal((await o.lire_question.executer({})).id, ID);
  const p = await o.profil_colonnes.executer({ dataset: contexte.dataset }); assert.ok(p.colonnes.length > 0);
  assert.ok((await o.profil_colonnes.executer({ dataset: "tms_conducteurs" })).erreur);
  assert.ok((await o.profil_colonnes.executer({})).erreur);
});

test("interpreter : proposition valide → compréhension, opérations, lignes lisibles, effet", async () => {
  const espace = ouvrirEspace(racineExemple());
  const llm = fauxLlm([appelOutil("lire_question", {}), fin("Vous donnez la date de clôture.", [{ op: "noter" }])]);
  const r = await interpreter({ espace, llm, id: ID, texte: "Date de clôture réelle" });
  assert.deepEqual([r.comprehension, r.operations, r.lignes.length], ["Vous donnez la date de clôture.", [{ op: "noter" }], 1]);
  assert.match(r.effet, /mesures alimentées/); assert.equal(r.meta.issue, "proposition");
  assert.match(llm.appels[0].messages[0].content, /Date de clôture réelle/);
});

test("interpreter : opération invalide renvoyée au modèle, qui corrige", async () => {
  const espace = ouvrirEspace(racineExemple());
  const llm = fauxLlm([fin("x", [{ op: "codes", cible: "inconnu.col", valeur: { A: "x" } }]), fin("Vous donnez la date.", [{ op: "noter" }])]);
  const r = await interpreter({ espace, llm, id: ID, texte: "Date de clôture" });
  assert.equal(r.comprehension, "Vous donnez la date."); assert.match(llm.appels[1].messages.at(-1).content, /colonne introuvable/);
});

test("interpreter : précision, échec de la boucle, texte vide ou trop long, question inconnue : sans appel inutile", async () => {
  const espace = ouvrirEspace(racineExemple());
  assert.equal((await interpreter({ espace, llm: fauxLlm([appelOutil("demander_precision", { question: "Quelle colonne ?" })]), id: ID, texte: "hum" })).precision, "Quelle colonne ?");
  const echec = await interpreter({ espace, llm: fauxLlm(Array.from({ length: 8 }, () => appelOutil("lire_question", {}))), id: ID, texte: "hum" });
  assert.ok(echec.erreurs && echec.meta.issue === "tours");
  const sans = fauxLlm([]);
  for (const texte of ["", "   ", "x".repeat(2001)]) assert.ok((await interpreter({ espace, llm: sans, id: ID, texte })).erreurs);
  assert.ok((await interpreter({ espace, llm: sans, id: "inconnu#q9", texte: "x" })).erreurs); assert.equal(sans.appels.length, 0);
});

test("interpreter pré-contrôle le texte en mode « autre réponse » (questions non libres)", async () => {
  let vu = null;
  const espace = { previsualiser: a => { vu = a.saisie; return { erreurs: ["stop"] }; } };
  const r = await interpreter({ espace, llm: null, id: "x#q1", texte: "autre chose", par: "t" });
  assert.equal(vu.autre, true); assert.deepEqual(r.erreurs, ["stop"]);
});

test("la boucle transmet le délai restant à chaque appel du modèle", async () => {
  const vus = [];
  const llm = { discuter: async a => { vus.push(a.delaiMs); return { message: { content: "?" }, usage: {} }; } };
  await boucle({ llm, systeme: "s", utilisateur: "u", outils: {}, delaiMs: 5000 });
  assert.ok(vus[0] > 0 && vus[0] <= 5000);
});
