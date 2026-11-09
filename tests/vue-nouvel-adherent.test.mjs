import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { monter, get } from "./aide/multi.mjs";

const lire = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const bloc = () => lire("viewer/ui.js").match(/let N=null;[\s\S]*?\nlet adhSeq/)[0];

test("formulaire : bouton, champs, SFTP replié, mot de passe en type password, erreurs par champ", () => {
  const b = bloc();
  assert.match(b, /Nouvel adhérent/); assert.match(b, /\/api\/adherents/);
  assert.match(b, /data-err=/); assert.match(b, /type:"password"/);
  assert.match(b, /<details class="nv-sftp"\$\{N\.sftpOuvert\?" open":""\}>/);
  assert.match(b, /Lancer la maquette après la création/);
  assert.match(b, /Il ne sera plus affiché/); assert.match(b, /data-nv-act="copier"/);
  assert.match(lire("viewer/ui.js"), /<div id="nouv"><\/div>/);
  assert.match(lire("viewer/boot.js"), /addEventListener\("adherents"/);
  assert.match(lire("viewer/style.css"), /\.nv-form/);
});

test("tout texte venu du serveur ou du formulaire passe par esc()", () => {
  for (const m of bloc().matchAll(/\$\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)) {
    const e = m[1];
    if (/^(esc\(|champ\(|CSS\.escape|soc$|sf\.|N\.envoi\?|N\.sftpOuvert\?|N\.maquette\?|N\.soc\.length>1\?|o\.type\|\||o\.ph\?|o\.max\?|i$|N\.soc\.length>1\?|k\.slice|k\b)/.test(e) || /^(i\?|o\.)/.test(e)) continue;
    assert.fail("expression non échappée : " + e);
  }
});

test("identifiant proposé depuis le nom", () => {
  const slug = new Function(bloc().match(/const slug=[^\n]*/)[0] + "return slug;")();
  assert.equal(slug("Transports Müller & Fils"), "transports-muller-fils");
  assert.equal(slug("  Été 2026 !  "), "ete-2026");
  assert.equal(slug("x".repeat(60)).length, 40);
});

test("page servie : l'admin reçoit le formulaire, la vue adhérent n'affiche pas l'onglet", async t => {
  const m = await monter(t); const adm = await m.connecter("admin-michel");
  const h = await (await get(m, "/", adm.cookie)).text(); assert.match(h, /function renderNouv/); assert.match(h, /data-nv-act/);
  assert.match(h, /body:not\(\[data-role="admin"\]\) #t-adh/);
});
