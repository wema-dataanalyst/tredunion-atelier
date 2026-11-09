/* Corrections de la revue sécurité du sous-projet 3b. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ecrireDataset, ecrireFlux, ecrireControle } from "../server/agent/specs.mjs";
import { ouvrirEspace } from "../tools/espace.mjs";
import { lancerMaquette, lancerEnfant, nettoyer, lireStatutMaquette } from "../server/maquette.mjs";
import { racineExemple } from "./aide/racine.mjs";
import { appelOutil } from "./aide/faux-llm.mjs";
import { monter, registre } from "./aide/multi.mjs";

const lire = (r, f) => fs.readFileSync(path.join(r, f), "utf8");
const FLUX = { id: "f9", ds: "tms_missions", codMode: "fixe", cod: "DISTANCE", lib: "Km", valeur: "km_prevus", date: "date_charg", unite: "km" };
const termine = (attente = 0) => ({ async discuter() { if (attente) await new Promise(r => setTimeout(r, attente)); return { message: { role: "assistant", content: null, tool_calls: appelOutil("terminer", { resume: "rien" }).tool_calls }, usage: { total_tokens: 1 } }; } });
/* `brut` : copie les CSV dans data/raw pour que `normaliser` tourne sans SFTP. */
const neuf = (brut = true) => {
  const racine = racineExemple();
  if (brut) for (const soc of ["kf", "rl"]) { const src = path.join(racine, "data/bronze", soc), dst = path.join(racine, "data/raw", soc); fs.mkdirSync(dst, { recursive: true }); fs.readdirSync(src).filter(f => f.endsWith(".csv")).forEach(f => fs.copyFileSync(path.join(src, f), path.join(dst, f))); }
  return { racine, espace: ouvrirEspace(racine) };
};
const now = () => new Date("2026-11-08T10:00:00");

/* ───── 1. grammaire fermée ───── */
test("règle silver : SQL hors grammaire refusé, rien n'est écrit ; condition du moteur acceptée", () => {
  const r = racineExemple(), f = "spec/datasets/tms_missions.yml", avant = lire(r, f);
  for (const sql of ["statut <> 'A' or 1=1", "statut in (select code from x)", "statut = 'A' union select 1", "lower(statut) = 'a'", "statut = 'A'; drop table x", "(select 1) = 1", "colonne_fantome = 'A'", "statut = 'A' -- fin"]) {
    const res = ecrireDataset(r, { id: "tms_missions", regles: [{ text: "x", sql }] });
    assert.ok(res.erreurs?.length, sql); assert.match(res.erreurs[0], /regles\[0\]/);
  }
  assert.equal(lire(r, f), avant);
  assert.ok(ecrireDataset(r, { id: "tms_missions", regles: [{ text: "x", sql: "statut <> 'A' and km_prevus > 0" }] }).ok);
  assert.ok(ecrireDataset(r, { id: "tms_missions", regles: [{ text: "ligne 1\nligne 2", sql: "statut = 'L'" }] }).erreurs, "texte multi-ligne = injection dans un commentaire SQL");
});

test("question de dataset : sql hors grammaire refusé", () => {
  const r = racineExemple();
  assert.ok(ecrireDataset(r, { id: "tms_missions", questions: [{ id: "q50", text: "x", reponse_type: "exclure", sql: "statut = 'A' or 1=1" }] }).erreurs);
});

test("flux : filtre et valeur hors grammaire refusés", () => {
  const r = racineExemple();
  for (const filtre of ["km_prevus > 0 or 1=1", "statut in (select 1)", "km_prevus > 0; --", "now() > 0", "km_prevus > 0 union select 1", "colonne_fantome > 0"])
    assert.ok(ecrireFlux(r, { ...FLUX, filtre }).erreurs?.some(e => /filtre/.test(e)), filtre);
  for (const valeur of ["(select sum(1) from x)", "km_prevus; drop table x", "pg_sleep(10)", "km_prevus + fantome", "1 or 1", "km_prevus /* c */"])
    assert.ok(ecrireFlux(r, { ...FLUX, valeur }).erreurs?.some(e => /valeur/.test(e)), valeur);
  assert.ok(!fs.existsSync(path.join(r, "spec/flux/f9.yml")));
  assert.ok(ecrireFlux(r, { ...FLUX, valeur: "km_prevus * 2", filtre: "km_prevus > 0 and statut <> 'A'" }).ok);
});

