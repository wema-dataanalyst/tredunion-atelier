#!/usr/bin/env node
/* Atelier silver → gold : CLI et serveur de prévisualisation.
   Le moteur (core/*.js) est le même que celui du navigateur : on l'exécute ici dans un contexte vm. */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { lireMemoire, cheminMemoire, ecrireMemoire, lireSel, pseudonymiserMemoire } from "./memoire.mjs";
import { apprendre } from "./apprendre.mjs";
import { normaliserSociete, planProfil } from "./normaliser.mjs";
import { configSftp, collecter, dossierSociete, validerSociete } from "./collecte.mjs";
import { comparer } from "./evaluer.mjs";
import { cmdCompte } from "./compte.mjs";
import { viderSpec } from "./gabarit.mjs";
import { adherentsRoot, comptesFile, creerCompte } from "../server/adherents.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.env.ATELIER_ROOT ? path.resolve(process.env.ATELIER_ROOT) : APP;
const P = (...a) => path.join(ROOT, ...a);
const A = (...a) => path.join(APP, ...a);
const rel = f => path.relative(ROOT, f).split(path.sep).join("/");
const exists = f => fs.existsSync(f);
import { ouvrirEspace, REGISTRE_VIDE } from "./espace.mjs";
const { readYaml, listYaml, readCsv, makeCtx, loadState, evaluate, repondre, apercuQuestion, viewerHtml, construire, livrables } = ouvrirEspace(ROOT);
if (exists(P(".env"))) process.loadEnvFile(P(".env")); // celui de l'adhérent (ATELIER_ROOT), ou celui de l'application sans ATELIER_ROOT : jamais les deux, pour ne pas prêter les identifiants d'un autre
const opt = (args, k) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : null; };

