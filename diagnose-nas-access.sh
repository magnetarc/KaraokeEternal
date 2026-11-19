#!/bin/sh
# Read-only checks of the running app; an isolated startup probe uses a temporary copy.
set -eu
umask 077
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. ./scripts/nas-compose.sh
actor=${SUDO_USER:-Conor}
test "$actor" != root || actor=Conor
uid=$(id -u "$actor")
gid=$(id -g "$actor")
groups=$(id -G "$actor")
image=karaoke-modern:local
media='/volume1/Media/10 - KARAOKE'
volume=karaoke-modern_karaoke-modern-config
container=$(docker ps -aq --filter label=com.docker.compose.project=karaoke-modern --filter label=com.docker.compose.service=karaoke-modern)
test -n "$container" || { echo 'Application container was not found.' >&2; exit 1; }
mkdir -p diagnostics
chown "$uid:$gid" diagnostics
report="$PWD/diagnostics/nas-access-$(date -u +%Y%m%dT%H%M%SZ)-$$.log"
touch "$report"
chown "$uid:$gid" "$report"
exec 3>&1
exec >>"$report" 2>&1
echo "NAS identity: $actor ($uid:$gid); groups: $groups"
docker inspect --format 'State={{json .State}} User={{json .Config.User}} Groups={{json .HostConfig.GroupAdd}}' "$container"
echo '=== Existing application startup ==='
docker logs --tail 60 "$container" || true
probe="const fs=require('node:fs');console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),groups:process.getgroups(),home:process.env.HOME}));for(const p of ['/app/build/server/main.js','/config','/config/database.sqlite3','/media']){try{const s=fs.statSync(p);console.log(JSON.stringify({path:p,uid:s.uid,gid:s.gid,mode:(s.mode&511).toString(8)}));fs.accessSync(p,p==='/media'?fs.constants.R_OK|fs.constants.X_OK:p.startsWith('/config')?fs.constants.R_OK|fs.constants.W_OK:fs.constants.R_OK);if(p==='/media')fs.readdirSync(p);console.log(p+': accessible')}catch(e){console.log(p+': '+e.code+' '+e.message)}}"
echo '=== Existing runtime identity ==='
docker exec "$container" node -e "$probe" || true
echo '=== Existing user plus NAS groups (no ownership changes) ==='
current_uid=$(docker exec "$container" id -u)
current_gid=$(docker exec "$container" id -g)
set -- docker run --rm --user "$current_uid:$current_gid" --network none
for group in $groups; do if [ "$group" != 0 ]; then set -- "$@" --group-add "$group"; fi; done
"$@" --mount "type=volume,source=$volume,target=/config" --mount "type=bind,source=$media,target=/media,readonly" --entrypoint node "$image" -e "$probe" || true

# Reproduce the proposed identity with the consistent, stopped backup from the
# failed repair. The live SQLite volume is never copied or changed here.
snapshot=''
for candidate in "$PWD"/backups/media-access-*/config; do
  if [ -f "$candidate/database.sqlite3" ]; then snapshot=$candidate; fi
done
if [ -f "$snapshot/database.sqlite3" ]; then
  probe_name="karaoke-modern-diag-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  probe_volume="$probe_name-config"
  clean_probe () {
    docker rm -f "$probe_name" >/dev/null 2>&1 || true
    docker volume rm "$probe_volume" >/dev/null 2>&1 || true
  }
  trap clean_probe EXIT HUP INT TERM
  docker volume create "$probe_volume" >/dev/null
  docker run --rm --user 0:0 --mount "type=volume,source=$probe_volume,target=/config" --mount "type=bind,source=$snapshot,target=/snapshot,readonly" --entrypoint sh "$image" -eu -c 'cp -a /snapshot/. /config/; chown -hR "$1:$2" /config' sh "$uid" "$gid"
  echo '=== Proposed NAS identity on isolated config copy ==='
  set -- docker run -d --name "$probe_name" --network none --user "$uid:$gid"
  for group in $groups; do if [ "$group" != 0 ]; then set -- "$@" --group-add "$group"; fi; done
  "$@" --mount "type=volume,source=$probe_volume,target=/config" --mount "type=bind,source=$media,target=/media,readonly" "$image"
  sleep 4
  docker exec "$probe_name" node -e "$probe" || true
  docker exec "$probe_name" node -e "fetch('http://127.0.0.1:8080/api/instance',{signal:AbortSignal.timeout(5000)}).then(async r=>console.log(r.status,await r.text())).catch(e=>{console.log(e.message);process.exit(1)})" || true
  docker inspect --format 'Isolated state={{json .State}}' "$probe_name"
  docker logs --tail 100 "$probe_name" || true
  clean_probe
  trap - EXIT HUP INT TERM
fi
echo 'Diagnostic checks complete. The original service and its config were not changed.'
echo "Diagnostics saved: $report" >&3
echo 'Tell Codex that the check is done; the saved report can be read directly.' >&3
