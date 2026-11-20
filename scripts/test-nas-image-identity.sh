#!/bin/sh
set -eu
. ./scripts/nas-image-identity.sh
index=sha256:1111111111111111111111111111111111111111111111111111111111111111
config=sha256:2222222222222222222222222222222222222222222222222222222222222222
wrong=sha256:3333333333333333333333333333333333333333333333333333333333333333
verify_image_identity "$index" "$config" "$index"
verify_image_identity "$index" "$config" "$config"
if verify_image_identity "$index" "$config" "$wrong"; then exit 1; fi
if verify_image_identity "$index" "$config"; then exit 1; fi
if verify_image_identity "$index" bad "$config"; then exit 1; fi
echo 'PASS: modern and classic image IDs accepted; incorrect/missing/malformed identities rejected'