/* ───────── commandes ───────── */
const C = { reset: "\x1b[0m", red: "\x1b[31m", yellow: "\x1b[33m", dim: "\x1b[2m", bold: "\x1b[1m", green: "\x1b[32m" };
function printFindings(findings) {
  const by = {}; findings.forEach(f => (by[f.fichier] = by[f.fichier] || []).push(f));
  Object.keys(by).sort().forEach(file => { console.log(`\n${C.bold}${file}${C.reset}`); by[file].forEach(f => console.log(`  ${f.niv === "erreur" ? C.red + "erreur" : f.niv === "alerte" ? C.yellow + "alerte" : C.dim + "info  "}${C.reset}  ${f.msg}`)); });
}
function cmdCheck(args) {
  const { ctx, findings } = evaluate(); const s = vm.runInContext("summary()", ctx);
  if (args.includes("--json")) { console.log(JSON.stringify({ findings, summary: s }, null, 2)); }
  else {
    printFindings(findings);
    const n = k => findings.filter(f => f.niv === k).length;
    console.log(`\n${n("erreur") ? C.red : C.green}${n("erreur")} erreur(s)${C.reset}, ${n("alerte")} alerte(s), ${n("info")} info(s)`);
    console.log(`Mesures : ${s.mesures.ok} alimentées, ${s.mesures.part} partielles, ${s.mesures.none} non alimentées, ${s.mesures.err} à corriger · FAITS : ${s.lignesFaits} lignes · questions ouvertes : ${s.questionsOuvertes}`);
    const h = s.hypotheses; console.log(`Hypothèses : ${h.basse} basses, ${h.moyenne} moyennes, ${h.haute} hautes, ${h.confirme} confirmées`);
  }
  process.exitCode = findings.some(f => f.niv === "erreur") ? 1 : 0;
}
function cmdBuild() {
  const r = construire();
  if (!r.ok) { printFindings(r.erreurs); console.error(`\n${C.red}Build interrompu : corrige d'abord les erreurs (npm run check).${C.reset}`); process.exitCode = 1; return; }
  const l = livrables(); console.log(`${r.fichiers} fichiers écrits dans generated/ :`); l.forEach(f => console.log("  generated/" + f.path));
}
function cmdQuestions(args) {
  const { ctx, state } = evaluate(); const lot = opt(args, "lot"); const toutes = args.includes("--toutes");
  const list = vm.runInContext("listeQuestions()", ctx).filter(q => (toutes || q.statut === "ouverte") && (!lot || q.lot === lot));
  if (!list.length) { console.log(toutes ? "Aucune question." : "Aucune question ouverte."); return; }
  let cur = null;
  list.forEach(q => { if (q.lot !== cur) { cur = q.lot; console.log(`\n${C.bold}${cur}${C.reset}`); }
    console.log(`${q.statut === "traitee" ? C.dim + "[traitée]" : C.yellow + "[ouverte]"}${C.reset} ${C.bold}${q.id}${C.reset} · ${q.source}${q.mesures.length ? ` · ${q.mesures.length} mesure(s)` : ""}  ${q.question}${q.reponse ? `\n            → ${q.reponse}` : ""}`); });
  const suivante = list.find(x => x.statut === "ouverte" && x.source === "profil");
  if ((args.includes("--suivante") || args.includes("--next")) && suivante) cmdQuestion([suivante.id], ctx, state);
}
function cmdQuestion(args, ctx0, st0) {
  const ref = args.find(a => !a.startsWith("--")); if (!ref) { console.error("Usage : npm run question -- <dataset>#<id>"); process.exitCode = 1; return; }
  const [dsId, qid] = ref.split("#"); const { ctx, state } = ctx0 ? { ctx: ctx0, state: st0 } : evaluate();
  const d = state.datasets.find(x => x.id === dsId); const q = d?.questions.find(x => x.id === qid);
  if (!q) { console.error(`Question ${ref} introuvable.`); process.exitCode = 1; return; }
  ctx.__ds = dsId; const prof = vm.runInContext("DS(__ds)._prof", ctx);
  const named = d.columns.filter(c => q.text.includes(c.name)); const cols = named.length ? named : d.columns;
  console.log(`\n${C.bold}${dsId}#${qid}${C.reset} ${q.text}\nFichier : spec/datasets/${dsId}.yml · données : ${d.file} (${d.rows.length} lignes)\n`);
  cols.forEach(c => { const p = prof[c.name] || {}; console.log(`  ${C.bold}${c.name}${C.reset} ${c.type || "?"} ${c.role}${c.desc ? " · " + c.desc : ""}${c.pii ? " · donnée personnelle" : ""}`);
    if (!c.pii && p.n) console.log(`    ${p.distinct} distinctes · ${Math.round(p.nulls / p.n * 100)} % vides · détecté ${p.guess}${p.fmt ? " " + p.fmt : ""} · fréquentes : ${p.top.slice(0, 8).map(t => `${t[0]} (${t[1]})`).join(", ")}`); });
  const rels = state.relations.filter(r => r.from.startsWith(dsId + ".") || r.to.startsWith(dsId + "."));
  if (rels.length) { console.log("\n  Relations :"); rels.forEach(r => { ctx.__r = r; const m = vm.runInContext("matchRate(__r)", ctx); console.log(`    ${r.id} ${r.from} → ${r.to}${m ? ` · ${(m.rate * 100).toFixed(1)} % rapprochés` : ""}`); }); }
  const fl = state.flux.filter(f => f.ds === dsId); if (fl.length) { console.log("\n  Flux :"); fl.forEach(f => console.log(`    ${f.id} → spec/flux/${f.id}.yml`)); }
}
function cmdProfile(args) {
  const file = args.find(a => !a.startsWith("--")); const opt = k => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : null; };
  if (!file || !opt("societe")) { console.error("Usage : npm run profil -- data/bronze/<societe>/<fichier>.csv --societe <id> [--id <nom>] [--force]"); process.exitCode = 1; return; }
  const ctx = makeCtx(); const { parseCSV, snake, profile, autoQuestions } = ctx.fns;
  const abs = path.resolve(ROOT, file); if (!exists(abs)) { console.error(`Fichier introuvable : ${file}`); process.exitCode = 1; return; }
  const id = snake(opt("id") || path.basename(abs).replace(/\.[^.]+$/, "")); const target = P("spec/datasets", id + ".yml");
  if (exists(target) && !args.includes("--force")) { console.error(`spec/datasets/${id}.yml existe déjà (ajoute --force pour l'écraser).`); process.exitCode = 1; return; }
  const projet = readYaml(P("spec/projet.yml"), {}); if (!(projet.societes || []).some(s => String(s.id) === opt("societe"))) console.warn(`${C.yellow}Attention : la société « ${opt("societe")} » n'est pas déclarée dans spec/projet.yml.${C.reset}`);
  const { header, rows } = readCsv(abs, parseCSV, snake);
  const d = { id, columns: header.map(h => ({ name: h, type: "", role: "attr", desc: "", pii: false, codes: null, format: "", decimalComma: false })), rows };
  profile(d); const qs = autoQuestions(d);
  const spec = { id, societe: opt("societe"), file: rel(abs), desc: "", grain: "",
    columns: d.columns.map(c => { const p = d._prof[c.name]; const o = { name: c.name, type: p.guess, role: "attr", desc: "" }; if (p.fmt) o.format = p.fmt; if (p.comma) o.decimalComma = true; return o; }),
    rules: [], questions: qs.map((q, i) => ({ id: `q${i + 1}`, text: q.text, done: false, answer: "" })), cases: [] };
  fs.mkdirSync(P("spec/datasets"), { recursive: true });
  fs.writeFileSync(target, `# Dataset bronze ${id} : profil généré, types détectés à confirmer avec l'adhérent\n` + YAML.stringify(spec, { lineWidth: 0 }));
  console.log(`spec/datasets/${id}.yml créé : ${d.columns.length} colonnes, ${rows.length} lignes, ${qs.length} questions préparées.`);
}
function cmdCouverture(args) {
  const { ctx } = evaluate();
  const r = vm.runInContext(`(()=>{ const cat=CAT(), cov=COV(), hors=horsPerimetre(); const need=new Map(); const ms={ok:[],part:[],none:[],err:[],hors:[]};
    cat.list.forEach(m=>{ const c=cov.get(m.id); if(hors.has(m.name)){ ms.hors.push(m.name); return; } ms[c.s].push(m.name); if(c.s!=="ok") (c.miss||[]).forEach(x=>{ if(!need.has(x)) need.set(x,[]); need.get(x).push(m.name); }); });
    const anomalies=cat.list.filter(m=>m.issues.some(i=>i.sev==="bad")).map(m=>({mesure:m.name,anomalies:m.issues.filter(i=>i.sev==="bad").map(i=>i.txt)}));
    return {mesures:ms, manque:[...need.entries()].map(([cat,ms])=>({categorie:cat,libelle:libelleCat(cat),mesures:[...new Set(ms)]})).sort((a,b)=>b.mesures.length-a.mesures.length), anomalies}; })()`, ctx);
  if (args.includes("--json")) { console.log(JSON.stringify(r, null, 2)); return; }
  console.log(`Mesures : ${r.mesures.ok.length} alimentées, ${r.mesures.part.length} partielles, ${r.mesures.none.length} non alimentées, ${r.mesures.err.length} à corriger${r.mesures.hors.length ? `, ${r.mesures.hors.length} hors périmètre` : ""}\n`);
  console.log(`${C.bold}Catégories manquantes, par nombre de mesures débloquées${C.reset}`);
  r.manque.forEach(x => { const lab = x.libelle !== x.categorie ? `${x.libelle} (${x.categorie})` : x.categorie; console.log(`  ${String(x.mesures.length).padStart(3)}  ${lab}  ${C.dim}${x.mesures.slice(0, 4).join(", ")}${x.mesures.length > 4 ? "…" : ""}${C.reset}`); });
  if (r.mesures.err.length) console.log(`\n${C.bold}Mesures à corriger dans le catalogue${C.reset}\n  ${r.mesures.err.join("\n  ")}`);
  if (args.includes("--anomalies")) { console.log(`\n${C.bold}Anomalies du catalogue${C.reset}`); r.anomalies.forEach(a => console.log(`  ${a.mesure} : ${a.anomalies.join(" ; ")}`)); }
}
function copyDir(a, b) { fs.mkdirSync(b, { recursive: true }); fs.readdirSync(a, { withFileTypes: true }).forEach(e => { const s = path.join(a, e.name), t = path.join(b, e.name); e.isDirectory() ? copyDir(s, t) : fs.copyFileSync(s, t); }); }
function hasDatasets() { return listYaml(P("spec/datasets")).length > 0; }
function exempleMulti() {
  const racine = adherentsRoot(), fichier = comptesFile();
  const present = ["alpha", "beta"].filter(id => exists(path.join(racine, id)));
  if (present.length) { console.error(`Adhérent(s) d'exemple déjà présent(s) dans ${racine} : ${present.join(", ")}. Rien n'est supprimé : retire-les à la main pour recommencer.`); process.exitCode = 1; return; }
  [["alpha", "Transports Alpha"], ["beta", "Transports Bêta"]].forEach(([id, nom]) => {
    const d = path.join(racine, id);
    copyDir(A("exemple/spec"), path.join(d, "spec")); copyDir(A("exemple/data"), path.join(d, "data"));
    fs.writeFileSync(path.join(d, "spec/reponses.yml"), REGISTRE_VIDE);
    const pj = path.join(d, "spec/projet.yml"); fs.writeFileSync(pj, fs.readFileSync(pj, "utf8").replace(/^adherent:.*$/m, `adherent: ${nom}`));
    console.log(`${id} : identifiant ${id}, mot de passe ${creerCompte({ fichier, id, role: "adherent", nom }).mdp}`);
  });
  console.log(`admin-michel : identifiant admin-michel, mot de passe ${creerCompte({ fichier, id: "admin-michel", role: "admin", nom: "Michel" }).mdp}\n(affichés une seule fois)`);
}
function cmdExemple(args) {
  if (args.includes("--multi")) return exempleMulti();
  if (hasDatasets() && !args.includes("--force")) { console.error("spec/ contient déjà des datasets. Ajoute --force pour la remplacer par l'exemple."); process.exitCode = 1; return; }
  ["spec/datasets", "spec/flux"].forEach(d => fs.rmSync(P(d), { recursive: true, force: true }));
  copyDir(A("exemple/spec"), P("spec")); copyDir(A("exemple/data"), P("data")); fs.mkdirSync(P(".atelier"), { recursive: true }); fs.copyFileSync(A("exemple/layout.json"), P(".atelier/layout.json"));
  console.log("Exemple Kessler-Rhin installé dans spec/ et data/. Lance npm run serve.");
}
function cmdReset(args) {
  if (!args.includes("--force")) { console.error("Efface datasets, flux, relations, journal et cas particuliers de spec/ (garde référentiel, catalogue et dimensions sans alimentation ; les réponses de spec/reponses.yml sont archivées dans .atelier/). Relance avec --force pour confirmer."); process.exitCode = 1; return; }
  viderSpec(P("spec"));
  fs.rmSync(P(".atelier/layout.json"), { force: true });
  const reg = P("spec/reponses.yml"), inst = P(".atelier/reponses.json"), archives = [];
  const base = `.atelier/reponses-archive-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}Z`;
  const nonVide = f => { try { return (YAML.parse(fs.readFileSync(f, "utf8")) || []).length !== 0; } catch { return true; } };
  fs.mkdirSync(P(".atelier"), { recursive: true });
  if (exists(reg) && nonVide(reg)) { fs.renameSync(reg, P(base + ".yml")); archives.push(base + ".yml"); }
  if (exists(inst) && nonVide(inst)) { fs.renameSync(inst, P(base + ".instantane.json")); archives.push(base + ".instantane.json"); } else fs.rmSync(inst, { force: true });
  fs.writeFileSync(reg, REGISTRE_VIDE); console.log(`Spec remise à zéro.${archives.length ? ` Réponses archivées dans ${archives.join(" et ")}.` : ""}`);
}

