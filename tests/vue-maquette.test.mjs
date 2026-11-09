import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { monter, get } from "./aide/multi.mjs";

const lire = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("le bouton est lié à /api/maquette, désactivé sans agent ou en cours, réservé à l'admin", () => {
  const u = lire("viewer/ui.js");
  assert.match(u, /function blocMaquette/); assert.match(u, /\/api\/maquette/);
  assert.match(u, /v\.role!=="admin"\) return ""/);
  assert.match(u, /data-maq="lancer"\$\{v\.agent&&!enCours\?"":" disabled"\}/);
  assert.match(u, /la spec est restée telle qu'avant/);
  assert.match(lire("viewer/boot.js"), /addEventListener\("maquette"/);
  assert.match(lire("viewer/style.css"), /\.maq-etape/);
});

test("tout texte venu du serveur passe par esc()", () => {
  const b = lire("viewer/ui.js").match(/function blocMaquette[\s\S]*?\n\$\("#qv"\)/)[0];
  for (const m of b.matchAll(/\$\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)) {
    const e = m[1]; if (/^(esc\(|enCours|v\.agent|etat|r\.fiche\?|\(m\.erreurs)/.test(e) || /encodeURIComponent/.test(e) || /^etapeMaquette/.test(e)) continue;
    assert.fail("expression non échappée : " + e);
  }
});

test("libellés d'étape", () => {
  const f = new Function(lire("viewer/ui.js").match(/function etapeMaquette[\s\S]*?\n(?=function blocMaquette)/)[0] + "return etapeMaquette;")();
  assert.equal(f({ etape: "collecte", i: 1, n: 2 }), "Collecte et lecture des exports…");
  assert.equal(f({ etape: "datasets", i: 3, n: 9 }), "Documentation des datasets 3/9…");
  assert.equal(f({ etape: "flux", i: 1, n: 4 }), "Flux et contrôles 1/4…");
  assert.equal(f({ etape: "perimetre", i: 1, n: 1 }), "Périmètre du tableau de bord…");
  assert.equal(f({ etape: "libelles", i: 1, n: 1 }), "Libellés des catégories…");
  assert.equal(f({ etape: "propositions", i: 1, n: 1 }), "Mesures propres à l'adhérent…");
  assert.equal(f({ etape: "verification", i: 0, n: 0 }), "Vérification…");
});

test("page servie : l'admin reçoit vue.maquette et le script ; l'adhérent n'a pas de maquette", async t => {
  const m = await monter(t); const adm = await m.connecter("admin-michel"), alpha = await m.connecter("alpha");
  const h = await (await get(m, "/", adm.cookie)).text(); assert.match(h, /function blocMaquette/); assert.match(h, /data-maq/);
  const va = (await (await get(m, "/api/state?adherent=alpha", adm.cookie)).json()).vue; assert.equal(va.agent, false); assert.equal(va.maquette, null);
  assert.equal("maquette" in (await (await get(m, "/api/state", alpha.cookie)).json()).vue, false);
});
