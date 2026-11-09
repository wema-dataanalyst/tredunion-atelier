import http from "node:http";

export const appelOutil = (nom, args, id = "c1") => ({ role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name: nom, arguments: typeof args === "string" ? args : JSON.stringify(args) } }] });

/* LLM en mémoire, scénario pas à pas */
export function fauxLlm(etapes) {
  const file = [...etapes], appels = [];
  return {
    appels,
    async discuter(requete) {
      appels.push(JSON.parse(JSON.stringify(requete)));
      if (!file.length) throw new Error("fauxLlm : plus d'étape prévue");
      let e = file.shift(); if (typeof e === "function") e = await e(requete);
      return { message: { role: "assistant", content: e.content ?? null, ...(e.tool_calls ? { tool_calls: e.tool_calls } : {}) }, usage: e.usage || { total_tokens: 10 } };
    },
  };
}

/* Vrai serveur HTTP local qui imite la passerelle : handler(corps, entetes) → objet JSON (ou {__statut}, {__brut}, Promise jamais résolue) */
export async function serveurFauxLlm(handler, port = 0) {
  const appels = [];
  const srv = http.createServer((req, res) => {
    const morceaux = []; req.on("data", c => morceaux.push(c));
    req.on("end", async () => {
      let corps = {}; try { corps = JSON.parse(Buffer.concat(morceaux).toString("utf8")); } catch {}
      appels.push({ chemin: req.url, entetes: req.headers, corps });
      const r = await handler(corps, req.headers);
      if (r && r.__statut) { res.writeHead(r.__statut, { "content-type": "application/json" }); return res.end(JSON.stringify(r)); }
      if (r && r.__brut !== undefined) { res.writeHead(200, { "content-type": "application/json" }); return res.end(r.__brut); }
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(r));
    });
  });
  await new Promise(ok => srv.listen(port, "127.0.0.1", ok));
  return { url: `http://127.0.0.1:${srv.address().port}`, appels, fermer: () => { srv.closeAllConnections?.(); srv.close(); } };
}
