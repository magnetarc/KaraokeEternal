#!/bin/sh
# Run on the NAS: sudo sh /volume1/docker/karaoke-modern/install-nas.sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. ./scripts/nas-compose.sh
test -r seed/catalogue-metadata.json || { echo 'Missing seed/catalogue-metadata.json' >&2; exit 1; }
test -d '/volume1/Media/10 - KARAOKE' || { echo 'The karaoke media folder is not accessible.' >&2; exit 1; }
compose config --quiet
if [ -n "$(docker ps --filter label=com.docker.compose.project=karaoke-modern --filter label=com.docker.compose.service=karaoke-modern --format '{{.ID}}')" ]; then
  container=$(docker ps --filter label=com.docker.compose.project=karaoke-modern --filter label=com.docker.compose.service=karaoke-modern --format '{{.ID}}')
  if docker exec "$container" node -e "require('node:fs').readdirSync('/media')" >/dev/null 2>&1; then
    echo 'karaoke-modern is already running with readable media. No import or restart performed.'
    compose ps
    exit 0
  fi
  exec sh ./repair-media-access.sh
fi
compose build karaoke-modern
sh ./repair-media-access.sh --prepare-only
compose --profile import run --rm import-metadata
compose up -d --no-build karaoke-modern
compose ps
echo 'Open http://192.168.50.150:8092 and create your host account/room.'
echo 'Add /media in Account > Media Folders and scan to enable playback.'
