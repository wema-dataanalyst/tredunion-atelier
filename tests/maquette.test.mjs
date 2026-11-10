import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ouvrirEspace } from "../tools/espace.mjs";
import { lancerMaquette, lancerEnfant, nettoyer, lireStatutMaquette, recupererInterrompu } from "../server/maquette.mjs";
import { racineExemple, ATELIER } from "./aide/racine.mjs";
import YAML from "yaml";
import { appelOutil } from "./aide/faux-llm.mjs";
import { ecrireProposition } from "../server/agent/specs.mjs";

const hypProp = { source: "agent", preuves: ["réponse adhérent"], question: "Suivre le CA froid ?" };
const propMaquette = {
  id: "p1",
  titre: "Suivre le CA froid ?",
  contexte: "Transport frigorifique.",
  codes: [{ cod: "CA FROID", lib: "Chiffre d'affaires froid" }],
  mesures: [
    { gabarit: "somme", nom: "CA froid", categories: ["CA FROID"], periodes: ["reel"] },
    { gabarit: "ratio", nom: "% froid du CA", num: "CA froid", den: "CA Réel" },
  ],
  feuille: "Mes indicateurs",
  hypothese: hypProp,
};
const llmEcritProposition = () => {
  let apres = false;
  return {
    async discuter(requete) {
      const u = String(requete.messages?.at(-1)?.content || "");
      if (!apres && /lire_reponses_adherent|mesures de base/.test(u)) {
        return {
          message: { role: "assistant", content: null, tool_calls: appelOutil("ecrire_proposition", propMaquette).tool_calls },
          usage: { total_tokens: 10 },
        };
      }
      if (!apres && requete.messages?.some(m => m.role === "tool" && String(m.content || "").includes('"ok":true'))) apres = true;
      return { message: { role: "assistant", content: null, tool_calls: appelOutil("terminer", { resume: "propositions" }).tool_calls }, usage: { total_tokens: 10 } };
    },
  };
};

const lire = (racine, f) => fs.readFileSync(path.join(racine, f), "utf8");
const FAUX_MDP = "faux-mdp-sftp-4242", FAUX_JETON = "faux-jeton-abcdef";

/* LLM qui termine chaque boucle ; avant, il peut agir sur le disque (effet de bord du test). */
const llmTermine = (avant = () => {}, jetons = 10) => { let n = 0; return { async discuter() { if (!n++) avant(); return { message: { role: "assistant", content: null, tool_calls: appelOutil("terminer", { resume: "rien à écrire" }).tool_calls }, usage: { total_tokens: jetons } }; } }; };

/* Racine d'exemple avec data/raw (copie des CSV) pour que `normaliser` tourne sans SFTP. */
function neuf() {
  const racine = racineExemple();
  for (const soc of ["kf", "rl"]) {
    const src = path.join(racine, "data/bronze", soc), dst = path.join(racine, "data/raw", soc); fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(src).filter(f => f.endsWith(".csv")).forEach(f => fs.copyFileSync(path.join(src, f), path.join(dst, f)));
  }
  return { racine, espace: ouvrirEspace(racine) };
}
const arbre = dir => { const o = {}; const p = (d, pre) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => e.isDirectory() ? p(path.join(d, e.name), `${pre}${e.name}/`) : o[pre + e.name] = fs.readFileSync(path.join(d, e.name)).toString("base64")); p(dir, ""); return o; };
const now = () => new Date("2026-11-08T10:00:00");

