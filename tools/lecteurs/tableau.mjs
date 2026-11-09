import { cellule, entetesUniques } from "./commun.mjs";

const vide = v => v == null || (typeof v === "string" && v.trim() === "");
const texte = v => typeof v === "string" && v.trim() !== "";

export function detecterEntete(lignes, max = 15) {
  let meilleure = -1, largeur = 1;
  lignes.slice(0, max).forEach((l, i) => {
    const pleines = l.filter(v => !vide(v));
    if (pleines.length < 2 || !pleines.every(texte)) return;
    if (pleines.length > largeur) { meilleure = i; largeur = pleines.length; }
  });
  return meilleure;
}

export function lireTableau(lignes, { ignorer = [] } = {}) {
  const h = detecterEntete(lignes);
  if (h < 0) return { erreur: "aucune ligne d'en-tête trouvée" };
  const tete = lignes[h];
  const cols = tete.map((v, i) => (vide(v) ? -1 : i)).filter(i => i >= 0);
  const motifs = ignorer.map(m => new RegExp(m, "i"));
  let pleines = 0, orphelines = 0;
  const sortie = [];
  for (const l of lignes.slice(h + 1)) {
    l.forEach((v, i) => { if (vide(v)) return; pleines++; if (vide(tete[i])) orphelines++; });
    const vals = cols.map(i => cellule(l[i]));
    if (!vals.some(Boolean)) continue;
    if (motifs.some(r => r.test(vals.find(Boolean)))) continue;
    sortie.push(vals);
  }
  if (pleines && orphelines / pleines > 0.05) return { erreur: `${Math.round(orphelines / pleines * 100)} % des valeurs sont sous des colonnes sans en-tête` };
  return { ligneEntete: h + 1, entetes: entetesUniques(cols.map(i => cellule(tete[i]))), lignes: sortie };
}
