#!/usr/bin/env bash
# Sauvegarde quotidienne : adherents/ et comptes.json. À lancer par cron ou un timer systemd.
set -euo pipefail
RACINE="${TREDUNION_RACINE:-/srv/tredunion}"
DEST="${TREDUNION_SAUVEGARDES:-/srv/tredunion-sauvegardes}"
mkdir -p "$DEST"
tar -czf "$DEST/tredunion-$(date +%F).tar.gz" -C "$RACINE" adherents comptes.json
find "$DEST" -name 'tredunion-*.tar.gz' -mtime +14 -delete
