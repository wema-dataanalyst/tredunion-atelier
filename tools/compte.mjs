/* npm run compte -- --adherent <id> | --admin <nom> */
import { adherentsRoot, comptesFile, adherentsConnus, creerCompte } from "../server/adherents.mjs";

export function cmdCompte(args, env = process.env) {
  const val = k => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : null; };
  const fichier = comptesFile(env);
  if (val("admin")) { const id = `admin-${val("admin").toLowerCase().replace(/[^a-z0-9_-]/g, "")}`; if (!/^admin-[a-z0-9_-]{1,35}$/.test(id)) throw new Error("nom d'administrateur invalide"); const { mdp } = creerCompte({ fichier, id, role: "admin", nom: val("admin") }); return console.log(`Compte administrateur créé.\n  identifiant : ${id}\n  mot de passe : ${mdp}\n(affiché une seule fois)`); }
  const id = val("adherent"); if (!id) throw new Error("Usage : npm run compte -- --adherent <id> | --admin <nom>");
  if (!adherentsConnus(adherentsRoot(env)).includes(id)) throw new Error(`Adhérent « ${id} » introuvable dans ${adherentsRoot(env)} (crée d'abord son dossier).`);
  const { mdp } = creerCompte({ fichier, id, role: "adherent", nom: id });
  console.log(`Compte créé.\n  identifiant : ${id}\n  mot de passe : ${mdp}\n(affiché une seule fois)`);
}
