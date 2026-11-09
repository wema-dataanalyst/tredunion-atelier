import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { creerApp } from "../../server/app.mjs";
import { creerCompte } from "../../server/adherents.mjs";
import { racineExemple } from "./racine.mjs";

export async function monter(t, opts = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "multi-")), adherents = path.join(base, "adherents"), comptes = path.join(base, "comptes.json");
  for (const id of ["alpha", "beta"]) { fs.mkdirSync(adherents, { recursive: true }); fs.cpSync(racineExemple(), path.join(adherents, id), { recursive: true }); }
  const mdp = {}; for (const [id, role] of [["alpha", "adherent"], ["beta", "adherent"], ["admin-michel", "admin"]]) mdp[id] = creerCompte({ fichier: comptes, id, role, nom: id }).mdp;
  const srv = creerApp({ adherents, comptes, ...opts }); await new Promise(ok => srv.listen(0, "127.0.0.1", ok)); t.after(() => srv.close());
  const url = `http://127.0.0.1:${srv.address().port}`;
  const connecter = async (id, pass = mdp[id], h = {}) => { const r = await fetch(url + "/api/connexion", { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify({ id, mdp: pass }) }); return { r, cookie: (r.headers.get("set-cookie") || "").split(";")[0] }; };
  return { url, adherents, mdp, connecter, srv };
}
export const get = (m, chemin, cookie, init = {}) => fetch(m.url + chemin, { redirect: "manual", ...init, headers: { cookie: cookie || "", ...(init.headers || {}) } });
export const post = (m, chemin, cookie, corps, headers = {}) => fetch(m.url + chemin, { method: "POST", headers: { "content-type": "application/json", cookie: cookie || "", ...headers }, body: JSON.stringify(corps) });
export const registre = (m, id) => YAML.parse(fs.readFileSync(path.join(m.adherents, id, "spec/reponses.yml"), "utf8")) || [];
