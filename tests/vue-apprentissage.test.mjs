import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lire = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("bloc « Mémoire commune » : admin seul, bouton lié à /api/apprendre, désactivé sans fait", () => {
  const u = lire("viewer/ui.js");
  assert.match(u, /function blocMemoire/); assert.match(u, /v\.role!=="admin"\|\|!v\.apprentissage\) return ""/);
  assert.match(u, /hypothèse\$\{f\.length>1\?"s":""\} tranchée/); assert.match(u, /à apprendre/);
  assert.match(u, /Appliquer à la mémoire/); assert.match(u, /\/api\/apprendre"\s*\+\s*location\.search/);
  assert.match(u, /data-mem="appliquer"\$\{f\.length\?"":" disabled"\}/);
  assert.match(u, /v\.innerHTML=blocMemoire\(\)/);
  assert.match(lire("viewer/boot.js"), /addEventListener\("apprentissage"/);
});

test("tout texte venu du serveur passe par esc() dans le bloc mémoire", () => {
  const b = lire("viewer/ui.js").match(/function blocMemoire[\s\S]*?\n\$\("#adhv"\)/)[0];
  for (const m of b.matchAll(/\$\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)) {
    const e = m[1]; if (/^(esc\(|f\.length|res|S\.apprErr|r\?|nb\(|x\.|f\.map|f\.length>1)/.test(e) || /^f\.length/.test(e)) continue;
    assert.fail("expression non échappée : " + e);
  }
});

test("« Je vous poserai ensuite » : rendu dans .qcomp, texte échappé, sans doublon dans la liste", () => {
  const u = lire("viewer/ui.js"), bloc = u.match(/const blocComp=[\s\S]*?\nconst effetClair/)[0];
  assert.match(bloc, /<p class="qsuivi">Je vous poserai ensuite : \$\{esc\(o\.valeur\?\.text\)\}<\/p>/);
  assert.match(bloc, /i\.operations\[k\]\?\.op!=="question"/);
  assert.match(lire("viewer/style.css"), /\.qsuivi/);
});
