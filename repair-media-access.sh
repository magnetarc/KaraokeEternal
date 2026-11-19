#!/bin/sh
# Run on the NAS: sudo sh /volume1/docker/karaoke-modern/repair-media-access.sh
set -eu
umask 077
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. ./scripts/nas-compose.sh
prepare_only=false
if [ "${1:-}" = --prepare-only ]; then prepare_only=true; fi

media='/volume1/Media/10 - KARAOKE'
volume='karaoke-modern_karaoke-modern-config'
image='karaoke-modern:local'
actor=${SUDO_USER:-Conor}
test "$actor" != root || actor=Conor
uid=$(id -u "$actor")
gid=$(id -g "$actor")
groups=$(id -G "$actor")
test "$uid" -ne 0 || { echo 'A non-root NAS user is required.' >&2; exit 1; }
test -d "$media" || { echo 'Karaoke folder is unavailable.' >&2; exit 1; }
docker image inspect "$image" >/dev/null
echo "Using NAS user $actor (UID $uid, GID $gid) for Karaoke Modern."

# Verify the proposed identity before stopping or changing the service.
# Opening one directory entry avoids enumerating the large RIGMAR folder.
probe="const fs=require('node:fs'); fs.accessSync('/media',fs.constants.R_OK|fs.constants.X_OK); for(const n of ['OTHER','RIGMAR','SUNFLY']) {const p='/media/'+n; if(fs.existsSync(p)){const d=fs.opendirSync(p);try{d.readSync()}finally{d.closeSync()}}} console.log('Media folders are readable.');"
set -- docker run --rm --user "$uid:$gid"
for group in $groups; do
  case "$group" in ''|*[!0-9]*) echo 'Unexpected NAS group ID.' >&2; exit 1 ;; esac
  if [ "$group" != 0 ]; then set -- "$@" --group-add "$group"; fi
done
"$@" --mount "type=bind,source=$media,target=/media,readonly" --entrypoint node "$image" -e "$probe"

pending="compose.nas.yaml.pending.$$"
{
  echo 'services:'
  echo '  karaoke-modern:'
  printf '    user: "%s:%s"\n' "$uid" "$gid"
  echo '    group_add:'
  for group in $groups; do if [ "$group" != 0 ]; then printf '      - "%s"\n' "$group"; fi; done
  echo '  import-metadata:'
  printf '    user: "%s:%s"\n' "$uid" "$gid"
} > "$pending"
chown "$uid:$gid" "$pending"
NAS_COMPOSE_OVERRIDE="$pending" compose config --quiet

containers=$(docker ps -aq --filter label=com.docker.compose.project=karaoke-modern --filter label=com.docker.compose.service=karaoke-modern)
set -- $containers
test "$#" -le 1 || { echo 'More than one application container found; no changes made.' >&2; exit 1; }
was_running=false
if [ "$#" -eq 1 ]; then
  container=$1
  actual_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/config"}}{{.Name}}{{end}}{{end}}' "$container")
  test "$actual_volume" = "$volume" || { echo 'Unexpected config mount; refusing ownership changes.' >&2; exit 1; }
  was_running=$(docker inspect --format '{{.State.Running}}' "$container")
fi
docker volume create "$volume" >/dev/null
old_owner=$(docker run --rm --user 0:0 --mount "type=volume,source=$volume,target=/config" --entrypoint stat "$image" -c '%u:%g' /config)

mkdir -p backups
backup="$PWD/backups/media-access-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -m 700 "$backup"
had_override=false
if [ -f compose.nas.yaml ]; then
  cp -p compose.nas.yaml "$backup/compose.nas.yaml.previous"
  had_override=true
fi
changed=false
stopped=false
rollback () {
  code=$?
  trap - EXIT HUP INT TERM
  if [ "$code" -ne 0 ]; then
    echo 'Repair failed; restoring the previous runtime identity.' >&2
    if [ "$changed" = true ]; then
      compose stop karaoke-modern || true
      if [ "$had_override" = true ]; then cp -p "$backup/compose.nas.yaml.previous" compose.nas.yaml; else rm -f compose.nas.yaml; fi
      docker run --rm --user 0:0 --mount "type=volume,source=$volume,target=/config" --entrypoint chown "$image" -hR "$old_owner" /config || true
    fi
    if [ "$stopped" = true ] && [ "$was_running" = true ]; then compose up -d --no-build --force-recreate karaoke-modern || true; fi
  fi
  rm -f "$pending"
  exit "$code"
}
trap rollback EXIT
trap 'exit 130' HUP INT TERM

# Stop this application only before backing up SQLite and changing config ownership.
if [ -n "$containers" ]; then compose stop karaoke-modern; fi
stopped=true
docker run --rm --user 0:0 \
  --mount "type=volume,source=$volume,target=/config" \
  --mount "type=bind,source=$backup,target=/backup" \
  --entrypoint sh "$image" -eu -c 'mkdir /backup/config; cp -a /config/. /backup/config/'
changed=true
docker run --rm --user 0:0 --mount "type=volume,source=$volume,target=/config" --entrypoint chown "$image" -hR "$uid:$gid" /config
mv "$pending" compose.nas.yaml
echo "Config backup saved at $backup/config"

if [ "$prepare_only" = false ]; then
  compose up -d --no-build --force-recreate karaoke-modern
  container=$(docker ps -q --filter label=com.docker.compose.project=karaoke-modern --filter label=com.docker.compose.service=karaoke-modern)
  attempt=0
  until docker exec "$container" node -e "fetch('http://127.0.0.1:8080/api/instance').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    test "$attempt" -lt 30 || { echo 'Application did not become ready.' >&2; exit 1; }
    sleep 1
  done
  docker exec "$container" node -e "$probe require('node:fs').accessSync('/config',require('node:fs').constants.W_OK);"
  docker exec "$container" node --input-type=module -e "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync('/config/database.sqlite3',{readOnly:true}); const check=db.prepare('PRAGMA quick_check').get().quick_check; if(check!=='ok')throw Error(check); console.log(JSON.stringify({database:check,users:db.prepare('SELECT COUNT(*) AS n FROM users').get().n,catalogueEntries:db.prepare('SELECT COUNT(*) AS n FROM catalogueEntries').get().n}));db.close();"
  echo 'Media access repaired. Refresh the browser and add /media.'
else
  echo 'NAS runtime identity and config volume are prepared.'
fi
trap - EXIT HUP INT TERM
