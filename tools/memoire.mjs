import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const FICHIERS = ["logiciels", "comptes", "colonnes"];

export function cheminMemoire(root, env = process.env) {
  return path.resolve(root, env.TREDUNION_MEMOIRE || "../tredunion-memoire");
}

export function lireMemoire(dir) {
  const m = { dir, existe: fs.existsSync(dir) };
  FICHIERS.forEach(k => {
    const f = path.join(dir, `${k}.yml`);
    if (!fs.existsSync(f)) { m[k] = []; return; }
    let v; try { v = YAML.parse(fs.readFileSync(f, "utf8")) || []; } catch (e) { throw new Error(`${k}.yml : YAML invalide (${e.message.split("\n")[0]})`); }
    if (!Array.isArray(v)) throw new Error(`${k}.yml : la racine doit être une liste`);
    m[k] = v;
  });
  return m;
}

export function ecrireMemoire(m, cles = FICHIERS) {
  fs.mkdirSync(m.dir, { recursive: true });
  cles.forEach(k => { // fichier temporaire puis renommage : jamais de fichier à moitié écrit
    const f = path.join(m.dir, `${k}.yml`), tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `# Mémoire Tredunion : ${k}\n` + YAML.stringify(m[k], { lineWidth: 0 })); fs.renameSync(tmp, f);
  });
}

// ── Pseudonymisation : confirme_chez / contredit_chez ne contiennent plus d'id de société en clair ──
export const pseudonyme = (sel, societe) => "p:" + crypto.createHmac("sha256", sel).update(String(societe)).digest("hex").slice(0, 16);
const estPseudo = v => /^p:[0-9a-f]{16}$/.test(String(v));

export function lireSel(dir, env = process.env) {
  if (env.TREDUNION_SEL) return env.TREDUNION_SEL;
  const f = path.join(dir, ".sel");
  if (!fs.existsSync(f)) { // wx : si un autre processus a créé le sel entre-temps, on le relit
    fs.mkdirSync(dir, { recursive: true });
    try { fs.writeFileSync(f, crypto.randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" }); } catch (x) { if (x.code !== "EEXIST") throw x; }
  }
  fs.chmodSync(f, 0o600);
  return fs.readFileSync(f, "utf8").trim();
}

// Une société figure dans la liste, en clair ou en pseudonyme.
export const comptePresent = (liste, societe, sel) => (liste || []).some(v => v === societe || v === pseudonyme(sel, societe));
// Valeurs distinctes, clair et pseudonyme d'une même société confondus ; jamais affichées.
export const distincts = (liste, sel) => new Set((liste || []).map(v => estPseudo(v) ? v : pseudonyme(sel, v))).size;

// Migration unique, idempotente : réécrit les valeurs en clair en pseudonymes. Renvoie le nombre de valeurs migrées.
export function pseudonymiserMemoire(dir, env = process.env) {
  const sel = lireSel(dir, env), m = lireMemoire(dir);
  let migrees = 0;
  const conv = l => { const r = []; (l || []).forEach(v => { const p = estPseudo(v) ? v : (migrees++, pseudonyme(sel, v)); if (!r.includes(p)) r.push(p); }); return r; };
  FICHIERS.forEach(k => { m[k] = m[k].map(e => (e.confirme_chez || e.contredit_chez) ? { ...e, confirme_chez: conv(e.confirme_chez), contredit_chez: conv(e.contredit_chez) } : e); });
  if (migrees) ecrireMemoire(m);
  return { migrees };
}