function societeValide(args) {
  const soc = opt(args, "societe"); validerSociete(soc, readYaml(P("spec/projet.yml"), {}).societes || []); return soc;
}

function cmdCollecte(args) {
  const soc = societeValide(args);
  const cfg = configSftp(process.env), societes = readYaml(P("spec/projet.yml"), {}).societes || [];
  const n = collecter({ ...cfg, dir: dossierSociete(cfg.dir, societes, soc) }, P("data/raw", soc), { sousDossier: societes.length > 1 ? soc : undefined });
  console.log(`${n} fichiers copiés dans data/raw/${soc}/`);
}

function cmdApprendre() {
  const { state, findings } = evaluate();
  if (findings.some(f => f.niv === "erreur")) throw new Error("La spec a des erreurs : corrige-les d'abord (npm run check)."); const memoire = lireMemoire(cheminMemoire(APP));
  if (!memoire.existe) throw new Error(`Mémoire introuvable : ${memoire.dir}`);
  const { comptes, colonnes, faits } = apprendre(state, memoire, lireSel(memoire.dir));
  if (faits.length) ecrireMemoire({ ...memoire, comptes, colonnes }, ["comptes", "colonnes"]);
  console.log(faits.length ? faits.join("\n") : "Aucune hypothèse tranchée à apprendre.");
}

