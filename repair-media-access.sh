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
mkdir -p diagnostics
chown "$uid:$gid" diagnostics
test -d "$media" || { echo 'Karaoke folder is unavailable.' >&2; exit 1; }
docker image inspect "$image" >/dev/null
containers=$(docker ps -aq --filter label=com.docker.compose.project=karaoke-modern --filter label=com.docker.compose.service=karaoke-modern)
set -- $containers
test "$#" -le 1 || { echo 'More than one application container found; no changes made.' >&2; exit 1; }
was_running=false
configured_user=$(docker image inspect --format '{{.Config.User}}' "$image")
if [ "$#" -eq 1 ]; then
  container=$1
  actual_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/config"}}{{.Name}}{{end}}{{end}}' "$container")
  test "$actual_volume" = "$volume" || { echo 'Unexpected config mount; no changes made.' >&2; exit 1; }
  configured_user=$(docker inspect --format '{{.Config.User}}' "$container")
  was_running=$(docker inspect --format '{{.State.Running}}' "$container")
fi
test -n "$configured_user" || { echo 'Expected a non-root application user.' >&2; exit 1; }
app_uid=$(docker run --rm --user "$configured_user" --entrypoint id "$image" -u)
app_gid=$(docker run --rm --user "$configured_user" --entrypoint id "$image" -g)
test "$app_uid" -ne 0 || { echo 'Expected a non-root application user.' >&2; exit 1; }
docker volume create "$volume" >/dev/null
echo "Keeping application UID $app_uid, GID $app_gid; adding NAS groups: $groups"

# Verify the proposed identity before stopping or changing the service.
# Opening one directory entry avoids enumerating the large RIGMAR folder.
probe="const fs=require('node:fs'); fs.accessSync('/config',fs.constants.W_OK); if(fs.existsSync('/config/database.sqlite3'))fs.accessSync('/config/database.sqlite3',fs.constants.R_OK|fs.constants.W_OK); fs.accessSync('/media',fs.constants.R_OK|fs.constants.X_OK); for(const n of ['OTHER','RIGMAR','SUNFLY']) {const p='/media/'+n; if(fs.existsSync(p)){const d=fs.opendirSync(p);try{d.readSync()}finally{d.closeSync()}}} console.log('Media folders are readable.');"
set -- docker run --rm --user "$app_uid:$app_gid"
for group in $groups; do
  case "$group" in ''|*[!0-9]*) echo 'Unexpected NAS group ID.' >&2; exit 1 ;; esac
  if [ "$group" != 0 ]; then set -- "$@" --group-add "$group"; fi
done
"$@" --mount "type=volume,source=$volume,target=/config" --mount "type=bind,source=$media,target=/media,readonly" --entrypoint node "$image" -e "$probe"

pending="compose.nas.yaml.pending.$$"
{
  echo 'services:'
  echo '  karaoke-modern:'
  printf '    user: "%s:%s"\n' "$app_uid" "$app_gid"
  echo '    group_add:'
  for group in $groups; do if [ "$group" != 0 ]; then printf '      - "%s"\n' "$group"; fi; done
  echo '  import-metadata:'
  printf '    user: "%s:%s"\n' "$app_uid" "$app_gid"
} > "$pending"
chown "$uid:$gid" "$pending"
compose_with_override "$pending" config --quiet


mkdir -p backups
backup="$PWD/backups/media-access-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -m 700 "$backup"
chown "$uid:$gid" "$backup"
# Keep stdout/stderr separately so JSON-returning checks stay machine-readable.
checked () {
  if "$@" > "$backup/last-check.stdout" 2> "$backup/last-check.stderr"; then
    cat "$backup/last-check.stdout"
    cat "$backup/last-check.stderr" >&2
  else
    check_code=$?
    cat "$backup/last-check.stdout"
    cat "$backup/last-check.stderr" >&2
    return "$check_code"
  fi
}
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
    failed=$(docker ps -aq --filter label=com.docker.compose.project=karaoke-modern --filter label=com.docker.compose.service=karaoke-modern)
    if [ -n "$failed" ]; then
      docker logs --tail 100 "$failed" > "$backup/failed-startup.log" 2>&1 || true
      docker inspect --format '{{json .State}}' "$failed" > "$backup/failed-state.json" 2>&1 || true
      docker inspect --format 'User={{json .Config.User}} Groups={{json .HostConfig.GroupAdd}}' "$failed" > "$backup/failed-runtime.txt" 2>&1 || true
      chown "$uid:$gid" "$backup/failed-startup.log" "$backup/failed-state.json" || true
      echo "Startup diagnostics saved in $backup" >&2
    fi
    printf '{"state":"repair-failed","rollbackAttempted":true,"diagnostics":"%s"}\n' "$backup" > diagnostics/media-access-result.json
    chown "$uid:$gid" diagnostics/media-access-result.json || true
    echo 'Repair failed; restoring the previous runtime identity.' >&2
    if [ "$changed" = true ]; then
      compose stop karaoke-modern || true
      if [ "$had_override" = true ]; then cp -p "$backup/compose.nas.yaml.previous" compose.nas.yaml; else rm -f compose.nas.yaml; fi
    fi
    if [ "$stopped" = true ] && [ "$was_running" = true ]; then compose up -d --no-build --force-recreate karaoke-modern || true; fi
  fi
  rm -f "$pending"
  exit "$code"
}
trap rollback EXIT
trap 'exit 130' HUP INT TERM

