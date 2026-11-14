import path from "node:path";
import { snake, entetesUniques, decouperLigne as decouper } from "./commun.mjs";

// Article A47 A-1 du LPF : colonnes obligatoires ; les montants sont en Debit/Credit ou en Montant/Sens.
const OBLIGATOIRES = ["journalcode", "ecrituredate", "comptenum"];
const MONTANTS = [["debit", "credit"], ["montant", "sens"]];
const DATE8 = { type: "date", format: "YYYYMMDD" };
export const TYPES_FEC = {
  journal_code: { type: "text" }, ecriture_num: { type: "text" }, ecriture_date: DATE8, compte_num: { type: "text" },
  comp_aux_num: { type: "text" }, piece_ref: { type: "text" }, piece_date: DATE8, ecriture_let: { type: "text" },
  date_let: DATE8, valid_date: DATE8, debit: { type: "decimal" }, credit: { type: "decimal" },
  montant: { type: "decimal" }, montantdevise: { type: "decimal" },
};

export function decoder(buffer) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, ""); }
  catch { return new TextDecoder("windows-1252").decode(buffer); }
}

// Noms de la norme : clé compacte (minuscules, sans « _ » ni espace) → nom canonique, quelle que soit la casse de l'en-tête.
const CANON = Object.fromEntries(["journal_code", "journal_lib", "ecriture_num", "ecriture_date", "compte_num", "compte_lib", "comp_aux_num", "comp_aux_lib", "piece_ref", "piece_date", "ecriture_lib", "debit", "credit", "ecriture_let", "date_let", "valid_date", "montantdevise", "idevise", "montant", "sens"].map(n => [n.replace(/_/g, ""), n]));
const nomFec = n => CANON[n.toLowerCase().replace(/[_\s]/g, "")] ?? n.replace(/([a-z])([A-Z])/g, "$1_$2");

const separateur = ligne => ["\t", "|", ";"].map(s => [s, ligne.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];

export function estFec(premiereLigne) {
  const noms = new Set(String(premiereLigne).split(separateur(premiereLigne)).map(n => n.trim().toLowerCase()));
  return OBLIGATOIRES.every(n => noms.has(n)) && MONTANTS.some(p => p.every(n => noms.has(n)));
}

const iso = d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

export function lireFec(texte) {
  const brutes = texte.split(/\r?\n/).filter(l => l.trim());
  const sep = separateur(brutes[0] || "");
  const entetes = entetesUniques(decouper(brutes[0], sep).map(n => nomFec(n.trim())));
  let irregulieres = 0;
  const lignes = brutes.slice(1).map(l => { const v = decouper(l, sep); if (v.length !== entetes.length) irregulieres++; return entetes.map((_, i) => (v[i] ?? "").trim()); });
  const iDate = entetes.indexOf("ecriture_date");
  const dates = iDate < 0 ? [] : lignes.map(l => l[iDate]).filter(d => /^\d{8}$/.test(d)).sort();
  const meta = dates.length ? { periode_du: iso(dates[0]), periode_au: iso(dates[dates.length - 1]) } : {};
  if (irregulieres) meta.lignes_irregulieres = irregulieres;
  const colonnes = Object.fromEntries(entetes.filter(e => TYPES_FEC[e]).map(e => [e, TYPES_FEC[e]]));
  return { entetes, lignes, meta, colonnes };
}

export function idFec(domaine, fichier) {
  const base = path.basename(fichier).replace(/\.[^.]+$/, "");
  const m = /^(?:\d{9})?FEC(\d{8})$/i.exec(base);
  return snake([domaine, m ? `fec_${m[1]}` : base].filter(Boolean).join("_"));
}
