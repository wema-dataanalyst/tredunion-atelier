import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function configSftp(env) {
  const manque = ["SFTP_HOST", "SFTP_USER", "SFTP_PASSWORD", "SFTP_DIR"].filter(k => !env[k]);
  if (manque.length) throw new Error(`Variables manquantes dans .env : ${manque.join(", ")}`);
  return { host: env.SFTP_HOST, port: env.SFTP_PORT || "22", user: env.SFTP_USER, password: env.SFTP_PASSWORD, dir: env.SFTP_DIR.replace(/\/+$/, "") };
}

// Pas de -b : le mode batch d'OpenSSH désactive l'authentification par mot de passe.
export function argsSftp(cfg) {
  return ["-P", String(cfg.port), "-o", "StrictHostKeyChecking=accept-new", "-o", "PreferredAuthentications=password", "-o", "PubkeyAuthentication=no", "-o", "NumberOfPasswordPrompts=1", "-o", "ConnectTimeout=20", `${cfg.user}@${cfg.host}`];
}

export function scriptSftp(cfg, local) {
  return `lcd "${local}"\nget -r "${cfg.dir}"\n`;
}

const compter = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? compter(path.join(dir, e.name)) : 1), 0);

export function erreurSftp(r, secret = "") {
  const err = secret ? (r.stderr || "").split(secret).join("***") : r.stderr || "";
  if (r.status !== 0) return `sftp a échoué (${r.status === null ? `signal ${r.signal}` : `code ${r.status}`}) : ${err.trim().split("\n").pop()}`;
  const l = err.split("\n").find(x => /not found|Permission denied|Couldn't|failure/i.test(x));
  return l ? `sftp : ${l.trim()}` : null;
}

export function validerSociete(soc, societes) {
  if (!soc) throw new Error("Option --societe <id> manquante");
  if (!/^[a-z0-9_-]+$/i.test(soc)) throw new Error(`Société « ${soc} » invalide (lettres, chiffres, _ et - seulement)`);
  if (!societes.some(s => String(s.id) === soc)) throw new Error(`Déclare d'abord la société « ${soc} » dans spec/projet.yml.`);
}

// Une société : le dossier tel quel ; plusieurs : le sous-dossier portant l'id de la société.
export function dossierSociete(dir, societes, soc) {
  const base = String(dir).replace(/\/+$/, "");
  if (societes.length <= 1) return base;
  if (!/^[a-z0-9_-]+$/i.test(soc)) throw new Error(`Société « ${soc} » invalide (lettres, chiffres, _ et - seulement)`);
  return `${base}/${soc}`;
}

// `sftp` : exécutable (faux en test). `sousDossier` : id de société, pour un message d'absence clair.
export function collecter(cfg, cible, { sftp = "sftp", sousDossier } = {}) {
  const absent = e => { throw sousDossier && /not found|No such file|Rien téléchargé/i.test(e.message)
    ? new Error(`sous-dossier ${sousDossier} introuvable dans ${path.posix.dirname(cfg.dir)}`) : e; };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "collecte-"));
  const askpass = path.join(tmp, "askpass.sh");
  fs.writeFileSync(askpass, "#!/bin/sh\nprintf '%s\\n' \"$SFTP_PASSWORD\"\n", { mode: 0o700 });
  try {
    const dl = path.join(tmp, "dl"); fs.mkdirSync(dl);
    const r = spawnSync(sftp, argsSftp(cfg), { input: scriptSftp(cfg, dl), encoding: "utf8", timeout: 600000,
      env: { ...process.env, SFTP_PASSWORD: cfg.password, SSH_ASKPASS: askpass, SSH_ASKPASS_REQUIRE: "force", DISPLAY: process.env.DISPLAY || "atelier" } });
    if (r.error) throw new Error(`sftp : ${r.error.message}`);
    const e = erreurSftp(r, cfg.password); if (e) absent(new Error(e));
    const src = path.join(dl, path.posix.basename(cfg.dir));
    if (!fs.existsSync(src)) absent(new Error(`Rien téléchargé depuis ${cfg.dir} : ${(r.stderr || "").split(cfg.password).join("***").trim().split("\n").pop()}`));
    fs.mkdirSync(cible, { recursive: true });
    fs.cpSync(src, cible, { recursive: true });
    return compter(src);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