test("maquette : succès sur l'exemple (statut, journal, build, check à 0 erreur)", async () => {
  const { racine, espace } = neuf(), vus = [], avant = lire(racine, "spec/journal.yml");
  const r = await lancerMaquette({ racine, espace, llm: llmTermine(), rapporter: s => vus.push(s.etape), now });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const st = lireStatutMaquette(racine);
  assert.equal(st.ok, true); assert.ok(st.debut && st.fin); assert.deepEqual(st.erreurs, []);
  assert.deepEqual(Object.keys(st.resume).sort(), ["controlesEnEcart", "fiche", "hypotheses", "mesuresApres", "mesuresAvant"]);
  assert.equal(st.resume.fiche, "generated/fiche_seance.md");
  assert.ok(vus.includes("collecte") && vus.includes("flux") && vus.includes("controles") && vus.includes("perimetre") && vus.includes("libelles") && vus.includes("verification"));
  assert.ok(fs.existsSync(path.join(racine, "generated/fiche_seance.md")));
  assert.ok(fs.existsSync(path.join(racine, "data/bronze/kf/tms_missions.meta.json")), "le processus enfant a normalisé");
  assert.ok(fs.existsSync(path.join(racine, ".atelier/spec-avant/projet.yml")));
  const j = lire(racine, "spec/journal.yml");
  assert.ok(j.startsWith(avant.replace(/\n*$/, "\n")), "journal existant conservé");
  assert.match(j, /question: maquette automatique/); assert.match(j, /→/);
  const lignes = lire(racine, ".atelier/maquette.jsonl").trim().split("\n").map(l => JSON.parse(l));
  assert.ok(lignes.length >= 3 && lignes.every(l => l.date && l.etape));
  assert.ok(lignes.some(l => l.etape === "construction" && l.issue === "ok"));
  const c = spawnSync(process.execPath, [ATELIER, "check"], { env: { ...process.env, ATELIER_ROOT: racine }, encoding: "utf8" });
  assert.equal(c.status, 0, c.stdout); assert.match(c.stdout, /0 erreur/);
});

test("maquette : check en échec → spec/ identique octet pour octet, fichiers créés supprimés", async () => {
  const { racine, espace } = neuf(), avant = arbre(path.join(racine, "spec"));
  const sabote = () => {
    fs.writeFileSync(path.join(racine, "spec/flux/zz_agent.yml"), "id: zz_agent\nds: dataset_inconnu\ncodMode: fixe\ncod: AFFR\nlib: x\nvaleur: y\nagg: sum\nchamp: MontantReel\ndate: d\n");
    fs.appendFileSync(path.join(racine, "spec/projet.yml"), "# modifié par l'agent\n");
    fs.rmSync(path.join(racine, "spec/relations.yml"));
  };
  const r = await lancerMaquette({ racine, espace, llm: llmTermine(sabote), rapporter() {}, now });
  assert.equal(r.ok, false); assert.ok(r.erreurs.length > 0);
  assert.deepEqual(arbre(path.join(racine, "spec")), avant);
  const st = lireStatutMaquette(racine); assert.equal(st.ok, false); assert.ok(st.erreurs.length > 0); assert.ok(st.fin);
  assert.ok(!fs.existsSync(path.join(racine, "spec/flux/zz_agent.yml")));
});

