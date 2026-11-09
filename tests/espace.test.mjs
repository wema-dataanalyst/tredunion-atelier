import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple } from "./aide/racine.mjs";

test("deux espaces ouverts sur deux racines restent indépendants", () => {
  const a = racineExemple(), b = racineExemple();
  const ea = ouvrirEspace(a), eb = ouvrirEspace(b);
  const r = ea.repondre({ id: "compta_balance#q1", saisie: { texte: "Date de clôture" }, par: "Compta" });
  assert.ok(!r.erreurs, JSON.stringify(r));
  assert.equal(YAML.parse(fs.readFileSync(path.join(a, "spec/reponses.yml"), "utf8")).length, 1);
  assert.equal((YAML.parse(fs.readFileSync(path.join(b, "spec/reponses.yml"), "utf8")) || []).length, 0);
  assert.equal(eb.loadState(eb.makeCtx()).state.reponses.length, 0);
});

test("ajouterAuRegistre écrit de façon atomique : aucun fichier temporaire ne reste", () => {
  const root = racineExemple(); const e = ouvrirEspace(root);
  e.ajouterAuRegistre({ id: "x#q1", reponse: "a" });
  assert.deepEqual(fs.readdirSync(path.join(root, "spec")).filter(f => f.includes(".tmp")), []);
  assert.equal(YAML.parse(fs.readFileSync(path.join(root, "spec/reponses.yml"), "utf8"))[0].id, "x#q1");
});

test("viewerHtml : la vue adhérent pose data-role, la vue locale non", () => {
  const e = ouvrirEspace(racineExemple());
  assert.match(e.viewerHtml({ role: "adherent" }), /<body data-role="adherent">/);
  assert.doesNotMatch(e.viewerHtml(), /<body data-role/);
});
