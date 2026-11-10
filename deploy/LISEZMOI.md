# Déploiement de la plateforme Tredunion

Guide d'installation sur un serveur Linux (Debian/Ubuntu, accès `root` ou `sudo`). Le serveur Node écoute sur `127.0.0.1:4400` et n'est jamais exposé directement : Caddy reçoit le trafic public en HTTPS et le relaie.

Ce guide couvre la plateforme (connexion, réponses des adhérents, build automatique, agent LLM, maquette automatique).

## 1. Prérequis

- Node 22 (`node --version`), installé dans `/usr/bin/node` (sinon adapter `ExecStart` dans le service).
- Caddy (paquet officiel).
- Un nom de domaine qui pointe vers le serveur.
- Pare-feu : n'ouvrir que les ports **80 et 443**. Le port 4400 ne doit pas être accessible de l'extérieur.

## 2. Utilisateur système

```bash
sudo useradd --system --create-home --home-dir /srv/tredunion --shell /usr/sbin/nologin tredunion
```

## 3. Dépôt et dépendances

```bash
sudo -u tredunion git clone <url-du-depot> /srv/tredunion/app
cd /srv/tredunion/app
sudo -u tredunion npm ci
```

## 4. Données et comptes

```bash
sudo -u tredunion mkdir -p /srv/tredunion/adherents
sudo -u tredunion touch /srv/tredunion/comptes.json
sudo chmod 600 /srv/tredunion/comptes.json
```

`comptes.json` contient les empreintes des mots de passe : il doit rester en permissions 600, lisible par `tredunion` seulement.

## 5. Service systemd

```bash
sudo cp /srv/tredunion/app/deploy/tredunion.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tredunion
sudo systemctl status tredunion
```

Le service pose `PORT=4400`, `ADHERENTS_ROOT`, `COMPTES_FILE`, `COOKIE_SECURE=1` et `TRUST_PROXY=1` :

- `COOKIE_SECURE=1` : le cookie de session n'est envoyé qu'en HTTPS. Sans HTTPS, la connexion ne fonctionne pas.
- `TRUST_PROXY=1` : correct derrière Caddy, qui ajoute l'IP du client en dernier dans `X-Forwarded-For`. Ne jamais l'activer sans proxy devant.
- Les sessions sont en mémoire : un redémarrage du service déconnecte tout le monde.

## Agent (passerelle LLM)

Pour activer l'interprétation des réponses libres (« Comprendre »), créer `/srv/tredunion/llm.env` (propriétaire `tredunion`, droits **600**) :

```
LLM_BASE_URL=https://llm.wema.fr
LLM_API_KEY=<clé virtuelle>
LLM_MODEL=claude-sonnet-4-6
LLM_MODEL_DATASETS=claude-haiku-4-5
```

`LLM_MODEL_DATASETS` (facultatif) : modèle des étapes « documentation des datasets » et « relations » de la maquette ; sans lui, `LLM_MODEL` sert partout.

Sans ce fichier, l'agent est désactivé : le texte libre est enregistré tel quel, et la maquette automatique ne démarre pas (HTTP 503). La clé virtuelle doit avoir un budget et une limite de débit côté passerelle ; compter une centaine d'appels LLM par maquette et un plafond de 2 000 000 jetons par run. Le journal d'usage est `adherents/<id>/.atelier/agent.jsonl`. Après modification : `sudo systemctl restart tredunion`.

## Maquette automatique

L'admin la lance depuis la vue adhérent (bouton « Lancer la maquette »). Le service systemd ne change pas : la passerelle LLM reste `llm.env` (section ci-dessus).

Pour aller chercher les exports sur le SFTP de l'adhérent, créer `adherents/<id>/.env` (propriétaire `tredunion`, droits **600**) avec les identifiants SFTP (voir `.env.exemple` à la racine du dépôt). Sans ce fichier, le run part des CSV déjà en place (`data/bronze/`) et n'exécute pas la collecte. Un seul accès SFTP par adhérent : avec une seule société, `SFTP_DIR` est téléchargé tel quel ; avec plusieurs, chaque société est lue dans le sous-dossier `SFTP_DIR/<id de la société>` (sous-dossier absent : la collecte de cette société échoue avec « sous-dossier <id> introuvable »). Seul le processus atelier charge ce fichier ; l'agent et les journaux n'y accèdent pas.

Un run dure en général plusieurs dizaines de minutes (collecte jusqu'à 15 min par société, puis boucles d'agent). Pendant ce temps, l'adhérent ne peut pas envoyer de réponse ni demander d'interprétation : le serveur répond **409**. Avant toute écriture, la plateforme copie `spec/` vers `adherents/<id>/.atelier/spec-avant/` ; si la vérification finale échoue, `spec/` est restaurée automatiquement depuis cette copie (idem en cas de redémarrage du service pendant un run).

