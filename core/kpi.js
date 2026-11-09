/* ───────────── questions KPI par thème ───────────── */

const KPI_QUESTIONS = [
  {
    id: "kpi:activites",
    theme: "accueil",
    titre: "Quelles activités voulez-vous suivre séparément ?",
    contexte: "Vos données comptables distinguent plusieurs types de chiffre d'affaires.",
    detect: () => S.st.flux.some(f => f.codMode === "regles" && (f.rules || []).length > 1),
    propositions: (reponse) => []
  },
  {
    id: "kpi:interim",
    theme: "masse",
    titre: "Distinguez-vous l'intérim des salaires permanents ?",
    contexte: "Vos données de paie peuvent séparer intérim et CDI/CDD.",
    detect: () => S.st.flux.some(f => f.ds && f.ds.startsWith("paie")),
    propositions: (reponse) => []
  },
  {
    id: "kpi:carburant",
    theme: "couts",
    titre: "Voulez-vous détailler les types de carburant (gazole, AdBlue…) ?",
    contexte: "Vos données carburant contiennent plusieurs produits.",
    detect: () => S.st.flux.some(f => f.ds && f.ds.includes("carburant")),
    propositions: (reponse) => []
  },
  {
    id: "kpi:km",
    theme: "couts",
    titre: "Suivez-vous les kilomètres parcourus ?",
    contexte: "Des données de distance sont disponibles.",
    detect: () => S.st.datasets.some(d => d.columns.some(c => /km|distance|kilom/i.test(c.name))),
    propositions: (reponse) => []
  }
];

function questionsKpi() {
  const besoins = S.st.besoins || { themes: [], libres: [] };
  const themesChoisis = new Set(besoins.themes.filter(t => t.choisi).map(t => t.id));
  const repondues = new Set((Array.isArray(S.st.reponses) ? S.st.reponses : []).filter(r => typeof r.id === "string" && r.id.startsWith("kpi:")).map(r => r.id));
  
  return KPI_QUESTIONS.filter(q => {
    if (!themesChoisis.has(q.theme)) return false;
    if (repondues.has(q.id)) return false;
    try { return q.detect(); } catch { return false; }
  }).map(q => ({
    id: q.id,
    theme: q.theme,
    titre: q.titre,
    contexte: q.contexte
  }));
}
