#!/bin/sh
# Install the verified prebuilt image after the initial media scan finishes.
set -eu
umask 077
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. ./scripts/nas-compose.sh
. ./scripts/nas-image-identity.sh
test -r compose.nas.yaml || { echo 'Run the media access repair first.' >&2; exit 1; }
actor=${SUDO_USER:-Conor}
test "$actor" != root || actor=Conor
uid=$(id -u "$actor"); gid=$(id -g "$actor")
mkdir -p diagnostics backups
chown "$uid:$gid" diagnostics
mkdir diagnostics/update.lock 2>/dev/null || { echo 'An update is already running. Keep its window open.' >&2; exit 1; }
stopped=false
backup=''
old_image=''
phase=preflight
release=''
expected_image=''
expected_config=''
observed_image=''
cleanup () {
  code=$?
  trap - EXIT HUP INT TERM
  if [ "$code" -ne 0 ] && [ -n "$old_image" ]; then
    docker tag "$old_image" karaoke-modern:local || true
  fi
  if [ "$code" -ne 0 ] && [ "$stopped" = true ]; then
    failed=$(docker ps -aq --filter label=com.docker.compose.project=karaoke-modern --filter label=com.docker.compose.service=karaoke-modern)
    if [ -n "$failed" ]; then docker logs --tail 100 "$failed" > "$backup/failed-startup.log" 2>&1 || true; fi
    compose_with_override compose.nas.yaml up -d --no-build --force-recreate karaoke-modern || true
    echo "Update failed. Previous image restored; config backup: $backup/config" >&2
  fi
  if [ "$code" -ne 0 ]; then
    printf '{"state":"failed","exitCode":%s,"phase":"%s","sourceCommit":"%s","expectedImage":"%s","expectedConfig":"%s","observedImage":"%s"}\n' "$code" "$phase" "$release" "$expected_image" "$expected_config" "$observed_image" > diagnostics/update-result.json
    chown "$uid:$gid" diagnostics/update-result.json || true
  fi
  rmdir diagnostics/update.lock 2>/dev/null || true
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
container=$(docker ps -q --filter label=com.docker.compose.project=karaoke-modern --filter label=com.docker.compose.service=karaoke-modern)
test -n "$container" || { echo 'The current service must be running.' >&2; exit 1; }
old_image=$(docker inspect --format '{{.Image}}' "$container")

release=$(tr -d '\r\n' < release-images/current-version)
case "$release" in ''|*[!a-f0-9]*) echo 'Invalid release identifier.' >&2; exit 1 ;; esac
test "${#release}" -eq 40
arch=$(docker info --format '{{.Architecture}}')
case "$arch" in x86_64|amd64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; *) echo "Unsupported NAS architecture: $arch" >&2; exit 1 ;; esac
bundle="$PWD/release-images/$release/$arch"
test "$(tr -d '\r\n' < "$bundle/source-commit.txt")" = "$release"
(cd "$bundle" && sha256sum -c karaoke-modern-image.tar.gz.sha256)
expected_image=$(tr -d '\r\n' < "$bundle/image-id.txt")
expected_config=$(tr -d '\r\n' < "$bundle/image-config-id.txt")
verify_image_identity "$expected_image" "$expected_config" "$expected_image"

phase=wait-for-scan
scan_check=$(cat scripts/nas-scan-check.cjs)
while :; do
  scan_state=$(docker exec "$container" node -e "$scan_check") || { echo 'Could not check media indexing.' >&2; exit 1; }
  case "$scan_state" in idle) break ;; busy) ;; *) echo 'Unexpected indexing status.' >&2; exit 1 ;; esac
  printf '{"state":"waiting-for-scan","sourceCommit":"%s"}\n' "$release" > diagnostics/update-result.json
  chown "$uid:$gid" diagnostics/update-result.json
  echo 'Media indexing is still running. Waiting 30 seconds; the current app stays running.'
  sleep 30
done
echo 'Indexing has finished. Loading the prebuilt image.'
phase=load-image
docker load -i "$bundle/karaoke-modern-image.tar.gz"
phase=verify-image
observed_image=$(docker image inspect --format '{{.Id}}' karaoke-modern:local)
verify_image_identity "$expected_image" "$expected_config" "$observed_image"
backup="$PWD/backups/update-$(date -u +%Y%m%dT%H%M%SZ)-$$"
phase=backup-config
mkdir -m 700 "$backup"; chown "$uid:$gid" "$backup"
printf '%s\n' "$old_image" > "$backup/previous-image.txt"
compose stop karaoke-modern
stopped=true
docker run --rm --user 0:0 --mount type=volume,source=karaoke-modern_karaoke-modern-config,target=/config --mount "type=bind,source=$backup,target=/backup" --entrypoint sh "$old_image" -eu -c 'mkdir /backup/config; cp -a /config/. /backup/config/'
compose_with_override compose.nas.yaml up -d --no-build --force-recreate karaoke-modern
phase=check-startup
container=$(docker ps -aq --filter label=com.docker.compose.project=karaoke-modern --filter label=com.docker.compose.service=karaoke-modern)
attempt=0
until docker exec "$container" node -e "fetch('http://127.0.0.1:8080/api/instance',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(e=>{console.error(e);process.exit(1)})" > "$backup/healthcheck.stdout" 2> "$backup/healthcheck.stderr"; do
  attempt=$((attempt+1)); test "$attempt" -lt 60 || { echo 'Updated service did not become ready.' >&2; exit 1; }; sleep 1
done
phase=check-database
result=$(docker exec "$container" node --input-type=module -e "import{DatabaseSync}from'node:sqlite';const d=new DatabaseSync('/config/database.sqlite3',{readOnly:true});const check=d.prepare('PRAGMA quick_check').get().quick_check;if(check!=='ok')throw Error(check);if(!d.prepare('PRAGMA table_info(queue)').all().some(c=>c.name==='selectedMediaId'))throw Error('Version selection migration is missing');console.log(JSON.stringify({state:'ready',checkedAt:new Date().toISOString(),sourceCommit:process.argv[1],database:check,users:d.prepare('SELECT COUNT(*) AS n FROM users').get().n,songs:d.prepare('SELECT COUNT(DISTINCT songId) AS n FROM media').get().n,versions:d.prepare('SELECT COUNT(*) AS n FROM media').get().n,catalogueEntries:d.prepare('SELECT COUNT(*) AS n FROM catalogueEntries').get().n}));d.close()" "$release" 2> "$backup/validation.stderr")
printf '%s\n' "$result" | tee diagnostics/update-result.json
chown "$uid:$gid" diagnostics/update-result.json
stopped=false
echo 'Update complete. Refresh http://192.168.50.150:8092/library to use Versions.'
