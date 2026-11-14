import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ouvrirEspace } from "../tools/espace.mjs";
import { creerOutilsMaquette } from "../server/agent/maquette-outils.mjs";
import { documenterDatasets, ecrireRelations, ecrireFluxEtControles, creerBudget } from "../server/agent/maquette-agent.mjs";
import { racineExemple } from "./aide/racine.mjs";
import { fauxLlm, appelOutil } from "./aide/faux-llm.mjs";

const neuf = () => { const racine = racineExemple(), espace = ouvrirEspace(racine); return { racine, espace, o: creerOutilsMaquette({ espace, racine }) }; };
const lire = (racine, f) => fs.readFileSync(path.join(racine, f), "utf8");
const hyp = { source: "agent", preuves: ["12 lignes, 0 % de vides"], question: "Ces codes sont-ils les bons ?" };
const NOMS = ["lire_dataset", "lire_memoire", "lire_comptes", "lire_plan_comptes", "lire_couverture", "lire_candidats_perimetre", "lire_codes_sans_libelle", "lire_reponses_adherent", "lire_mesures_base", "ecrire_dataset", "ecrire_flux", "ecrire_controle", "ecrire_relation", "ecrire_perimetre", "ecrire_libelles", "ecrire_proposition", "terminer"];
/* valeurs des colonnes pii de l'exemple */
const piiValeurs = racine => lire(racine, "data/bronze/kf/tms_conducteurs.csv").split("\n").slice(1).flatMap(l => l.split(";").slice(1, 3)).filter(v => v.length >= 4);

test("outils : liste attendue, lectures sans valeur pii", async () => {
  const { racine, o } = neuf();
  assert.deepEqual(Object.keys(o).sort(), [...NOMS].sort());
  const p = await o.lire_dataset.executer({ id: "tms_conducteurs" });
  assert.ok(p.colonnes.length > 0 && p.lignes > 0);
  const t = JSON.stringify(p); piiValeurs(racine).forEach(v => assert.ok(!t.includes(v), "valeur pii dans le profil"));
  const nom = p.colonnes.find(c => c.nom === "nom"); assert.equal(nom.pii, true); assert.equal(nom.frequentes, undefined);
  assert.ok((await o.lire_couverture.executer({})).referentiel.includes("AFFR"));
  assert.deepEqual(await o.lire_memoire.executer({ colonne: "inconnue_xyz" }), { entrees: [] });
  assert.deepEqual(await o.lire_comptes.executer({ prefixe: "706" }), { entrees: [] });
});

test("outils : dataset hors périmètre ou id malveillant refusé", async () => {
  const { o } = neuf();
  for (const id of ["autre_adherent", "../../etc/passwd", "", undefined, 3]) assert.ok((await o.lire_dataset.executer({ id })).erreur, String(id));
});

test("espace.memoireComptes : entrées anonymisées par préfixe", () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || "/tmp"), "mem-")); fs.writeFileSync(path.join(dir, "comptes.yml"), "- id: '706'\n  cod: CA TPS\n  confirme_chez: [alpha, beta]\n  contredit_chez: []\n");
  const avant = process.env.TREDUNION_MEMOIRE; process.env.TREDUNION_MEMOIRE = dir;
  try { const e = ouvrirEspace(racineExemple()).memoireComptes("7061"); assert.equal(e.length, 1); assert.deepEqual([e[0].cod, e[0].confirme_chez], ["CA TPS", "moins de 3 adhérents"]); assert.equal(e[0].contredit_chez, 0); assert.equal(ouvrirEspace(racineExemple()).memoireComptes("").length, 0); }
  finally { avant === undefined ? delete process.env.TREDUNION_MEMOIRE : process.env.TREDUNION_MEMOIRE = avant; }
});