function cmdMemoire(args) {
  if (!args.includes("--pseudonymiser")) throw new Error("Usage : npm run memoire -- --pseudonymiser");
  const dir = cheminMemoire(APP);
  if (!fs.existsSync(dir)) throw new Error(`Mémoire introuvable : ${dir}`);
  const { migrees } = pseudonymiserMemoire(dir);
  console.log(migrees ? `${migrees} valeur(s) pseudonymisée(s).` : "Rien à migrer : la mémoire est déjà pseudonymisée.");
}

function cmdControles() {
  const { ctx } = evaluate(); const res = vm.runInContext("CTRL()", ctx);
  if (!res.length) { console.log("Aucun contrôle dans spec/controles.yml."); return; }
  res.forEach(r => console.log(`${r.statut === "ok" ? C.green : r.statut === "ecart" ? C.yellow : C.red}${r.statut.padEnd(7)}${C.reset} ${C.bold}${r.id}${C.reset} ${r.libelle} : ${r.msg}`));
}

function cmdEvaluer(args) {
  const dir = opt(args, "corrige"); if (!dir) throw new Error("Usage : npm run evaluer -- --corrige <dossier spec>");
  const lire = sous => listYaml(path.resolve(ROOT, dir, sous)).map(f => readYaml(f, {}));
  const { state } = evaluate();
  const corrige = { flux: lire("flux"), datasets: lire("datasets") };
  if (!corrige.flux.length) throw new Error(`Aucun flux dans le corrigé : ${path.resolve(ROOT, dir, "flux")}`);
  const r = comparer(state, corrige);
  [["Flux", r.flux], ["Décodages", r.codes]].forEach(([n, x]) => {
    console.log(`${C.bold}${n}${C.reset} : ${x.trouves}/${x.attendus} retrouvés (${Math.round(x.taux * 100)} %)`);
    if (x.manquants.length) console.log(`  manquants : ${x.manquants.join(", ")}`);
    if (x.en_plus.length) console.log(`  en plus : ${x.en_plus.join(", ")}`);
  });
}

