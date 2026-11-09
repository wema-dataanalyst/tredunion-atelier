import fs from "node:fs";

// Doit rester identique à snake() de core/model.js : les noms de colonnes de la spec en dépendent.
export const snake = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "c_$1") || "col";

const p2 = n => String(n).padStart(2, "0");

export function cellule(v) {
  if (v == null) return "";
  if (v instanceof Date) {
    if (!v.getUTCHours() && !v.getUTCMinutes() && !v.getUTCSeconds()) return `${p2(v.getUTCDate())}/${p2(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
    return `${v.getUTCFullYear()}-${p2(v.getUTCMonth() + 1)}-${p2(v.getUTCDate())}T${p2(v.getUTCHours())}:${p2(v.getUTCMinutes())}:${p2(v.getUTCSeconds())}`;
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v).replace(/\s*\r?\n\s*/g, " ").trim();
}

export function entetesUniques(noms) {
  const vus = new Map();
  return noms.map((n, i) => {
    const base = String(n ?? "").trim() ? snake(n) : `col_${i + 1}`;
    const k = (vus.get(base) || 0) + 1; vus.set(base, k);
    return k === 1 ? base : `${base}_${k}`;
  });
}

const champCsv = s => /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

export function ecrireCsv(fichier, entetes, lignes) {
  fs.writeFileSync(fichier, [entetes, ...lignes].map(l => l.map(champCsv).join(";")).join("\n") + "\n");
}
