const lib = v => typeof v === "string" ? v : JSON.stringify(v);
export function decrire(o) {
  if (o.op === "valider") return `${o.valeur ? "Confirmer" : "Démentir"} l'hypothèse ${o.cible}`;
  if (o.op === "codes") return `Libellés de ${o.cible} : ${Object.entries(o.valeur || {}).map(([k, v]) => `${k} = ${v}`).join(", ")}`;
  if (o.op === "exclure") return `Ne garder que les lignes de ${o.cible} où : ${o.sql}`;
  if (o.op === "definir") return `Définir ${o.cible} = ${lib(o.valeur)}`;
  if (o.op === "fichier") return `Fichier ${o.cible} : ${o.valeur === "traiter" ? "à traiter" : "à ignorer"}`;
  if (o.op === "question") return `Je vous poserai ensuite : ${o.valeur?.text}`;
  if (o.op === "mesure") return `Ajouter les mesures « ${typeof o.valeur?.titre === "string" ? o.valeur.titre : o.cible || ""} »`;
  return "Noter votre réponse telle quelle";
}
const PARAM_OPS = { type: "array", maxItems: 10, items: { type: "object", properties: { op: { type: "string", enum: ["valider", "codes", "exclure", "definir", "fichier", "noter", "question", "mesure"] }, cible: { type: "string" }, valeur: {}, sql: { type: "string" }, text: { type: "string" } }, required: ["op"] } };
export function creerOutils({ espace, id, texte, par, contexte }) {
  const ops = o => ({ ...o, parametres: { type: "object", ...o.parametres } });
  const verifier = (operations, comprehension) => espace.previsualiser({ id, saisie: { interpretation: { texte, comprehension: comprehension || "", operations } }, par });
  return {
    lire_question: ops({ nom: "lire_question", description: "Lit la question posée à l'adhérent : texte, type de réponse, cible, options.", parametres: { properties: {} },
      executer: () => ({ id: contexte.id, question: contexte.titre || contexte.question, type: contexte.type, cible: contexte.cible, options: contexte.options, dataset: contexte.dataset }) }),
    profil_colonnes: ops({ nom: "profil_colonnes", description: "Profil des colonnes non personnelles du dataset de la question (valeurs fréquentes, % de vides).", parametres: { properties: { dataset: { type: "string" } }, required: ["dataset"] },
      executer: a => a.dataset === contexte.dataset ? { dataset: contexte.dataset, colonnes: contexte.colonnes } : { erreur: `dataset non disponible : seul « ${contexte.dataset} » est accessible pour cette question` } }),
    lire_memoire: ops({ nom: "lire_memoire", description: "Sens connus d'un nom de colonne dans la mémoire commune (sans noms d'adhérents).", parametres: { properties: { colonne: { type: "string" } }, required: ["colonne"] },
      executer: a => ({ entrees: espace.memoireColonne(a.colonne) }) }),
    verifier_operations: ops({ nom: "verifier_operations", description: "Vérifie des opérations sans les appliquer ; renvoie les erreurs ou l'effet attendu.", parametres: { properties: { operations: PARAM_OPS }, required: ["operations"] },
      executer: a => { const r = verifier(a.operations); return r.erreurs ? { ok: false, erreurs: r.erreurs } : { ok: true, effet: r.entree.effet }; } }),
    proposer: ops({ nom: "proposer", description: "Termine : propose à l'adhérent ce que tu as compris (comprehension : une phrase en français courant) et les opérations correspondantes.", parametres: { properties: { comprehension: { type: "string" }, operations: PARAM_OPS }, required: ["comprehension", "operations"] },
      executer: a => { const r = verifier(a.operations, a.comprehension); return r.erreurs ? { erreur: r.erreurs.join(" ; ") } : { final: "proposition", donnees: { comprehension: String(a.comprehension).trim(), operations: r.entree.modifs, effet: r.entree.effet } }; } }),
    demander_precision: ops({ nom: "demander_precision", description: "Termine : pose une seule question de précision à l'adhérent quand sa réponse ne permet pas de conclure.", parametres: { properties: { question: { type: "string" } }, required: ["question"] },
      executer: a => ({ final: "precision", donnees: { precision: String(a.question || "").trim() } }) }),
  };
}