async function cmdMaquette(args) {
  const soc = societeValide(args);
  if (!args.includes("--sans-collecte")) { console.log("Collecte SFTP en cours…"); cmdCollecte(args); } else console.log("Collecte SFTP ignorée (pas de .env)");
  console.log("Lecture des exports bruts…");
  await cmdNormaliser(args, true);
  const bronze = P("data/bronze", soc);
  console.log("Profil des exports (documentation des colonnes)…");
  fs.readdirSync(bronze).filter(f => f.endsWith(".csv")).sort().forEach(f => {
    console.log(`Profil de ${f}`);
    const plan = planProfil(listYaml(P("spec/datasets")).map(g => readYaml(g, {})), rel(path.join(bronze, f)), soc);
    if (plan) cmdProfile([rel(path.join(bronze, f)), "--societe", soc, ...(plan.id ? ["--id", plan.id] : [])]);
  });
  console.log("Contrôle de la spec…"); cmdCheck([]);
}

async function cmdNormaliser(args, enDirect = false) {
  const soc = societeValide(args);
  const brut = P("data/raw", soc); if (!exists(brut)) throw new Error(`Dossier introuvable : data/raw/${soc} (lance d'abord npm run collecte)`);
  const memoire = lireMemoire(cheminMemoire(APP));
  if (!memoire.existe) console.warn(`${C.yellow}Mémoire introuvable (${memoire.dir}) : seul le lecteur tableau sera utilisé.${C.reset}`);
  const { ecrits, nonLus } = await normaliserSociete({ brut, bronze: P("data/bronze", soc), logiciels: memoire.logiciels, progres: enDirect ? console.log : undefined });
  console.log(`${ecrits.length} fichiers CSV écrits dans data/bronze/${soc}/`);
  ecrits.forEach(e => console.log(`  ${e.id}.csv  ${e.lignes} lignes · ${e.lecteur}${e.hors_recette ? ` · ${C.yellow}${e.hors_recette} valeurs hors recette${C.reset}` : ""}`));
  if (nonLus.length) { console.log(`\n${C.yellow}${nonLus.length} non lus${C.reset}`); nonLus.forEach(n => console.log(`  ${n.fichier}${n.feuille ? " · " + n.feuille : ""} : ${n.raison}`)); }
}

