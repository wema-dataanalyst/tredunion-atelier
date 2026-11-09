/* Création d'un adhérent : validation stricte, construction dans un dossier voisin puis renommage (tout ou rien). */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { creerCompte, adherentsConnus } from "./adherents.mjs";
import { lireComptes } from "./auth.mjs";
import { gabaritSpec } from "../tools/gabarit.mjs";

const ID = /^[a-z0-9_-]{1,40}$/, RESERVE = /^(admin|exemple$)/;
const HOTE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/, UTILISATEUR = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/;
const CONTROLE = /[\u0000-\u001f\u007f]/;
const texte = (v, max) => typeof v === "string" && v.trim().length >= 1 && v.length <= max && !CONTROLE.test(v);
const vide = v => v === undefined || v === null || v === "";

function validerId(v, champ, erreurs) {
  if (typeof v !== "string" || !ID.test(v) || RESERVE.test(v)) return erreurs.push({ champ, msg: "identifiant invalide (a-z, 0-9, _ ou -, 40 caractères au plus, hors noms réservés)" });
  return v;
}

export function validerNouvelAdherent(entree) {
  const e = entree && typeof entree === "object" ? entree : {}, erreurs = [], err = (champ, msg) => erreurs.push({ champ, msg });
  if (!texte(e.nom, 120)) err("nom", "nom requis (120 caractères au plus, sans caractère de contrôle)");
  const id = validerId(e.id, "id", erreurs);
  const bruts = Array.isArray(e.societes) ? e.societes : [];
  if (!bruts.length || bruts.length > 20) err("societes", "entre 1 et 20 sociétés");
  const vus = new Set(), societes = [];
  bruts.slice(0, 20).forEach((s, i) => {
    const o = s && typeof s === "object" ? s : {}, sid = validerId(o.id, `societes[${i}].id`, erreurs);
    if (sid && vus.has(sid)) err(`societes[${i}].id`, "identifiant de société en double"); else if (sid) vus.add(sid);
    if (!texte(o.name, 120)) err(`societes[${i}].name`, "nom requis");
    if (!vide(o.source) && !texte(o.source, 120)) err(`societes[${i}].source`, "source invalide");
    societes.push({ id: sid, name: o.name, ...(vide(o.source) ? {} : { source: o.source }) });
  });
  let sftp = null;
  const s = e.sftp && typeof e.sftp === "object" ? e.sftp : {};
  if (["host", "user", "password", "dir"].some(k => !vide(s[k]))) {
    const port = vide(s.port) ? 22 : (typeof s.port === "number" || typeof s.port === "string" ? Number(s.port) : NaN);
    if (typeof s.host !== "string" || !HOTE.test(s.host)) err("sftp.host", "serveur invalide");
    if (!Number.isInteger(port) || port < 1 || port > 65535) err("sftp.port", "port invalide (1 à 65535)");
    if (typeof s.user !== "string" || !UTILISATEUR.test(s.user)) err("sftp.user", "utilisateur invalide");
    if (!texte(s.dir, 200) || /["\\]/.test(s.dir) || !s.dir.replace(/\/+$/, "")) err("sftp.dir", "dossier invalide (200 caractères au plus, sans guillemet ni contrôle, pas la racine seule)");
    else if (s.dir.includes("'") && s.dir.includes("`")) err("sftp.dir", "dossier refusé : il ne peut pas contenir à la fois une apostrophe (') et un accent grave (`)");
    if (typeof s.password !== "string" || !s.password.length || s.password.length > 200 || CONTROLE.test(s.password)) err("sftp.password", "mot de passe invalide (1 à 200 caractères, sans retour à la ligne)");
    else if (s.password.includes("'") && s.password.includes("`")) err("sftp.password", "mot de passe refusé : il ne peut pas contenir à la fois une apostrophe (') et un accent grave (`)");
    sftp = { host: s.host, port, user: s.user, password: s.password, dir: s.dir };
  }
  if (erreurs.length) return { erreurs };
  return { ok: true, valeur: { nom: e.nom.trim(), id, societes, sftp, maquette: e.maquette === true } };
}

/* Une valeur entre apostrophes (ou accents graves) est lue telle quelle par process.loadEnvFile : ni $, ni \n, ni # interprétés. */
export function ligneEnv(cle, valeur) {
  const q = !valeur.includes("'") ? "'" : !valeur.includes("`") ? "`" : null;
  if (!q) throw new Error(`valeur non représentable pour ${cle}`);
  return `${cle}=${q}${valeur}${q}\n`;
}

const refus = (code, erreurs) => Object.assign(new Error(code), { code, erreurs });

/* gabarit(dossierSpec, {adherent, societes}) écrit spec/. Lève { code: "invalide"|"existe" } ; toute autre erreur annule la création. */
export function creerAdherent({ racine, comptes, entree, gabarit = gabaritSpec }) {
  const v = validerNouvelAdherent(entree); if (!v.ok) throw refus("invalide", v.erreurs);
  const { nom, id, societes, sftp } = v.valeur, final = path.join(racine, id);
  if (fs.existsSync(final) || adherentsConnus(racine).includes(id) || lireComptes(comptes).some(c => c.id === id)) throw refus("existe", [{ champ: "id", msg: "identifiant déjà pris" }]);
  fs.mkdirSync(racine, { recursive: true });
  const tmp = path.join(racine, `.nouveau-${id}-${crypto.randomBytes(6).toString("hex")}`);
  let rendu = false, mdp;
  try {
    gabarit(path.join(tmp, "spec"), { adherent: nom, societes });
    for (const soc of societes) for (const d of ["raw", "bronze"]) fs.mkdirSync(path.join(tmp, "data", d, soc.id), { recursive: true });
    fs.mkdirSync(path.join(tmp, ".atelier"), { recursive: true });
    if (sftp) fs.writeFileSync(path.join(tmp, ".env"), ligneEnv("SFTP_HOST", sftp.host) + ligneEnv("SFTP_PORT", String(sftp.port)) + ligneEnv("SFTP_USER", sftp.user) + ligneEnv("SFTP_PASSWORD", sftp.password) + ligneEnv("SFTP_DIR", sftp.dir), { mode: 0o600 });
    fs.renameSync(tmp, final); rendu = true;
    ({ mdp } = creerCompte({ fichier: comptes, id, role: "adherent", nom }));
  } catch (x) {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (rendu) fs.rmSync(final, { recursive: true, force: true });
    throw x;
  }
  return { id, mdp };
}
