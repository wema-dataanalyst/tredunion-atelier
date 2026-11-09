import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";
import { ouvrirEspace } from "../tools/espace.mjs";
import { racineExemple, ATELIER } from "./aide/racine.mjs";

const espaceTmp = t => { const root = racineExemple(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return { root, e: ouvrirEspace(root) }; };
const ecrire = (root, f, s) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s); };
const CSV = "data/bronze/kf/tms_vehicules.csv";
const avecMarques = (root, marques) => {
  const l = fs.readFileSync(path.join(root, CSV), "utf8").split("\n");
  marques.forEach((m, i) => { const c = l[i + 1].split(";"); c[2] = m; l[i + 1] = c.join(";"); });
  ecrire(root, CSV, l.join("\n"));
};
const marques = (e) => { const r = e.apercuQuestion("tms_vehicules#q1"), i = r.colonnes.findIndex(c => c.name === "marque"); return r.lignes.map(l => l[i]); };

test("filet : e-mail, téléphone, IBAN, 13 chiffres et plus masqués même hors colonne pii", t => {
  const { root, e } = espaceTmp(t);
  const sensibles = ["jean.dupont@exemple.fr", "06 12 34 56 78", "+33 6 12 34 56 78", "03.88.12.34.56", "+49 151 2345 6789", "FR76 3000 6000 0112 3456 7890 189", "FR7630006000011234567890189", "1 85 05 78 006 084 36", "4970123412341234"];
  avecMarques(root, sensibles);
  const m = marques(e); sensibles.forEach((s, i) => assert.equal(m[i], "•••", s));
  const s = JSON.stringify(e.apercuQuestion("tms_vehicules#q1")); assert.ok(!s.includes("dupont") && !s.includes("4970"));
});

test("filet : un montant, une date ou une immatriculation ne sont pas masqués", t => {
  const { root, e } = espaceTmp(t);
  const ok = ["1234,56", "12 345 678,90", "2025-01-31", "31/01/2025", "FA-918-SF", "1234567", "0,5"];
  avecMarques(root, ok);
  const m = marques(e); ok.forEach((s, i) => assert.equal(m[i], s, s));
});

test("espace : un file: hors de la racine est une erreur de spec, pas une exception", t => {
  const { root, e } = espaceTmp(t);
  const f = path.join(root, "spec/datasets/tms_vehicules.yml");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("file: data/bronze/kf/tms_vehicules.csv", "file: ../../../../etc/passwd"));
  let r; assert.doesNotThrow(() => { r = e.loadState(e.makeCtx()); });
  assert.ok(r.errors.some(x => /racine|sort/.test(x.msg)), JSON.stringify(r.errors));
  assert.equal(r.state.datasets.find(d => d.id === "tms_vehicules"), undefined);
});

test("readCsv : refus au-delà de 200 Mo, cache borné à 32 entrées", async t => {
  const { root, e } = espaceTmp(t);
  const gros = path.join(root, "gros.csv"); fs.writeFileSync(gros, "a\n"); fs.truncateSync(gros, 201 * 1024 * 1024);
  const parse = s => s.split("\n").map(l => l.split(";")), snake = s => s;
  assert.throws(() => e.readCsv(gros, parse, snake), /200 Mo/);
  const { csvCache } = await import("../tools/espace.mjs");
  for (let i = 0; i < 40; i++) { const f = path.join(root, `p${i}.csv`); fs.writeFileSync(f, "a\n1\n"); e.readCsv(f, parse, snake); }
  assert.ok(csvCache.size <= 32, String(csvCache.size));
});

test("mode local : erreur interne sans stack ni message brut", async t => {
  const root = racineExemple(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".atelier"), { recursive: true }); fs.writeFileSync(path.join(root, ".atelier/layout.json"), "{ pas du json SECRETXYZ");
  const port = await new Promise(ok => { const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); }); });
  const p = spawn(process.execPath, [ATELIER, "serve", "--port", String(port)], { env: { ...process.env, ATELIER_ROOT: root } }); t.after(() => p.kill());
  await new Promise((ok, ko) => { p.stdout.on("data", d => /Prévisualisation/.test(d) && ok()); p.on("exit", c => ko(new Error("serveur arrêté : " + c))); });
  const r = await fetch(`http://127.0.0.1:${port}/api/state`); assert.equal(r.status, 500);
  const txt = await r.text(); assert.ok(!/at |\.mjs|JSON|SECRETXYZ|position/i.test(txt), txt);
});
