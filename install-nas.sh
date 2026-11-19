#!/bin/sh
# Run on the NAS: sudo sh /volume1/docker/karaoke-modern/install-nas.sh
set -eu
# Synology's non-interactive sudo environment can omit package executables.
# Keep this local to the installer; do not change the user's shell settings.
PATH="/var/packages/ContainerManager/target/usr/bin:/var/packages/Docker/target/usr/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin:${PATH:-}"
export PATH
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
command -v docker >/dev/null 2>&1 || { echo 'Docker executable not found in the standard Synology package locations. No changes made.' >&2; exit 1; }
echo "Docker executable: $(command -v docker)"
docker --version
docker info >/dev/null
COMPOSE_BIN=''
if docker compose version >/dev/null 2>&1; then
  COMPOSE_MODE=plugin
else
  COMPOSE_MODE=standalone
  for candidate in docker-compose \
    /var/packages/ContainerManager/target/usr/bin/docker-compose \
    /var/packages/ContainerManager/target/usr/libexec/docker/cli-plugins/docker-compose \
    /var/packages/ContainerManager/target/usr/lib/docker/cli-plugins/docker-compose \
    /var/packages/Docker/target/usr/bin/docker-compose; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" version >/dev/null 2>&1; then
      COMPOSE_BIN=$candidate
      break
    fi
  done
  test -n "$COMPOSE_BIN" || { echo 'Docker is available, but its Compose command was not found. No changes made.' >&2; exit 1; }
fi
compose () {
  if [ "$COMPOSE_MODE" = plugin ]; then
    docker compose -p karaoke-modern -f compose.yaml "$@"
  else
    "$COMPOSE_BIN" -p karaoke-modern -f compose.yaml "$@"
  fi
}
compose version
test -r seed/catalogue-metadata.json || { echo 'Missing seed/catalogue-metadata.json' >&2; exit 1; }
test -d '/volume1/Media/10 - KARAOKE' || { echo 'The karaoke media folder is not accessible.' >&2; exit 1; }
compose config --quiet
if [ -n "$(docker ps --filter label=com.docker.compose.project=karaoke-modern --filter label=com.docker.compose.service=karaoke-modern --format '{{.ID}}')" ]; then
  echo 'karaoke-modern is already running. No database import or restart performed.'
  compose ps
  exit 0
fi
compose build karaoke-modern
compose --profile import run --rm import-metadata
compose up -d --no-build karaoke-modern
compose ps
echo 'Open http://192.168.50.150:8092 and create your host account/room.'
echo 'Add /media in Account > Media Folders and scan to enable playback.'
