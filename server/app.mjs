/* Serveur multi-adhérent : connexion, session, un espace par adhérent. */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ouvrirEspace } from "../tools/espace.mjs";
import { hacher, verifier, lireComptes, creerSessions, creerLimiteur } from "./auth.mjs";
import { creerFile } from "./file.mjs";
import { llmDepuisEnv } from "./agent/llm.mjs";
import { interpreter } from "./agent/interpreter.mjs";
import { lancerMaquette, lireStatutMaquette, recupererInterrompu, nettoyer } from "./maquette.mjs";
import { adherentsConnus, racineDe, adherentsRoot, comptesFile } from "./adherents.mjs";
import { creerAdherent } from "./nouvel-adherent.mjs";
import { gabaritSpec } from "../tools/gabarit.mjs";
import { ecrireBesoins } from "./agent/specs.mjs";

const ICI = path.dirname(fileURLToPath(import.meta.url)), APP = path.resolve(ICI, "..");
const HASH_FACTICE = hacher("facticE-" + Date.now()); // égalise le temps de réponse si l'identifiant est inconnu
const json = (res, code, o, h = {}) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store", ...h }); res.end(JSON.stringify(o)); };
const ENTETES = {
  "x-frame-options": "DENY", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
};
const refus = (res, code, msg) => json(res, code, { erreurs: [msg] });

function corps(req, res, fn) {
  if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) { req.resume(); return refus(res, 415, "corps attendu en application/json"); }
  const morceaux = []; let taille = 0, trop = false;
  req.on("data", c => { if (trop) return; taille += c.length; if (taille > 65536) { trop = true; refus(res, 413, "corps trop volumineux"); req.destroy(); } else morceaux.push(c); });
  req.on("end", () => { if (trop) return; let o; try { o = JSON.parse(Buffer.concat(morceaux).toString("utf8")); } catch { return refus(res, 400, "corps JSON illisible"); } fn(o || {}); });
}
const cookieDe = req => /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie || "")?.[1] || "";

// Un adhérent ne voit ni les noms des autres adhérents (mémoire commune) ni le chemin disque de la mémoire.
// Un comptage de 1 ou 2 identifierait les adhérents : en dessous de SEUIL_K la liste est vide et `<liste>_peu` vaut true.
const AUTRE = "un autre adhérent", SEUIL_K = 3;
function anonymes(en, cle) { const n = Array.isArray(en[cle]) ? en[cle].length : 0; return n >= SEUIL_K ? { [cle]: Array.from({ length: n }, (_, i) => `${AUTRE} (${i + 1})`) } : { [cle]: [], ...(n ? { [cle.replace("_chez", "_peu")]: true, peu: true } : {}) }; }
export function anonymiser(m = {}) {
  const { dir, ...reste } = m;
  for (const k of ["logiciels", "comptes", "colonnes"]) reste[k] = (m[k] || []).map(en => ({ ...en, ...anonymes(en, "confirme_chez"), ...anonymes(en, "contredit_chez") }));
  return reste;
}

