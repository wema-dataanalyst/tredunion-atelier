import { pseudonyme } from "./memoire.mjs";

const ajouter = (liste, v) => { if (!liste.includes(v)) liste.push(v); };
const retirer = (liste, ...vs) => vs.forEach(v => { const i = liste.indexOf(v); if (i >= 0) liste.splice(i, 1); });

// details : faits qui modifient la mémoire, sans société. N'écrit que la forme pseudonymisée ; une ancienne valeur en clair de la même société est remplacée.
export function apprendre(state, memoire, sel) {
  const comptes = structuredClone(memoire.comptes || []), colonnes = structuredClone(memoire.colonnes || []), faits = [], details = [];
  const noter = (fichier, liste, cle, h, societe, creer, pareil = () => true) => {
    if (!h || !(h.valide || h.refuse) || !societe) return;
    cle = new RegExp(`^memoire:${fichier}/(.+)$`).exec(String(h.source || ""))?.[1] ?? cle;
    let e = liste.find(x => String(x.id) === cle);
    const avant = e ? JSON.stringify(e) : null;
    if (!e) { if (h.refuse) return; e = { id: cle, ...creer(), confirme_chez: [], contredit_chez: [] }; liste.push(e); }
    const confirme = h.valide && pareil(e), p = pseudonyme(sel, societe);
    retirer(e.confirme_chez, societe); retirer(e.contredit_chez, societe);
    ajouter(confirme ? e.confirme_chez : e.contredit_chez, p); retirer(confirme ? e.contredit_chez : e.confirme_chez, p);
    faits.push(`${confirme ? "confirmé" : "contredit"} : ${cle}`);
    if (JSON.stringify(e) !== avant) details.push({ type: fichier, cle, effet: confirme ? "confirmé" : "contredit" }); // seulement ce qui change la mémoire
  };
  const societeDe = ds => state.datasets.find(d => d.id === ds)?.societe;
  state.flux.forEach(fl => (fl.rules || []).forEach(r =>
    noter("comptes", comptes, String(r.prefix), r.hypothese, societeDe(fl.ds), () => ({ cod: r.cod, lib: r.lib || r.cod }), e => e.cod === r.cod)));
  state.datasets.forEach(d => (d.columns || []).forEach(c =>
    noter("colonnes", colonnes, c.name, c.hypothese, d.societe, () => ({ desc: c.desc, type: c.type }), e => e.desc === c.desc && e.type === c.type)));
  return { comptes, colonnes, faits, details };
}
