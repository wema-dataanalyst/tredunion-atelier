/* Boucle d'outils bornée : le modèle ne peut qu'appeler les outils fournis. finSur : noms d'outils dont un appel réussi termine la boucle (évite un tour pour rien). */
export async function boucle({ llm, systeme, utilisateur, outils, tours = 6, delaiMs = 30000, jetonsMax = 20000, now = Date.now, trace, capture, finSur = [], etape }) {
  const debut = now(); let jetons = 0, n = 0, derniere = "", repetes = 0;
  const messages = [{ role: "user", content: utilisateur }];
  const defs = Object.values(outils).map(o => ({ type: "function", function: { name: o.nom, description: o.description, parameters: o.parametres } }));
  while (n < tours) {
    if (now() - debut > delaiMs) return { issue: "delai", tours: n, jetons };
    if (jetons > jetonsMax) return { issue: "jetons", tours: n, jetons };
    n++;
    const { message, usage } = await llm.discuter({ systeme, messages, outils: defs, delaiMs: Math.max(1, delaiMs - (now() - debut)), ...(etape ? { etape } : {}) });
    jetons += usage?.total_tokens || 0; messages.push(message);
    if (capture) try { capture({ tour: n, systeme, messages: messages.slice(0, -1), reponse: message, usage: usage || {} }); } catch { /* le journal ne doit jamais casser la boucle */ }
    const appels = message.tool_calls || [];
    if (!appels.length) return { issue: "precision", precision: String(message.content || "").trim(), tours: n, jetons };
    for (const a of appels) {
      const nom = a.function?.name, o = Object.hasOwn(outils, nom) ? outils[nom] : null; let res;
      if (!o) res = { erreur: `outil inconnu : ${nom}` };
      else {
        let args; try { args = JSON.parse(a.function.arguments || "{}"); } catch { args = null; }
        const sig = `${nom}:${a.function?.arguments}`;
        if (sig === derniere) { repetes++; if (repetes >= 2) return { issue: "repetition", tours: n, jetons }; res = { erreur: "appel identique au précédent : ne le répète pas, passe à l'étape suivante ou appelle terminer" }; }
        else if (args == null || typeof args !== "object" || Array.isArray(args)) res = { erreur: "arguments illisibles (objet JSON attendu)" };
        else { repetes = 0; try { res = await o.executer(args); } catch { res = { erreur: "outil en échec" }; } }
        derniere = sig;
      }
      const taille = JSON.stringify(res ?? null).length;
      if (trace) try { const err = res?.erreur ?? res?.erreurs; trace({ outil: String(nom).slice(0, 40), tour: n, jetons, taille, ...(err ? { erreur: String(Array.isArray(err) ? err[0] : err).slice(0, 160) } : {}) }); } catch { /* le journal ne doit jamais casser la boucle */ }
      if (finSur.includes(nom) && res && res.ok && !res.erreur && !res.erreurs) return { issue: "termine", tours: n, jetons };
      if (res && res.final) return { issue: res.final, ...(res.donnees || {}), tours: n, jetons };
      messages.push({ role: "tool", tool_call_id: a.id, content: JSON.stringify(res).slice(0, 8000) });
    }
  }
  return { issue: "tours", tours: n, jetons };
}
