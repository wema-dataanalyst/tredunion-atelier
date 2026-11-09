/* Écriture de spec sûre pour l'agent de maquette : validation avant écriture, rien hors <racine>/spec/, sans réseau.
   Chaque fonction : (racine, entree) → {ok:true} | {erreurs:[…]}. Commentaires et ordre des clés conservés (API Document de yaml). */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import YAML from "yaml";
import { ouvrirEspace } from "../../tools/espace.mjs";

const ID = /^[a-z0-9_]+$/;
const MAX = 20 * 1024;
const MIN_PII = 4;
/* Miroirs des constantes de core/model.js et core/calque.js (le moteur est chargé par vm, non importable). */
const TYPES = ["text", "int", "decimal", "date", "timestamp", "bool"];
const ROLES = ["attr", "key", "fk", "measure", "ignore"];
const REPONSES = ["confirmer", "codes", "choix", "exclure", "fichier", "libre"];
const CODMODES = ["fixe", "regles", "colonne"];
const CHAMPS = ["MontantReel", "BudgetNextN", "MontantLoc"];
const AGGS = ["sum", "count", "avg", "min", "max"];
const KINDS = ["equal", "lookup", "fuzzy"];
const NORMS = ["none", "trim_upper", "alnum_upper", "strip_zeros"];
const CTRL_TYPES = ["ecart_somme", "rapprochement", "mensuel"];
const SOURCE = /^(agent|memoire:(logiciels|comptes|colonnes)\/.+)$/;

const obj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const str = x => typeof x === "string" && x.trim() !== "";
const num01 = x => typeof x === "number" && x >= 0 && x <= 1;
const sauf = (f, ...a) => { try { return f(...a); } catch { return null; } };

/* ───── grammaire fermée du moteur ───── */
/* Les textes de conditions et de calculs sont collés dans le SQL généré : seule la grammaire de core/model.js (parseCond, compileVal) est admise.
   Le moteur est un script vm : on le charge par le contexte de l'espace, sans toucher à core/. */
