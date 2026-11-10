/* Client de la passerelle LLM WeMa (API compatible OpenAI, clé virtuelle). */
/* parEtape : modèle propre à une étape (ex. {datasets: "claude-haiku-4-5"}), sinon modele. */
export function creerLlm({ baseUrl = "https://llm.wema.fr", cle, modele, parEtape = {}, fetchImpl = fetch, delaiMs = 60000 }) {
  const url = String(baseUrl).replace(/\/+$/, "") + "/v1/chat/completions";
  return {
    async discuter({ systeme, messages, outils, delaiMs: d, etape }) {
      let r;
      try {
        r = await fetchImpl(url, {
          method: "POST", signal: AbortSignal.timeout(Math.max(1, Math.min(delaiMs, d ?? delaiMs))),
          headers: { "content-type": "application/json", authorization: `Bearer ${cle}` },
          body: JSON.stringify({ model: (etape && parEtape[etape]) || modele, temperature: 0, max_tokens: 3000, messages: [{ role: "system", content: systeme }, ...messages], tools: outils, tool_choice: "auto" }),
        });
      } catch (e) { throw new Error(e?.name === "TimeoutError" ? "passerelle LLM : délai dépassé" : "passerelle LLM injoignable"); }
      if (!r.ok) throw new Error(`passerelle LLM : HTTP ${r.status}`);
      let j; try { j = await r.json(); } catch { throw new Error("passerelle LLM : réponse illisible"); }
      const m = j?.choices?.[0]?.message; if (!m) throw new Error("passerelle LLM : réponse vide");
      return { message: { role: "assistant", content: m.content ?? null, ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) }, usage: j.usage || {} };
    },
  };
}
export const llmDepuisEnv = (env = process.env) => env.LLM_API_KEY && env.LLM_MODEL ? creerLlm({ baseUrl: env.LLM_BASE_URL || undefined, cle: env.LLM_API_KEY, modele: env.LLM_MODEL, parEtape: env.LLM_MODEL_DATASETS ? { datasets: env.LLM_MODEL_DATASETS, relations: env.LLM_MODEL_DATASETS } : {} }) : null;
