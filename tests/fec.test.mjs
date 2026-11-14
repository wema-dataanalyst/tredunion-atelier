import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { decoder, estFec, lireFec, idFec } from "../tools/lecteurs/fec.mjs";
import { normaliserSociete, appliquerTypesMeta } from "../tools/normaliser.mjs";
import { racineExemple, ATELIER } from "./aide/racine.mjs";

const ENTETE = "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise";
const FEC = [ENTETE,
  "VT\tJournal de vente\t1\t20260701\t7060010009\tTransports France\t\t\tF1\t20260701\tFacture; client A\t0,0\t1200,50\t\t\t\t-1200,50\tEUR",
  "HA\tJournal d'achat\t2\t20260930\t6021000009\tAchats gasoil\t\t\tA1\t20260930\tGasoil\t300,0\t0,0\t\t\t\t300,00\tEUR"].join("\r\n") + "\r\n";

test("estFec : reconnaît l'en-tête DGFiP (tabulation ou barre), refuse un autre fichier", () => {
  assert.equal(estFec(ENTETE), true);
  assert.equal(estFec(ENTETE.replaceAll("\t", "|")), true);
  assert.equal(estFec("JournalCode|EcritureDate|CompteNum|Montant|Sens"), true);
  assert.equal(estFec("date;compte;montant"), false);
});

test("decoder : UTF-8, sinon Windows-1252", () => {
  assert.equal(decoder(Buffer.from("\uFEFFCrédit", "utf8")), "Crédit");
  assert.equal(decoder(Buffer.from([0x43, 0x72, 0xe9, 0x64, 0x69, 0x74])), "Crédit");
});

test("lireFec : noms de colonnes lisibles, cellules conservées, période et types", () => {
  const r = lireFec(FEC);
  assert.deepEqual(r.entetes.slice(0, 6), ["journal_code", "journal_lib", "ecriture_num", "ecriture_date", "compte_num", "compte_lib"]);
  assert.equal(r.lignes.length, 2);
  assert.equal(r.lignes[0][10], "Facture; client A");
  assert.equal(r.lignes[0][12], "1200,50");
  assert.deepEqual(r.meta, { periode_du: "2026-07-01", periode_au: "2026-09-30" });
  assert.deepEqual(r.colonnes.compte_num, { type: "text" });
  assert.deepEqual(r.colonnes.ecriture_date, { type: "date", format: "YYYYMMDD" });
  assert.equal(r.colonnes.compte_lib, undefined);
});

test("idFec : date de clôture du nom normé, sinon le nom du fichier", () => {
  assert.equal(idFec("", "/x/484147699FEC20270630.txt"), "fec_20270630");
  assert.equal(idFec("Compta", "/x/484147699FEC20270630.txt"), "compta_fec_20270630");
  assert.equal(idFec("", "/x/export grand livre.txt"), "export_grand_livre");
});

test("normaliserSociete : un FEC .txt devient un CSV bronze avec ses types ; un autre .txt reste non lu", async () => {
  const brut = fs.mkdtempSync(path.join(os.tmpdir(), "brut-")), bronze = `${brut}-bronze`;
  fs.writeFileSync(path.join(brut, "484147699FEC20270630.txt"), FEC);
  fs.writeFileSync(path.join(brut, "notes.txt"), "rien");
  const r = await normaliserSociete({ brut, bronze, logiciels: [] });
  assert.deepEqual(r.ecrits.map(e => [e.id, e.lecteur, e.lignes]), [["fec_20270630", "fec", 2]]);
  const csv = fs.readFileSync(path.join(bronze, "fec_20270630.csv"), "utf8").split("\n");
  assert.equal(csv[0].split(";")[4], "compte_num");
  assert.match(csv[1], /;"Facture; client A";/);
  const meta = JSON.parse(fs.readFileSync(path.join(bronze, "fec_20270630.meta.json"), "utf8"));
  assert.equal(meta.logiciel, "FEC (DGFiP)");
  assert.deepEqual(meta.colonnes.valid_date, { type: "date", format: "YYYYMMDD" });
  assert.deepEqual(r.nonLus, [{ fichier: "notes.txt", raison: "format .txt non pris en charge" }]);
});

test("appliquerTypesMeta : impose type et format, garde la virgule détectée", () => {
  const cols = [{ name: "compte_num", type: "int", role: "attr", desc: "" }, { name: "debit", type: "decimal", role: "attr", desc: "", decimalComma: true }, { name: "compte_lib", type: "text", role: "attr", desc: "" }];
  const r = appliquerTypesMeta(cols, { colonnes: { compte_num: { type: "text" }, debit: { type: "decimal" } } });
  assert.deepEqual(r.map(c => [c.name, c.type, c.decimalComma ?? false]), [["compte_num", "text", false], ["debit", "decimal", true], ["compte_lib", "text", false]]);
  assert.deepEqual(appliquerTypesMeta(cols, null), cols);
});

test("npm run profil : un FEC bronze sort avec comptes en texte et dates YYYYMMDD", async () => {
  const r = racineExemple(), brut = fs.mkdtempSync(path.join(os.tmpdir(), "brut-")), bronze = path.join(r, "data/bronze/kf");
  fs.writeFileSync(path.join(brut, "484147699FEC20270630.txt"), FEC);
  await normaliserSociete({ brut, bronze, logiciels: [] });
  const p = spawnSync("node", [ATELIER, "profil", "data/bronze/kf/fec_20270630.csv", "--societe", "kf"], { env: { ...process.env, ATELIER_ROOT: r }, encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr);
  const d = YAML.parse(fs.readFileSync(path.join(r, "spec/datasets/fec_20270630.yml"), "utf8"));
  const col = n => d.columns.find(c => c.name === n);
  assert.equal(col("compte_num").type, "text");
  assert.deepEqual([col("ecriture_date").type, col("ecriture_date").format], ["date", "YYYYMMDD"]);
  assert.deepEqual([col("debit").type, col("debit").decimalComma], ["decimal", true]);
});

test("npm run profil : .meta.json illisible → avertissement, types du profil", async () => {
  const r = racineExemple(), brut = fs.mkdtempSync(path.join(os.tmpdir(), "brut-")), bronze = path.join(r, "data/bronze/kf");
  fs.writeFileSync(path.join(brut, "484147699FEC20270630.txt"), FEC);
  await normaliserSociete({ brut, bronze, logiciels: [] });
  fs.writeFileSync(path.join(bronze, "fec_20270630.meta.json"), "{");
  const p = spawnSync("node", [ATELIER, "profil", "data/bronze/kf/fec_20270630.csv", "--societe", "kf"], { env: { ...process.env, ATELIER_ROOT: r }, encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr);
  assert.match((p.stderr || "") + (p.stdout || ""), /illisible/);
  const d = YAML.parse(fs.readFileSync(path.join(r, "spec/datasets/fec_20270630.yml"), "utf8"));
  assert.equal(d.columns.find(c => c.name === "compte_num").type, "int");
});