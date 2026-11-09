import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMoteur, etatCaTotal } from "./aide/moteur.mjs";

const PIEGE = "x\nselect 1; -- ";
const entree = modifs => ({ id: "tms#q4", reponse: "r", date: "2026-11-12T14:00:00", origine: "client", modifs });
const moteur = () => chargerMoteur(etatCaTotal({ source: "agent", question: "HT ?" }));

test("erreurModif refuse tout texte multi-ligne, de contrôle ou trop long", () => {
  const m = moteur();
  for (const text of [PIEGE, "a\rb", "a\u0000b", "a\u2028b", "a".repeat(301)])
    assert.match(m.run(`erreurModif(${JSON.stringify({ op: "exclure", cible: "tms", sql: "montant > 0", text })})`), /^text /, JSON.stringify(text));
  assert.equal(m.run(`erreurModif({op:"exclure",cible:"tms",sql:"montant > 0",text:"Exclure les nuls"})`), null);
  for (const k of ["titre", "contexte"])
    assert.match(m.run(`erreurModif(${JSON.stringify({ op: "question", cible: "tms", valeur: { text: "Une question valable ?", [k]: PIEGE } })})`), new RegExp(k));
});

test("la génération neutralise les retours à la ligne des textes libres", () => {
  const m = chargerMoteur(etatCaTotal({ source: "agent", question: "HT ?" }, { reponses: [] }));
  m.run(`(()=>{ const d=DS('tms'); d.desc=${JSON.stringify(PIEGE)}; d.grain=${JSON.stringify(PIEGE)}; d.columns[0].desc=${JSON.stringify(PIEGE)}; d.columns[1].desc=${JSON.stringify(PIEGE)};
    d.rules.push({text:${JSON.stringify(PIEGE)},sql:"montant > 0"}); S.st.societes[0].name=${JSON.stringify(PIEGE)}; S.st.adherent=${JSON.stringify(PIEGE)};
    S.st.flux[0].note=${JSON.stringify(PIEGE)}; S.ver++; return 1; })()`);
  const sorties = m.run(`[silverSql(DS('tms')), faitsSql(), qvs()]`);
  for (const sql of sorties) for (const l of sql.split("\n")) assert.ok(!/^select 1;/i.test(l.trim()), `ligne injectée : ${l}`);
});

test("la confiance ne change pas entre la mémoire brute et la vue anonymisée", async () => {
  const { anonymiser } = await import("../server/app.mjs");
  const memoire = { logiciels: [], colonnes: [], comptes: [{ id: "706", confirme_chez: ["a"], contredit_chez: ["b"] }] };
  const conf = mem => { const m = chargerMoteur(etatCaTotal({ source: "memoire:comptes/706", question: "HT ?" }, { memoire: { ...mem, dir: "" } }));
    return m.run("listeHypotheses()[0]"); };
  const brut = conf(memoire), anon = conf(anonymiser(memoire));
  assert.equal(anon.confiance, brut.confiance);
  assert.ok(anon.raisons.some(r => /moins de 3/.test(r)) && !anon.raisons.some(r => /chez 1 /.test(r)));
});
