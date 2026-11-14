/* Plan de comptes d'un FEC ou d'un grand livre en bronze, sur le fichier entier (l'aperçu s'arrête à 50 000 lignes). */
import { decouperLigne, snake } from "./lecteurs/commun.mjs";

const nombre = s => { let t = String(s ?? "").replace(/\s/g, ""); if (/\./.test(t) && t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, ""); const n = Number(t.replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const arrondi = n => Math.sign(n) * Math.round(Math.abs(n)) || 0;
const moisDe = s => { const t = String(s ?? "").trim(); let m = /^(\d{4})(\d{2})\d{2}$/.exec(t) || /^(\d{4})-(\d{2})-\d{2}/.exec(t); if (m) return `${m[1]}-${m[2]}`; m = /^\d{2}\/(\d{2})\/(\d{4})/.exec(t); return m ? `${m[2]}-${m[1]}` : "?"; };
const parFrequence = m => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
const compter = (m, k) => m.set(k, (m.get(k) || 0) + 1);

const ALIAS = { compte: ["compte_num", "numero_compte", "num_compte", "n_compte", "compte", "comptenum"], libelle: ["compte_lib", "intitule", "intitule_compte", "libelle_compte", "comptelib"], journal: ["journal_code", "code_journal", "journal", "journalcode"], date: ["ecriture_date", "date_ecriture", "date", "ecrituredate"] };
const premier = (h, noms) => noms.find(n => h.includes(n));
export const aliasLibelle = h => premier(h, ALIAS.libelle);
export const estComptable = h => !!premier(h, ALIAS.compte) && (h.includes("debit") && h.includes("credit") || h.includes("montant") && h.includes("sens"));

export function planComptes(texte, { classes = "67", prefixe = "", libPersonnel = false, budget = Infinity, masquer = () => false } = {}) {
  classes = classes.replace(/4/g, "") || "67"; // les comptes de tiers (classe 4) peuvent porter un nom de personne dans le numéro ou le libellé
  const lignes = String(texte).replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  const sep = [";", ",", "\t", "|"].map(c => [c, (lignes[0] || "").split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const h = decouperLigne(lignes[0] || "", sep).map(snake);
  const [iCpt, iLib, iJnl, iDate] = [ALIAS.compte, ALIAS.libelle, ALIAS.journal, ALIAS.date].map(a => h.indexOf(premier(h, a))), [iD, iC, iM, iS] = ["debit", "credit", "montant", "sens"].map(n => h.indexOf(n));
  if (!estComptable(h)) return { erreur: "ni numéro de compte ni montants (débit et crédit, ou montant et sens) : ce dataset n'est pas un FEC ou un grand livre" };
  const comptes = new Map(), mois = new Map(), journaux = new Map();
  let nb = 0;
  for (const l of lignes.slice(1)) {
    const v = decouperLigne(l, sep), cpt = String(v[iCpt] ?? "").trim();
    if (!cpt) continue;
    nb++;
    const net = iD >= 0 ? nombre(v[iC]) - nombre(v[iD]) : (/^c/i.test(String(v[iS] ?? "").trim()) ? 1 : -1) * nombre(v[iM]);
    const jnl = iJnl >= 0 ? String(v[iJnl] ?? "").trim() : "", m = iDate >= 0 ? moisDe(v[iDate]) : "?";
    if (jnl) compter(journaux, jnl);
    const mm = mois.get(m) || { mois: m, lignes: 0, produits: 0, charges: 0 };
    mm.lignes++; if (cpt[0] === "7") mm.produits += net; else if (cpt[0] === "6") mm.charges -= net; mois.set(m, mm);
    if (cpt[0] === "4" || (prefixe ? !cpt.startsWith(prefixe) : !classes.includes(cpt[0]))) continue;
    const c = comptes.get(cpt) || { compte: cpt, lignes: 0, net: 0, libs: new Map(), jnls: new Map() };
    c.lignes++; c.net += net;
    const lib = iLib >= 0 ? String(v[iLib] ?? "").trim() : "";
    if (lib) compter(c.libs, lib); if (jnl) compter(c.jnls, jnl); comptes.set(cpt, c);
  }
  const dates = [...mois.values()].filter(x => x.mois !== "?").sort((a, b) => a.mois.localeCompare(b.mois));
  const lib = c => libPersonnel || !/^[67]/.test(c.compte) || !c.libs.size ? "" : masquer(parFrequence(c.libs)[0][0]) ? "•••" : parFrequence(c.libs)[0][0];
  let liste = [...comptes.values()].map(c => [c.compte, lib(c), c.lignes, arrondi(c.net), parFrequence(c.jnls).slice(0, 3).map(x => x[0]).join(",")]);
  const res = {
    lignes: nb, classes, ...(prefixe ? { prefixe } : {}),
    periode: dates.length ? { du: dates[0].mois, au: dates.at(-1).mois } : null,
    mois: dates.map(x => ({ ...x, produits: arrondi(x.produits), charges: arrondi(x.charges) })),
    ...(mois.has("?") ? { sans_date: mois.get("?").lignes } : {}),
    journaux: parFrequence(journaux).map(([code, n]) => ({ code, lignes: n })),
    colonnes_comptes: ["compte", "libelle", "lignes", "net", "journaux"],
  };
  const taille = (r, comptes) => JSON.stringify({ ...r, comptes }).length;
  if (taille(res, liste) > budget) {
    const omis = { comptes_omis: liste.length, conseil: 'précisez prefixe (ex. "706") ou classes (ex. "7") pour voir les comptes omis' };
    const fixe = taille({ ...res, ...omis }, []) - 2, gros = [...liste].sort((a, b) => Math.abs(b[3]) - Math.abs(a[3]) || a[0].localeCompare(b[0]));
    let k = 0, t = fixe + 2;
    while (k < gros.length && (t += JSON.stringify(gros[k]).length + (k ? 1 : 0)) <= budget) k++;
    const garde = new Set(gros.slice(0, k).map(c => c[0]));
    liste = liste.filter(c => garde.has(c[0])); omis.comptes_omis = gros.length - k; Object.assign(res, omis);
  }
  return { ...res, comptes: liste.sort((a, b) => a[0].localeCompare(b[0])) };
}
