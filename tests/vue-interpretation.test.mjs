import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { monter, get } from "./aide/multi.mjs";
import { fauxLlm } from "./aide/faux-llm.mjs";

test("viewer : interface « J'ai compris » présente dans le code", () => {
  const ui = fs.readFileSync("viewer/ui.js", "utf8");
  for (const m of ["/api/interpreter", "interpretation", "J'ai compris", "C'est bien ça", "Reformuler", "Envoyer tel quel à WeMa"]) assert.ok(ui.includes(m), m);
  assert.match(ui, /S\.vue\??\.agent/);
  assert.ok(fs.readFileSync("viewer/style.css", "utf8").includes(".qcomp"));
});

test("serveur : la page porte la logique et vue.agent est vrai avec une passerelle", async t => {
  const m = await monter(t, { llm: fauxLlm([]) }); const { cookie } = await m.connecter("alpha");
  const page = await (await get(m, "/", cookie)).text();
  assert.ok(page.includes("J'ai compris") && page.includes("/api/interpreter") && page.includes(".qcomp"));
  assert.equal((await (await get(m, "/api/state", cookie)).json()).vue.agent, true);
});
