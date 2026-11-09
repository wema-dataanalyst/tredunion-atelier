/* Liste des adhérents (un dossier chacun) et création des comptes. Un chemin ne se construit que depuis cette liste. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hacher, lireComptes, ecrireComptes, motDePasseAleatoire } from "./auth.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ID = /^[a-z0-9_-]{1,40}$/;
export const adherentsRoot = (env = process.env) => path.resolve(env.ADHERENTS_ROOT || path.join(APP, "adherents"));
export const comptesFile = (env = process.env) => path.resolve(env.COMPTES_FILE || path.join(APP, "comptes.json"));

export function adherentsConnus(racine) {
  if (!fs.existsSync(racine)) return [];
  return fs.readdirSync(racine, { withFileTypes: true }).filter(e => e.isDirectory() && ID.test(e.name) && fs.existsSync(path.join(racine, e.name, "spec"))).map(e => e.name).sort();
}
export function racineDe(racine, id) {
  if (typeof id !== "string" || !ID.test(id) || !adherentsConnus(racine).includes(id)) throw new Error("adhérent inconnu");
  return path.join(racine, id);
}
export function creerCompte({ fichier, id, role, nom }) {
  const mdp = motDePasseAleatoire();
  const autres = lireComptes(fichier).filter(c => c.id !== id);
  ecrireComptes(fichier, autres.concat([{ id, role, nom: nom || id, mdp: hacher(mdp) }]));
  return { mdp };
}
