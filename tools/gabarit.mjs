/* Spec vide : la même logique pour `npm run reset` et pour la création d'un adhérent. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { REGISTRE_VIDE } from "./espace.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTETE_PROJET = "# Adhérent et sociétés (filiales) traitées dans cette séance\n";

/* Vide datasets, flux, relations, journal, projet et l'alimentation des dimensions d'un dossier spec/. */
export function viderSpec(spec, projet = { adherent: "Nouvel adhérent", societes: [] }) {
  ["datasets", "flux"].forEach(d => { fs.rmSync(path.join(spec, d), { recursive: true, force: true }); fs.mkdirSync(path.join(spec, d), { recursive: true }); fs.writeFileSync(path.join(spec, d, ".gitkeep"), ""); });
  fs.writeFileSync(path.join(spec, "relations.yml"), "# Relations entre colonnes de datasets\n[]\n"); fs.writeFileSync(path.join(spec, "journal.yml"), "# Journal des décisions de séance\n[]\n");
  fs.writeFileSync(path.join(spec, "projet.yml"), ENTETE_PROJET + YAML.stringify({ adherent: projet.adherent, societes: projet.societes, cases: [], questions: [] }, { lineWidth: 0 }));
  const dims = path.join(spec, "dims");
  if (fs.existsSync(dims)) fs.readdirSync(dims).filter(f => /\.ya?ml$/.test(f)).sort().forEach(n => { const f = path.join(dims, n), doc = YAML.parseDocument(fs.readFileSync(f, "utf8")); (doc.get("columns")?.items || []).forEach((c, i) => doc.setIn(["columns", i, "map"], doc.createNode({}))); fs.writeFileSync(f, doc.toString({ lineWidth: 0 })); });
}

/* Écrit dans `dest` (dossier spec/ à créer) le gabarit d'un nouvel adhérent : catalogue, dimensions sans alimentation et référentiel du dépôt. */
export function gabaritSpec(dest, projet, source = path.join(APP, "spec")) {
  fs.mkdirSync(dest, { recursive: true });
  for (const n of ["catalogue", "dims", "referentiel.yml"]) fs.cpSync(path.join(source, n), path.join(dest, n), { recursive: true });
  fs.writeFileSync(path.join(dest, "controles.yml"), "# Contrôles croisés\n[]\n");
  fs.writeFileSync(path.join(dest, "reponses.yml"), REGISTRE_VIDE);
  viderSpec(dest, projet);
}
