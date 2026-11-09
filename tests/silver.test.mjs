import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, dataset, colonne } from "./aide/moteur.mjs";

const etat = (rules, extra = {}) => ({ datasets: [dataset("tms", [colonne("code", { type: "int" }), colonne("jour", { type: "date", format: "DD'MM" }), colonne("note", { role: "ignore" })],
  [["01", "", "x"], ["02", "", "y"], ["01", "", "z"]], { rules })], ...extra });

test("règle texte sur une colonne numérique : l'aperçu compare en nombre, comme Postgres", () => {
  const m = chargerMoteur(etat([{ text: "Hors code 01", sql: "code not in ('01')" }, { text: "Pas le 3", sql: "code <> '3'" }]));
  assert.equal(m.run("silverRows(DS('tms')).dropped"), 2);
  assert.equal(chargerMoteur(etat([{ text: "Code 02", sql: "code = '02'" }])).run("silverRows(DS('tms')).rows.length"), 1);
});

test("silverSql applique les règles aux colonnes converties, et échappe le format", () => {
  const sql = chargerMoteur(etat([{ text: "Hors code 01", sql: "code not in ('01')" }])).run("silverSql(DS('tms'))");
  assert.match(sql, /\),\n\nsilver as \(\nselect\n[\s\S]*nullif\(trim\(src\.code\), ''\)::integer as code,[\s\S]*\nfrom src\n\)\nselect \* from silver\nwhere \(code not in \('01'\)\)  -- Hors code 01\n$/);
  assert.match(sql, /to_date\(nullif\(trim\(src\.jour\), ''\), 'DD''MM'\)/);
  assert.doesNotMatch(chargerMoteur(etat([])).run("silverSql(DS('tms'))"), /silver|where/);
});

test("règle texte sur une colonne texte : la comparaison reste textuelle", () => {
  const s = etat([{ text: "Hors 1", sql: "code not in ('1')" }]); s.datasets[0].columns[0].type = "text";
  assert.equal(chargerMoteur(s).run("silverRows(DS('tms')).dropped"), 0);
});

test("check : erreur pour une colonne ignorée, alerte pour un identifiant inconnu, rien pour du SQL Postgres valide", () => {
  const f = chargerMoteur(etat([{ text: "a", sql: "note <> 'x'" }, { text: "b", sql: "code_libelle = 'Livré' and upper(code) in ('A')" }, { text: "c", sql: "code <> 1 and jour is not null" },
    { text: "d", sql: "extract(year from jour) = 2025" }, { text: "e", sql: "code::numeric > 0 and cast(code as integer) > 0" },
    { text: "f", sql: "jour > date '2025-01-01' and jour < current_date and societe_key = 's1'" }])).run("checkSpec()")
    .filter(x => /règle sur une colonne/.test(x.msg)).map(x => [x.niv, x.msg.replace(/^.*: /, "")]);
  assert.deepEqual(f, [["erreur", "note"], ["alerte", "code_libelle"]]);
});
