import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { creerApp } from "../server/app.mjs";
import { creerCompte } from "../server/adherents.mjs";
import { racineExemple } from "./aide/racine.mjs";

const lire = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("le CSS cache le schéma et les outils d'atelier pour un adhérent", () => {
  const css = lire("viewer/style.css");
  for (const id of ["#t-canvas", "#t-cat", "#t-mes", "#t-files", "#t-log"]) assert.ok(css.includes(`body[data-role="adherent"] ${id}`), id);
});

test("boot.js transmet la requête de la page (?adherent=) à l'état, aux réponses et au temps réel", () => {
  const b = lire("viewer/boot.js"), u = lire("viewer/ui.js");
  assert.match(b, /\/api\/state"\s*\+\s*location\.search/); assert.match(b, /\/events"\s*\+\s*location\.search/);
  assert.match(u, /\/api\/reponse"\s*\+\s*location\.search/);
});

test("les pages portent le bouton de déconnexion et le sélecteur admin", () => {
  const h = lire("viewer/body.html"); assert.match(h, /id="b-out"/); assert.match(h, /id="sel-adh"/);
});

test("intégration : la page servie à un adhérent porte data-role, le bouton et le sélecteur", async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "vue-")), adherents = path.join(base, "adherents"), comptes = path.join(base, "comptes.json");
  fs.mkdirSync(adherents, { recursive: true }); fs.cpSync(racineExemple(), path.join(adherents, "alpha"), { recursive: true });
  const { mdp } = creerCompte({ fichier: comptes, id: "alpha", role: "adherent", nom: "alpha" });
  const srv = creerApp({ adherents, comptes }); await new Promise(ok => srv.listen(0, "127.0.0.1", ok)); t.after(() => { srv.close(); fs.rmSync(base, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${srv.address().port}`;
  const c = await fetch(url + "/api/connexion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "alpha", mdp }) });
  const cookie = (c.headers.get("set-cookie") || "").split(";")[0];
  const page = await (await fetch(url + "/", { headers: { cookie } })).text();
  assert.match(page, /id="b-out"/); assert.match(page, /id="sel-adh"/); assert.match(page, /data-role="adherent"/);
});
