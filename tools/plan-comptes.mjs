/* Plan de comptes d'un FEC ou d'un grand livre en bronze, sur le fichier entier (l'aperçu s'arrête à 50 000 lignes). */
import { decouperLigne } from "./lecteurs/commun.mjs";

const nombre = s => { const n = Number(String(s ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const arrondi = n => Math.sign(n) * Math.round(Math.abs(n)) || 0;
const moisDe = s => { const t = String(s ?? "").trim(); let m = /^(\d{4})(\d{2})\d{2}$/.exec(t) || /^(\d{4})-(\d{2})-\d{2}/.exec(t); if (m) return `${m[1]}-${m[2]}`; m = /^\d{2}\/(\d{2})\/(\d{4})/.exec(t); return m ? `${m[2]}-${m[1]}` : "?"; };
const parFrequence = m => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
const compter = (m, k) => m.set(k, (m.get(k) || 0) + 1);

export function planComptes(texte, { classes = "67", libPersonnel = false } = {}) {
  classes = classes.replace(/4/g, "") || "67"; // les comptes de tiers (classe 4) peuvent porter un nom de personne dans le numéro ou le libellé
  const lignes = String(texte).replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  const h = decouperLigne(lignes[0] || "", ";").map(s => s.trim());
  const [iCpt, iLib, iJnl, iDate, iD, iC, iM, iS] = ["compte_num", "compte_lib", "journal_code", "ecriture_date", "debit", "credit", "montant", "sens"].map(n => h.indexOf(n));
  if (iCpt < 0 || !((iD >= 0 && iC >= 0) || (iM >= 0 && iS >= 0))) return { erreur: "ni compte_num ni montants (debit et credit, ou montant et sens) : ce dataset n'est pas un FEC ou un grand livre" };
  const comptes = new Map(), mois = new Map(), journaux = new Map();
  for (const l of lignes.slice(1)) {
    const v = decouperLigne(l, ";"), cpt = String(v[iCpt] ?? "").trim();
    if (!cpt) continue;
    const net = iD >= 0 ? nombre(v[iC]) - nombre(v[iD]) : (/^c/i.test(String(v[iS] ?? "").trim()) ? 1 : -1) * nombre(v[iM]);
    const jnl = iJnl >= 0 ? String(v[iJnl] ?? "").trim() : "", m = iDate >= 0 ? moisDe(v[iDate]) : "?";
    if (jnl) compter(journaux, jnl);
    const mm = mois.get(m) || { mois: m, lignes: 0, produits: 0, charges: 0 };
    mm.lignes++; if (cpt[0] === "7") mm.produits += net; else if (cpt[0] === "6") mm.charges -= net; mois.set(m, mm);
    if (!classes.includes(cpt[0])) continue;
    const c = comptes.get(cpt) || { compte: cpt, lignes: 0, net: 0, libs: new Map(), jnls: new Map() };
    c.lignes++; c.net += net;
    const lib = iLib >= 0 ? String(v[iLib] ?? "").trim() : "";
    if (lib) compter(c.libs, lib); if (jnl) compter(c.jnls, jnl); comptes.set(cpt, c);
  }
  const dates = [...mois.values()].filter(x => x.mois !== "?").sort((a, b) => a.mois.localeCompare(b.mois));
  return {
    lignes: lignes.length - 1, classes,
    periode: dates.length ? { du: dates[0].mois, au: dates.at(-1).mois } : null,
    mois: dates.map(x => ({ ...x, produits: arrondi(x.produits), charges: arrondi(x.charges) })),
    ...(mois.has("?") ? { sans_date: mois.get("?").lignes } : {}),
    journaux: parFrequence(journaux).map(([code, n]) => ({ code, lignes: n })),
    comptes: [...comptes.values()].sort((a, b) => a.compte.localeCompare(b.compte)).map(c => ({
      compte: c.compte, ...(!libPersonnel && /^[67]/.test(c.compte) && c.libs.size ? { lib: parFrequence(c.libs)[0][0] } : {}),
      lignes: c.lignes, net: arrondi(c.net), journaux: parFrequence(c.jnls).slice(0, 3).map(x => x[0]),
    })),
  };
}