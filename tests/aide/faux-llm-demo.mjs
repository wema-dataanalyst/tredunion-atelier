import { serveurFauxLlm, appelOutil } from "./faux-llm.mjs";

/* Faux LLM de démonstration : node tests/aide/faux-llm-demo.mjs <port> */
const port = Number(process.argv[2]);
if (!port) { console.error("Usage : node tests/aide/faux-llm-demo.mjs <port>"); process.exit(1); }
const texteDe = c => String((c.messages || []).filter(m => m.role === "user").map(m => m.content).join("\n"));
const s = await serveurFauxLlm(corps => {
  const msgs = corps.messages || [];
  if (msgs.some(m => m.role === "tool")) {
    const t = (texteDe(corps).match(/"""\n([\s\S]*?)\n"""/) || [, ""])[1];
    return { choices: [{ message: appelOutil("proposer", { comprehension: `Vous indiquez : ${t.slice(0, 60)}`, operations: [{ op: "noter" }] }) }], usage: { total_tokens: 10 } };
  }
  if (/précis/i.test((texteDe(corps).match(/"""\n([\s\S]*?)\n"""/) || [, ""])[1])) return { choices: [{ message: { role: "assistant", content: "Pouvez-vous préciser de quelle colonne vous parlez ?" } }], usage: { total_tokens: 10 } };
  return { choices: [{ message: appelOutil("lire_question", {}) }], usage: { total_tokens: 10 } };
}, port);
console.log(`Faux LLM : ${s.url}`);
