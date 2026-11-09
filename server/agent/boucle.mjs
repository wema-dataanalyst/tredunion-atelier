/* Boucle d'outils bornée : le modèle ne peut qu'appeler les outils fournis. */
export async function boucle({ llm, systeme, utilisateur, outils, tours = 6, delaiMs = 30000, jetonsMax = 20000, now = Date.now }) {
  const debut = now(); let jetons = 0, n = 0;
  const messages = [{ role: "user", content: utilisateur }];
  const defs = Object.values(outils).map(o => ({ type: "function", function: { name: o.nom, description: o.description, parameters: o.parametres } }));
  while (n < tours) {
    if (now() - debut > delaiMs) return { issue: "delai", tours: n, jetons };
    if (jetons > jetonsMax) return { issue: "jetons", tours: n, jetons };
    n++;
    const { message, usage } = await llm.discuter({ systeme, messages, outils: defs, delaiMs: Math.max(1, delaiMs - (now() - debut)) });
    jetons += usage?.total_tokens || 0; messages.push(message);
    const appels = message.tool_calls || [];
    if (!appels.length) return { issue: "precision", precision: String(message.content || "").trim(), tours: n, jetons };
    for (const a of appels) {
      const nom = a.function?.name, o = Object.hasOwn(outils, nom) ? outils[nom] : null; let res;
      if (!o) res = { erreur: `outil inconnu : ${nom}` };
      else {
        let args; try { args = JSON.parse(a.function.arguments || "{}"); } catch { args = null; }
        if (args == null || typeof args !== "object" || Array.isArray(args)) res = { erreur: "arguments illisibles (objet JSON attendu)" };
        else { try { res = await o.executer(args); } catch { res = { erreur: "outil en échec" }; } }
      }
      if (res && res.final) return { issue: res.final, ...(res.donnees || {}), tours: n, jetons };
      messages.push({ role: "tool", tool_call_id: a.id, content: JSON.stringify(res).slice(0, 8000) });
    }
  }
  return { issue: "tours", tours: n, jetons };
}
