# Shared host-side Docker/Compose discovery. Source after changing to project root.
# Synology's non-interactive sudo environment can omit package executables.
# Keep this local to the installer; do not change the user's shell settings.
PATH="/var/packages/ContainerManager/target/usr/bin:/var/packages/Docker/target/usr/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin:${PATH:-}"
export PATH
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
    if [ -r "${NAS_COMPOSE_OVERRIDE:-compose.nas.yaml}" ]; then
      docker compose -p karaoke-modern -f compose.yaml -f "${NAS_COMPOSE_OVERRIDE:-compose.nas.yaml}" "$@"
    else
      docker compose -p karaoke-modern -f compose.yaml "$@"
    fi
  else
    if [ -r "${NAS_COMPOSE_OVERRIDE:-compose.nas.yaml}" ]; then
      "$COMPOSE_BIN" -p karaoke-modern -f compose.yaml -f "${NAS_COMPOSE_OVERRIDE:-compose.nas.yaml}" "$@"
    else
      "$COMPOSE_BIN" -p karaoke-modern -f compose.yaml "$@"
    fi
  fi
}
compose version
