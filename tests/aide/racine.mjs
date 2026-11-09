import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ATELIER = path.join(APP, "tools/atelier.mjs");

export function racineExemple() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atelier-"));
  fs.cpSync(path.join(APP, "exemple/spec"), path.join(root, "spec"), { recursive: true });
  fs.cpSync(path.join(APP, "exemple/data"), path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "spec/reponses.yml"), "# Registre des réponses de l'adhérent : on ajoute à la fin, on n'efface jamais.\n");
  return root;
}
