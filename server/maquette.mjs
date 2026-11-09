/* Maquette automatique d'un adhérent : copie de sécurité, collecte et profil (processus enfant), agent, vérification, construction. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawn } from "node:child_process";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { valeursPiiAdherent } from "./agent/specs.mjs";
import { documenterDatasets, ecrireFluxEtControles, proposerPerimetre, proposerLibelles, proposerMesures, creerBudget } from "./agent/maquette-agent.mjs";

const ATELIER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../tools/atelier.mjs");
const DELAI_ENFANT_MS = 15 * 60 * 1000, PLAFOND_RUN_MS = 30 * 60 * 1000, SORTIE_MAX = 1500;
const ENV_ENFANT = /^(PATH|HOME|USER|LANG|LC_\w+|TMPDIR|TZ|TREDUNION_MEMOIRE|SSH_AUTH_SOCK)$/; // jamais les secrets du serveur (LLM_*, SFTP_*, cookies)
const NOM_SECRET = /pass|pwd|secret|token|key|mdp|auth|cred|private|cert/i;
const SOCIETE = /^[a-z0-9][a-z0-9_-]*$/i;

const dossier = racine => path.join(racine, ".atelier");
const FICHIER = racine => path.join(dossier(racine), "maquette.json");
const AVANT = racine => path.join(dossier(racine), "spec-avant");
const iso = now => now().toISOString().slice(0, 19);

/* ───────── secrets ───────── */
function secretsDe(racine) {
  const valeurs = o => Object.entries(o).filter(([k, v]) => NOM_SECRET.test(k) && typeof v === "string" && v !== "").map(([, v]) => v);
  let env = {}; try { env = parseEnv(fs.readFileSync(path.join(racine, ".env"), "utf8")); } catch { /* pas de .env */ }
  return [...new Set([...valeurs(env), ...valeurs(process.env)])].sort((a, b) => b.length - a.length);
}
export function nettoyer(texte, secrets = []) {
  let t = String(texte ?? "").replace(/\x1b\[[0-9;]*m/g, "");
  // une valeur courte (< 4 caractères) n'est masquée que comme mot entier, sinon elle défigurerait tout le texte
  for (const s of secrets) t = s.length >= 4 ? t.split(s).join("***") : t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu"), "***");
  return t.replace(/Bearer\s+[\w.~+\/=-]+/gi, "Bearer ***").replace(/(\w*(?:pass|passwd|password|mdp|secret|token|api[_-]?key)\w*\s*[=:]\s*)\S+/gi, "$1***");
}

/* Aucune donnée de ligne dans ce qui est stocké : suites de 6 chiffres ou plus et valeurs des colonnes pii des datasets de l'adhérent. */
export function masquer(texte, pii = []) {
  let t = String(texte ?? "").replace(/\d{6,}/g, "***");
  for (const v of pii) t = t.replace(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "***");
  return t;
}

const piiDe = racine => { try { return valeursPiiAdherent(racine); } catch { return []; } };

/* ───────── processus enfant ───────── */
/* `commande` : [exécutable, ...arguments], pour les tests ; par défaut `atelier maquette --societe <s> [--sans-collecte]`. */
export function lancerEnfant({ racine, societe, sansCollecte = true, delaiMs = DELAI_ENFANT_MS, commande, signal }) {
  const args = commande || [process.execPath, ATELIER, "maquette", "--societe", societe, ...(sansCollecte ? ["--sans-collecte"] : [])];
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => ENV_ENFANT.test(k))); env.ATELIER_ROOT = racine;
  const secrets = secretsDe(racine);
  return new Promise(fin => {
    let sortie = "", err = "", delai = false, fini = false;
    const garder = (a, c) => (a + c).slice(-8000);
    const clore = (ok, erreur) => { if (fini) return; fini = true; clearTimeout(minuteur); signal?.removeEventListener("abort", couper); fin(ok ? { ok: true } : { ok: false, erreur: masquer(nettoyer(erreur, secrets), piiDe(racine)).trim().slice(-SORTIE_MAX) }); };
    const enfant = spawn(args[0], args.slice(1), { cwd: racine, env, stdio: ["ignore", "pipe", "pipe"] });
    const minuteur = setTimeout(() => { delai = true; enfant.kill("SIGKILL"); }, delaiMs);
    const couper = () => { if (!fini) { enfant.kill("SIGKILL"); clore(false, "Interrompu"); } };
    if (signal?.aborted) couper(); else signal?.addEventListener("abort", couper, { once: true });
    enfant.stdout.on("data", c => { sortie = garder(sortie, c); });
    enfant.stderr.on("data", c => { err = garder(err, c); });
    enfant.on("error", e => clore(false, `Lancement impossible : ${e.message}`));
    // Le `check` final de la maquette met le code à 1 sans rien écrire sur stderr : ce n'est pas une panne.
    // Le `check` final de la maquette met le code à 1 sans rien écrire sur stderr : ce n'est pas une panne.
    enfant.on("close", (code, signal) => {
      if (delai) return clore(false, `Délai de ${Math.round(delaiMs / 60000)} min dépassé pour la collecte et la lecture des exports. ${err || sortie}`);
      clore(signal === null && (code === 0 || !err.trim()), err.trim() || sortie || `Arrêt (code ${code}, signal ${signal})`);
    });
  });
}