test("maquette : plafond de jetons → échec propre, le travail déjà écrit est gardé (pas de restauration)", async () => {
  const { racine, espace } = neuf(), avant = arbre(path.join(racine, "spec"));
  const r = await lancerMaquette({ racine, espace, llm: llmTermine(() => fs.appendFileSync(path.join(racine, "spec/projet.yml"), "# x\n"), 500000), rapporter() {}, now });
  assert.equal(r.ok, false); assert.match(r.erreurs.join(" "), /jetons/); assert.match(r.erreurs.join(" "), /relancez la maquette/);
  assert.match(lire(racine, "spec/projet.yml"), /# x/, "la spec modifiée n'est pas restaurée");
  assert.notDeepEqual(arbre(path.join(racine, "spec")), avant);
});

test("maquette : échec d'une étape agent (passerelle injoignable) → le travail déjà écrit avant l'échec est gardé", async () => {
  const { racine, espace } = neuf();
  let n = 0;
  const llm = { async discuter() { if (n++ === 0) { fs.appendFileSync(path.join(racine, "spec/projet.yml"), "# déjà écrit avant l'incident\n"); return { message: { role: "assistant", content: null, tool_calls: appelOutil("terminer", { resume: "ok" }).tool_calls }, usage: { total_tokens: 10 } }; } throw new Error("passerelle LLM injoignable"); } };
  const r = await lancerMaquette({ racine, espace, llm, rapporter() {}, now });
  assert.equal(r.ok, false); assert.match(r.erreurs.join(" "), /passerelle LLM injoignable/); assert.match(r.erreurs.join(" "), /relancez la maquette/);
  assert.match(lire(racine, "spec/projet.yml"), /# déjà écrit avant l'incident/);
});

test("maquette : sans passerelle LLM → échec sans toucher à spec/", async () => {
  const { racine, espace } = neuf(), avant = arbre(path.join(racine, "spec"));
  const r = await lancerMaquette({ racine, espace, llm: null, rapporter() {}, now });
  assert.equal(r.ok, false); assert.deepEqual(arbre(path.join(racine, "spec")), avant);
});

test("enfant : .env de l'adhérent chargé, variables du serveur non transmises, aucun secret dans l'erreur", async () => {
  const { racine, espace } = neuf();
  // .env factice sans SFTP_DIR : la collecte échoue tout de suite, sans réseau, en nommant seulement la variable absente.
  fs.writeFileSync(path.join(racine, ".env"), `SFTP_HOST=127.0.0.1\nSFTP_USER=faux\nSFTP_PASSWORD=${FAUX_MDP}\n`);
  process.env.LLM_API_KEY = FAUX_JETON;
  try {
    const e = await lancerEnfant({ racine, societe: "kf", sansCollecte: false });
    assert.equal(e.ok, false); assert.match(e.erreur, /SFTP_DIR/); assert.doesNotMatch(e.erreur, /SFTP_HOST|SFTP_USER|SFTP_PASSWORD/);
    const r = await lancerMaquette({ racine, espace, llm: llmTermine(), rapporter() {}, now });
    assert.equal(r.ok, false); assert.match(r.erreurs.join(" "), /SFTP_DIR/);
    const tout = [".atelier/maquette.json", ".atelier/maquette.jsonl"].map(f => lire(racine, f)).join("\n") + JSON.stringify(r);
    assert.ok(!tout.includes(FAUX_MDP) && !tout.includes(FAUX_JETON));
  } finally { delete process.env.LLM_API_KEY; }
});

test("enfant : environnement filtré et sortie nettoyée des secrets", async () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "enfant-"));
  fs.writeFileSync(path.join(racine, ".env"), `SFTP_PASSWORD=${FAUX_MDP}\nSFTP_HOST=h\n`);
  process.env.LLM_API_KEY = FAUX_JETON; process.env.SFTP_PASSWORD = "mdp-du-serveur-9999";
  try {
    const script = `const e=process.env;console.error(JSON.stringify({racine:e.ATELIER_ROOT,llm:!!e.LLM_API_KEY,sftp:!!e.SFTP_PASSWORD}));console.error("Authorization: Bearer ${FAUX_JETON} mdp=${FAUX_MDP} SFTP_PASSWORD=autre mdp-du-serveur-9999");process.exit(3)`;
    const e = await lancerEnfant({ racine, societe: "kf", commande: [process.execPath, "-e", script] });
    assert.equal(e.ok, false);
    assert.match(e.erreur, new RegExp(`"racine":"${racine.replace(/\//g, "\\/")}","llm":false,"sftp":false`));
    for (const s of [FAUX_JETON, FAUX_MDP, "mdp-du-serveur-9999", "=autre"]) assert.ok(!e.erreur.includes(s), s);
    assert.match(e.erreur, /Bearer \*\*\*/);
  } finally { delete process.env.LLM_API_KEY; delete process.env.SFTP_PASSWORD; }
});

test("enfant : les lignes sortent en direct, nettoyées des secrets et des longs nombres", async () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "enfant-"));
  fs.writeFileSync(path.join(racine, ".env"), `SFTP_PASSWORD=${FAUX_MDP}\n`);
  const script = `console.log("lecture tms_missions");console.log("mdp=${FAUX_MDP} 12345678901");console.log("fin sans retour")`;
  const lignes = [];
  const e = await lancerEnfant({ racine, societe: "kf", commande: [process.execPath, "-e", script], surLigne: l => lignes.push(l) });
  assert.equal(e.ok, true);
  assert.equal(lignes[0], "lecture tms_missions");
  assert.ok(lignes.every(l => !l.includes(FAUX_MDP) && !l.includes("12345678901")), lignes.join("|"));
  assert.equal(lignes.length, 3);
});

test("enfant : délai dépassé → arrêt et message", async () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "enfant-"));
  const e = await lancerEnfant({ racine, societe: "kf", delaiMs: 300, commande: [process.execPath, "-e", "setTimeout(()=>{},60000)"] });
  assert.equal(e.ok, false); assert.match(e.erreur, /délai/i);
});

