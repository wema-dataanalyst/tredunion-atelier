/* Un espace = un dossier d'adhérent (spec/, data/, generated/). Tout ce qui lit ou écrit la spec passe par ici. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { lireMemoire, ecrireMemoire, cheminMemoire, lireSel } from "./memoire.mjs";
import { apprendre } from "./apprendre.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const A = (...a) => path.join(APP, ...a);
const exists = f => fs.existsSync(f);
export const CORE = ["core/engine.js", "core/mesures.js", "core/model.js", "core/check.js", "core/controles.js", "core/hypotheses.js", "core/questions.js", "core/calque.js", "core/kpi.js"];
export const REGISTRE_VIDE = "# Registre des réponses de l'adhérent : on ajoute à la fin, on n'efface jamais.\n";
export const csvCache = new Map(); // LRU : le plus ancien en premier
const CSV_MAX_OCTETS = 200 * 1024 * 1024, CSV_MAX_ENTREES = 32;
/* Filet de l'aperçu : valeur qui ressemble à une donnée personnelle, même hors colonne pii (e-mail, téléphone, IBAN, 13 chiffres ou plus). */
export function ressembleSensible(v) {
  const s = String(v ?? "").trim(); if (!s) return false;
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(s)) return true;
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i.test(s.replace(/\s/g, ""))) return true;
  if (!/^\+?[\d\s.()\-]+$/.test(s)) return false;
  const n = s.replace(/\D/g, "").length;
  return n >= 13 || (/^(\+|00)/.test(s) && n >= 9 && n <= 15) || /^0\d([\s.\-]?\d{2}){4}$/.test(s);
}