test("flux : cod, lib, prefix, site, colonnes ne sont jamais du SQL libre", () => {
  const r = racineExemple();
  const refus = (extra, motif) => assert.ok(ecrireFlux(r, { ...FLUX, ...extra }).erreurs?.some(e => motif.test(e)), JSON.stringify(extra));
  refus({ lib: "x' || (select 1) || '" }, /lib/);
  refus({ lib: "x\"y" }, /lib/);
  refus({ cod: "DISTANCE' or '1'='1" }, /cod/);
  refus({ site: "'Stras'bourg'" }, /site/);
  refus({ site: "'a'; drop" }, /site/);
  refus({ site: "(select 1)" }, /site/);
  refus({ vehicule: "date_charg; drop table x" }, /vehicule/);
  refus({ chauffeur: "'texte'" }, /chauffeur/);
  refus({ client: "upper(statut)" }, /client/);
  refus({ date: "date_charg) or (1=1" }, /date/);
  refus({ unite: "km\nselect 1" }, /unite/);
  refus({ note: "a\nselect 1" }, /note/);
  assert.ok(ecrireFlux(r, { id: "f8", ds: "tms_missions", codMode: "regles", codCol: "statut; drop", valeur: "km_prevus", date: "date_charg", rules: [{ prefix: "7061", cod: "CA TPS" }] }).erreurs);
  assert.ok(ecrireFlux(r, { id: "f8", ds: "tms_missions", codMode: "regles", codCol: "statut", valeur: "km_prevus", date: "date_charg", rules: [{ prefix: "70' or '1", cod: "CA TPS" }] }).erreurs);
  assert.ok(ecrireFlux(r, { id: "f8", ds: "tms_missions", codMode: "regles", codCol: "statut", valeur: "km_prevus", date: "date_charg", rules: [{ prefix: "7061", cod: "CA TPS", lib: "x'--" }] }).erreurs);
  assert.ok(ecrireFlux(r, { id: "f8", ds: "tms_missions", codMode: "colonne", codCol: "statut", libCol: "x) from y --", valeur: "km_prevus", date: "date_charg" }).erreurs);
  assert.ok(ecrireFlux(r, { ...FLUX, site: "'Strasbourg'", vehicule: "immat_tracteur", chauffeur: "code_cond" }).ok);
});

test("contrôle ecart_somme : valeur et filtre hors grammaire refusés", () => {
  const r = racineExemple();
  const c = (a, b) => ecrireControle(r, { id: "c9", type: "ecart_somme", annee: 2025, tolerance: 0.05, a, b });
  const a = { ds: "tms_missions", valeur: "ca_ht", date: "date_livr" }, b = { ds: "compta_balance", valeur: "montant" };
  assert.ok(c({ ...a, valeur: "(select 1)" }, b).erreurs?.some(e => /a\.valeur/.test(e)));
  assert.ok(c(a, { ...b, filtre: "compte like '70%' or 1=1" }).erreurs?.some(e => /b\.filtre/.test(e)));
  assert.ok(c(a, { ...b, filtre: "compte in (select 1)" }).erreurs);
  assert.ok(c({ ...a, date: "date_livr; x" }, b).erreurs);
  assert.ok(!fs.existsSync(path.join(r, "spec/controles.yml")) || !/c9/.test(lire(r, "spec/controles.yml")));
  assert.ok(c(a, { ...b, filtre: "compte like '70%'" }).ok);
});

/* ───── 2. statut sans donnée de ligne ───── */
test("enfant en échec : suites de chiffres et valeurs pii masquées dans l'erreur", async () => {
  const { racine } = neuf();
  const nom = lire(racine, "data/bronze/kf/tms_conducteurs.csv").split("\n")[1].split(";")[1];
  const script = `console.error("ligne : ${nom};carte 12345678901;petit 1234;ok"); process.exit(2)`;
  const e = await lancerEnfant({ racine, societe: "kf", commande: [process.execPath, "-e", script] });
  assert.equal(e.ok, false);
  assert.ok(!e.erreur.includes(nom) && !/\d{6,}/.test(e.erreur), e.erreur);
  assert.match(e.erreur, /1234/, "les petits nombres restent lisibles");
});

test("run en échec à la collecte : le statut stocké ne contient ni pii ni longue suite de chiffres", async () => {
  const { racine, espace } = neuf(false); fs.rmSync(path.join(racine, "data/bronze"), { recursive: true, force: true });
  const nom = "Fournier";
  const r = await lancerMaquette({ racine, espace, llm: termine(), now });
  assert.equal(r.ok, false);
  const st = JSON.stringify(lireStatutMaquette(racine)); assert.ok(!st.includes(nom) && !/\d{6,}/.test(st));
});

/* ───── 3. liens symboliques ───── */
test("lien symbolique sous spec/ : le run échoue proprement, rien n'est modifié", async () => {
  const { racine, espace } = neuf(), spec = path.join(racine, "spec");
  const dehors = path.join(racine, "dehors.txt"); fs.writeFileSync(dehors, "secret");
  fs.symlinkSync(dehors, path.join(spec, "lien.yml"));
  const r = await lancerMaquette({ racine, espace, llm: termine(), now });
  assert.equal(r.ok, false); assert.match(r.erreurs.join(" "), /lien symbolique/i);
  assert.equal(fs.readFileSync(dehors, "utf8"), "secret");
  assert.ok(!fs.existsSync(path.join(racine, ".atelier/spec-avant")), "aucune copie n'est faite");
  assert.ok(fs.lstatSync(path.join(spec, "lien.yml")).isSymbolicLink());
});

