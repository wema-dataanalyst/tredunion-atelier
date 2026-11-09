import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, etatCaTotal, colonne } from "./aide/moteur.mjs";

const ok = { id: "c1", type: "mensuel", ds: "tms", date: "date_chgt", porte_sur: ["tms.montant"] };
const ko = { id: "c2", type: "mensuel", ds: "tms", porte_sur: ["tms.montant"] };
const mem = (contredit = []) => ({ logiciels: [], comptes: [], colonnes: [{ id: "montant_ht", desc: "Montant HT", confirme_chez: ["autre"], contredit_chez: contredit }] });
const hyp = st => chargerMoteur(st).run("listeHypotheses()")[0];

test("déduction de l'agent seule : confiance basse", () => {
  const h = hyp(etatCaTotal({ source: "agent", preuves: ["somme 1 000"], question: "Le montant est-il HT ?" }));
  assert.equal(h.cible, "tms.montant"); assert.equal(h.confiance, "basse"); assert.equal(h.conflit, false);
  assert.equal(h.question, "Le montant est-il HT ?");
});

test("un contrôle concordant donne moyenne", () => {
  assert.equal(hyp(etatCaTotal({ source: "agent" }, { controles: [ok] })).confiance, "moyenne");
});

test("mémoire confirmée et contrôle concordant donnent haute", () => {
  assert.equal(hyp(etatCaTotal({ source: "memoire:colonnes/montant_ht" }, { controles: [ok], memoire: mem() })).confiance, "haute");
});

test("une mémoire contredite plafonne à moyenne", () => {
  assert.equal(hyp(etatCaTotal({ source: "memoire:colonnes/montant_ht" }, { controles: [ok], memoire: mem(["x"]) })).confiance, "moyenne");
});

test("un contrôle en écart donne basse avec conflit", () => {
  const h = hyp(etatCaTotal({ source: "agent" }, { controles: [ok, ko] }));
  assert.equal(h.confiance, "basse"); assert.equal(h.conflit, true);
});

test("une hypothèse validée est confirmée", () => {
  assert.equal(hyp(etatCaTotal({ source: "agent", valide: true }, { controles: [ko] })).confiance, "confirme");
});

test("une entrée de mémoire introuvable est une erreur de spec", () => {
  const f = chargerMoteur(etatCaTotal({ source: "memoire:colonnes/inconnue" })).run("checkSpec()");
  assert.ok(f.some(x => x.niv === "erreur" && /mémoire introuvable/.test(x.msg)));
});

test("le badge d'une mesure suit la pire hypothèse de ses flux", () => {
  const { run } = chargerMoteur(etatCaTotal({ source: "agent" }));
  assert.deepEqual(run(`badgeMesure(CAT().list.find(m=>m.name==="CA Réel"))`), { niveau: "rouge", pire: "basse", n: 1 });
  assert.equal(run(`badgeMesure(CAT().list.find(m=>m.name==="Gazole"))`), null);
});

test("summary compte les hypothèses par confiance", () => {
  assert.deepEqual(chargerMoteur(etatCaTotal({ source: "agent" })).run("summary().hypotheses"), { confirme: 0, haute: 0, moyenne: 0, basse: 1 });
});

const erreurs = (st, re) => chargerMoteur(st).run("checkSpec()").filter(x => x.niv === "erreur" && re.test(x.msg));

test("hypothese : preuves non liste, source inconnue, valide et refuse ensemble sont des erreurs", () => {
  assert.equal(erreurs(etatCaTotal({ source: "agent", preuves: "texte" }), /preuves/).length, 1);
  assert.equal(erreurs(etatCaTotal({ source: "n'importe quoi" }), /source/).length, 1);
  assert.equal(erreurs(etatCaTotal({ source: "memoire:dir/x" }), /source/).length, 1);
  assert.equal(erreurs(etatCaTotal({ source: "agent", valide: true, refuse: true }), /valide.*refuse/).length, 1);
  assert.equal(erreurs(etatCaTotal({ source: "memoire:colonnes/montant_ht", preuves: [] }, { memoire: mem() }), /preuves|source|refuse/).length, 0);
});

test("une valeur pii dans une preuve, une question, un desc, une règle ou un filtre est une erreur sans la valeur", () => {
  const st = (h, ex = {}) => { const s = etatCaTotal(h); s.datasets[0].columns.push(colonne("nom", { pii: true })); s.datasets[0].rows = [["02/01/2025", "600", "Durandel"], ["15/02/2025", "400", "Bo"]]; return Object.assign(s, ex); };
  const pii = (s, cible) => { const f = erreurs(s, /personnelle/); assert.equal(f.length, 1); assert.match(f[0].msg, cible); assert.ok(!f[0].msg.includes("Durandel")); };
  pii(st({ source: "agent", preuves: ["Livré par Durandel"] }), /tms\.montant.*tms\.nom/);
  pii(st({ source: "agent", question: "Durandel est-il chauffeur ?" }), /tms\.montant/);
  const d = st({ source: "agent" }); d.datasets[0].columns[0].desc = "durandel"; pii(d, /tms\.date_chgt/);
  const r = st({ source: "agent" }); r.datasets[0].rules = [{ text: "Sans Durandel", sql: "1=1" }]; pii(r, /tms#regle1/);
  const fl = st({ source: "agent" }); fl.flux[0].filtre = "nom <> 'Durandel'"; pii(fl, /flux:f1/);
  assert.equal(erreurs(st({ source: "agent", preuves: ["Bo", "600"] }), /personnelle/).length, 0);
});

test("une valeur pii qui est un mot entier d'une colonne non personnelle n'est pas une fuite, ni une sous-chaîne", () => {
  const s = etatCaTotal({ source: "agent", preuves: ["Ordres route et export ; Durandelle livré"] });
  s.datasets[0].columns.push(colonne("nom", { pii: true }), colonne("lib"));
  s.datasets[0].rows = ["route A", "route B", "route C", "route D", "route E"].map(l => ["02/01/2025", "600", "Route", l]).concat([["15/02/2025", "400", "Durandel", "Export"]]);
  assert.equal(erreurs(s, /personnelle/).length, 0);
});

test("un nom présent une seule fois dans une colonne non personnelle reste une fuite", () => {
  const s = etatCaTotal({ source: "agent", preuves: ["Client Martinez"] });
  s.datasets[0].columns.push(colonne("nom", { pii: true }), colonne("lib"));
  s.datasets[0].rows = [["02/01/2025", "600", "Martinez", "Transports Martinez"]];
  assert.equal(erreurs(s, /personnelle/).length, 1);
});

test("règle de compte issue de la mémoire : même cod et préfixe commençant par l'id", () => {
  const regle = (source, prefix = "706", cod = "CA TPS") => { const s = etatCaTotal(null); s.flux[0].codMode = "regles"; s.flux[0].rules = [{ prefix, cod, lib: cod, hypothese: { source } }]; s.categories.push({ cod: "CA TPS", note: "" });
    s.memoire = { logiciels: [], colonnes: [], comptes: [{ id: "706", cod: "CA TPS", confirme_chez: ["x"], contredit_chez: [] }] }; return s; };
  assert.equal(erreurs(regle("memoire:comptes/706"), /mémoire/).length, 0);
  assert.equal(erreurs(regle("memoire:comptes/706", "706", "GO"), /cod/).length, 1);
  assert.equal(erreurs(regle("memoire:comptes/706", "7061"), /préfixe/).length, 0);
  assert.equal(erreurs(regle("memoire:comptes/706", "707"), /préfixe/).length, 1);
});
