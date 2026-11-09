import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hacher, verifier, lireComptes, ecrireComptes, creerSessions, creerLimiteur, motDePasseAleatoire } from "../server/auth.mjs";

test("hacher / verifier : bon mot de passe accepté, mauvais refusé, sel différent à chaque fois", () => {
  const h = hacher("secret"); assert.match(h, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.equal(verifier("secret", h), true); assert.equal(verifier("autre", h), false);
  assert.notEqual(hacher("secret"), h);
  assert.equal(verifier("secret", "n'importe quoi"), false);
});

test("comptes : lecture d'un fichier absent, aller-retour, aucun fichier temporaire", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cpt-")), "comptes.json");
  assert.deepEqual(lireComptes(f), []);
  ecrireComptes(f, [{ id: "a", role: "adherent", nom: "A", mdp: "x" }]);
  assert.equal(lireComptes(f)[0].id, "a");
  assert.deepEqual(fs.readdirSync(path.dirname(f)).filter(n => n.includes("tmp")), []);
});

test("sessions : jeton valide puis expiré, et fermeture", () => {
  let t = 1000; const s = creerSessions({ duree: 100, now: () => t });
  const j = s.ouvrir({ id: "a", role: "adherent", nom: "A", mdp: "x" });
  assert.deepEqual(s.lire(j), { id: "a", role: "adherent", nom: "A" });
  assert.equal(s.lire("faux"), null);
  t = 1101; assert.equal(s.lire(j), null);
  const k = s.ouvrir({ id: "b", role: "admin", nom: "B", mdp: "x" }); s.fermer(k); assert.equal(s.lire(k), null);
});

test("limiteur : bloque au 5e échec, se libère après la fenêtre, le succès remet à zéro", () => {
  let t = 0; const l = creerLimiteur({ max: 5, fenetre: 1000, now: () => t });
  for (let i = 0; i < 4; i++) l.echec("a|ip"); assert.equal(l.bloque("a|ip"), false);
  l.echec("a|ip"); assert.equal(l.bloque("a|ip"), true);
  t = 1001; assert.equal(l.bloque("a|ip"), false);
  l.echec("b|ip"); l.succes("b|ip"); for (let i = 0; i < 4; i++) l.echec("b|ip"); assert.equal(l.bloque("b|ip"), false);
});

test("limiteur : bloque() ne crée pas d'entrée, mais echec() oui", () => {
  const l = creerLimiteur({ max: 1 }); assert.equal(l.bloque("z"), false); l.echec("z"); assert.equal(l.bloque("z"), true);
});

test("motDePasseAleatoire : 16 caractères, différent à chaque appel", () => {
  const a = motDePasseAleatoire(); assert.match(a, /^[\w-]{16}$/); assert.notEqual(a, motDePasseAleatoire());
});

test("sessions : purger retire les sessions expirées jamais relues", () => {
  let t = 0; const s = creerSessions({ duree: 100, now: () => t });
  s.ouvrir({ id: "a", role: "adherent", nom: "A" }); s.ouvrir({ id: "b", role: "adherent", nom: "B" });
  t = 50; s.ouvrir({ id: "c", role: "adherent", nom: "C" }); assert.equal(s.taille(), 3);
  t = 120; s.purger(); assert.equal(s.taille(), 1);
});