export function creerApp({ adherents, comptes, cookieSecure = false, trustProxy = false, construireAuto = true, now = Date.now, llm = llmDepuisEnv() }) {
  const sessions = creerSessions({ now }), limiteur = creerLimiteur({ now }), limiteurIp = creerLimiteur({ now, max: 30 });
  const ipDe = req => trustProxy ? String(req.headers["x-forwarded-for"] || "").split(",").pop().trim() || req.socket.remoteAddress : req.socket.remoteAddress;
  const file = creerFile(), espaces = new Map(), flux = new Map(), veilleurs = [], minuteurs = [], fluxParSession = new Map(); // id → espace / Set de réponses SSE
  const limiteurReponses = creerLimiteur({ now, max: 30 }), limiteurAgent = creerLimiteur({ now, max: 10 }), limiteurCreation = creerLimiteur({ now, max: 10, fenetre: 3600000 }), enCours = new Set(), declenches = new Set(), apercus = new Map(), apercusQuestion = new Map(), limiteurApercu = creerLimiteur({ now, max: 60, fenetre: 60000 }); // apercus : id → { t, v } (cache 5 s)
  const runs = new Map(); // id → promesse du run de maquette en cours (un par adhérent, 2 au plus sur le serveur)
  const MAX_RUNS = 2;
  const apprentissages = new Map(); // id → { t, v } : aperçu de l'apprentissage (cache 5 s)
  let apprentissageEnCours = false; // un seul clic « Appliquer » à la fois sur le serveur
  let arret = false; const annulation = new AbortController();
  const envoyer = (id, ev) => { if (!arret) (flux.get(id) || new Set()).forEach(r => r.write(`event: ${ev}\ndata: {}\n\n`)); };
  const purgerApercusQuestion = id => { for (const k of apercusQuestion.keys()) if (k.startsWith(id + "\n")) apercusQuestion.delete(k); };
  const apercuDe = id => {
    const c = apercus.get(id); if (c && now() - c.t < 5000) return c.v;
    let v; try { v = { id, ...espace(id).apercu() }; } catch (x) { console.error(x); v = { id, erreur: "indisponible" }; }
    apercus.set(id, { t: now(), v }); return v;
  };
  function espace(id) {
    let e = espaces.get(id); if (e) return e;
    e = ouvrirEspace(racineDe(adherents, id));
    let timer = null; const w = fs.watch(e.P("spec"), { recursive: true }, (_, f) => { if (f && /(^|[\\/])\.|~$|\.swp$|\.tmp$/.test(String(f))) return; clearTimeout(timer); timer = setTimeout(() => { apercus.delete(id); purgerApercusQuestion(id); apprentissages.delete(id); envoyer(id, "spec"); }, 250); });
    veilleurs.push(() => { clearTimeout(timer); w.close(); }); espaces.set(id, e);
    return e;
  }
  let vide = null; // espace jetable (spec vide dans /tmp) pour servir la page à l'admin tant qu'aucun adhérent n'existe
  function espaceVide() {
    if (vide) return vide;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tredunion-vide-"));
    gabaritSpec(path.join(dir, "spec"), { adherent: "Aucun adhérent", societes: [] });
    veilleurs.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    return (vide = ouvrirEspace(dir));
  }
  const originOk = req => { const o = req.headers.origin; return !o || o === `http://${req.headers.host}` || o === `https://${req.headers.host}`; };
  let pageConnexion = null; // lue une fois
  const connexionHtml = () => pageConnexion ??= fs.readFileSync(path.join(ICI, "connexion.html"), "utf8").replace("/*WEMA*/", () => fs.readFileSync(path.join(APP, "viewer/wema.css"), "utf8"));
  const erreurInterne = (res, x) => { console.error(x); if (!res.headersSent) refus(res, 500, "erreur interne"); };
  for (const i of adherentsConnus(adherents)) { try { recupererInterrompu(racineDe(adherents, i)); } catch (x) { console.error(nettoyer(x?.message || x)); } }
  const vueMaquette = id => { if (!id) return null; const m = lireStatutMaquette(racineDe(adherents, id)); if (!m) return null; const { etape, i, n, debut, fin, ok, erreurs, resume, journal } = m; return { etape, i, n, debut, fin, ok, erreurs, resume, journal }; };
  const vueApprentissage = id => {
    if (!id) return { faits: [] };
    const c = apprentissages.get(id); if (c && now() - c.t < 5000) return c.v;
    let v; try { v = espace(id).apercuApprentissage(); } catch (x) { console.error(nettoyer(x?.message || x)); v = { faits: [] }; }
    apprentissages.set(id, { t: now(), v }); return v;
  };
  const demarrerMaquette = (id, e) => {
    const run = lancerMaquette({ racine: racineDe(adherents, id), espace: e, llm, signal: annulation.signal, rapporter: () => envoyer(id, "maquette") })
      .catch(x => console.error(nettoyer(x?.message || x)))
      .finally(() => { runs.delete(id); apercus.delete(id); purgerApercusQuestion(id); envoyer(id, "maquette"); envoyer(id, "spec"); envoyer(id, "statut"); });
    runs.set(id, run);
  };
  const battement = setInterval(() => { sessions.purger(); flux.forEach(l => l.forEach(r => r.write(": ping\n\n"))); }, 30000); battement.unref();

  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x"), p = url.pathname;
    for (const [k, v] of Object.entries(ENTETES)) res.setHeader(k, v);
    try {
      const pf = /^\/fonts\/([\w-]+\.woff2)$/.exec(p);
      if (pf) { const f = path.join(APP, "viewer/fonts", pf[1]); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable" }); return res.end(fs.readFileSync(f)); }
      if (p === "/connexion" && req.method === "GET") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); return res.end(connexionHtml()); }
      if (req.method === "POST" && !originOk(req)) return refus(res, 403, "origine refusée");
      if (p === "/api/connexion" && req.method === "POST") return corps(req, res, b => {
        const ip = ipDe(req);
        if (limiteurIp.bloque(ip)) return refus(res, 429, "Trop de tentatives, réessayez plus tard");
        if (typeof b.id !== "string" || b.id.length > 40) { limiteurIp.echec(ip); return refus(res, 401, "Identifiant ou mot de passe incorrect"); }
        const cle = `${b.id}|${ip}`;
        if (limiteur.bloque(cle)) return refus(res, 429, "Trop de tentatives, réessayez plus tard");
        const c = lireComptes(comptes).find(x => x.id === b.id), mdp = String(b.mdp ?? "");
        const ok = mdp.length <= 1024 && (c ? verifier(mdp, c.mdp) : (verifier(mdp, HASH_FACTICE), false));
        if (!ok) { limiteur.echec(cle); limiteurIp.echec(ip); return refus(res, 401, "Identifiant ou mot de passe incorrect"); }
        limiteur.succes(cle);
        const sid = sessions.ouvrir(c);
        json(res, 200, { ok: true, role: c.role }, { "set-cookie": `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${cookieSecure ? "; Secure" : ""}` });
      });
      const s = sessions.lire(cookieDe(req));
      if (!s) { if (p === "/") { res.writeHead(302, { location: "/connexion" }); return res.end(); } return refus(res, 401, "connexion requise"); }
      if (p === "/api/deconnexion" && req.method === "POST") { sessions.fermer(cookieDe(req)); res.writeHead(204, { "set-cookie": "sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" }); return res.end(); }

      if (p === "/api/adherents" && req.method === "POST") {
        if (s.role !== "admin") { req.resume(); return refus(res, 403, "réservé à l'administrateur"); }
        const cleCreation = `compte:${s.id}`; if (limiteurCreation.bloque(cleCreation)) { req.resume(); return refus(res, 429, "Trop de créations, réessayez plus tard"); }
        limiteurCreation.echec(cleCreation); // clé = compte (une reconnexion ne remet pas le compteur à zéro)
        return corps(req, res, b => {
          let r; const secretsCreation = [b?.sftp?.password].filter(v => typeof v === "string" && v);
          try { r = creerAdherent({ racine: adherents, comptes, entree: b }); }
          catch (x) {
            if (x.code === "invalide") return json(res, 400, { erreurs: x.erreurs });
            if (x.code === "existe") return json(res, 409, { erreurs: x.erreurs });
            console.error(nettoyer(x?.message || x, secretsCreation)); return refus(res, 500, "erreur interne");
          }
          apercus.clear(); apercusQuestion.clear(); let maquette = "non-demandee";
          if (b.maquette === true) {
            maquette = "indisponible";
            if (llm && runs.size < MAX_RUNS) { try { demarrerMaquette(r.id, espace(r.id)); maquette = "lancee"; } catch (x) { console.error(nettoyer(x?.message || x, [...secretsCreation, r.mdp])); } }
          }
          json(res, 201, { id: r.id, mdp: r.mdp, maquette });
          flux.forEach((_, i) => envoyer(i, "adherents"));
        });
      }
      if (p === "/api/adherents") { if (s.role !== "admin") return refus(res, 403, "réservé à l'administrateur"); return json(res, 200, adherentsConnus(adherents).map(apercuDe)); }
      const liste = adherentsConnus(adherents);
      const id = s.role === "admin" ? (url.searchParams.get("adherent") || liste[0]) : s.id;
      let e;
      if (!id) { // aucun adhérent : l'admin garde la page (onglet Adhérents pour en créer un), le reste est refusé
        if (s.role !== "admin" || !["/", "/api/state", "/events"].includes(p)) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end("<p>Aucun adhérent.</p>"); }
        e = espaceVide();
      } else try { e = espace(id); } catch { return refus(res, 404, "adhérent introuvable"); }
      if (p === "/api/livrables" || p === "/api/livrable") {
        if (s.role !== "admin") return refus(res, 403, "réservé à l'administrateur");
        if (p === "/api/livrables") return json(res, 200, e.livrables());
        const f = url.searchParams.get("f"), contenu = e.lireLivrable(f); if (!contenu) return refus(res, 404, "fichier introuvable");
        const nom = path.basename(f).replace(/[^\w.-]/g, "_");
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="${nom}"`, "cache-control": "no-store" }); return res.end(contenu);
      }

      if (p === "/" && req.method === "GET") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); return res.end(e.viewerHtml({ role: s.role })); }
      if (p === "/api/state") { const { state, errors } = e.loadState(e.makeCtx()); if (s.role !== "admin") state.memoire = anonymiser(state.memoire); return json(res, 200, { state, errors, at: new Date().toISOString(), vue: { role: s.role, nom: state.adherent, adherents: s.role === "admin" ? liste : [], agent: !!llm, ...(s.role === "admin" ? { maquette: vueMaquette(id), apprentissage: vueApprentissage(id) } : {}) } }); }
      if (p === "/api/apercu-question" && req.method === "GET") {
        const q = url.searchParams.get("id"); if (!q || q.length > 200) return refus(res, 404, "question introuvable");
        if (limiteurApercu.bloque(s.id)) return refus(res, 429, "Trop de demandes, réessayez dans une minute");
        limiteurApercu.echec(s.id);
        const cle = id + "\n" + q, c = apercusQuestion.get(cle); let r;
        if (c && now() - c.t < 5000) r = c.v; else { r = e.apercuQuestion(q); apercusQuestion.set(cle, { t: now(), v: r }); if (apercusQuestion.size > 500) apercusQuestion.delete(apercusQuestion.keys().next().value); }
        return r ? json(res, 200, r) : refus(res, 404, "question introuvable");
      }
      if (p === "/events") {
        const sid = cookieDe(req); if ((fluxParSession.get(sid) || 0) >= 5) return refus(res, 429, "trop de flux ouverts");
        fluxParSession.set(sid, (fluxParSession.get(sid) || 0) + 1);
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" }); res.on("error", () => {}); res.write("retry: 1500\n\n"); if (!flux.has(id)) flux.set(id, new Set()); flux.get(id).add(res);
        req.on("close", () => { flux.get(id)?.delete(res); const n = (fluxParSession.get(sid) || 1) - 1; if (n) fluxParSession.set(sid, n); else fluxParSession.delete(sid); });
        return;
      }
      if ((p === "/api/reponse" || p === "/api/interpreter") && req.method === "POST" && runs.has(id)) { req.resume(); return refus(res, 409, "Une maquette est en cours, réessayez dans quelques minutes"); }
      if (p === "/api/reponse" && req.method === "POST") {
        const sid = cookieDe(req); if (limiteurReponses.bloque(sid)) { req.resume(); return refus(res, 429, "Trop de réponses, réessayez plus tard"); }
        limiteurReponses.echec(sid);
      }
      if (p === "/api/reponse" && req.method === "POST") return corps(req, res, b => { if (runs.has(id)) return refus(res, 409, "Une maquette est en cours, réessayez dans quelques minutes"); try { const r = e.repondre(b); if (!r.erreurs) { apercus.delete(id); purgerApercusQuestion(id); envoyer(id, "spec"); if (construireAuto && !arret) { declenches.add(id); file.declencher(id, () => {
        if (arret) return;
        try { e.construire(); } catch (x) { console.error(x); try { e.ecrireStatut({ tentative: new Date().toISOString().slice(0, 19), ok: false, nbErreurs: 1, erreurs: [{ fichier: "build", msg: "erreur interne pendant la construction" }] }); } catch (y) { console.error(y); } }
        finally { apercus.delete(id); purgerApercusQuestion(id); envoyer(id, "statut"); }
      }); } } json(res, r.erreurs ? 400 : 200, r); } catch (x) { erreurInterne(res, x); } });
      if (p === "/api/interpreter" && req.method === "POST") {
        if (!llm) { req.resume(); return refus(res, 503, "interprétation indisponible"); }
        const sid = cookieDe(req); if (limiteurAgent.bloque(sid)) { req.resume(); return refus(res, 429, "Trop d'interprétations, réessayez plus tard"); }
        limiteurAgent.echec(sid);
        return corps(req, res, async b => {
          if (runs.has(id)) return refus(res, 409, "Une maquette est en cours, réessayez dans quelques minutes");
          if (enCours.has(id)) return refus(res, 429, "Une interprétation est déjà en cours");
          enCours.add(id); const t0 = now(); let r, issue;
          try { r = await interpreter({ espace: e, llm, id: b.id, texte: b.texte, par: b.par }); issue = r.meta?.issue || "refus"; }
          catch (x) { console.error(String(x?.message || x).replace(/Bearer\s+\S+/gi, "Bearer ***")); issue = "passerelle"; }
          finally { enCours.delete(id); }
          try { fs.mkdirSync(e.P(".atelier"), { recursive: true }); fs.appendFileSync(e.P(".atelier/agent.jsonl"), JSON.stringify({ date: new Date().toISOString(), id: typeof b.id === "string" ? b.id.slice(0, 80) : "", tours: r?.meta?.tours ?? 0, jetons: r?.meta?.jetons ?? 0, ms: now() - t0, issue }) + "\n"); } catch (x) { console.error(x); }
          if (!r) return refus(res, 502, "interprétation indisponible");
          const { meta, ...sortie } = r; json(res, sortie.erreurs ? 400 : 200, sortie);
        });
      }
      if (p === "/api/maquette" && req.method === "POST") {
        req.resume();
        if (s.role !== "admin") return refus(res, 403, "réservé à l'administrateur");
        if (!llm) return refus(res, 503, "L'agent n'est pas disponible");
        if (runs.has(id)) return refus(res, 429, "Une maquette est déjà en cours pour cet adhérent");
        if (runs.size >= MAX_RUNS) return refus(res, 429, "Trop de maquettes en cours, réessayez plus tard");
        demarrerMaquette(id, e);
        return json(res, 202, { ok: true });
      }
      if (p === "/api/apprendre" && req.method === "POST") {
        req.resume();
        if (s.role !== "admin") return refus(res, 403, "réservé à l'administrateur");
        if (apprentissageEnCours) return refus(res, 409, "Un apprentissage est déjà en cours");
        apprentissageEnCours = true;
        return setImmediate(() => { try {
          const r = e.appliquerApprentissage(); apprentissages.delete(id);
          if (r.erreurs) return json(res, 400, r);
          fs.mkdirSync(e.P(".atelier"), { recursive: true }); fs.appendFileSync(e.P(".atelier/apprentissage.jsonl"), JSON.stringify({ date: new Date().toISOString(), admin: s.id, adherent: id, faits: r.faits.length, details: r.faits }) + "\n");
          json(res, 200, r); envoyer(id, "apprentissage");
        } catch (x) { erreurInterne(res, x); } finally { apprentissageEnCours = false; } });
      }
      if (p === "/api/layout" && req.method === "POST") {
        if (s.role !== "admin") return refus(res, 403, "réservé à l'administrateur");
        return corps(req, res, b => { if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return refus(res, 400, "x et y doivent être des nombres"); try { const f = e.P(".atelier/layout.json"); fs.mkdirSync(path.dirname(f), { recursive: true }); const l = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {}; l[`${b.kind}:${b.id}`] = { x: Math.round(b.x), y: Math.round(b.y) }; fs.writeFileSync(f, JSON.stringify(l, null, 2)); res.writeHead(204); res.end(); } catch { res.writeHead(400); res.end(); } });
      }
      if (p === "/api/besoins" && req.method === "POST") return corps(req, res, b => { try {
        const { themes, libres } = b;
        ecrireBesoins(racineDe(adherents, id), { themes: themes || [], libres: libres || [] });
        apercus.delete(id); purgerApercusQuestion(id); envoyer(id, "spec");
        if (construireAuto && !arret) { declenches.add(id); file.declencher(id, () => {
          if (arret) return;
          try { e.construire(); } catch (x) { console.error(x); try { e.ecrireStatut({ tentative: new Date().toISOString().slice(0, 19), ok: false, nbErreurs: 1, erreurs: [{ fichier: "build", msg: "erreur interne pendant la construction" }] }); } catch (y) { console.error(y); } }
          finally { apercus.delete(id); purgerApercusQuestion(id); envoyer(id, "statut"); }
        }); }
        json(res, 200, { ok: true });
      } catch (x) { erreurInterne(res, x); } });
      res.writeHead(404); res.end("introuvable");
    } catch (x) { erreurInterne(res, x); }
  });
  // à l'arrêt : fermer les veilleurs de fichiers et les flux SSE, sinon le processus ne se termine pas
  const fermer = () => { arret = true; annulation.abort(); clearInterval(battement); veilleurs.forEach(f => f()); flux.forEach(l => l.forEach(r => r.end())); flux.clear(); };
  const close = srv.close.bind(srv);
  srv.close = cb => { // attend les builds en cours (5 s au plus) avant de rendre la main
    fermer(); const attente = Promise.all([...declenches].map(i => file.attendre(i))), delai = new Promise(ok => setTimeout(ok, 5000).unref());
    const maquettes = Promise.all([...runs.values()]);
    Promise.race([Promise.all([attente, maquettes]), delai]).then(() => {
      for (const i of runs.keys()) { try { recupererInterrompu(racineDe(adherents, i)); } catch (x) { console.error(nettoyer(x?.message || x)); } }
      close(cb);
    }); return srv;
  };
  srv.attendreFile = i => file.attendre(i);
  srv.attendreMaquette = i => runs.get(i) || Promise.resolve();
  return srv;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = +process.env.PORT || 4400;
  creerApp({ adherents: adherentsRoot(), comptes: comptesFile(), cookieSecure: process.env.COOKIE_SECURE === "1", trustProxy: process.env.TRUST_PROXY === "1" })
    .listen(port, "127.0.0.1", () => console.log(`Plateforme : http://localhost:${port}\nAdhérents : ${adherentsConnus(adherentsRoot()).join(", ") || "(aucun)"}`));
}
