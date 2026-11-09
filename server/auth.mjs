/* Comptes, mots de passe (scrypt), sessions en mémoire, limitation des tentatives. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const N = 16384, LONG = 32;
export function hacher(mdp) {
  const sel = crypto.randomBytes(16);
  return `scrypt$${sel.toString("hex")}$${crypto.scryptSync(String(mdp), sel, LONG, { N }).toString("hex")}`;
}
export function verifier(mdp, stocke) {
  const m = /^scrypt\$([0-9a-f]+)\$([0-9a-f]+)$/.exec(String(stocke || "")); if (!m) return false;
  const attendu = Buffer.from(m[2], "hex"), calcule = crypto.scryptSync(String(mdp), Buffer.from(m[1], "hex"), attendu.length, { N });
  return attendu.length === calcule.length && crypto.timingSafeEqual(attendu, calcule);
}
export const motDePasseAleatoire = () => crypto.randomBytes(12).toString("base64url");

export function lireComptes(fichier) {
  if (!fs.existsSync(fichier)) return [];
  const l = JSON.parse(fs.readFileSync(fichier, "utf8")); return Array.isArray(l) ? l : [];
}
export function ecrireComptes(fichier, comptes) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const tmp = `${fichier}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(comptes, null, 2), { mode: 0o600 }); fs.renameSync(tmp, fichier);
}

export function creerSessions({ duree = 12 * 3600 * 1000, now = Date.now } = {}) {
  const m = new Map();
  return {
    ouvrir(c) { const j = crypto.randomBytes(32).toString("base64url"); m.set(j, { id: c.id, role: c.role, nom: c.nom || c.id, fin: now() + duree }); return j; },
    lire(j) { const s = m.get(j); if (!s) return null; if (now() > s.fin) { m.delete(j); return null; } return { id: s.id, role: s.role, nom: s.nom }; },
    fermer(j) { m.delete(j); },
    purger() { m.forEach((s, j) => { if (now() > s.fin) m.delete(j); }); },
    taille: () => m.size,
  };
}

export function creerLimiteur({ max = 5, fenetre = 10 * 60 * 1000, now = Date.now } = {}) {
  const m = new Map();
  const vivants = cle => { const l = (m.get(cle) || []).filter(t => now() - t < fenetre); if (l.length) m.set(cle, l); else m.delete(cle); return l; };
  return { bloque: cle => vivants(cle).length >= max, echec(cle) { const l = vivants(cle); l.push(now()); m.set(cle, l); }, succes(cle) { m.delete(cle); } };
}
