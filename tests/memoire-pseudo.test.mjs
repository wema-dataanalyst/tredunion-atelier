import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pseudonyme, lireSel, ecrireMemoire, comptePresent, distincts, pseudonymiserMemoire, lireMemoire } from "../tools/memoire.mjs";
import { apprendre } from "../tools/apprendre.mjs";
import { anonymiser } from "../server/app.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "mem-pseudo-"));

test("pseudonyme déterministe, p: + 16 hex, dépend du sel", () => {
  const p = pseudonyme("sel", "kf");
  assert.match(p, /^p:[0-9a-f]{16}$/);
  assert.equal(p, pseudonyme("sel", "kf"));
  assert.notEqual(p, pseudonyme("autre", "kf"));
  assert.notEqual(p, pseudonyme("sel", "rl"));
});

test("sel : variable d'environnement d'abord", () => {
  assert.equal(lireSel(tmp(), { TREDUNION_SEL: "env" }), "env");
});

test("sel absent : créé en 600, relu à l'identique", () => {
  const dir = tmp(), a = lireSel(dir, {});
  assert.ok(a.length >= 32);
  assert.equal(fs.statSync(path.join(dir, ".sel")).mode & 0o777, 0o600);
  assert.equal(lireSel(dir, {}), a);
});

test("comparaison compatible clair / pseudonyme", () => {
  assert.ok(comptePresent(["kf"], "kf", "s"));
  assert.ok(comptePresent([pseudonyme("s", "kf")], "kf", "s"));
  assert.ok(!comptePresent([pseudonyme("s", "rl")], "kf", "s"));
  assert.equal(distincts(["kf", pseudonyme("s", "kf"), pseudonyme("s", "rl")], "s"), 2);
});

const ecrireComptes = (dir, liste) => fs.writeFileSync(path.join(dir, "comptes.yml"), "# Mémoire\n" + liste);

test("migration : réécrit en p:, idempotente, sans id en clair", () => {
  const dir = tmp();
  ecrireComptes(dir, "- id: '706'\n  cod: CA TPS\n  confirme_chez: [kf, rl]\n  contredit_chez: [kf]\n");
  const r1 = pseudonymiserMemoire(dir, {});
  assert.ok(r1.migrees >= 1);
  const t1 = fs.readFileSync(path.join(dir, "comptes.yml"), "utf8");
  assert.ok(!/\bkf\b|\brl\b/.test(t1));
  assert.match(t1, /p:[0-9a-f]{16}/);
  assert.equal(pseudonymiserMemoire(dir, {}).migrees, 0);
  assert.equal(fs.readFileSync(path.join(dir, "comptes.yml"), "utf8"), t1);
});

const etat = h => ({ datasets: [{ id: "bal", societe: "etc", columns: [] }], flux: [{ id: "f1", ds: "bal", rules: [{ prefix: "706", cod: "CA TPS", hypothese: h }] }] });

test("apprendre n'écrit que la forme p: et retire l'ancienne forme claire", () => {
  const sel = "s", m = { comptes: [{ id: "706", cod: "CA TPS", confirme_chez: ["etc"], contredit_chez: [] }], colonnes: [] };
  const r = apprendre(etat({ valide: true }), m, sel);
  assert.deepEqual(r.comptes[0].confirme_chez, [pseudonyme(sel, "etc")]);
  assert.ok(!r.faits.join().includes("etc"));
  const neuf = apprendre(etat({ refuse: true }), { comptes: [{ id: "706", cod: "CA TPS", confirme_chez: [], contredit_chez: [] }], colonnes: [] }, sel);
  assert.deepEqual(neuf.comptes[0].contredit_chez, [pseudonyme(sel, "etc")]);
});

test("lecture compatible : lireMemoire garde les deux formes", () => {
  const dir = tmp();
  ecrireComptes(dir, "- id: '706'\n  confirme_chez: [kf, 'p:0123456789abcdef']\n  contredit_chez: []\n");
  assert.equal(lireMemoire(dir).comptes[0].confirme_chez.length, 2);
});

test("vues anonymisées : ni hash ni id ; sous 3 adhérents, pas de comptage", () => {
  const v = JSON.stringify(anonymiser({ dir: "/x", comptes: [{ id: "706", confirme_chez: [pseudonyme("s", "kf"), "rl", "aa"], contredit_chez: ["bb"] }] }));
  assert.ok(!v.includes("p:") && !v.includes("rl") && !v.includes("/x"));
  assert.ok(v.includes("un autre adhérent"));
  const e = anonymiser({ comptes: [{ id: "706", confirme_chez: ["a", "b", "c"], contredit_chez: ["d"] }, { id: "1", confirme_chez: [], contredit_chez: [] }] }).comptes;
  assert.equal(e[0].confirme_chez.length, 3); assert.equal(e[0].confirme_peu, undefined);
  assert.deepEqual([e[0].contredit_chez, e[0].contredit_peu, e[0].peu], [[], true, true]);
  assert.deepEqual([e[1].confirme_chez, e[1].peu], [[], undefined]);
});

test("le sel est créé en wx, la mémoire écrite par renommage", () => {
  const dir = tmp(); fs.writeFileSync(path.join(dir, ".sel"), "existant", { mode: 0o600 });
  assert.equal(lireSel(dir, {}), "existant");
  ecrireMemoire({ dir, comptes: [{ id: "1" }] }, ["comptes"]);
  assert.deepEqual(fs.readdirSync(dir).filter(f => f.endsWith(".tmp")), []);
  assert.match(fs.readFileSync(path.join(dir, "comptes.yml"), "utf8"), /id: "1"|id: '1'/);
});

import { chargerMoteur, etatCaTotal } from "./aide/moteur.mjs";
const hyp = st => chargerMoteur(st).run("listeHypotheses()")[0];
const ok = { id: "c1", type: "mensuel", ds: "tms", date: "date_chgt", porte_sur: ["tms.montant"] };
const memoire = (conf, contr = []) => ({ logiciels: [], comptes: [], colonnes: [{ id: "montant_ht", desc: "Montant HT", confirme_chez: conf, contredit_chez: contr }] });

test("confiance inchangée avec la forme p:, et raisons sans hash", () => {
  const src = { source: "memoire:colonnes/montant_ht" };
  const h = hyp(etatCaTotal(src, { controles: [ok], memoire: memoire(["p:0123456789abcdef"]) }));
  assert.equal(h.confiance, "haute");
  assert.equal(hyp(etatCaTotal(src, { controles: [ok], memoire: memoire(["p:0123456789abcdef"], ["p:fedcba9876543210"]) })).confiance, "moyenne");
  assert.ok(!JSON.stringify(h.raisons).includes("p:"));
});