/* ───────── statut et journal ───────── */
export function lireStatutMaquette(racine) {
  try { const o = JSON.parse(fs.readFileSync(FICHIER(racine), "utf8")); return o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch { return null; }
}
function ecrireStatut(racine, st) {
  fs.mkdirSync(dossier(racine), { recursive: true });
  const tmp = FICHIER(racine) + `.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(st, null, 2)); fs.renameSync(tmp, FICHIER(racine));
}
const tracer = (racine, now, ligne) => { fs.mkdirSync(dossier(racine), { recursive: true }); fs.appendFileSync(path.join(dossier(racine), "maquette.jsonl"), JSON.stringify({ date: iso(now), ...ligne }) + "\n"); };

/* ───────── copie de sécurité ───────── */
/* Le registre des réponses n'est ni copié ni restauré : l'agent ne l'écrit jamais et on ne l'efface jamais. */
const REGISTRE = "reponses.yml";
/* Refuse (erreur propre) un lien symbolique dans `dir` : copie et restauration le suivraient hors de spec/. */
function sansLiens(dir) {
  const verifier = d => { if (fs.lstatSync(d).isSymbolicLink()) throw new Error(`Lien symbolique refusé sous spec/ (${path.relative(path.dirname(dir), d) || path.basename(d)}) : retire-le puis relance la maquette.`);
    if (fs.statSync(d).isDirectory()) fs.readdirSync(d).forEach(n => verifier(path.join(d, n))); };
  if (fs.lstatSync(dir, { throwIfNoEntry: false })) verifier(dir);
}
function sauvegarder(racine) {
  const spec = path.join(racine, "spec"); sansLiens(spec);
  const tmp = AVANT(racine) + ".tmp"; fs.rmSync(tmp, { recursive: true, force: true });
  fs.cpSync(spec, tmp, { recursive: true, preserveTimestamps: true, filter: src => src !== path.join(spec, REGISTRE) });
  fs.rmSync(AVANT(racine), { recursive: true, force: true }); fs.renameSync(tmp, AVANT(racine));
}
/* spec/ redevient identique à la copie, en place : le dossier spec/ lui-même n'est jamais remplacé (les fs.watch dessus restent valides). */
function restaurer(racine) {
  if (!fs.existsSync(AVANT(racine))) return false;
  const spec = path.join(racine, "spec"); sansLiens(AVANT(racine)); sansLiens(spec);
  const voulu = lister(AVANT(racine)), present = lister(spec);
  for (const f of present.keys()) if (!voulu.has(f)) fs.rmSync(path.join(spec, f), { force: true });
  for (const [f, octets] of voulu) if (!octets.equals(present.get(f) ?? Buffer.alloc(0)) || !present.has(f)) { fs.mkdirSync(path.dirname(path.join(spec, f)), { recursive: true }); fs.writeFileSync(path.join(spec, f), octets); }
  const dossiers = new Set([...voulu.keys()].flatMap(f => { const o = []; for (let d = path.dirname(f); d !== "."; d = path.dirname(d)) o.push(d); return o; }));
  const vides = d => fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).forEach(e => { const c = path.join(d, e.name); vides(c); if (!dossiers.has(path.relative(spec, c)) && !fs.readdirSync(c).length) fs.rmdirSync(c); });
  vides(spec);
  return true;
}
const MSG_PLAFOND = "La maquette a dépassé la durée maximale (30 min) : elle a été arrêtée et la spec remise dans son état d'avant.";
const MSG_INTERROMPU = "La maquette a été interrompue (redémarrage du serveur) : la spec a été remise dans son état d'avant.";
/* Au démarrage : un run « en cours » n'a plus de processus derrière lui. */
export function recupererInterrompu(racine, now = () => new Date()) {
  const st = lireStatutMaquette(racine); if (!st || st.fin) return false;
  let msg = MSG_INTERROMPU, issue = "restauree";
  try { restaurer(racine); } catch (x) { msg += ` La restauration a été refusée : ${x.message}`; issue = "refusee"; }
  ecrireStatut(racine, { ...st, etape: "interrompu", fin: iso(now), ok: false, erreurs: [msg] });
  tracer(racine, now, { etape: "interrompu", issue });
  return true;
}

/* ───────── mesures ───────── */
function bilan(espace) {
  const { ctx, findings } = espace.evaluate(), s = vm.runInContext("summary()", ctx), ecarts = vm.runInContext("CTRL()", ctx).filter(r => r.statut === "ecart").length;
  return { erreurs: findings.filter(f => f.niv === "erreur").map(f => `${f.fichier} : ${f.msg}`), mesures: s.mesures.ok, faits: s.lignesFaits, hypotheses: s.hypotheses, ecarts };
}
const lister = dir => { const o = new Map(); const p = (d, pre) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => e.isSymbolicLink() ? sansLiens(path.join(d, e.name)) : !pre && e.name === REGISTRE ? null : e.isDirectory() ? p(path.join(d, e.name), `${pre}${e.name}/`) : o.set(pre + e.name, fs.readFileSync(path.join(d, e.name)))); if (fs.existsSync(dir)) p(dir, ""); return o; };
const fichiersChanges = racine => { const a = lister(AVANT(racine)), b = lister(path.join(racine, "spec")); return [...new Set([...a.keys(), ...b.keys()])].filter(f => !a.get(f)?.equals(b.get(f) ?? Buffer.alloc(0)) || !a.has(f) || !b.has(f)).sort().map(f => "spec/" + f); };

/* ───────── run ───────── */
/* Renvoie le statut final : { ok, erreurs, resume }. `rapporter(statut)` est appelé à chaque changement d'état. */
export async function lancerMaquette({ racine, espace, llm, rapporter = () => {}, now = () => new Date(), signal: signalExterne, plafondMs = PLAFOND_RUN_MS }) {
  // Un seul signal pour le run : annulation externe (arrêt du serveur) ou plafond de durée totale.
  const plafond = new AbortController(); let delai = false;
  const minuteur = setTimeout(() => { delai = true; plafond.abort(); }, plafondMs); minuteur.unref();
  const relais = () => plafond.abort(); if (signalExterne?.aborted) relais(); else signalExterne?.addEventListener("abort", relais, { once: true });
  const signal = plafond.signal;
  try { return await corpsMaquette(); } finally { clearTimeout(minuteur); signalExterne?.removeEventListener("abort", relais); }
  async function corpsMaquette() {
  let st = { etape: "copie", i: 0, n: 0, debut: iso(now), fin: null, ok: null, erreurs: [], resume: null };
  const maj = patch => { st = { ...st, ...patch }; ecrireStatut(racine, st); rapporter({ ...st }); };
  const etapeAgent = ({ etape, i, n }) => maj({ etape, i, n });
  const boucles = (etape, r) => (r.boucles || []).forEach(b => tracer(racine, now, { etape, cible: b.cible, issue: b.issue, tours: b.tours, jetons: b.jetons }));
  const secrets = secretsDe(racine); let sauve = false;
  const coupe = () => signal?.aborted;
  const interrompu = () => {
    let msg = delai ? MSG_PLAFOND : MSG_INTERROMPU;
    try { if (sauve) restaurer(racine); } catch (x) { msg += ` La restauration a été refusée : ${x.message}`; }
    tracer(racine, now, { etape: "interrompu", issue: delai ? "plafond" : "restauree" });
    maj({ etape: "interrompu", fin: iso(now), ok: false, erreurs: [msg], resume: null });
    return st;
  };
  const echec = (erreurs, etape) => {
    if (coupe()) return interrompu();
    try { if (sauve) restaurer(racine); } catch (x) { erreurs = [...erreurs, `La spec n'a pas pu être remise dans son état d'avant : ${x.message}`]; }
    tracer(racine, now, { etape, issue: "echec", erreurs: erreurs.length });
    maj({ etape: "fin", fin: iso(now), ok: false, erreurs: erreurs.slice(0, 20).map(e => nettoyer(e, secrets)), resume: null });
    return st;
  };
  // Après l'annulation, plus aucun appel à l'agent : ni lecture, ni outil, donc plus d'écriture dans spec/.
  const llmCoupe = llm && { discuter: async (...a) => { if (coupe()) throw new Error("Interrompu"); const r = await llm.discuter(...a); if (coupe()) throw new Error("Interrompu"); return r; } };
  try {
    if (!llm) { maj({ etape: "fin", fin: iso(now), ok: false, erreurs: ["L'agent n'est pas disponible : la maquette automatique ne peut pas démarrer."] }); return st; }
    const projet = espace.readYaml(espace.P("spec/projet.yml"), {}), societes = (projet.societes || []).map(s => String(s.id));
    if (!societes.length || !societes.every(s => SOCIETE.test(s))) { maj({ etape: "fin", fin: iso(now), ok: false, erreurs: ["spec/projet.yml : aucune société valide à traiter."] }); return st; }
    if (coupe()) return interrompu();
    sauvegarder(racine); sauve = true;
    const avant = bilan(espace);
    maj({ etape: "collecte", i: 0, n: societes.length }); tracer(racine, now, { etape: "copie", issue: "ok" });

    const sansCollecte = !fs.existsSync(path.join(racine, ".env"));
    for (const [k, societe] of societes.entries()) {
      if (coupe()) return interrompu();
      maj({ etape: "collecte", i: k + 1, n: societes.length });
      const debut = Date.now(), e = await lancerEnfant({ racine, societe, sansCollecte, signal });
      tracer(racine, now, { etape: "collecte", cible: societe, issue: e.ok ? "ok" : "echec", duree_ms: Date.now() - debut });
      if (!e.ok) return echec([`Collecte ou lecture des exports (${societe}) : ${e.erreur}`], "collecte");
    }

    const budget = creerBudget();
    if (coupe()) return interrompu();
    const d = await documenterDatasets({ espace, racine, llm: llmCoupe, rapporter: etapeAgent, budget }); boucles("datasets", d);
    if (d.erreurs) return echec(d.erreurs, "datasets");
    if (coupe()) return interrompu();
    const f = await ecrireFluxEtControles({ espace, racine, llm: llmCoupe, rapporter: etapeAgent, budget }); boucles("flux", f);
    if (f.erreurs) return echec(f.erreurs, "flux");

    if (coupe()) return interrompu();
    const pm = await proposerPerimetre({ espace, racine, llm: llmCoupe, rapporter: etapeAgent, budget }); boucles("perimetre", pm);
    if (pm.erreurs) return echec(pm.erreurs, "perimetre");

    if (coupe()) return interrompu();
    const lb = await proposerLibelles({ espace, racine, llm: llmCoupe, rapporter: etapeAgent, budget }); boucles("libelles", lb);
    if (lb.erreurs) return echec(lb.erreurs, "libelles");

    if (coupe()) return interrompu();
    const pr = await proposerMesures({ espace, racine, llm: llmCoupe, rapporter: etapeAgent, budget }); boucles("propositions", pr);
    if (pr.erreurs) return echec(pr.erreurs, "propositions");

    if (coupe()) return interrompu();
    maj({ etape: "verification", i: 0, n: 0 });
    const apres = bilan(espace); tracer(racine, now, { etape: "verification", issue: apres.erreurs.length ? "echec" : "ok", erreurs: apres.erreurs.length, jetons: budget.utilises });
    if (apres.erreurs.length) return echec(apres.erreurs, "verification");

    if (coupe()) return interrompu();
    maj({ etape: "construction" });
    const resume = { mesuresAvant: avant.mesures, mesuresApres: apres.mesures, hypotheses: apres.hypotheses, controlesEnEcart: apres.ecarts, fiche: "generated/fiche_seance.md" };
    const journal = path.join(racine, "spec/journal.yml"), h = apres.hypotheses;
    const texte = fs.existsSync(journal) ? fs.readFileSync(journal, "utf8") : "# Journal des décisions : une entrée par question tranchée\n";
    const entree = { date: iso(now), question: "maquette automatique",
      decision: `Spec pré-remplie par l'agent à partir des exports : hypothèses à valider ${h.basse} basses, ${h.moyenne} moyennes, ${h.haute} hautes. Effet : mesures alimentées ${avant.mesures} → ${apres.mesures}, lignes FAITS ${avant.faits} → ${apres.faits}.`,
      fichiers: [...new Set([...fichiersChanges(racine), "spec/journal.yml"])].sort().slice(0, 40) };
    fs.writeFileSync(journal, texte.replace(/\n*$/, "\n") + YAML.stringify([entree], { lineWidth: 0 }));
    if (coupe()) return interrompu();
    const b = espace.construire();
    if (!b.ok) return echec(b.erreurs.map(x => `${x.fichier} : ${x.msg}`), "construction");
    tracer(racine, now, { etape: "construction", issue: "ok", jetons: budget.utilises });
    maj({ etape: "fin", fin: iso(now), ok: true, erreurs: [], resume });
    return st;
  } catch (e) {
    return echec([`Maquette en échec : ${e?.message || e}`], "exception");
  }
  }
}
