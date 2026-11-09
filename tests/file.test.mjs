import { test } from "node:test";
import assert from "node:assert/strict";
import { creerFile } from "../server/file.mjs";

const pause = ms => new Promise(r => setTimeout(r, ms));

test("même clé : une tâche à la fois, dans l'ordre", async () => {
  const f = creerFile(), trace = []; let actives = 0, max = 0;
  const tache = nom => async () => { actives++; max = Math.max(max, actives); trace.push("début " + nom); await pause(20); trace.push("fin " + nom); actives--; };
  const p = f.declencher("a", tache("1")); await pause(5); f.declencher("a", tache("2")); await p;
  assert.equal(max, 1); assert.deepEqual(trace, ["début 1", "fin 1", "début 2", "fin 2"]);
});

test("regroupement : 5 déclenchements pendant une exécution n'en font qu'une de plus", async () => {
  const f = creerFile(); let n = 0;
  const tache = async () => { n++; await pause(20); };
  const p = f.declencher("a", tache); await pause(5);
  for (let i = 0; i < 5; i++) f.declencher("a", tache);
  await p; await f.attendre("a"); assert.equal(n, 2);
});

test("une tâche en échec ne bloque pas la suivante", async () => {
  const f = creerFile(); let ok = false; const log = console.error; console.error = () => {};
  try { const p = f.declencher("a", () => { throw new Error("boum"); }); await pause(5); f.declencher("a", () => { ok = true; }); await p; await f.attendre("a"); } finally { console.error = log; }
  assert.equal(ok, true);
});

test("clés différentes : indépendantes", async () => {
  const f = creerFile(), trace = [];
  const a = f.declencher("a", async () => { trace.push("a0"); await pause(30); trace.push("a1"); });
  const b = f.declencher("b", async () => { trace.push("b0"); await pause(5); trace.push("b1"); });
  await Promise.all([a, b]); assert.ok(trace.indexOf("b1") < trace.indexOf("a1"));
});

test("attendre une clé inconnue ou inactive se résout aussitôt", async () => {
  const f = creerFile(); await f.attendre("x"); await f.declencher("y", () => {}); await f.attendre("y");
});