/* ───────── réponses de l'adhérent ───────── */
function lireCorps(req, res, fn) {
  const refus = (code, msg) => { res.writeHead(code, { "content-type": "application/json", connection: "close" }); res.end(JSON.stringify({ erreurs: [msg] })); };
  // application/json impose un preflight CORS, que ce serveur ne sert pas : une page tierce ne peut pas écrire au registre.
  if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) { req.resume(); return refus(415, "corps attendu en application/json"); }
  const morceaux = []; let taille = 0, trop = false;
  req.on("data", c => { if (trop) return; taille += c.length; if (taille > 65536) { trop = true; refus(413, "corps trop volumineux"); } else morceaux.push(c); });
  req.on("end", () => { if (trop) return; let o; try { o = JSON.parse(Buffer.concat(morceaux).toString("utf8")); } catch { return refus(400, "corps JSON illisible"); } fn(o || {}); });
}
/* ───────── serveur de prévisualisation ───────── */
function cmdServe(args) {
  const port = +(args[args.indexOf("--port") + 1] || 0) || 4321; const clients = new Set();
  const send = (ev, data) => clients.forEach(r => r.write(`event: ${ev}\ndata: ${JSON.stringify(data || {})}\n\n`));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    try {
      if (url.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); return res.end(viewerHtml()); }
      const pf = /^\/fonts\/([\w-]+\.woff2)$/.exec(url.pathname); if (pf) { const f = A("viewer/fonts/" + pf[1]); if (!exists(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable" }); return res.end(fs.readFileSync(f)); }
      if (url.pathname === "/api/state") { const ctx = makeCtx(); const { state, errors } = loadState(ctx); res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); return res.end(JSON.stringify({ state, errors, at: new Date().toISOString() })); }
      if (url.pathname === "/api/apercu-question" && req.method === "GET") { const q = url.searchParams.get("id"), r = q && q.length <= 200 ? apercuQuestion(q) : null; res.writeHead(r ? 200 : 404, { "content-type": "application/json", "cache-control": "no-store" }); return res.end(JSON.stringify(r || { erreurs: ["question introuvable"] })); }
      if (url.pathname === "/events") { res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" }); res.write("retry: 1500\n\n"); clients.add(res); req.on("close", () => clients.delete(res)); return; }
      if (url.pathname === "/api/reponse" && req.method === "POST") { lireCorps(req, res, b => { try { const r = repondre(b); res.writeHead(r.erreurs ? 400 : 200, { "content-type": "application/json" }); res.end(JSON.stringify(r)); } catch (e) { console.error(e); res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }); res.end("Erreur interne"); } }); return; }
      if (url.pathname === "/api/layout" && req.method === "POST") { let b = ""; req.on("data", c => b += c); req.on("end", () => { try { const { kind, id, x, y } = JSON.parse(b); const f = P(".atelier/layout.json"); fs.mkdirSync(path.dirname(f), { recursive: true }); const l = exists(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {}; l[`${kind}:${id}`] = { x: Math.round(x), y: Math.round(y) }; fs.writeFileSync(f, JSON.stringify(l, null, 2)); res.writeHead(204); res.end(); } catch (e) { res.writeHead(400); res.end(); } }); return; }
      res.writeHead(404); res.end("introuvable");
    } catch (e) { console.error(e); res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }); res.end("Erreur interne"); }
  });
  let timer = null, kind = "spec";
  const onChange = k => (ev, f) => { if (f && /(^|[\\/])\.|~$|\.swp$/.test(String(f))) return; if (k === "code") kind = "code"; clearTimeout(timer); timer = setTimeout(() => { const kd = kind; kind = "spec"; send(kd, { fichier: f ? String(f) : null }); console.log(`${C.dim}${new Date().toLocaleTimeString("fr-FR")} ${kd === "code" ? "code de la vue modifié, rechargement complet" : "spec modifiée"}${f ? " · " + f : ""}${C.reset}`); }, 250); };
  [[P("spec"), "spec"], [P("data"), "spec"], [A("viewer"), "code"], [A("core"), "code"]].forEach(([d, k]) => { if (exists(d)) fs.watch(d, { recursive: true }, onChange(k)); });
  setInterval(() => send("ping"), 20000);
  server.listen(port, "127.0.0.1", () => console.log(`Prévisualisation : http://localhost:${port}\nDans Cursor : Ctrl+Shift+P → « Simple Browser: Show » → colle cette adresse.\nLa page se met à jour à chaque modification de spec/ ou data/.`));
}