État du run : `adherents/<id>/.atelier/maquette.json`. Historique (dates, étapes, tours, jetons, issue, sans contenu de données) : `maquette.jsonl`.

## Mémoire commune et apprentissage

Dans l'onglet Adhérents, l'admin voit le bloc « Mémoire commune » : les hypothèses tranchées à apprendre et le bouton « Appliquer à la mémoire » (`POST /api/apprendre`, admin seul, un clic à la fois : **409** sinon ; refusé s'il reste des erreurs de spec). Le journal est `adherents/<id>/.atelier/apprentissage.jsonl` (date, nombre de faits).

La mémoire (`TREDUNION_MEMOIRE`, par défaut `../tredunion-memoire`) stocke les sociétés sous forme pseudonymisée (`p:` + HMAC-SHA256 tronqué). Le sel vient de `TREDUNION_SEL`, sinon du fichier `.sel` de la mémoire (droits 600, créé au premier apprentissage). **Sauvegarder `.sel` avec la mémoire** (sans lui, les anciens pseudonymes ne se retrouvent plus) et ne jamais le versionner. Migration unique des anciennes entrées en clair : `npm run memoire -- --pseudonymiser`.

## 6. Caddy

Éditer `deploy/Caddyfile` : remplacer `tredunion.example.com` par le vrai domaine, puis :

```bash
sudo cp /srv/tredunion/app/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtient et renouvelle le certificat HTTPS tout seul (ports 80 et 443 ouverts).

## 7. Créer un adhérent

**Depuis la plateforme (recommandé)** : connecté en admin, onglet Adhérents, bouton « Nouvel adhérent ». Saisir le nom, l'identifiant (proposé depuis le nom), les sociétés, et si les identifiants SFTP existent déjà, le bloc « Accès SFTP » (écrit dans `adherents/<id>/.env`, droits 600). La plateforme crée le dossier, la spec vide et le compte, puis affiche le mot de passe **une seule fois** avec un bouton « Copier ». La case « Lancer la maquette après la création » démarre la maquette si l'agent est configuré. Ensuite, la plateforme ne permet ni de changer le mot de passe, ni de modifier le SFTP, ni de désactiver l'adhérent. Un mot de passe SFTP ne peut pas contenir à la fois `'` et `` ` ``.

**En ligne de commande** (les commandes restent) :

```bash
sudo -u tredunion mkdir -p /srv/tredunion/adherents/<id>/spec
cd /srv/tredunion/app
sudo -u tredunion env ADHERENTS_ROOT=/srv/tredunion/adherents COMPTES_FILE=/srv/tredunion/comptes.json npm run compte -- --adherent <id>
```

Le dossier `adherents/<id>/` doit contenir sa `spec/` avant la première connexion. Le mot de passe n'est affiché **qu'une seule fois** : le transmettre à l'adhérent tout de suite ; pour en changer, relancer la commande (elle remplace le compte).

## 8. Créer le compte admin

```bash
sudo -u tredunion env ADHERENTS_ROOT=/srv/tredunion/adherents COMPTES_FILE=/srv/tredunion/comptes.json npm run compte -- --admin <nom>
```

Même règle : le mot de passe ne s'affiche qu'une fois.

## 9. Sauvegarde

```bash
sudo chmod +x /srv/tredunion/app/deploy/sauvegarde.sh
sudo crontab -u tredunion -e
```

Ajouter la ligne :

```
15 3 * * * /srv/tredunion/app/deploy/sauvegarde.sh
```

Le script archive `adherents/` et `comptes.json` dans `/srv/tredunion-sauvegardes` (le script crée ce dossier ; il appartiendra à l'utilisateur qui lance le script) et supprime les archives de plus de 14 jours. Copier ce dossier hors du serveur régulièrement.

## 10. Mise à jour

```bash
cd /srv/tredunion/app
sudo -u tredunion git pull && sudo -u tredunion npm ci && sudo systemctl restart tredunion
```

Le redémarrage déconnecte les utilisateurs (sessions en mémoire) : le faire hors des heures de séance.

## 11. Restauration

```bash
sudo systemctl stop tredunion
sudo -u tredunion tar -xzf /srv/tredunion-sauvegardes/tredunion-AAAA-MM-JJ.tar.gz -C /srv/tredunion
sudo chmod 600 /srv/tredunion/comptes.json
sudo systemctl start tredunion
```

## À ne pas faire

- Ne pas lancer `npm run serve` sur le serveur (prévisualisation locale, sans connexion).
- Ne pas ouvrir le port 4400 dans le pare-feu.
- Ne pas versionner `comptes.json` ni `adherents/`.
