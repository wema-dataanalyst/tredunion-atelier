import { cellule } from "./commun.mjs";

const vide = v => v == null || (typeof v === "string" && v.trim() === "");

export function correspond(lignes, recette, max = 12) {
  const textes = lignes.slice(0, max).flat().filter(v => typeof v === "string").map(v => v.toLowerCase());
  const sig = recette.signature || [];
  return sig.length > 0 && sig.every(s => textes.some(t => t.includes(s.toLowerCase())));
}

export function lirePositions(lignes, recette) {
  const sig = recette.signature.map(s => s.toLowerCase());
  const motifs = (recette.ignorer || []).map(m => new RegExp(m, "i"));
  const noms = recette.colonnes.map(c => c.nom);
  const prises = new Set(recette.colonnes.map(c => c.col - 1));
  const requis = (recette.requis || []).map(n => noms.indexOf(n));
  const inconnu = (recette.requis || []).find(n => !noms.includes(n)); if (inconnu) throw new Error(`recette ${recette.id || "?"} : requis « ${inconnu} » absent des colonnes`);
  const sortie = []; let horsRecette = 0;
  for (const l of lignes) {
    if (l.some(v => typeof v === "string" && sig.some(s => v.toLowerCase().includes(s)))) continue;
    const vals = recette.colonnes.map(c => cellule(l[c.col - 1]));
    if (!vals.some(Boolean)) continue;
    if (requis.some(i => !vals[i])) continue;
    if (motifs.some(r => r.test(vals.find(Boolean)))) continue;
    horsRecette += l.filter((v, i) => !vide(v) && !prises.has(i)).length;
    sortie.push(vals);
  }
  return { entetes: noms, lignes: sortie, horsRecette };
}

const premiereDate = l => l.find(v => v instanceof Date);

export function lireMeta(lignes, max = 12) {
  const meta = {};
  const chercher = (cle, motif) => {
    const l = lignes.slice(0, max).find(l => l.some(v => typeof v === "string" && motif.test(v.trim())) && premiereDate(l));
    if (l) meta[cle] = premiereDate(l).toISOString().slice(0, 10);
  };
  chercher("periode_du", /^période du$/i);
  chercher("periode_au", /^au$/i);
  chercher("tirage", /^date de tirage$/i);
  return meta;
}
