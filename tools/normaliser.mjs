import fs from "node:fs";
import path from "node:path";
import readXlsxFile from "read-excel-file/node";
import { snake, ecrireCsv } from "./lecteurs/commun.mjs";
import { lireTableau } from "./lecteurs/tableau.mjs";
import { correspond, lirePositions, lireMeta } from "./lecteurs/positions.mjs";

const IGNORER = ["^Nombre de lignes\\s*:"];

function fichiers(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? fichiers(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    .sort();
}

export function idDataset(domaine, fichier, feuille) {
  const base = path.basename(fichier).replace(/\.[^.]+$/, "");
  return snake([domaine, base, feuille].filter(Boolean).join("_"));
}

// Profil d'un CSV bronze : null s'il est déjà décrit, sinon l'option --id si l'id est pris par un autre fichier.
export function planProfil(datasets, fichier, societe) {
  if (datasets.some(d => d.file === fichier)) return null;
  const id = idDataset("", fichier, "");
  return datasets.some(d => d.id === id) ? { id: `${societe}_${id}` } : {};
}

export function lireFeuille(lignes, logiciels) {
  const recette = logiciels.find(r => r.lecteur === "positions" && correspond(lignes, r));
  if (recette) return { ...lirePositions(lignes, recette), lecteur: recette.id, logiciel: recette.logiciel, meta: lireMeta(lignes) };
  const t = lireTableau(lignes, { ignorer: IGNORER });
  return t.erreur ? t : { ...t, lecteur: "tableau", meta: lireMeta(lignes) };
}

export async function normaliserSociete({ brut, bronze, logiciels, progres = () => {} }) {
  fs.mkdirSync(bronze, { recursive: true });
  const ecrits = [], nonLus = [], ids = new Map();
  const ecrire = (id, relatif, meta, corps) => {
    if (ids.has(id)) { nonLus.push({ fichier: relatif, ...(meta.feuille ? { feuille: meta.feuille } : {}), raison: `même nom de dataset que ${ids.get(id)}` }); return; }
    ids.set(id, relatif); corps(path.join(bronze, `${id}.csv`));
    fs.writeFileSync(path.join(bronze, `${id}.meta.json`), JSON.stringify(meta, null, 2) + "\n");
    ecrits.push({ id, ...meta });
  };
  for (const f of fichiers(brut)) {
    const relatif = path.relative(brut, f).split(path.sep).join("/");
    const parts = relatif.split("/"); const domaine = parts.length > 1 ? parts[0] : "";
    const ext = path.extname(f).toLowerCase();
    progres(`Lecture de ${relatif}`);
    if (ext === ".csv") {
      const lignes = Math.max(0, fs.readFileSync(f, "utf8").split(/\r?\n/).filter(l => l.trim()).length - 1);
      ecrire(idDataset(domaine, f, ""), relatif, { source: relatif, domaine, lecteur: "copie", lignes }, cible => fs.copyFileSync(f, cible));
      continue;
    }
    if (ext !== ".xlsx") { nonLus.push({ fichier: relatif, raison: `format ${ext || "sans extension"} non pris en charge` }); continue; }
    let feuilles;
    try { feuilles = await readXlsxFile(f); }
    catch (e) { nonLus.push({ fichier: relatif, raison: `Excel illisible : ${e.message}` }); continue; }
    for (const s of feuilles) {
      const r = lireFeuille(s.data, logiciels);
      if (r.erreur) { nonLus.push({ fichier: relatif, feuille: s.sheet, raison: r.erreur }); continue; }
      const meta = { source: relatif, feuille: s.sheet, domaine, lecteur: r.lecteur, ...(r.logiciel ? { logiciel: r.logiciel } : {}), ...r.meta, lignes: r.lignes.length, ...(r.horsRecette ? { hors_recette: r.horsRecette } : {}) };
      ecrire(idDataset(domaine, f, feuilles.length > 1 ? s.sheet : ""), relatif, meta, cible => ecrireCsv(cible, r.entetes, r.lignes));
    }
  }
  fs.writeFileSync(path.join(bronze, "_non_lus.json"), JSON.stringify(nonLus, null, 2) + "\n");
  return { ecrits, nonLus };
}
