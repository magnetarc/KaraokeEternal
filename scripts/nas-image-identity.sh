# Docker's classic store reports the config digest; containerd can report the
# index/manifest digest. Both must come from the checksum-verified image export.
verify_image_identity () {
  for digest in "$@"; do
    case "$digest" in sha256:*) hex=${digest#sha256:} ;; *) echo 'Invalid image identity metadata.' >&2; return 1 ;; esac
    case "$hex" in *[!a-f0-9]*) echo 'Invalid image identity metadata.' >&2; return 1 ;; esac
    test "${#hex}" -eq 64 || { echo 'Invalid image identity metadata.' >&2; return 1; }
  done
  test "$#" -eq 3 || { echo 'Missing image identity metadata.' >&2; return 1; }
  case "$3" in
    "$1"|"$2") echo "Verified imported image: $3" ;;
    *) echo "Imported image identity mismatch. Export: $1; config: $2; observed: $3" >&2; return 1 ;;
  esac
}