let moteurCache = null;
const moteur = racine => moteurCache ??= vm.runInContext("({parseCond,compileVal})", ouvrirEspace(racine).makeCtx());
const GRAMMAIRE = "conditions admises : colonne (= <> != > < >= <=) valeur, colonne [not] in (…), colonne [not] like|ilike '…', colonne is [not] null, reliées par and (ni or, ni sous-requête, ni fonction)";
/* Message d'erreur ou null. `cols` : colonnes du dataset (silver). */
function erreurCond(racine, sql, cols, ou) {
  if (!str(sql) || sql.length > 300) return `${ou} : condition obligatoire (300 caractères au plus)`;
  if (!moteur(racine).parseCond(sql)) return `${ou} : condition refusée, hors grammaire du moteur (${GRAMMAIRE})`;
  const inconnue = sql.split(/\s+and\s+/i).map(p => /^[\s(]*([a-z_]\w*)/i.exec(p)?.[1]).find(c => c && !cols.has(c));
  return inconnue ? `${ou} : colonne « ${inconnue} » absente du dataset` : null;
}
function erreurValeur(racine, expr, d, ou) {
  return str(expr) && expr.length <= 300 && moteur(racine).compileVal(expr, d) ? null : `${ou} : calcul refusé (une colonne du dataset ou un calcul + - * / ( ) entre colonnes et nombres)`;
}
/* Identifiants et libellés collés dans le SQL : jamais d'apostrophe, de guillemet, de ; ni de retour à la ligne. */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const CODE = /^[\p{L}\p{N} _.%\-]{1,60}$/u;
const LIBELLE = /^[\p{L}\p{N} _.%()\-/+&,:’]{1,80}$/u;
const PREFIXE = /^[A-Za-z0-9]{1,20}$/;
const texteLibre = x => typeof x === "string" && !/[\r\n\u2028\u2029]/.test(x); // texte collé dans un commentaire SQL : une seule ligne
const siteFixe = x => /^'[\p{L}\p{N} _.\-]{1,60}'$/u.test(String(x).trim());

function chemin(racine, ...parts) {
  const base = path.resolve(racine, "spec"), f = path.resolve(base, ...parts);
  return f.startsWith(base + path.sep) ? f : null;
}
const fichierId = (racine, dossier, id) => chemin(racine, dossier, id + ".yml");
const lireYaml = f => YAML.parseDocument(fs.readFileSync(f, "utf8"));
function ecrire(f, doc) {
  const tmp = f + ".tmp"; fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(tmp, doc.toString()); fs.renameSync(tmp, f);
}

/* Prépare une entrée : objet, taille, id sûr. Renvoie une copie JSON (sans prototype ni fonctions). */
function preparer(entree) {
  if (!obj(entree)) return { erreurs: ["entrée : objet attendu"] };
  let t; try { t = JSON.stringify(entree); } catch { return { erreurs: ["entrée illisible"] }; }
  if (Buffer.byteLength(t) > MAX) return { erreurs: [`entrée trop grosse (${MAX / 1024} ko au plus)`] };
  if (typeof entree.id !== "string" || !ID.test(entree.id)) return { erreurs: ["id invalide (lettres minuscules, chiffres et _ seulement)"] };
  return { e: JSON.parse(t) };
}

export function lireReferentiel(racine) {
  const f = chemin(racine, "referentiel.yml");
  if (!f || !fs.existsSync(f)) return [];
  return ((YAML.parse(fs.readFileSync(f, "utf8")) || {}).codes || []).map(c => String(typeof c === "string" ? c : c.cod));
}

/* Colonnes d'un dataset de la spec (+ _libelle des colonnes codées), ou null si le dataset n'existe pas. */
function datasetSpec(racine, id) {
  const f = typeof id === "string" && ID.test(id) ? fichierId(racine, "datasets", id) : null;
  if (!f || !fs.existsSync(f)) return null;
  return sauf(() => YAML.parse(fs.readFileSync(f, "utf8")) || {});
}
function colonnesDe(d) {
  const s = new Set(); (d.columns || []).forEach(c => { s.add(String(c.name)); if (c.codes) s.add(c.name + "_libelle"); }); return s;
}

/* ───── données personnelles ───── */
const snake = h => String(h).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
function csv(texte) {
  texte = texte.replace(/^\uFEFF/, ""); const premiere = texte.split(/\r?\n/)[0] || "";
  const delim = [";", ",", "\t", "|"].map(d => [d, premiere.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < texte.length && rows.length <= 50001; i++) { const c = texte[i];
    if (q) { if (c === '"') { if (texte[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === delim) { row.push(f); f = ""; } else if (c === "\n") { row.push(f.replace(/\r$/, "")); rows.push(row); row = []; f = ""; } else f += c; }
  if (f !== "" || row.length) { row.push(f.replace(/\r$/, "")); rows.push(row); }
  return rows;
}
/* Valeurs distinctes (minuscules) des colonnes pii d'un dataset : [{col, valeurs}]. */
function valeursPii(racine, d) {
  const cols = (d.columns || []).filter(c => c.pii).map(c => String(c.name)); if (!cols.length || !d.file) return [];
  const f = path.resolve(racine, String(d.file)), base = path.resolve(racine, "data");
  if (!f.startsWith(base + path.sep) || !fs.existsSync(f)) return [];
  const rows = csv(fs.readFileSync(f, "utf8")), head = (rows[0] || []).map(snake);
  return cols.map(c => { const k = head.indexOf(c); const v = new Set();
    if (k >= 0) rows.slice(1).forEach(r => { const x = String(r[k] ?? "").trim().toLowerCase(); if (x.length >= MIN_PII && !(/^[\d\s.,-]+$/.test(x) && x.length < 6)) v.add(x); });
    return { col: `${d.id}.${c}`, valeurs: [...v] }; }).filter(p => p.valeurs.length);
}
/* Toutes les valeurs pii (minuscules, ≥ 4 caractères) des datasets de la spec d'un adhérent. */
export function valeursPiiAdherent(racine) {
  const dir = path.join(racine, "spec/datasets"); if (!fs.existsSync(dir)) return [];
  return [...new Set(fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).flatMap(f => { const d = sauf(() => YAML.parse(fs.readFileSync(path.join(dir, f), "utf8"))); return d && obj(d) ? valeursPii(racine, d).flatMap(p => p.valeurs) : []; }))];
}
function textes(x, out = []) { if (typeof x === "string") out.push(x); else if (Array.isArray(x)) x.forEach(y => textes(y, out)); else if (obj(x)) Object.values(x).forEach(y => textes(y, out)); return out; }
const mot = (s, x) => { let i = s.indexOf(x); while (i >= 0) { if (!/[\p{L}\p{N}]/u.test(s[i - 1] || "") && !/[\p{L}\p{N}]/u.test(s[i + x.length] || "")) return true; i = s.indexOf(x, i + 1); } return false; };
/* Les messages ne nomment que la colonne, jamais la valeur. */
function erreursPii(racine, entree, datasets) {
  const ts = textes(entree).map(t => t.toLowerCase()), out = [];
  datasets.forEach(d => valeursPii(racine, d).forEach(p => { if (ts.some(t => p.valeurs.some(v => mot(t, v)))) out.push(`le texte contient une valeur de la colonne personnelle ${p.col} : reformule sans la citer`); }));
  return out;
}

/* ───── hypothèse ───── */
function hypotheseNette(h, errs, ou, existante) {
  if (!obj(h)) { errs.push(`${ou} : hypothese doit être un objet`); return null; }
  if (typeof h.source !== "string" || !SOURCE.test(h.source)) errs.push(`${ou} : source « ${h.source} » invalide (agent ou memoire:<logiciels|comptes|colonnes>/<id>)`);
  if (!Array.isArray(h.preuves) || !h.preuves.length || !h.preuves.every(str)) errs.push(`${ou} : preuves doit être une liste de textes`);
  if (!str(h.question)) errs.push(`${ou} : question obligatoire`);
  if (h.reponse_type !== undefined && !REPONSES.includes(h.reponse_type)) errs.push(`${ou} : reponse_type « ${h.reponse_type} » invalide`);
  if (existante && (existante.valide || existante.refuse)) errs.push(`${ou} : hypothèse déjà tranchée par l'adhérent, on ne la réécrit pas`);
  const n = { source: h.source, preuves: h.preuves, question: h.question };
  if (h.reponse_type !== undefined) n.reponse_type = h.reponse_type;
  return { ...n, valide: false, refuse: false };
}
const hypExistante = n => sauf(() => n?.get("hypothese")?.toJSON?.());

/* ───── fusion dans un document ───── */
const valeurYaml = (doc, v) => v !== null && typeof v === "object" ? doc.createNode(v) : v;
const poser = (doc, map, k, v) => map.set(k, valeurYaml(doc, v));
function sequence(doc, map, cle) {
  let s = map.get(cle, true);
  if (!YAML.isSeq(s)) { s = new YAML.YAMLSeq(); map.set(cle, s); }
  s.flow = false; return s;
}
const trouver = (seq, cle, val) => seq.items.find(i => YAML.isMap(i) && i.get(cle) === val);
const racineMap = doc => { if (!YAML.isMap(doc.contents)) doc.contents = new YAML.YAMLMap(); return doc.contents; };
function listeRacine(doc) {
  if (!YAML.isSeq(doc.contents)) doc.contents = new YAML.YAMLSeq();
  doc.contents.flow = false; return doc.contents;
}
function fusionnerListe(doc, seq, cle, val, valeurs, creer) {
  let item = trouver(seq, cle, val);
  if (!item) { item = doc.createNode({ [cle]: val }); seq.add(item); }
  Object.entries(valeurs).forEach(([k, v]) => poser(doc, item, k, v));
  return item;
}
function refDs(racine, ref, errs, ou, cache) {
  const [ds, col, ...reste] = String(ref || "").split(".");
  const d = cache(ds); if (!d || !col || reste.length) { errs.push(`${ou} : référence « ${ref} » invalide (dataset.colonne)`); return null; }
  if (!colonnesDe(d).has(col)) { errs.push(`${ou} : colonne inconnue ${ref}`); return null; }
  return d;
}
function creerCache(racine) {
  const m = new Map();
  return id => { if (!m.has(id)) { const d = datasetSpec(racine, id); m.set(id, d && { ...d, id }); } return m.get(id); };
}

/* ───── dataset ───── */
export function ecrireDataset(racine, entree) {
  const p = preparer(entree); if (p.erreurs) return p;
  const e = p.e, f = fichierId(racine, "datasets", e.id);
  /* Tolérances sans ambiguïté : « WHERE » en tête d'une condition, « label » pour « libelle ». */
  const sansWhere = x => { if (obj(x) && typeof x.sql === "string") x.sql = x.sql.replace(/^\s*where\s+/i, ""); };
  (Array.isArray(e.regles) ? e.regles : []).forEach(sansWhere);
  (Array.isArray(e.questions) ? e.questions : []).forEach(q => { sansWhere(q); if (obj(q) && Array.isArray(q.options)) q.options = q.options.map(o => obj(o) && o.label !== undefined && o.libelle === undefined ? { libelle: o.label, ...Object.fromEntries(Object.entries(o).filter(([k]) => k !== "label")) } : o); });
  if (!f || !fs.existsSync(f)) return { erreurs: [`dataset « ${e.id} » inconnu : il est créé par npm run profil`] };
  const doc = lireYaml(f), map = racineMap(doc), errs = [];
  const colonnes = YAML.isSeq(map.get("columns", true)) ? map.get("columns", true) : null;
  ["desc", "grain"].forEach(k => { if (e[k] !== undefined) { if (!texteLibre(e[k])) errs.push(`${k} : texte d'une seule ligne attendu`); else poser(doc, map, k, e[k]); } });
  (e.colonnes ?? []).forEach((c, i) => {
    const ou = `colonnes[${i}]`; if (!obj(c)) return errs.push(`${ou} : objet attendu`);
    const noeud = colonnes && trouver(colonnes, "name", c.name); if (!noeud) return errs.push(`${ou} : colonne inconnue « ${c.name} »`);
    if (c.desc !== undefined && !texteLibre(c.desc)) errs.push(`${ou} : desc doit être un texte d'une seule ligne`);
    if (c.role !== undefined && !ROLES.includes(c.role)) errs.push(`${ou} : rôle « ${c.role} » inconnu (${ROLES.join(", ")})`);
    if (c.type !== undefined && !TYPES.includes(c.type)) errs.push(`${ou} : type « ${c.type} » inconnu (${TYPES.join(", ")})`);
    if (c.pii !== undefined && typeof c.pii !== "boolean") errs.push(`${ou} : pii doit être vrai ou faux`);
    if (c.format !== undefined && typeof c.format !== "string") errs.push(`${ou} : format doit être un texte`);
    if (c.decimalComma !== undefined && typeof c.decimalComma !== "boolean") errs.push(`${ou} : decimalComma doit être vrai ou faux`);
    if (c.codes !== undefined && !(obj(c.codes) && Object.values(c.codes).every(v => typeof v === "string"))) errs.push(`${ou} : codes doit être un objet {code: libellé}, par exemple {"L": "Livrée"}`);
    const h = c.hypothese !== undefined ? hypotheseNette(c.hypothese, errs, `${ou}.hypothese`, hypExistante(noeud)) : undefined;
    if (errs.length) return;
    for (const k of ["desc", "role", "type", "pii", "codes", "format", "decimalComma"]) if (c[k] !== undefined) poser(doc, noeud, k, c[k]);
    if (h) poser(doc, noeud, "hypothese", h);
  });
  (e.regles ?? []).forEach((r, i) => {
    const ou = `regles[${i}]`; if (!obj(r)) return errs.push(`${ou} : objet attendu`);
    const ec = erreurCond(racine, r.sql, colonnesDe(doc.toJS()), `${ou}.sql`); if (ec) return errs.push(ec);
    if (r.text !== undefined && !texteLibre(r.text)) return errs.push(`${ou} : text doit être un texte d'une seule ligne`);
    const h = r.hypothese !== undefined ? hypotheseNette(r.hypothese, errs, `${ou}.hypothese`, null) : undefined;
    if (errs.length) return;
    const seq = sequence(doc, map, "rules"), item = trouver(seq, "sql", r.sql);
    const v = {}; if (r.text !== undefined) v.text = r.text; if (h) v.hypothese = h;
    if (item) Object.entries(v).forEach(([k, x]) => poser(doc, item, k, x));
    else seq.add(doc.createNode({ text: r.text ?? "", sql: r.sql, ...(h ? { hypothese: h } : {}) }));
  });
  (e.questions ?? []).forEach((q, i) => {
    const ou = `questions[${i}]`; if (!obj(q) || typeof q.id !== "string" || !ID.test(q.id)) return errs.push(`${ou} : id invalide`);
    if (q.reponse_type !== undefined && !REPONSES.includes(q.reponse_type)) errs.push(`${ou} : reponse_type « ${q.reponse_type} » invalide (${REPONSES.join(", ")})`);
    for (const k of ["text", "titre", "contexte", "reponse_cible", "sql"]) if (q[k] !== undefined && typeof q[k] !== "string") errs.push(`${ou} : ${k} doit être un texte`);
    if (typeof q.sql === "string" && q.sql) { const ec = erreurCond(racine, q.sql, colonnesDe(doc.toJS()), `${ou}.sql`); if (ec) errs.push(ec); }
    if (q.options !== undefined && !(Array.isArray(q.options) && q.options.length <= 10 && q.options.every(o => obj(o) && str(o.libelle)))) errs.push(`${ou} : options mal formées : liste de {libelle, valeur} (10 au plus)`);
    if (errs.length) return;
    const seq = sequence(doc, map, "questions"), item = trouver(seq, "id", q.id);
    if (q.couverte === true) { if (item) seq.items.splice(seq.items.indexOf(item), 1); return; }
    if (!item && !str(q.text)) return errs.push(`${ou} : question « ${q.id} » inconnue (text obligatoire pour en créer une)`);
    const v = {}; for (const k of ["text", "reponse_type", "reponse_cible", "options", "sql", "titre", "contexte"]) if (q[k] !== undefined) v[k] = q[k];
    if (item) Object.entries(v).forEach(([k, x]) => poser(doc, item, k, x));
    else seq.add(doc.createNode({ id: q.id, text: v.text, ...v, done: false }));
  });
  if (errs.length) return { erreurs: errs };
  const fusion = { ...doc.toJS(), id: e.id };
  const pii = erreursPii(racine, { desc: e.desc, grain: e.grain, colonnes: e.colonnes, regles: e.regles, questions: e.questions }, [fusion]);
  if (pii.length) return { erreurs: pii };
  const avant = fs.readFileSync(f, "utf8"), apres = doc.toString();
  if (avant === apres) return { ok: true, rien_de_nouveau: true, ...etatDataset(fusion), suite: "Identique à l'existant : ne le renvoie pas ; complète ce qui manque ou appelle terminer." };
  ecrire(f, doc); return { ok: true, ...etatDataset(fusion) };
}
/* Ce qui reste à documenter : retour de l'outil, pour que le modèle ne répète pas le même appel. */
function etatDataset(d) {
  const cols = d.columns || [], sans = cols.filter(c => !String(c.desc || "").trim()).map(c => c.name);
  return { colonnes_documentees: `${cols.length - sans.length}/${cols.length}`, ...(sans.length ? { colonnes_sans_desc: sans.slice(0, 40) } : {}), desc: !!String(d.desc || "").trim(), grain: !!String(d.grain || "").trim(), regles: (d.rules || []).length, questions_ouvertes: (d.questions || []).filter(q => !q.done).length };
}

/* ───── flux ───── */
const COLS_FLUX = ["date", "vehicule", "chauffeur", "client", "collaborateur", "codCol", "libCol"];
export function ecrireFlux(racine, entree) {
  const p = preparer(entree); if (p.erreurs) return p;
  const e = p.e, f = fichierId(racine, "flux", e.id), errs = [], cache = creerCache(racine);
  const existe = fs.existsSync(f), doc = existe ? lireYaml(f) : new YAML.Document({ id: e.id });
  const map = racineMap(doc); if (!existe) doc.commentBefore = ` Flux ${e.id} : ${e.ds || "?"} → FAITS`;
  const m = { ...(existe ? doc.toJS() : {}), ...Object.fromEntries(Object.entries(e).filter(([k]) => !["rules", "hypothese"].includes(k))) };
  const d = cache(m.ds); if (!d) return { erreurs: [`dataset « ${m.ds} » inconnu`] };
  const cols = colonnesDe(d), codes = new Set(lireReferentiel(racine));
  if (!CODMODES.includes(m.codMode)) errs.push(`codMode « ${m.codMode} » inconnu (${CODMODES.join(", ")})`);
  if (m.champ !== undefined && !CHAMPS.includes(m.champ)) errs.push(`champ « ${m.champ} » inconnu (${CHAMPS.join(", ")})`);
  if (m.agg !== undefined && !AGGS.includes(m.agg)) errs.push(`agg « ${m.agg} » inconnue (${AGGS.join(", ")})`);
  const ev = erreurValeur(racine, m.valeur, d, "valeur"); if (ev) errs.push(ev);
  if (!str(m.date)) errs.push("date : obligatoire (FAITS est mensuel)");
  COLS_FLUX.forEach(k => { if (m[k] !== undefined && !(typeof m[k] === "string" && IDENT.test(m[k]) && cols.has(m[k]))) errs.push(`${k} : « ${m[k]} » n'est pas une colonne de ${d.id}`); });
  if (m.site !== undefined && !siteFixe(m.site) && !(typeof m.site === "string" && IDENT.test(m.site) && cols.has(m.site))) errs.push(`site : « ${m.site} » n'est ni une colonne de ${d.id} ni un texte fixe entre apostrophes (lettres, chiffres, espaces ; pas d'apostrophe à l'intérieur)`);
  if (m.filtre !== undefined && m.filtre !== "") { const ec = erreurCond(racine, m.filtre, cols, "filtre"); if (ec) errs.push(ec); }
  if (m.lib !== undefined && !(typeof m.lib === "string" && LIBELLE.test(m.lib))) errs.push("lib : libellé simple (lettres, chiffres, espaces, ( ) - / + & , :), sans apostrophe droite ni guillemet");
  if (m.cod !== undefined && !(typeof m.cod === "string" && CODE.test(m.cod))) errs.push("cod : code simple (lettres, chiffres, espaces, _ . % -)");
  for (const k of ["unite", "note"]) if (m[k] !== undefined && !texteLibre(m[k])) errs.push(`${k} : texte d'une seule ligne attendu`);
  if (m.codMode === "fixe" && !codes.has(m.cod)) errs.push(`cod « ${m.cod} » absent de spec/referentiel.yml`);
  const regles = e.rules ?? [];
  if (!Array.isArray(regles)) errs.push("rules : liste attendue");
  else regles.forEach((r, i) => { const ou = `rules[${i}]`;
    if (!obj(r) || !PREFIXE.test(String(r.prefix ?? ""))) return errs.push(`${ou} : prefix obligatoire (lettres et chiffres seulement)`);
    if (!codes.has(r.cod)) errs.push(`${ou} : cod « ${r.cod} » absent de spec/referentiel.yml`);
    if (r.lib !== undefined && !(typeof r.lib === "string" && LIBELLE.test(r.lib))) errs.push(`${ou} : lib : libellé simple, sans apostrophe droite ni guillemet`); });
  if (["regles", "colonne"].includes(m.codMode) && !str(m.codCol)) errs.push("codCol obligatoire pour ce codMode");
  if (m.codMode === "regles" && !regles.length && !(doc.toJS().rules || []).length) errs.push("rules : au moins une règle");
  const h = e.hypothese !== undefined ? hypotheseNette(e.hypothese, errs, "hypothese", hypExistante(map)) : undefined;
  if (errs.length) return { erreurs: errs };
  const hr = regles.map((r, i) => r.hypothese !== undefined ? hypotheseNette(r.hypothese, errs, `rules[${i}].hypothese`, null) : undefined);
  if (errs.length) return { erreurs: errs };
  Object.entries(e).filter(([k]) => k !== "id" && !["rules", "hypothese"].includes(k)).forEach(([k, v]) => { if (flux_cles.has(k)) poser(doc, map, k, v); });
  if (regles.length) { const seq = sequence(doc, map, "rules");
    regles.forEach((r, i) => fusionnerListe(doc, seq, "prefix", String(r.prefix), { cod: r.cod, ...(r.lib !== undefined ? { lib: r.lib } : {}), ...(hr[i] ? { hypothese: hr[i] } : {}) })); }
  if (h) poser(doc, map, "hypothese", h);
  const pii = erreursPii(racine, { ...e, id: undefined }, [d]);
  if (pii.length) return { erreurs: pii };
  ecrire(f, doc); return { ok: true };
}
const flux_cles = new Set(["ds", "codMode", "cod", "lib", "codCol", "libCol", "valeur", "agg", "champ", "unite", "date", "vehicule", "chauffeur", "site", "client", "collaborateur", "filtre", "note"]);

/* ───── contrôle ───── */
export function ecrireControle(racine, entree) {
  const p = preparer(entree); if (p.erreurs) return p;
  const e = p.e, f = chemin(racine, "controles.yml"), errs = [], cache = creerCache(racine), concernes = [];
  const existe = fs.existsSync(f), doc = existe ? lireYaml(f) : new YAML.Document([]);
  if (!existe) doc.commentBefore = " Contrôles croisés entre sources";
  const seq = listeRacine(doc), item = trouver(seq, "id", e.id);
  const m = { ...(item ? item.toJSON() : {}), ...e };
  if (!CTRL_TYPES.includes(m.type)) errs.push(`type « ${m.type} » inconnu (${CTRL_TYPES.join(", ")})`);
  for (const k of ["libelle", "reponse"]) if (m[k] !== undefined && typeof m[k] !== "string") errs.push(`${k} : texte attendu`);
  const dsExiste = (id, ou) => { const d = cache(id); if (!d) errs.push(`${ou} : dataset « ${id} » inconnu`); else concernes.push(d); return d; };
  if (m.annee !== undefined && !Number.isInteger(m.annee)) errs.push("annee : entier attendu");
  if (m.tolerance !== undefined && !num01(m.tolerance)) errs.push("tolerance : nombre entre 0 et 1");
  if (m.seuil !== undefined && !num01(m.seuil)) errs.push("seuil : nombre entre 0 et 1");
  if (m.porte_sur !== undefined && !(Array.isArray(m.porte_sur) && m.porte_sur.length <= 20 && m.porte_sur.every(str))) errs.push("porte_sur : liste de textes");
  if (m.type === "ecart_somme") ["a", "b"].forEach(k => { const c = m[k];
    if (!obj(c) || !str(c.valeur)) return errs.push(`${k} : {ds, valeur, date?, filtre?} attendu`);
    const d = dsExiste(c.ds, k); if (!d) return;
    if (c.date !== undefined && !(typeof c.date === "string" && IDENT.test(c.date) && colonnesDe(d).has(c.date))) errs.push(`${k}.date : colonne « ${c.date} » absente de ${d.id}`);
    const ev = erreurValeur(racine, c.valeur, d, `${k}.valeur`); if (ev) errs.push(ev);
    if (c.filtre !== undefined && c.filtre !== "") { const ec = erreurCond(racine, c.filtre, colonnesDe(d), `${k}.filtre`); if (ec) errs.push(ec); } });
  if (m.type === "rapprochement") { [m.from, m.to].forEach((r, i) => { const d = refDs(racine, r, errs, i ? "to" : "from", cache); if (d) concernes.push(d); });
    if (m.norm !== undefined && !NORMS.includes(m.norm)) errs.push(`norm « ${m.norm} » inconnue`); }
  if (m.type === "mensuel") { const d = dsExiste(m.ds, "ds"); if (d && m.date && !(typeof m.date === "string" && IDENT.test(m.date) && colonnesDe(d).has(m.date))) errs.push(`date : colonne « ${m.date} » absente de ${d.id}`); }
  if (errs.length) return { erreurs: errs };
  const cles = { ecart_somme: ["annee", "tolerance", "a", "b"], rapprochement: ["from", "to", "norm", "seuil"], mensuel: ["ds", "date"] }[m.type].concat(["type", "libelle", "porte_sur", "reponse"]);
  const v = Object.fromEntries(cles.filter(k => e[k] !== undefined).map(k => [k, e[k]]));
  for (const k of ["a", "b"]) if (obj(v[k])) v[k] = Object.fromEntries(["ds", "valeur", "date", "filtre"].filter(c => v[k][c] !== undefined).map(c => [c, v[k][c]]));
  const noeud = fusionnerListe(doc, seq, "id", e.id, {});
  Object.entries(v).forEach(([k, x]) => poser(doc, noeud, k, x));
  const pii = erreursPii(racine, { ...v }, concernes);
  if (pii.length) return { erreurs: pii };
  ecrire(f, doc); return { ok: true };
}

/* ───── relation ───── */
export function ecrireRelation(racine, entree) {
  const p = preparer(entree); if (p.erreurs) return p;
  const e = p.e, f = chemin(racine, "relations.yml"), errs = [], cache = creerCache(racine), concernes = [];
  const existe = fs.existsSync(f), doc = existe ? lireYaml(f) : new YAML.Document([]);
  if (!existe) doc.commentBefore = " Relations entre colonnes de datasets (from = colonne qui référence, to = clé référencée)";
  const seq = listeRacine(doc), item = trouver(seq, "id", e.id);
  const m = { ...(item ? item.toJSON() : {}), ...e };
  [["from", m.from], ["to", m.to]].forEach(([k, r]) => { const d = refDs(racine, r, errs, k, cache); if (d) concernes.push(d); });
  if (m.kind !== undefined && !KINDS.includes(m.kind)) errs.push(`kind « ${m.kind} » inconnu (${KINDS.join(", ")})`);
  if (m.norm !== undefined && !NORMS.includes(m.norm)) errs.push(`norm « ${m.norm} » inconnue (${NORMS.join(", ")})`);
  if (m.note !== undefined && typeof m.note !== "string") errs.push("note : texte attendu");
  const h = e.hypothese !== undefined ? hypotheseNette(e.hypothese, errs, "hypothese", hypExistante(item)) : undefined;
  if (errs.length) return { erreurs: errs };
  const v = Object.fromEntries(["from", "to", "kind", "norm", "note"].filter(k => e[k] !== undefined).map(k => [k, e[k]]));
  if (h) v.hypothese = h;
  const pii = erreursPii(racine, { ...v }, concernes);
  if (pii.length) return { erreurs: pii };
  const noeud = fusionnerListe(doc, seq, "id", e.id, {});
  Object.entries(v).forEach(([k, x]) => poser(doc, noeud, k, x));
  ecrire(f, doc); return { ok: true };
}

/* ───── périmètre ───── */
export function ecrirePerimetre(racine, entree, autorises) {
  const p = preparer(entree); if (p.erreurs) return p;
  const e = p.e, f = chemin(racine, "perimetre.yml"), errs = [];
  const existe = fs.existsSync(f), doc = existe ? lireYaml(f) : new YAML.Document({});
  if (!existe) doc.commentBefore = " Mesures du dashboard de référence écartées chez cet adhérent, groupées par cause";
  const map = racineMap(doc), seq = sequence(doc, map, "groupes"), item = trouver(seq, "id", e.id);
  const ex = item ? item.toJSON() : {}, m = { ...ex, ...e };
  for (const k of ["cause", "titre", "contexte"]) if (m[k] !== undefined && !str(m[k])) errs.push(`${k} : texte attendu`);
  if (!str(m.cause)) errs.push("cause obligatoire");
  if (!Array.isArray(m.mesures) || !m.mesures.length || m.mesures.length > 60 || !m.mesures.every(str)) errs.push("mesures : liste de 1 à 60 noms");
  else { const ok = new Set([...autorises, ...(ex.mesures || [])]);
    m.mesures.filter(n => !ok.has(n)).forEach(n => errs.push(`mesure « ${n} » : pas un candidat (seules les mesures sans aucune donnée, hors groupe existant, peuvent être écartées)`)); }
  const h = hypotheseNette(e.hypothese, errs, "hypothese", hypExistante(item));
  if (errs.length) return { erreurs: errs };
  const v = Object.fromEntries(["cause", "mesures", "titre", "contexte"].filter(k => m[k] !== undefined).map(k => [k, m[k]]));
  v.hypothese = h;
  const dsDir = path.join(racine, "spec/datasets");
  const tous = fs.existsSync(dsDir) ? fs.readdirSync(dsDir).filter(x => /\.ya?ml$/.test(x)).map(x => sauf(() => YAML.parse(fs.readFileSync(path.join(dsDir, x), "utf8")))).filter(obj) : [];
  const pii = erreursPii(racine, { ...v }, tous);
  if (pii.length) return { erreurs: pii };
  const noeud = fusionnerListe(doc, seq, "id", e.id, {});
  Object.entries(v).forEach(([k, x]) => poser(doc, noeud, k, x));
  ecrire(f, doc); return { ok: true };
}

/* ───── libellés lisibles des catégories ───── */
export function ecrireLibelles(racine, entree, autorises) {
  const p = preparer(entree); if (p.erreurs) return p;
  const e = p.e, f = chemin(racine, "referentiel.yml"), errs = [];
  if (!f || !fs.existsSync(f)) return { erreurs: ["referentiel.yml absent"] };
  if (!Array.isArray(e.libelles) || !e.libelles.length || e.libelles.length > 40) return { erreurs: ["libelles : liste de 1 à 40 éléments {cod, lib, hypothese}"] };
  const doc = lireYaml(f), map = racineMap(doc), seq = sequence(doc, map, "codes"), ok = new Set(autorises), v = [];
  e.libelles.forEach((l, i) => { const ou = `libelles[${i}]`;
    if (!obj(l) || !str(l.cod)) return errs.push(`${ou} : cod obligatoire`);
    const item = seq.items.find(x => (YAML.isMap(x) ? x.get("cod") : YAML.isScalar(x) ? x.value : x) === l.cod);
    if (!item) return errs.push(`${ou} : code « ${l.cod} » absent du référentiel (aucun code ne peut être créé)`);
    if (!ok.has(l.cod)) errs.push(`${ou} : code « ${l.cod} » non autorisé (codes utilisés par un flux, sans libellé tranché)`);
    const lib = typeof l.lib === "string" ? l.lib.trim() : "";
    if (!lib || lib.length > 60 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(l.lib)) errs.push(`${ou} : libellé de 1 à 60 caractères, sur une ligne`);
    const h = hypotheseNette(l.hypothese, errs, `${ou}.hypothese`, YAML.isMap(item) ? hypExistante(item) : undefined);
    v.push({ item, cod: l.cod, lib, h }); });
  if (errs.length) return { erreurs: errs };
  const dsDir = path.join(racine, "spec/datasets");
  const tous = fs.existsSync(dsDir) ? fs.readdirSync(dsDir).filter(x => /\.ya?ml$/.test(x)).map(x => sauf(() => YAML.parse(fs.readFileSync(path.join(dsDir, x), "utf8")))).filter(obj) : [];
  const pii = erreursPii(racine, { libelles: v.map(x => ({ lib: x.lib, h: x.h })) }, tous);
  if (pii.length) return { erreurs: pii };
  v.forEach(x => { let noeud = x.item;
    if (!YAML.isMap(noeud)) { noeud = doc.createNode({ cod: x.cod }); seq.items[seq.items.indexOf(x.item)] = noeud; }
    poser(doc, noeud, "lib", x.lib); poser(doc, noeud, "hypothese", x.h); });
  ecrire(f, doc); return { ok: true };
}

/* ───── mesures de l'adhérent ───── */
const MAX_OUVERTES = 5;
export function ecrireProposition(racine, entree, erreursMetier) {
  const p = preparer(entree); if (p.erreurs) return p;
  const e = p.e, f = chemin(racine, "mesures.yml"), errs = [...(erreursMetier || [])];
  const existe = fs.existsSync(f), doc = existe ? lireYaml(f) : new YAML.Document({});
  if (!existe) doc.commentBefore = " Mesures et codes catégorie propres à cet adhérent, par proposition";
  const map = racineMap(doc), seq = sequence(doc, map, "propositions"), item = trouver(seq, "id", e.id);
  const h = hypotheseNette(e.hypothese, errs, "hypothese", hypExistante(item));
  if (!item) {
    const ouvertes = seq.items.filter(x => YAML.isMap(x) && !(x.get("hypothese")?.get?.("valide") || x.get("hypothese")?.get?.("refuse"))).length;
    if (ouvertes >= MAX_OUVERTES) errs.push(`${MAX_OUVERTES} propositions ouvertes au plus : attendre la réponse de l'adhérent`);
  }
  if (errs.length) return { erreurs: errs };
  const v = Object.fromEntries(["titre", "contexte", "codes", "mesures", "feuille"].filter(k => e[k] !== undefined).map(k => [k, e[k]]));
  v.hypothese = h;
  const dsDir = path.join(racine, "spec/datasets");
  const tous = fs.existsSync(dsDir) ? fs.readdirSync(dsDir).filter(x => /\.ya?ml$/.test(x)).map(x => sauf(() => YAML.parse(fs.readFileSync(path.join(dsDir, x), "utf8")))).filter(obj) : [];
  const pii = erreursPii(racine, { ...v }, tous);
  if (pii.length) return { erreurs: pii };
  const noeud = fusionnerListe(doc, seq, "id", e.id, {});
  Object.entries(v).forEach(([k, x]) => poser(doc, noeud, k, x));
  ecrire(f, doc); return { ok: true };
}

export function ecrireBesoins(racine, besoins) {
  const p = path.join(racine, "spec/besoins.yml");
  fs.writeFileSync(p, "# Besoins de l'adhérent\n" + YAML.stringify(besoins));
}
