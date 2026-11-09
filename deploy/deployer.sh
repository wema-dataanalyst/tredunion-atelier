#!/usr/bin/env bash
# Met à jour la prod depuis le poste de dev : tests, push, puis pull + npm ci + redémarrage sur le VPS.
# Usage : deploy/deployer.sh [--sans-tests]
# Variables : VPS_SSH (défaut vpspublic, alias de ~/.ssh/config), VPS_APP (défaut /home/michelf/tredunion-atelier)
set -euo pipefail
cd "$(dirname "$0")/.."
VPS_SSH="${VPS_SSH:-vpspublic}"
VPS_APP="${VPS_APP:-/home/michelf/tredunion-atelier}"

[ -z "$(git status --porcelain)" ] || { echo "Des modifications ne sont pas commitées : commit d'abord." >&2; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "Branche courante différente de main." >&2; exit 1; }

if [ "${1:-}" != "--sans-tests" ]; then npm test --silent; fi
git push origin main

# -t : sudo peut demander le mot de passe
ssh -t "$VPS_SSH" "set -e; cd '$VPS_APP' && git pull --ff-only && npm ci --silent && sudo systemctl restart tredunion && sleep 2 && systemctl is-active tredunion && curl -s -o /dev/null -w 'HTTP local : %{http_code}\n' http://127.0.0.1:4400/"
echo "Déployé. Les sessions ont été fermées par le redémarrage."