test("nettoyer : Bearer, mots de passe et secrets littéraux", () => {
  const t = nettoyer("a Bearer abc.def-12 b password: hunter2 c SFTP_PASSWORD=xyz d SECRETLITTERAL e", ["SECRETLITTERAL"]);
  for (const s of ["abc.def-12", "hunter2", "xyz", "SECRETLITTERAL"]) assert.ok(!t.includes(s), s);
});

test("statut : absent ou corrompu → null, sans lever", () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "statut-"));
  assert.equal(lireStatutMaquette(racine), null);
  fs.mkdirSync(path.join(racine, ".atelier")); fs.writeFileSync(path.join(racine, ".atelier/maquette.json"), '{"etape":"flu');
  assert.equal(lireStatutMaquette(racine), null);
  fs.writeFileSync(path.join(racine, ".atelier/maquette.json"), "[1]");
  assert.equal(lireStatutMaquette(racine), null);
  assert.equal(recupererInterrompu(racine), false);
});

test("redémarrage : statut « en cours » périmé → interrompu, spec/ restaurée", () => {
  const { racine } = neuf(), avant = arbre(path.join(racine, "spec"));
  fs.cpSync(path.join(racine, "spec"), path.join(racine, ".atelier/spec-avant"), { recursive: true });
  fs.writeFileSync(path.join(racine, "spec/projet.yml"), "adherent: casse\n"); fs.writeFileSync(path.join(racine, "spec/flux/nouveau.yml"), "id: nouveau\n");
  fs.writeFileSync(path.join(racine, ".atelier/maquette.json"), JSON.stringify({ etape: "flux", i: 2, n: 5, debut: "2026-11-08T10:00:00" }));
  assert.equal(recupererInterrompu(racine, now), true);
  assert.deepEqual(arbre(path.join(racine, "spec")), avant);
  const st = lireStatutMaquette(racine); assert.equal(st.etape, "interrompu"); assert.equal(st.ok, false); assert.ok(st.fin); assert.ok(st.erreurs.length);
  assert.equal(recupererInterrompu(racine), false, "idempotent");
});

test("redémarrage : un run terminé n'est pas touché", () => {
  const { racine } = neuf(); fs.mkdirSync(path.join(racine, ".atelier"), { recursive: true });
  const fini = { etape: "fin", debut: "a", fin: "b", ok: true, erreurs: [], resume: {} };
  fs.writeFileSync(path.join(racine, ".atelier/maquette.json"), JSON.stringify(fini));
  assert.equal(recupererInterrompu(racine), false); assert.deepEqual(lireStatutMaquette(racine), fini);
});

test("restauration en place : un fs.watch de spec/ ouvert avant reçoit encore des évènements après", async () => {
  const { racine, espace } = neuf(), spec = path.join(racine, "spec"), inode = fs.statSync(spec).ino, vus = [];
  const w = fs.watch(spec, { recursive: true }, (_, f) => vus.push(f));
  try {
    const avant = arbre(spec);
    const r = await lancerMaquette({ racine, espace, llm: llmTermine(() => { fs.writeFileSync(path.join(spec, "flux/nouveau.yml"), "id: n\n"); fs.mkdirSync(path.join(spec, "neuf")); fs.writeFileSync(path.join(spec, "neuf/x.yml"), "a: 1\n"); fs.rmSync(path.join(spec, "relations.yml")); fs.writeFileSync(path.join(spec, "projet.yml"), "adherent: casse\n"); }), now });
    assert.equal(r.ok, false); // flux/nouveau.yml invalide → check en échec → restauration
    assert.deepEqual(arbre(spec), avant); assert.equal(fs.statSync(spec).ino, inode, "le dossier spec/ n'est pas remplacé");
    assert.ok(!fs.existsSync(path.join(spec, "neuf")));
    await new Promise(ok => setTimeout(ok, 200)); vus.length = 0;
    fs.writeFileSync(path.join(spec, "apres.yml"), "x: 1\n"); await new Promise(ok => setTimeout(ok, 300));
    assert.ok(vus.length > 0, "évènements encore reçus");
  } finally { w.close(); }
});