const [cmd, ...args] = process.argv.slice(2);
const CMDS = { couverture: cmdCouverture, serve: cmdServe, check: cmdCheck, build: cmdBuild, questions: cmdQuestions, question: a => cmdQuestion(a), profil: cmdProfile, exemple: cmdExemple, reset: cmdReset, collecte: cmdCollecte, apprendre: cmdApprendre, memoire: a => cmdMemoire(a), evaluer: cmdEvaluer, normaliser: cmdNormaliser, maquette: cmdMaquette, controles: cmdControles, compte: a => cmdCompte(a) };
if (!CMDS[cmd]) { console.log("Commandes : serve | couverture [--anomalies|--json] | check [--json] | build | questions [--toutes] [--lot <lot>] [--suivante] | question <dataset>#<id> | profil <csv> --societe <id> [--id nom] | compte --adherent <id>|--admin <nom> | exemple [--force] | exemple --multi | reset --force | collecte --societe <id> | apprendre | memoire --pseudonymiser | evaluer --corrige <dossier> | normaliser --societe <id> | maquette --societe <id> [--sans-collecte] | controles"); process.exitCode = cmd ? 1 : 0; }
else Promise.resolve().then(() => CMDS[cmd](args)).catch(e => { console.error(`${C.red}${e.message}${C.reset}`); process.exitCode = 1; });
