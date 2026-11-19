#!/bin/sh
# Run on the NAS: sudo sh /volume1/docker/karaoke-modern/install-nas.sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
command -v docker >/dev/null 2>&1 || { echo 'Docker is unavailable. Install Container Manager first.' >&2; exit 1; }
docker compose version >/dev/null
test -r seed/catalogue-metadata.json || { echo 'Missing seed/catalogue-metadata.json' >&2; exit 1; }
test -d '/volume1/Media/10 - KARAOKE' || { echo 'The karaoke media folder is not accessible.' >&2; exit 1; }
docker compose -f compose.yaml config --quiet
if [ -n "$(docker compose -f compose.yaml ps --status running -q karaoke-modern)" ]; then
  echo 'karaoke-modern is already running. No database import or restart performed.'
  docker compose -f compose.yaml ps
  exit 0
fi
docker compose -f compose.yaml build karaoke-modern
docker compose -f compose.yaml --profile import run --rm import-metadata
docker compose -f compose.yaml up -d --no-build karaoke-modern
docker compose -f compose.yaml ps
echo 'Open http://192.168.50.150:8092 and create your host account/room.'
echo 'Add /media in Account > Media Folders and scan to enable playback.'