export function ouvrirEspace(racine) {
  racine = path.resolve(racine);
  const P = (...a) => path.join(racine, ...a);
  const rel = f => path.relative(racine, f).split(path.sep).join("/");
  const readYaml = (f, def) => { if (!exists(f)) return def; const t = fs.readFileSync(f, "utf8"); try { return YAML.parse(t) ?? def; } catch (e) { throw new Error(`${rel(f)} : YAML invalide (${e.message.split("\n")[0]})`); } };
  const listYaml = dir => exists(dir) ? fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort().map(f => path.join(dir, f)) : [];
  function readCsv(file, parseCSV, snake) {
    let st; try { st = fs.statSync(file); } catch (e) { csvCache.delete(file); throw e; }
    const hit = csvCache.get(file);
    if (hit && hit.mtime === st.mtimeMs) { csvCache.delete(file); csvCache.set(file, hit); return hit.data; }
    if (st.size > CSV_MAX_OCTETS) throw new Error(`${rel(file)} : fichier trop gros (plus de 200 Mo)`);
    const rows = parseCSV(fs.readFileSync(file, "utf8"));
    const header = (rows[0] || []).map((h, i) => snake(h) || `col_${i + 1}`);
    const data = { header, rows: rows.slice(1, 50001) };
    csvCache.set(file, { mtime: st.mtimeMs, data });
    while (csvCache.size > CSV_MAX_ENTREES) csvCache.delete(csvCache.keys().next().value);
    return data;
  }
  const reel = f => exists(f) ? fs.realpathSync(f) : path.resolve(f);
  const dansRacine = f => { const r = path.relative(reel(racine), reel(f)); return !!r && !r.startsWith("..") && !path.isAbsolute(r); };
  const normQuestion = q => ({ id: q.id || "", text: q.text || "", done: !!q.done, answer: q.answer || "", reponse_type: q.reponse_type || "", reponse_cible: q.reponse_cible || "", options: Array.isArray(q.options) ? q.options : [], sql: q.sql || "", titre: q.titre || "", contexte: q.contexte || "" });
  function loadState(ctx) {
    const errors = [];
    const safe = (f, def, fn) => { try { return fn(); } catch (e) { errors.push({ niv: "erreur", fichier: rel(f), msg: e.message }); return def; } };
    const projet = safe(P("spec/projet.yml"), {}, () => readYaml(P("spec/projet.yml"), {}));
    const layout = exists(P(".atelier/layout.json")) ? JSON.parse(fs.readFileSync(P(".atelier/layout.json"), "utf8")) : {};
    const { parseCSV, snake, goldTemplate } = ctx.fns;
    const societes = (projet.societes || []).map((s, i) => ({ id: String(s.id), name: s.name || s.id, source: s.source || "", color: s.color ?? i }));
    const datasets = [];
    listYaml(P("spec/datasets")).forEach((f, i) => safe(f, null, () => {
      const d = readYaml(f, {}); d.id = d.id || path.basename(f).replace(/\.ya?ml$/, "");
      d.columns = (d.columns || []).map(c => ({ name: String(c.name), type: c.type || "", role: c.role || "attr", desc: c.desc || "", pii: !!c.pii, codes: c.codes || null, format: c.format || "", decimalComma: !!c.decimalComma, hypothese: c.hypothese || null }));
      d.questions = (d.questions || []).map(normQuestion);
      d.rules = d.rules || []; d.cases = (d.cases || []).map(c => typeof c === "string" ? { text: c } : c);
      const file = d.file ? P(d.file) : null; d.rows = [];
      if (file && !dansRacine(file)) throw new Error(`file : chemin hors de la racine de l'espace (${String(d.file).slice(0, 80)})`);
      if (!file || !exists(file)) d._fileMissing = true;
      else { const { header, rows } = readCsv(file, parseCSV, snake); const idx = d.columns.map(c => header.indexOf(c.name));
        d._notInCsv = d.columns.filter((c, k) => idx[k] < 0).map(c => c.name); d._notInSpec = header.filter(h => !d.columns.some(c => c.name === h));
        d.rows = rows.map(r => idx.map(k => k < 0 ? "" : (r[k] ?? ""))); }
      const metaF = file ? file.replace(/\.csv$/i, ".meta.json") : null; d.meta = metaF && dansRacine(metaF) && exists(metaF) ? JSON.parse(fs.readFileSync(metaF, "utf8")) : null;
      const pos = layout["ds:" + d.id]; d.x = pos?.x ?? 40 + (i % 2) * 290; d.y = pos?.y ?? 40 + Math.floor(i / 2) * 280;
      datasets.push(d);
    }));
    const relations = safe(P("spec/relations.yml"), [], () => (readYaml(P("spec/relations.yml"), []) || []).map((r, i) => ({ id: r.id || `r${i + 1}`, from: r.from, to: r.to, kind: r.kind || "equal", norm: r.norm || "none", note: r.note || "" })));
    const flux = [];
    listYaml(P("spec/flux")).forEach(f => safe(f, null, () => { const x = readYaml(f, {}); x.id = x.id || path.basename(f).replace(/\.ya?ml$/, "");
      flux.push(Object.assign({ codMode: "fixe", cod: "", lib: "", codCol: "", libCol: "", rules: [], unite: "€", champ: "MontantReel", valeur: "", agg: "sum", date: "", vehicule: "", chauffeur: "", site: "", client: "", collaborateur: "", filtre: "", note: "" }, x)); }));
    const gold = goldTemplate().filter(t => t.kind === "faits" || t.generated).concat([]);
    listYaml(P("spec/dims")).forEach(f => safe(f, null, () => { const t = readYaml(f, {}); t.id = t.id || path.basename(f).replace(/\.ya?ml$/, ""); t.kind = "dim";
      t.columns = (t.columns || []).map(c => ({ name: String(c.name), type: c.type || "text", desc: c.desc || "", map: c.map || {}, hypothese: c.hypothese || null })); gold.push(t); }));
    const tpl = Object.fromEntries(goldTemplate().map(t => [t.id, t]));
    gold.forEach(t => { const pos = layout["gold:" + t.id]; t.x = pos?.x ?? tpl[t.id]?.x ?? 690; t.y = pos?.y ?? tpl[t.id]?.y ?? 40; });
    const ref = safe(P("spec/referentiel.yml"), {}, () => readYaml(P("spec/referentiel.yml"), {}));
    const categories = (ref.codes || []).map(c => typeof c === "string" ? { cod: c, note: "", lib: "" } : { cod: String(c.cod), note: c.note || "", lib: typeof c.lib === "string" ? c.lib : "", ...(c.hypothese && typeof c.hypothese === "object" ? { hypothese: c.hypothese } : {}) });
    const catalogue = exists(P("spec/catalogue/elements_principaux.txt")) ? fs.readFileSync(P("spec/catalogue/elements_principaux.txt"), "utf8").replace(/\r/g, "") : "";
    const journal = safe(P("spec/journal.yml"), [], () => readYaml(P("spec/journal.yml"), []) || []);
    const perimetre = safe(P("spec/perimetre.yml"), [], () => { const doc = readYaml(P("spec/perimetre.yml"), {}); const l = doc && Array.isArray(doc.groupes) ? doc.groupes : [];
      return l.filter(g => g && typeof g === "object").map(g => ({ id: String(g.id ?? ""), cause: String(g.cause || ""), mesures: Array.isArray(g.mesures) ? g.mesures.map(String) : [], titre: String(g.titre || ""), contexte: String(g.contexte || ""), hypothese: g.hypothese && typeof g.hypothese === "object" ? g.hypothese : null })); });
    const propositions = safe(P("spec/mesures.yml"), [], () => {
      const doc = readYaml(P("spec/mesures.yml"), {});
      const l = doc && Array.isArray(doc.propositions) ? doc.propositions : [];
      const obj = x => x && typeof x === "object" && !Array.isArray(x);
      return l
        .filter(obj)
        .map(p => ({
          id: String(p.id ?? ""),
          titre: String(p.titre || ""),
          contexte: String(p.contexte || ""),
          feuille: p.feuille === undefined ? undefined : String(p.feuille),
          codes: Array.isArray(p.codes) ? p.codes.filter(obj).map(c => ({ cod: String(c.cod ?? ""), lib: String(c.lib ?? "") })) : [],
          mesures: Array.isArray(p.mesures) ? p.mesures.filter(obj).map(g => ({ ...g })) : [],
          hypothese: obj(p.hypothese) ? p.hypothese : undefined,
        }));
    });
    const controles = safe(P("spec/controles.yml"), [], () => readYaml(P("spec/controles.yml"), []) || []);
    const reponses = safe(P("spec/reponses.yml"), null, () => { try { return readYaml(P("spec/reponses.yml"), []) ?? []; } catch { throw new Error("spec/reponses.yml illisible : les réponses ne sont plus affichées. Corrige le fichier (dernière version lue : .atelier/reponses.json, si elle existe)"); } });
    if (reponses !== null) safe(P("spec/reponses.yml"), null, () => filetReponses(reponses));
    const memoire = lireMemoire(cheminMemoire(APP));
    const nonLus = societes.flatMap(s => { const f = P("data/bronze", s.id, "_non_lus.json"); return exists(f) ? JSON.parse(fs.readFileSync(f, "utf8")).map(x => ({ societe: s.id, ...x })) : []; });
    const log = journal.map(j => ({ at: j.date || "", said: j.question || "", resume: j.decision || "", ops: (j.fichiers || []).map(String) }));
    return { state: { version: 2, adherent: projet.adherent || "Adhérent", societes, datasets, relations, gold, flux, categories, catalogue, cases: (projet.cases || []).map(c => typeof c === "string" ? { text: c } : c), questions: (Array.isArray(projet.questions) ? projet.questions : []).filter(q => q != null && typeof q === "object").map(normQuestion), perimetre, propositions, log, controles, reponses: reponses ?? [], memoire, nonLus }, errors };
  }
  /* Sans git, l'instantané .atelier/reponses.json est le seul témoin d'une réponse effacée du registre. */
  function filetReponses(reponses) {
    const f = P(".atelier/reponses.json"), cle = r => JSON.stringify([r?.id, r?.date, r?.reponse]);
    const avant = exists(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
    const ici = new Set((Array.isArray(reponses) ? reponses : []).map(cle));
    const perdues = (Array.isArray(avant) ? avant : []).filter(r => !ici.has(cle(r)));
    if (perdues.length) throw new Error(`spec/reponses.yml : ${perdues.length} réponse(s) disparue(s) depuis le dernier chargement (ids : ${[...new Set(perdues.map(r => r?.id))].join(", ")}). Rétablis-les depuis .atelier/reponses.json ; si la suppression est voulue, supprime ce fichier.`);
    const t = JSON.stringify(reponses, null, 2);
    if (Array.isArray(reponses) && (!exists(f) || fs.readFileSync(f, "utf8") !== t)) { fs.mkdirSync(P(".atelier"), { recursive: true }); fs.writeFileSync(f, t); }
  }
  function makeCtx() {
    const ctx = vm.createContext({ console, Intl, Date, Math, JSON });
    CORE.forEach(f => vm.runInContext(fs.readFileSync(A(f), "utf8"), ctx, { filename: f }));
    ctx.fns = vm.runInContext("({parseCSV,snake,goldTemplate,profile,autoQuestions})", ctx);
    return ctx;
  }
  function evaluate(plus = []) {
    const ctx = makeCtx(); const { state, errors } = loadState(ctx); if (plus.length && Array.isArray(state.reponses)) state.reponses = state.reponses.concat(plus);
    ctx.__state = state; vm.runInContext("S.st=hydrate(__state); S.ver++;", ctx);
    const findings = errors.concat(vm.runInContext("checkSpec()", ctx));
    return { ctx, state, findings, errors };
  }
  function ajouterAuRegistre(entree) {
    const f = P("spec/reponses.yml"), avant = exists(f) ? fs.readFileSync(f, "utf8") : REGISTRE_VIDE;
    const tmp = f + `.${process.pid}.tmp`;
    fs.writeFileSync(tmp, avant.replace(/^\[\]\s*$/m, "").replace(/\n*$/, "\n") + YAML.stringify([entree], { lineWidth: 0 }));
    fs.renameSync(tmp, f);
  }
  function preparer({ id, saisie, par }) {
    if (typeof id !== "string" || (saisie != null && typeof saisie !== "object") || (par != null && (typeof par !== "string" || par.length > 80))) return { erreurs: ["requête invalide : id, saisie, par"] };
    const { ctx, errors } = evaluate(); if (errors.some(e => e.fichier === "spec/reponses.yml")) return { erreurs: ["registre spec/reponses.yml illisible : corrige-le avant de répondre"] };
    const avant = vm.runInContext("summary()", ctx);
    ctx.__r = { id, saisie: saisie || {}, par: par || "", date: new Date().toISOString().slice(0, 19) };
    const r = JSON.parse(JSON.stringify(vm.runInContext("entreeReponse(__r.id, __r.saisie, __r.par, __r.date)", ctx)));
    if (r.erreurs) return r;
    const apres = vm.runInContext("summary()", evaluate([r.entree]).ctx);
    r.entree.effet = `mesures alimentées ${avant.mesures.ok} → ${apres.mesures.ok} · lignes FAITS ${avant.lignesFaits} → ${apres.lignesFaits} · questions ouvertes ${avant.questionsOuvertes} → ${apres.questionsOuvertes}`;
    return r;
  }
  function repondre(req) { const r = preparer(req); if (!r.erreurs) ajouterAuRegistre(r.entree); return r; }
  function contexteAgent(id) {
    const { ctx } = evaluate(); ctx.__id = id;
    return JSON.parse(JSON.stringify(vm.runInContext(`(()=>{ const q=listeQuestions().find(x=>x.id===__id&&x.source!=="registre"); if(!q) return null;
      const dsId=String(q.element||"").split(/[.#]/)[0], d=DS(dsId), fo=q.formulaire||{};
      const colonnes=d?d.columns.filter(c=>!c.pii).map(c=>{ const p=(d._prof||{})[c.name]||{}; return {nom:c.name,type:c.type,desc:c.desc||"",codes:c.codes||null,distinctes:p.distinct||0,pctVides:p.n?Math.round(p.nulls/p.n*100):0,frequentes:(p.top||[]).slice(0,10)}; }):[];
      return {id:q.id,question:q.question,titre:q.titre||"",type:q.type,cible:fo.cible||"",options:fo.options||[],dataset:d?dsId:"",colonnes}; })()`, ctx)));
  }
  /* Un comptage de 1 ou 2 identifierait les adhérents : l'agent lit « moins de 3 adhérents ». */
  const peu = l => { const n = (l || []).length; return n >= 3 ? n : n ? "moins de 3 adhérents" : 0; };
  const comptagesAnonymes = e => ({ ...e, confirme_chez: peu(e.confirme_chez), contredit_chez: peu(e.contredit_chez) });
  function memoireColonne(nom) {
    const m = lireMemoire(cheminMemoire(APP)), n = String(nom || "").toLowerCase();
    return (m.colonnes || []).filter(e => [e.id, e.nom].some(x => String(x || "").toLowerCase() === n)).map(comptagesAnonymes);
  }
  /* Profil d'un dataset pour l'agent de maquette : jamais de valeur des colonnes pii, ni de question qui en cite. */
  function profilDataset(id) {
    const { ctx } = evaluate(); ctx.__id = String(id);
    return JSON.parse(JSON.stringify(vm.runInContext(`(()=>{ const d=DS(__id); if(!d) return null; const pii=new Set(d.columns.filter(c=>c.pii).map(c=>c.name));
      const colonnes=d.columns.map(c=>{ const p=(d._prof||{})[c.name]||{}, base={nom:c.name,type:c.type,role:c.role,desc:c.desc||"",pii:!!c.pii,distinctes:p.distinct||0,pctVides:p.n?Math.round(p.nulls/p.n*100):0};
        if(c.pii) return base; return {...base,codes:c.codes||null,format:c.format||"",decimalComma:!!c.decimalComma,devine:p.guess||"",min:p.min??"",max:p.max??"",frequentes:(p.top||[]).slice(0,8),hypothese:c.hypothese||null}; });
      const touche=r=>[r.from,r.to].some(x=>String(x).split(".")[0]===d.id);
      return {id:d.id,societe:d.societe||"",desc:d.desc||"",grain:d.grain||"",lignes:d.rows.length,colonnes,regles:(d.rules||[]).map(r=>({text:r.text||"",sql:r.sql||""})),
        relations:S.st.relations.filter(touche).map(r=>({id:r.id,from:r.from,to:r.to,kind:r.kind,norm:r.norm})),
        flux:S.st.flux.filter(f=>f.ds===d.id).map(f=>({id:f.id,cod:f.cod,codMode:f.codMode,valeur:f.valeur,champ:f.champ,unite:f.unite})),
        questions:d.questions.filter(q=>![...pii].some(n=>String(q.text||"").startsWith(n+" :"))).map(q=>({id:q.id,text:q.text,done:q.done,reponse_type:q.reponse_type}))}; })()`, ctx)));
  }
  /* Catégories manquantes classées par nombre de mesures débloquées (comme npm run couverture). */
  function couverture() {
    const { ctx } = evaluate();
    return JSON.parse(JSON.stringify(vm.runInContext(`(()=>{ const cat=CAT(), cov=COV(), hors=horsPerimetre(), need=new Map(), n={ok:0,part:0,none:0,err:0,hors:0};
      cat.list.forEach(m=>{ const c=cov.get(m.id); if(hors.has(m.name)){ n.hors++; return; } n[c.s]++; if(c.s!=="ok") (c.miss||[]).forEach(x=>{ if(!need.has(x)) need.set(x,new Set()); need.get(x).add(m.name); }); });
      return {mesures:n,manque:[...need.entries()].map(([categorie,ms])=>({categorie,libelle:libelleCat(categorie),mesures:[...ms]})).sort((a,b)=>b.mesures.length-a.mesures.length)}; })()`, ctx)));
  }
  /* Mesures candidates au périmètre : statut « none », ni hors périmètre ni déjà dans un groupe (quel que soit son état). */
  function candidatsPerimetre() {
    const { ctx } = evaluate();
    return JSON.parse(JSON.stringify(vm.runInContext(`(()=>{ const cat=CAT(), cov=COV(), hors=horsPerimetre(), deja=new Set();
      (S.st.perimetre||[]).forEach(g=>(g.mesures||[]).forEach(n=>{ const m=cat.resolve(String(n)); deja.add(m?m.name:String(n)); }));
      const adh=nomsMesuresAdherent(), vus=new Set(), out=[];
      cat.list.forEach(m=>{ if(vus.has(m.name)||hors.has(m.name)||deja.has(m.name)||adh.has(m.name)) return; const c=cov.get(m.id); if(c.s!=="none") return; vus.add(m.name); out.push({mesure:m.name,manque:(c.miss||[]).slice()}); });
      return out; })()`, ctx)));
  }
  /* Codes utilisés par au moins un flux, sans libellé : candidats à la proposition de la maquette. Un code dont l'hypothèse est tranchée est écarté. */
  function codesSansLibelle() {
    const { ctx } = evaluate();
    return JSON.parse(JSON.stringify(vm.runInContext(`(()=>{ const use=new Map();
      S.st.flux.forEach(f=>{ const cods=f.codMode==="regles"?(f.rules||[]).map(r=>r.cod):f.codMode==="colonne"?[]:[f.cod]; cods.filter(Boolean).forEach(c=>{ if(!use.has(c)) use.set(c,new Set()); use.get(c).add(f.id); }); });
      return S.st.categories.filter(c=>use.has(c.cod)&&!(c.lib&&String(c.lib).trim())&&!(c.hypothese&&(c.hypothese.valide||c.hypothese.refuse))).map(c=>({cod:c.cod,flux:[...use.get(c.cod)]})); })()`, ctx)));
  }
  function memoireComptes(prefixe) {
    const m = lireMemoire(cheminMemoire(APP)), p = String(prefixe || "").trim();
    return p ? (m.comptes || []).filter(e => { const i = String(e.id ?? ""); return i && (p.startsWith(i) || i.startsWith(p)); }).map(comptagesAnonymes) : [];
  }
  function viewerHtml(vue) {
    const css = fs.readFileSync(A("viewer/style.css"), "utf8"), wema = fs.readFileSync(A("viewer/wema.css"), "utf8"), body = fs.readFileSync(A("viewer/body.html"), "utf8");
    const js = CORE.concat(["viewer/ui.js", "viewer/dash.js", "viewer/boot.js"]).map(f => `/* ${f} */\n` + fs.readFileSync(A(f), "utf8").replace(/^"use strict";/, "")).join("\n");
    const attr = vue?.role ? ` data-role="${vue.role === "admin" ? "admin" : "adherent"}"` : "";
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Atelier silver → gold</title>
  <style>*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}body{margin:0}${wema}${css}</style></head><body${attr}>
  ${body}
  <script>"use strict";\n${js}\n</script></body></html>`;
  }
  const STATUT = () => P(".atelier/statut.json");
  const lireStatut = () => { try { return JSON.parse(fs.readFileSync(STATUT(), "utf8")); } catch { return {}; } };
  function ecrireStatut(o) {
    const f = STATUT(); fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + `.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify({ ...lireStatut(), ...o }, null, 2)); fs.renameSync(tmp, f);
  }
  function recupererEchange() { // une coupure a pu laisser des dossiers temporaires ou l'ancien livrable
    const residus = n => fs.readdirSync(racine).filter(x => x.startsWith(n)).sort();
    if (!exists(P("generated"))) { const [ancien] = residus("generated.old-"); if (ancien) fs.renameSync(P(ancien), P("generated")); }
    [...residus("generated.tmp-"), ...residus("generated.old-")].forEach(x => fs.rmSync(P(x), { recursive: true, force: true }));
  }
  function construire() {
    recupererEchange();
    const { ctx, findings } = evaluate(), at = new Date().toISOString().slice(0, 19), erreurs = findings.filter(f => f.niv === "erreur");
    if (erreurs.length) { ecrireStatut({ tentative: at, ok: false, nbErreurs: erreurs.length, erreurs: erreurs.slice(0, 20).map(f => ({ fichier: f.fichier, msg: f.msg })) }); return { ok: false, erreurs }; }
    const files = vm.runInContext("buildFiles()", ctx), out = P("generated"), tmp = P(`generated.tmp-${process.pid}`), old = P(`generated.old-${process.pid}`);
    try {
      files.forEach(f => { const t = path.join(tmp, f.path); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, f.body); });
      if (exists(out)) fs.renameSync(out, old);
      fs.renameSync(tmp, out); fs.rmSync(old, { recursive: true, force: true });
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    ecrireStatut({ tentative: at, ok: true, dernierBuild: at, fichiers: files.length, nbErreurs: 0, erreurs: [] });
    return { ok: true, fichiers: files.length };
  }
  function livrables() {
    const base = P("generated"); if (!exists(base)) return [];
    const sortie = []; const parcourir = (d, pre) => fs.readdirSync(d, { withFileTypes: true }).forEach(en => { const rel = pre ? `${pre}/${en.name}` : en.name; en.isDirectory() ? parcourir(path.join(d, en.name), rel) : en.isFile() && sortie.push({ path: rel, taille: fs.statSync(path.join(d, en.name)).size }); });
    parcourir(base, ""); return sortie.sort((a, b) => a.path.localeCompare(b.path));
  }
  const lireLivrable = p => typeof p === "string" && livrables().some(x => x.path === p) ? fs.readFileSync(path.join(P("generated"), ...p.split("/"))) : null;
  function apercu() {
    const { ctx, findings, state } = evaluate(), s = vm.runInContext("summary()", ctx), qs = vm.runInContext("listeQuestions()", ctx), m = s.mesures, st = lireStatut();
    const dernieres = new Map(); (state.reponses || []).forEach(r => dernieres.set(r.id, r));
    const libres = [...dernieres.values()].filter(r => r.origine === "client" && r.reponse && (r.modifs || []).length && r.modifs.every(x => x.op === "noter")).length;
    return { nom: state.adherent, questions: { traitees: qs.filter(q => q.statut === "traitee").length, total: qs.length }, mesures: { ok: m.ok, total: m.ok + m.part + m.none + m.err },
      erreurs: findings.filter(f => f.niv === "erreur").length, dernierBuild: st.dernierBuild || null, buildOk: st.ok ?? null, libres, nonLus: (state.nonLus || []).length };
  }
  /* Aperçu sans écriture : le sel n'est pas créé (les faits n'en dépendent pas), aucune société en clair. */
  function apercuApprentissage() {
    const { state } = evaluate(), memoire = lireMemoire(cheminMemoire(APP)), fichierSel = path.join(memoire.dir, ".sel");
    const sel = process.env.TREDUNION_SEL || (exists(fichierSel) ? lireSel(memoire.dir) : "apercu");
    return { faits: apprendre(state, memoire, sel).details };
  }
  function appliquerApprentissage() {
    const { state, findings } = evaluate(), n = findings.filter(f => f.niv === "erreur").length;
    if (n) return { erreurs: [`La spec a ${n} erreur(s) : corrige-les d'abord`] };
    const memoire = lireMemoire(cheminMemoire(APP));
    if (!memoire.existe) return { erreurs: ["Mémoire commune introuvable"] };
    const { comptes, colonnes, details } = apprendre(state, memoire, lireSel(memoire.dir));
    if (details.length) ecrireMemoire({ ...memoire, comptes, colonnes }, ["comptes", "colonnes"]);
    return { faits: details };
  }
  /* Aperçu des données d'une question : 10 lignes des datasets concernés, colonnes concernées d'abord.
     Le masquage des colonnes pii est fait ici, avant toute sérialisation : une colonne de même nom déclarée pii ailleurs est masquée aussi. */
  function apercuQuestion(id) {
    const { ctx, state } = evaluate();
    const q = vm.runInContext("listeQuestions()", ctx).find(x => x.id === id && x.source !== "registre"); if (!q) return null;
    const jetons = s => String(s || "").replace(/'[^']*'/g, " ").match(/[A-Za-z_]\w*/g) || [];
    const piiNoms = new Set(state.datasets.flatMap(d => d.columns.filter(c => c.pii).map(c => c.name)));
    const el = String(q.element || ""), cibles = new Map(); // dataset → colonnes concernées
    const vise = (ds, cols) => { if (!cibles.has(ds)) cibles.set(ds, new Set()); (cols || []).forEach(c => cibles.get(ds).add(c)); };
    let raison = "";
    if (el.startsWith("flux:")) { const f = state.flux.find(x => x.id === el.slice(5).split(/[#.]/)[0]); if (f) vise(f.ds, [f.codCol, f.libCol, f.date, f.vehicule, f.chauffeur, f.site, f.client, f.collaborateur].flatMap(jetons).concat(jetons(f.valeur), jetons(f.filtre))); }
    else if (el.startsWith("controle:")) {
      const c = state.controles.find(x => `controle:${x.id}` === el) || {};
      for (const k of ["a", "b"]) if (c[k]?.ds) vise(String(c[k].ds), [c[k].valeur, c[k].date, c[k].filtre].flatMap(jetons));
      for (const k of ["from", "to"]) if (c[k]) { const [ds, col] = String(c[k]).split("."); vise(ds, [col]); }
      if (c.ds) vise(String(c.ds), jetons(c.date));
    } else if (q.source === "projet") raison = "question sur votre activité : pas de données à afficher";
    else if (q.source === "non_lu") raison = "fichier non lu : aucune donnée à afficher";
    else if (el.startsWith("perimetre:")) raison = "question sur votre tableau de bord : pas de données à afficher";
    else if (el.startsWith("mesures:")) raison = "question sur votre tableau de bord : pas de données à afficher";
    else if (el.startsWith("categorie:")) raison = "question sur le libellé d'une catégorie : pas de données à afficher";
    else if (/^DIM_/.test(el)) raison = "dimension : pas de dataset associé";
    else { const [ds, col] = [el.split(/[.#]/)[0], /^[^.#:]+\.([^.#]+)/.exec(el)?.[1]]; vise(ds, col ? [col] : []); }
    if (!cibles.size) return { aucun: true, raison: raison || "aucun dataset associé à cette question" };
    const vue = [...cibles].map(([ds, concernees]) => {
      const d = state.datasets.find(x => x.id === ds); if (!d) return { aucun: true, raison: "dataset introuvable" };
      const idx = d.columns.map((c, i) => i), conc = i => concernees.has(d.columns[i].name);
      const choix = idx.filter(conc).concat(idx.filter(i => !conc(i))).slice(0, 8);
      const masque = choix.map(i => d.columns[i].pii || piiNoms.has(d.columns[i].name));
      const texte = (v, m) => { const s = String(v ?? ""); return !s ? "" : m || ressembleSensible(s) ? "•••" : s.length > 80 ? s.slice(0, 80) + "…" : s; };
      return { dataset: d.id, societe: d.societe || "", total: d.rows.length,
        colonnes: choix.map((i, k) => ({ name: d.columns[i].name, pii: masque[k], concerne: conc(i) })),
        lignes: d.rows.slice(0, 10).map(r => choix.map((i, k) => texte(r[i], masque[k]))) };
    });
    return vue.length === 1 ? vue[0] : { apercus: vue };
  }
  /* Erreurs de validation d'une proposition, par le moteur (même règles que check). */
  function erreursProposition(p) {
    const { ctx } = evaluate();
    ctx.__p = JSON.parse(JSON.stringify(p));
    return JSON.parse(JSON.stringify(vm.runInContext("erreursProposition(__p,S.st)", ctx)));
  }
  /* Dernière réponse de l'adhérent à chaque question de projet (activités, KPI attendus). */
  function reponsesAdherent() {
    const { ctx } = evaluate();
    return JSON.parse(
      JSON.stringify(
        vm.runInContext(
          `(()=>{ const m=new Map(); (S.st.reponses||[]).forEach(r=>{ if(r&&typeof r.id==="string"&&r.id.startsWith("projet#")&&typeof r.reponse==="string"&&r.reponse.trim()) m.set(r.id,{id:r.id,question:String(r.question||""),reponse:r.reponse.trim().slice(0,1000)}); }); return [...m.values()]; })()`,
          ctx
        )
      )
    );
  }
  function nomsCatalogueBase() {
    const { ctx } = evaluate();
    return JSON.parse(JSON.stringify(vm.runInContext(`parseCatalogue(S.st.catalogue||"").map(m=>m.name)`, ctx)));
  }
  const besoinsPath = path.join(racine, "spec/besoins.yml");
  const besoinsRaw = fs.existsSync(besoinsPath) ? YAML.parse(fs.readFileSync(besoinsPath, "utf8")) : null;
  const besoins = { themes: besoinsRaw?.themes || [], libres: besoinsRaw?.libres || [] };
  return { besoins, apercuQuestion, apercuApprentissage, appliquerApprentissage, P, readYaml, listYaml, readCsv, makeCtx, loadState, evaluate, repondre, previsualiser: preparer, contexteAgent, memoireColonne, memoireComptes, profilDataset, couverture, candidatsPerimetre, codesSansLibelle, erreursProposition, reponsesAdherent, nomsCatalogueBase, ajouterAuRegistre, viewerHtml, construire, apercu, livrables, lireLivrable, lireStatut, ecrireStatut };
}
