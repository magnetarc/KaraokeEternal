# Modern Karaoke test instance

This fork adds a modern playable browser, full staged songbook, shared categories,
clear queue controls and a separate host metadata workspace. It keeps upstream's
queue and playback system. No live deployment is part of this build.

## Preview on this PC

Run `npm run build:preview`, then `npm run test:preview`. Open
`http://127.0.0.1:8091/songbook` for the indexed collection, or `/library` for the
12 fictional playable examples. Disposable logins are in MODERN-BROWSER.md.
The preview binds to this PC only. Its database is `.test-instance`, separate
from any NAS installation. It cannot serve the archive contents as audio.

## Prepare a fresh NAS test container

The Docker build, non-root startup, isolated metadata import and HTTP route
checks pass on a Linux GitHub Actions runner using fictional seed entries.
See the fork’s Modern test container workflow. The actual NAS mount/scan and
real media playback still need deployment checks. The development PC uses
the same compiled Node server directly.

Use a new project folder for this checkout. Copy the supplied metadata bundle
to `seed/catalogue-metadata.json`. Keep the named `modern-test-config` volume;
never substitute the live Karaoke Eternal config directory or database.

```sh
docker compose -f compose.test.yaml build
docker compose -f compose.test.yaml --profile import run --rm import-metadata
docker compose -f compose.test.yaml up -d karaoke-modern-test
```

Open `http://NAS-IP:8092/songbook`, create a fresh host account and room, and
sign in. The metadata bundle supplies no accounts or existing sessions.
Import before the first normal launch: an already existing unmarked database
is deliberately refused by the CLI. Reimporting a marked test database adds
missing metadata while retaining existing host categories and suggestions.
Stop the test service before reimporting. No automatic deployment is configured.

To enable playback, uncomment the optional **read-only** media bind mount in
compose.test.yaml and point it at extracted MP3+CDG, ZIP or video files. Add
`/media` under Account → Media Folders and scan. Multipart RAR downloads are
not playable media folders; extract separately only when ready and with enough
storage. Exact artist/title matches link the staged entries, categories and saved
favourites. Version/remix wording is retained; unmatched identities stay separate.

The existing live service and Shield can continue using their current address.
Port 8092, the Docker project and config volume are independent. Check the NAS
port is free before launching. The Shield is not repointed by these commands.

## Metadata and accuracy

All source variants are retained. Model styles, artist context, collections and
editorial popularity are unreviewed discovery suggestions. Popular first orders
exact titles before partial titles, then host picks, editorial priors, shared
favourites and room queue activity. It does not claim chart statistics.

The focused independent audit found cover/version and language inference errors.
Model-only language, release decade and voice allocation are kept in the source
outputs but withheld from public filters. They remain blank until reviewed.
Host decisions, including intentional blanks, override suggestions. The host can
edit song details in the full songbook or review MusicBrainz recording evidence
in Organise. MusicBrainz searches never approve a recording automatically.
Public artist data provides labelled artist-style context, not proof about a song.

Export/import commands are in `scripts/catalogue-bundle.mjs`. The bundle contains
only staged artist/title entries, source variants, discovery suggestions and
artist context; no media paths, users, credentials, sessions or playback history.

## Check and rollback

Check phone QR/browser sign-in, search “Perfect”, favourites, a real media scan,
queue add/remove/skip and playback before considering any change to the live
setup. To stop this test only:

```sh
docker compose -f compose.test.yaml stop karaoke-modern-test
```

Keep the test volume for saved decisions. Do not delete or modify the live
container/volume to roll back a test. See the project’s OneDrive records for
actual counts, hashes, QA evidence and remaining deployment checks.
