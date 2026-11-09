import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CORE = ["core/engine.js", "core/mesures.js", "core/model.js", "core/check.js", "core/controles.js", "core/hypotheses.js", "core/questions.js", "core/calque.js", "core/kpi.js"];

export const colonne = (name, extra = {}) => ({ name, type: "", role: "attr", desc: "", pii: false, codes: null, format: "", decimalComma: false, hypothese: null, ...extra });
export const dataset = (id, columns, rows, extra = {}) => ({ id, societe: "s1", file: `data/bronze/s1/${id}.csv`, desc: "", grain: "", columns, rows, rules: [], questions: [], cases: [], meta: null, ...extra });

export function chargerMoteur(partiel) {
  const ctx = vm.createContext({ console, Intl, Date, Math, JSON });
  const SHEETS_MIN = [
    { id: "accueil", title: "Accueil", objs: [{ t: "kb", items: [{ m: "CA Réel" }, { m: "Budget" }] }] },
    { id: "general", title: "Général", objs: [] },
    { id: "resultat", title: "Résultat", objs: [] },
    { id: "masse", title: "Masse salariale", objs: [] },
    { id: "activites", title: "Activités", objs: [] },
    { id: "couts", title: "Coûts d'exploitation", objs: [] },
  ];
  vm.runInContext(`const SHEETS = ${JSON.stringify(SHEETS_MIN)};`, ctx);
  CORE.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));
  const gold = vm.runInContext("goldTemplate()", ctx).filter(t => t.kind === "faits" || t.generated);
  ctx.__state = { version: 2, adherent: "Test", societes: [{ id: "s1", name: "S1", source: "", color: 0 }], datasets: [], relations: [], gold, flux: [], categories: [], catalogue: "", cases: [], log: [], controles: [], memoire: { logiciels: [], comptes: [], colonnes: [] }, nonLus: [], reponses: [], besoins: { themes: [], libres: [] }, ...partiel };
  vm.runInContext("S.st=hydrate(__state); S.ver++;", ctx);
  return { run: code => JSON.parse(JSON.stringify(vm.runInContext(code, ctx)) ?? "null") };
}

export const CATALOGUE = "CA Réel\n    Sum({<[%COD_CATEGORIE]={'CA TOTAL'}>} MontantReel)\n\nGazole\n    Sum({<[%COD_CATEGORIE]={'GO'}>} MontantReel)\n";

export const etatCaTotal = (hypothese, extra = {}) => ({
  datasets: [dataset("tms", [colonne("date_chgt"), colonne("montant", { desc: "Montant HT", hypothese })], [["02/01/2025", "600"], ["15/02/2025", "400"]])],
  flux: [{ id: "f1", ds: "tms", codMode: "fixe", cod: "CA TOTAL", lib: "CA total", valeur: "montant", agg: "sum", champ: "MontantReel", unite: "€", date: "date_chgt",
    rules: [], codCol: "", libCol: "", vehicule: "", chauffeur: "", site: "", client: "", collaborateur: "", filtre: "", note: "" }],
  categories: [{ cod: "CA TOTAL", note: "" }, { cod: "GO", note: "" }],
  catalogue: CATALOGUE,
  ...extra,
});