test("lien symbolique apparu pendant le run : pas de restauration à travers le lien, échec propre", async () => {
  const { racine, espace } = neuf(), spec = path.join(racine, "spec");
  const dehors = path.join(racine, "dossier-dehors"); fs.mkdirSync(dehors);
  const llm = { async discuter() { fs.symlinkSync(dehors, path.join(spec, "evasion")); throw new Error("panne"); } };
  const r = await lancerMaquette({ racine, espace, llm, now });
  assert.equal(r.ok, false); assert.deepEqual(fs.readdirSync(dehors), []);
});

/* ───── 4. course avec /api/reponse ───── */
test("réponse dont le corps arrive après le lancement d'un run : 409, registre intact", async t => {
  const m = await monter(t, { llm: termine(600) });
  const racine = path.join(m.adherents, "alpha");
  for (const soc of ["kf", "rl"]) { const dst = path.join(racine, "data/raw", soc); fs.mkdirSync(dst, { recursive: true }); fs.readdirSync(path.join(racine, "data/bronze", soc)).filter(f => f.endsWith(".csv")).forEach(f => fs.copyFileSync(path.join(racine, "data/bronze", soc, f), path.join(dst, f))); }
  const alpha = (await m.connecter("alpha")).cookie, admin = (await m.connecter("admin-michel")).cookie;
  const avant = registre(m, "alpha").length;
  const corps = JSON.stringify({ id: "tms_missions#q1", saisie: { type: "libre", texte: "x" }, par: "alpha" });
  const statut = await new Promise((ok, ko) => {
    const req = http.request(m.url + "/api/reponse", { method: "POST", headers: { "content-type": "application/json", cookie: alpha, "content-length": Buffer.byteLength(corps), origin: m.url } }, res => { res.resume(); ok(res.statusCode); });
    req.on("error", ko); req.write(corps.slice(0, 5));
    setTimeout(async () => {
      const lancement = await fetch(m.url + "/api/maquette?adherent=alpha", { method: "POST", headers: { "content-type": "application/json", cookie: admin }, body: "{}" });
      assert.equal(lancement.status, 202); req.end(corps.slice(5));
    }, 100);
  });
  assert.equal(statut, 409); assert.equal(registre(m, "alpha").length, avant);
  await m.srv.attendreMaquette("alpha");
});

test("la maquette ne touche jamais spec/reponses.yml (ni copie, ni restauration, ni effacement)", async () => {
  const { racine, espace } = neuf(), reg = path.join(racine, "spec/reponses.yml");
  const llm = { async discuter() { fs.writeFileSync(reg, "# effacé par l'agent\n"); fs.writeFileSync(path.join(racine, "spec/flux/zz.yml"), "id: zz\nds: inconnu\n"); return { message: { role: "assistant", content: null, tool_calls: appelOutil("terminer", { resume: "x" }).tool_calls }, usage: { total_tokens: 1 } }; } };
  const avant = lire(racine, "spec/reponses.yml");
  const r = await lancerMaquette({ racine, espace, llm, now });
  assert.equal(r.ok, false);
  assert.ok(!fs.existsSync(path.join(racine, ".atelier/spec-avant/reponses.yml")), "pas dans la copie");
  assert.equal(lire(racine, "spec/reponses.yml"), "# effacé par l'agent\n", "pas restauré (et jamais écrit par l'outil)");
  assert.notEqual(avant, "");
  assert.ok(!fs.existsSync(path.join(racine, "spec/flux/zz.yml")), "le reste est bien restauré");
});

/* ───── 5. plafond de durée, secrets ───── */
test("plafond de durée totale : le run est interrompu avec un message dédié", async () => {
  const { racine, espace } = neuf(), spec = path.join(racine, "spec");
  const avant = lire(racine, "spec/projet.yml");
  const llm = { async discuter() { await new Promise(r => setTimeout(r, 400)); return { message: { role: "assistant", content: null, tool_calls: appelOutil("terminer", { resume: "x" }).tool_calls }, usage: { total_tokens: 1 } }; } };
  const r = await lancerMaquette({ racine, espace, llm, now, plafondMs: 150 });
  assert.equal(r.ok, false); assert.match(r.erreurs[0], /durée maximale/);
  assert.equal(lire(racine, "spec/projet.yml"), avant); assert.ok(spec);
});

test("secrets : toute variable au nom évocateur est masquée, même courte", () => {
  assert.equal(nettoyer("le code est ab et abc ; xabcx", ["ab", "abc"]), "le code est *** et *** ; xabcx");
  assert.equal(nettoyer("longsecret123", ["longsecret123"]), "***");
});

test("secrets : une variable d'environnement courte au nom secret est masquée dans l'erreur de l'enfant", async () => {
  const { racine } = neuf(); process.env.MON_PWD_TEST = "zz";
  try {
    const e = await lancerEnfant({ racine, societe: "kf", commande: [process.execPath, "-e", "console.error('echec zz fin'); process.exit(2)"] });
    assert.ok(!/\bzz\b/.test(e.erreur), e.erreur);
  } finally { delete process.env.MON_PWD_TEST; }
});
