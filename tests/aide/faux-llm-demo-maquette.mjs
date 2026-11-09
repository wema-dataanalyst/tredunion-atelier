import { serveurFauxLlm, appelOutil } from "./faux-llm.mjs";

/* Faux LLM de démonstration de la maquette automatique : node tests/aide/faux-llm-demo-maquette.mjs <port> [délai_ms]
   Chaque appel dure `délai_ms` (défaut 1500) pour laisser voir les étapes. Pour un dataset à documenter : un ecrire_dataset (desc) puis terminer ; sinon terminer. */
const port = Number(process.argv[2]), delai = Number(process.argv[3] ?? 1500);
if (!port) { console.error("Usage : node tests/aide/faux-llm-demo-maquette.mjs <port> [délai_ms]"); process.exit(1); }
const reponse = message => ({ choices: [{ message }], usage: { total_tokens: 10 } });
const s = await serveurFauxLlm(async corps => {
  await new Promise(r => setTimeout(r, delai));
  const msgs = corps.messages || [], dernier = [...msgs].reverse().find(m => m.role === "user");
  const dataset = String(dernier?.content || "").match(/^Documente le dataset « ([\w-]+) »/);
  if (dataset && !msgs.some(m => m.role === "tool")) return reponse(appelOutil("ecrire_dataset", { id: dataset[1], desc: "Export documenté par la maquette de démonstration" }));
  return reponse(appelOutil("terminer", { resume: "Démonstration : rien d'autre à écrire" }));
}, port);
console.log(`Faux LLM : ${s.url}`);