# Stop only this application for a consistent config backup; ownership is retained.
if [ -n "$containers" ]; then compose stop karaoke-modern; fi
stopped=true
docker run --rm --user 0:0 \
  --mount "type=volume,source=$volume,target=/config" \
  --mount "type=bind,source=$backup,target=/backup" \
  --entrypoint sh "$image" -eu -c 'mkdir /backup/config; cp -a /config/. /backup/config/'
changed=true
mv "$pending" compose.nas.yaml
echo "Config backup saved at $backup/config"

if [ "$prepare_only" = false ]; then
  checked compose_with_override compose.nas.yaml up -d --no-build --force-recreate karaoke-modern
  container=$(docker ps -aq --filter label=com.docker.compose.project=karaoke-modern --filter label=com.docker.compose.service=karaoke-modern)
  attempt=0
  until docker exec "$container" node -e "fetch('http://127.0.0.1:8080/api/instance',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(e=>{console.error(e);process.exit(1)})" > "$backup/healthcheck.stdout" 2> "$backup/healthcheck.stderr"; do
    attempt=$((attempt + 1))
    test "$attempt" -lt 60 || { echo 'Application did not become ready.' >&2; exit 1; }
    sleep 1
  done
  checked docker inspect --format 'Applied user={{json .Config.User}} groups={{json .HostConfig.GroupAdd}}' "$container"
  # Inspect the initial application process, rather than assuming an auxiliary
  # docker-exec process has identical supplementary groups on every engine.
  checked docker exec "$container" node -e "const fs=require('node:fs'); const s=fs.readFileSync('/proc/1/status','utf8'); const actual=s.match(/^Groups:\\s*(.*)$/m)[1].trim().split(/\\s+/).map(Number);const expected=process.argv.slice(1).map(Number).filter(x=>x!==0);console.log(JSON.stringify({appGroups:actual,checkGroups:process.getgroups(),expectedGroups:expected}));if(expected.some(x=>!actual.includes(x)))throw Error('NAS groups were not applied to the application process')" $groups
  # Repeat the proven access check with explicit groups, avoiding exec-specific
  # group handling. No live database content is changed by this filesystem probe.
  set -- docker run --rm --user "$app_uid:$app_gid"
  for group in $groups; do if [ "$group" != 0 ]; then set -- "$@" --group-add "$group"; fi; done
  checked "$@" --mount "type=volume,source=$volume,target=/config" --mount "type=bind,source=$media,target=/media,readonly" --entrypoint node "$image" -e "$probe"
  result=$(checked docker exec "$container" node --input-type=module -e "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync('/config/database.sqlite3',{readOnly:true}); const check=db.prepare('PRAGMA quick_check').get().quick_check; if(check!=='ok')throw Error(check); console.log(JSON.stringify({state:'ready',checkedAt:new Date().toISOString(),uid:process.getuid(),gid:process.getgid(),groups:(await import('node:fs')).readFileSync('/proc/1/status','utf8').match(/^Groups:\\s*(.*)$/m)[1].trim().split(/\\s+/).map(Number),checkProcessGroups:process.getgroups(),database:check,users:db.prepare('SELECT COUNT(*) AS n FROM users').get().n,catalogueEntries:db.prepare('SELECT COUNT(*) AS n FROM catalogueEntries').get().n}));db.close();")
  printf '%s\n' "$result"
  printf '%s\n' "$result" > diagnostics/media-access-result.json
  chown "$uid:$gid" diagnostics/media-access-result.json
  echo 'Media access repaired. Refresh the browser and add /media.'
else
  echo 'NAS groups and config volume are prepared.'
fi
trap - EXIT HUP INT TERM