test("annulation : le run s'arrête, plus aucune écriture dans spec/ après, statut interrompu", async () => {
  const { racine, espace } = neuf(), spec = path.join(racine, "spec"), ctl = new AbortController(), avant = arbre(spec);
  let appels = 0, liberer; const bloque = new Promise(ok => { liberer = ok; });
  const llm = { async discuter() { appels++; ctl.abort(); await bloque; fs.writeFileSync(path.join(spec, "flux/tardif.yml"), "id: t\n"); return { message: { role: "assistant", content: null, tool_calls: appelOutil("terminer", { resume: "x" }).tool_calls }, usage: { total_tokens: 1 } }; } };
  const p = lancerMaquette({ racine, espace, llm, signal: ctl.signal, now });
  await new Promise(ok => setTimeout(ok, 500)); liberer(); // le LLM en vol rend la main après l'abandon
  const r = await p;
  assert.equal(appels, 1); assert.equal(r.ok, false); assert.equal(lireStatutMaquette(racine).etape, "interrompu");
  assert.deepEqual(arbre(spec), avant);
  await new Promise(ok => setTimeout(ok, 300)); assert.deepEqual(arbre(spec), avant);
});

test("maquette : sans réponse adhérent, pas d'étape propositions ni de mesures.yml", async () => {
  const { racine, espace } = neuf(), vus = [];
  const r = await lancerMaquette({ racine, espace, llm: llmTermine(), rapporter: s => vus.push(s.etape), now });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.ok(!vus.includes("propositions"));
  assert.ok(!fs.existsSync(path.join(racine, "spec/mesures.yml")));
});

test("maquette : avec réponse adhérent, l'étape propositions écrit une proposition", async () => {
  const { racine, espace } = neuf(), vus = [];
  fs.writeFileSync(
    path.join(racine, "spec/reponses.yml"),
    YAML.stringify([
      { id: "projet#q1", question: "Activités ?", reponse: "Transport frigorifique", origine: "client", date: "2026-11-08T10:00:00", modifs: [{ op: "noter" }] },
    ])
  );
  const r = await lancerMaquette({ racine, espace: ouvrirEspace(racine), llm: llmEcritProposition(), rapporter: s => vus.push(s.etape), now });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.ok(vus.includes("propositions"));
  const d = YAML.parse(fs.readFileSync(path.join(racine, "spec/mesures.yml"), "utf8"));
  assert.equal(d.propositions[0].hypothese.valide, false);
});

test("maquette relance propositions : une proposition tranchée n'est pas modifiée", async () => {
  const { racine, espace } = neuf();
  const { hypothese, ...p } = propMaquette;
  ecrireProposition(racine, { ...p, hypothese }, []);
  const f = path.join(racine, "spec/mesures.yml");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("valide: false", "valide: true"));
  const avant = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    path.join(racine, "spec/reponses.yml"),
    YAML.stringify([
      { id: "projet#q1", question: "Activités ?", reponse: "Transport frigorifique", origine: "client", date: "2026-11-08T10:00:00", modifs: [{ op: "noter" }] },
    ])
  );
  const r = await lancerMaquette({ racine, espace: ouvrirEspace(racine), llm: llmEcritProposition(), rapporter() {}, now });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.equal(fs.readFileSync(f, "utf8"), avant);
});

test("annulation : signal déjà levé → rien lancé ; enfant tué", async () => {
  const { racine, espace } = neuf(), ctl = new AbortController(); ctl.abort();
  const r = await lancerMaquette({ racine, espace, llm: llmTermine(), signal: ctl.signal, now });
  assert.equal(r.ok, false); assert.equal(lireStatutMaquette(racine).etape, "interrompu");
  const c2 = new AbortController(), t0 = Date.now(), p = lancerEnfant({ racine, societe: "kf", commande: [process.execPath, "-e", "setTimeout(()=>{},60000)"], signal: c2.signal });
  setTimeout(() => c2.abort(), 200); const e = await p;
  assert.equal(e.ok, false); assert.ok(Date.now() - t0 < 5000);
});

test("maquette : journal vide écrit en style flow ([]) → l'entrée ajoutée reste du YAML valide", async () => {
  const { racine, espace } = neuf();
  fs.writeFileSync(path.join(racine, "spec/journal.yml"), "# Journal des décisions de séance\n[]\n");
  const r = await lancerMaquette({ racine, espace, llm: llmTermine(), rapporter() {}, now });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const j = YAML.parse(lire(racine, "spec/journal.yml"));
  assert.equal(j.length, 1); assert.equal(j[0].question, "maquette automatique");
});
