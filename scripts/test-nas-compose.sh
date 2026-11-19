#!/bin/sh
# No Docker daemon is used. Run under BusyBox ash as well as the Linux host shell.
set -eu
repo=$PWD
work=$(mktemp -d)
calls="$work/calls.log"
docker () {
  case "$1" in
    --version|info) return 0 ;;
    compose) if [ "${2:-}" = version ]; then return 0; fi ;;
  esac
  printf '%s\n' "$*" >> "$calls"
}
docker_compose_fixture () { printf '%s\n' "$*" >> "$calls"; }
. "$repo/scripts/nas-compose.sh"
cd "$work"
touch compose.yaml
assignment_probe () { :; }
PORTABILITY_PROBE=assigned assignment_probe
echo "Function-prefix assignment after return: ${PORTABILITY_PROBE:-unset}"
for mode in plugin standalone; do
  COMPOSE_MODE=$mode
  COMPOSE_BIN=docker_compose_fixture
  pending="candidate.$mode.yaml"
  touch "$pending"
  # Model an assignment retained by older BusyBox ash. It must not influence
  # the argument-based helper or silently discard the published runtime file.
  NAS_COMPOSE_OVERRIDE=stale-temporary-file.yaml
  compose_with_override "$pending" config --quiet
  mv "$pending" compose.nas.yaml
  compose up -d --no-build karaoke-modern
  grep -F -- "-f compose.yaml -f $pending config --quiet" "$calls" >/dev/null
  grep -F -- '-f compose.yaml -f compose.nas.yaml up -d --no-build karaoke-modern' "$calls" >/dev/null
  if compose_with_override missing-file.yaml config --quiet; then
    echo 'Missing override incorrectly fell back to the base configuration' >&2
    exit 1
  fi
  echo "PASS: $mode validates a candidate then launches with the published override, despite stale environment state"
done
