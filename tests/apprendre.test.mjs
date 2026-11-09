import { test } from "node:test";
import assert from "node:assert/strict";
import { apprendre as app } from "../tools/apprendre.mjs";
import { pseudonyme } from "../tools/memoire.mjs";

const P = pseudonyme("s", "etc"), apprendre = (st, m) => app(st, m, "s");

const etat = (hypothese, cod = "CA TPS") => ({ datasets: [{ id: "bal", societe: "etc", columns: [] }], flux: [{ id: "f1", ds: "bal", rules: [{ prefix: "706", cod, lib: "CA transport", hypothese }] }] });
const vide = { comptes: [], colonnes: [] };
const existant = () => ({ comptes: [{ id: "706", cod: "CA TPS", lib: "CA transport", confirme_chez: ["autre"], contredit_chez: [] }], colonnes: [] });

test("une règle validée entre dans la mémoire des comptes", () => {
  assert.deepEqual(apprendre(etat({ source: "agent", valide: true }), vide).comptes,
    [{ id: "706", cod: "CA TPS", lib: "CA transport", confirme_chez: [P], contredit_chez: [] }]);
});

test("relancer ne duplique pas la confirmation", () => {
  const une = apprendre(etat({ valide: true }), vide);
  assert.deepEqual(apprendre(etat({ valide: true }), une).comptes[0].confirme_chez, [P]);
});

test("un démenti contredit l'entrée existante", () => {
  assert.deepEqual(apprendre(etat({ refuse: true }), existant()).comptes[0].contredit_chez, [P]);
});

test("un autre code validé contredit l'entrée sans la changer", () => {
  const e = apprendre(etat({ valide: true }, "CA LOG"), existant()).comptes[0];
  assert.deepEqual([e.cod, e.contredit_chez], ["CA TPS", [P]]);
});

test("une hypothèse non tranchée est ignorée, la mémoire d'entrée n'est pas modifiée", () => {
  const m = existant();
  assert.equal(apprendre(etat({ source: "agent" }), m).faits.length, 0);
  assert.deepEqual(m, existant());
});

test("une colonne validée entre dans la mémoire des colonnes", () => {
  const st = { datasets: [{ id: "tms", societe: "etc", columns: [{ name: "montant_ht", desc: "Montant HT", type: "decimal", hypothese: { valide: true } }] }], flux: [] };
  assert.deepEqual(apprendre(st, vide).colonnes, [{ id: "montant_ht", desc: "Montant HT", type: "decimal", confirme_chez: [P], contredit_chez: [] }]);
});

test("la clé de mémoire vient de la source memoire:<fichier>/<id>", () => {
  const st7 = etat({ source: "memoire:comptes/706", valide: true }); st7.flux[0].rules[0].prefix = "70610000";
  const e = apprendre(st7, existant());
  assert.deepEqual(e.comptes.map(c => [c.id, c.confirme_chez]), [["706", ["autre", P]]]);
  const st = { datasets: [{ id: "tms", societe: "etc", columns: [{ name: "mt", desc: "Montant HT", type: "decimal", hypothese: { source: "memoire:colonnes/montant_ht", valide: true } }] }], flux: [] };
  const m = { comptes: [], colonnes: [{ id: "montant_ht", desc: "Montant HT", type: "decimal", confirme_chez: [], contredit_chez: [] }] };
  assert.deepEqual(apprendre(st, m).colonnes.map(c => [c.id, c.confirme_chez]), [["montant_ht", [P]]]);
});

test("une colonne dont desc ou type diffère contredit l'entrée au lieu de la confirmer", () => {
  const m = { comptes: [], colonnes: [{ id: "montant_ht", desc: "Montant HT", type: "decimal", confirme_chez: [], contredit_chez: [] }] };
  const st = type => ({ datasets: [{ id: "tms", societe: "etc", columns: [{ name: "montant_ht", desc: "Montant TTC", type, hypothese: { valide: true } }] }], flux: [] });
  assert.deepEqual(apprendre(st("decimal"), m).colonnes[0].contredit_chez, [P]);
  const ok = { datasets: [{ id: "tms", societe: "etc", columns: [{ name: "montant_ht", desc: "Montant HT", type: "text", hypothese: { valide: true } }] }], flux: [] };
  assert.deepEqual(apprendre(ok, m).colonnes[0].contredit_chez, [P]);
});

test("une société n'est jamais à la fois confirmée et contredite : la dernière décision gagne", () => {
  const m = existant(); m.comptes[0].contredit_chez = [P];
  const e = apprendre(etat({ valide: true }), m).comptes[0];
  assert.deepEqual([e.confirme_chez, e.contredit_chez], [["autre", P], []]);
  const f = apprendre(etat({ refuse: true }), { comptes: [{ ...m.comptes[0], confirme_chez: [P], contredit_chez: [] }], colonnes: [] }).comptes[0];
  assert.deepEqual([f.confirme_chez, f.contredit_chez], [[], [P]]);
});