test("documenterDatasets : un dataset documenté de bout en bout (écriture, hypothèse non validée, suivi)", async () => {
  const { racine, espace } = neuf();
  const suivi = [];
  const llm = fauxLlm([
    appelOutil("ecrire_dataset", { id: "tms_conducteurs", desc: "Conducteurs du TMS", colonnes: [{ name: "type_contrat", desc: "Type de contrat", hypothese: { ...hyp, valide: true } }] }),
  ]);
  const r = await documenterDatasets({ espace, racine, llm, ids: ["tms_conducteurs"], rapporter: x => suivi.push(x) });
  assert.equal(r.ok, true); assert.deepEqual(r.boucles.map(b => [b.cible, b.issue, b.tours]), [["tms_conducteurs", "termine", 1]]);
  assert.deepEqual(suivi, [{ etape: "datasets", i: 1, n: 1 }]);
  const y = lire(racine, "spec/datasets/tms_conducteurs.yml"); assert.match(y, /desc: Conducteurs du TMS/); assert.match(y, /valide: false/); assert.doesNotMatch(y, /valide: true/);
  assert.match(y, /# Dataset bronze tms_conducteurs/);
  assert.equal(r.jetons, 10);
  assert.match(llm.appels[0].messages[0].content, /Profil complet/); assert.deepEqual(llm.appels[0].outils.map(o => o.function.name), ["ecrire_dataset"]);
});

test("documenterDatasets : par défaut, seuls les datasets sans desc ; une écriture refusée revient au modèle comme erreur", async () => {
  const { racine, espace } = neuf();
  const f = path.join(racine, "spec/datasets/tms_conducteurs.yml"); fs.writeFileSync(f, lire(racine, "spec/datasets/tms_conducteurs.yml").replace(/^desc:.*$/m, "desc: ''"));
  for (const d of fs.readdirSync(path.join(racine, "spec/datasets")).filter(x => x !== "tms_conducteurs.yml")) { const g = path.join(racine, "spec/datasets", d); fs.writeFileSync(g, fs.readFileSync(g, "utf8").replace(/^desc: ""$/m, "desc: Déjà documenté")); }
  const llm = fauxLlm([
    appelOutil("ecrire_dataset", { id: "tms_conducteurs", colonnes: [{ name: "colonne_inconnue", desc: "x" }] }),
    appelOutil("ecrire_dataset", { id: "tms_conducteurs", desc: "Corrigé" }),
  ]);
  const r = await documenterDatasets({ espace, racine, llm });
  assert.deepEqual(r.boucles.map(b => b.cible), ["tms_conducteurs"]);
  assert.match(llm.appels[1].messages.at(-1).content, /erreurs/); assert.match(llm.appels[1].messages.at(-1).content, /colonne inconnue/);
  assert.match(lire(racine, "spec/datasets/tms_conducteurs.yml"), /desc: '?Corrigé/);
});

test("plafond de jetons : échec propre avec message clair, plus aucun appel ensuite", async () => {
  const { racine, espace } = neuf();
  const llm = fauxLlm([{ ...appelOutil("ecrire_dataset", { id: "tms_conducteurs", colonnes: [{ name: "inconnue", desc: "x" }] }), usage: { total_tokens: 500 } }, ...Array(5).fill({ ...appelOutil("terminer", {}) })]);
  const r = await documenterDatasets({ espace, racine, llm, ids: ["tms_conducteurs", "tms_missions"], budget: creerBudget(400) });
  assert.match(r.erreurs[0], /Plafond de .* jetons atteint/); assert.equal(r.ok, undefined); assert.equal(llm.appels.length, 1);
  const deja = await documenterDatasets({ espace, racine, llm, ids: ["tms_missions"], budget: { plafond: 10, utilises: 10 } });
  assert.match(deja.erreurs[0], /Plafond/); assert.equal(llm.appels.length, 1);
});

test("passerelle en échec : erreur propre", async () => {
  const { racine, espace } = neuf();
  const r = await documenterDatasets({ espace, racine, llm: { discuter: async () => { throw new Error("passerelle LLM injoignable"); } }, ids: ["tms_conducteurs"] });
  assert.deepEqual(r.erreurs, ["passerelle LLM injoignable"]);
});

test("ecrireFluxEtControles : une boucle par catégorie du référentiel (au plus max), puis les contrôles", async () => {
  const { racine, espace } = neuf();
  const attendues = espace.couverture().manque.filter(x => lire(racine, "spec/referentiel.yml").includes(`cod: ${x.categorie}\n`)).slice(0, 2).length;
  const suivi = [], llm = fauxLlm(Array(10).fill(appelOutil("terminer", { resume: "rien" })));
  const r = await ecrireFluxEtControles({ espace, racine, llm, max: 2, rapporter: x => suivi.push(x) });
  assert.equal(r.ok, true); assert.equal(r.boucles.length, attendues + 1); assert.equal(r.boucles.at(-1).cible, "controles");
  assert.deepEqual(suivi.at(-1), { etape: "controles", i: 1, n: 1 }); assert.ok(attendues > 0);
  assert.match(llm.appels[0].messages[0].content, /Catégorie à débloquer/);
});

test("flux : un code hors référentiel est refusé et renvoyé au modèle", async () => {
  const { racine, espace } = neuf();
  const llm = fauxLlm([appelOutil("ecrire_flux", { id: "f9", ds: "tms_missions", codMode: "fixe", cod: "INVENTE", lib: "x", valeur: "montant", agg: "sum", champ: "MontantReel", date: "date_chargement" }), appelOutil("terminer", {}), appelOutil("terminer", {}), appelOutil("terminer", {})]);
  await ecrireFluxEtControles({ espace, racine, llm, max: 1 });
  assert.match(llm.appels[1].messages.at(-1).content, /erreurs/); assert.ok(!fs.existsSync(path.join(racine, "spec/flux/f9.yml")));
});

test("aucune valeur pii dans les messages envoyés au modèle (outils de lecture et d'écriture)", async () => {
  const { racine, espace } = neuf();
  const llm = fauxLlm([appelOutil("ecrire_dataset", { id: "tms_conducteurs", desc: "Conducteurs" })]);
  await documenterDatasets({ espace, racine, llm, ids: ["tms_conducteurs"] });
  const vu = JSON.stringify(llm.appels.at(-1).messages.filter(m => m.role !== "assistant")); piiValeurs(racine).forEach(v => assert.ok(!vu.includes(v), "valeur pii envoyée au modèle"));
  assert.match(vu, /personnelle/);
});

test("ecrireRelations : un index compact des colonnes, aucun profil complet, outils limités aux relations", async () => {
  const { racine, espace } = neuf();
  const llm = fauxLlm([appelOutil("terminer", { resume: "rien d'évident" })]);
  const r = await ecrireRelations({ espace, racine, llm });
  assert.equal(r.ok, true); assert.deepEqual(r.boucles.map(b => [b.cible, b.issue, b.tours]), [["relations", "termine", 1]]);
  assert.deepEqual(llm.appels[0].outils.map(o => o.function.name).sort(), ["ecrire_relation", "terminer"]);
  assert.match(llm.appels[0].messages[0].content, /tms_conducteurs : /);
});
