# Modern browser test branch

## Full songbook and portable test deployment (overnight build)

`/songbook` searches the entire staged collection through a full-text index,
with server pagination, suggested styles/collections, private favourites,
host picks and a confirmed manual category editor. It clearly separates indexed
entries from scanned, playable media. `/library` retains the playable modern
browser and its queue preview; `/queue` has visible Skip/Remove controls.

The in-chat enrichment uses GPT-6 Luna for bulk artist context and sparse song
recognition, with a focused stronger-model audit/recognition pass. Styles and
editorial popularity remain unverified suggestions. Model-only language, decade
and voice allocation are withheld after the audit found version inference errors.
Unknowns remain blank. Existing host decisions, including blanks, always win.
Exact artist/title identities link staged entries and favourites when media scans.

See [TEST-DEPLOYMENT.md](TEST-DEPLOYMENT.md) for metadata-only seed export/import,
a separate Docker test project, read-only media mounting and deployment limits.
The personal catalogue, classification outputs and evidence stay in the OneDrive
project, excluded from Git. Public API lookup is keyless; no standalone LLM API
integration or API key is required for the saved in-chat categorisation pass.

## Metadata workspace and discovery ranking (18 November 2026)

The host-only `/catalogue` route imports Artist/Title CSV or JSON, including legacy Windows-1252 song books. Source entries are retained; exact normalized artist/title pairs share a metadata entry, while live/remix/cover wording is preserved. Imports are staged metadata, not playable songs. Invalid batches write nothing; completed batches can be safely imported again.

Queue up to 25 entries, then Start / resume. Public MusicBrainz requests share one lane with at least 1.2 seconds between starts, an identified User-Agent, persistent response caching, global busy-service cooldown, bounded retries and progress checkpoints. Restarting leaves work paused. Pause finishes the current entry. No MusicBrainz account or API key is used.

Search returns up to 100 candidates. **Choose the intended recording explicitly**, then resume its detail lookup. Exact title/artist text, search rank and the oldest date among a limited set do not establish the original recording. Revise search wording without changing the imported source. Search falls back to the first credited artist only when the full credit finds nothing; those results require comparison.

The review shows recording genre votes, lyric languages from linked works, recording release-date evidence, source URLs and retrieval dates. Unrelated release-title language is not used for lyric language. The highest-voted genre is initially checked; multiple languages remain unchecked until chosen. Solo/duet/group are manual decisions. Approval requires an explicit identity/category confirmation. Exported approved JSON includes sources and evidence. There are no automatic approvals, automatic LLM factual approvals, periodic metadata refreshes or media-file writes.

Approved categories can fill empty fields on an unambiguously linked library song. Existing manually edited category records, including intentionally blank fields, are protected as a whole. Existing nonempty imported fields are also retained. Changing a category in the song browser marks that record manual. Every approval/rejection has an audit record; choosing a new candidate clears the staged approval but does not undo earlier library categories. Review skipped fields, and use the manual editor for corrections.

`Popular first` is now the song browser default. Text matching still filters the same songs. For searches, exact titles precede title prefixes, title substrings and combined artist/title matches. Within a relevance tier, host-promoted songs precede usage ranking; usage score is 5 × shared song favourites + 2 × current-room queue entries + shared artist favourites. Remaining ties use title and song ID. This is local discovery ranking, not external chart data or a lifetime play count. Host promotion is in Edit categories. Alphabetical, artist and duration ordering remain available.

The prepared OneDrive test database contains the Rigmar song book as staged metadata; Git and source archives exclude that personal runtime data. A fresh clone contains only the fictional seed library. Offline import/pilot helpers refuse a running preview PID and any database without the test marker:

```powershell
node scripts/import-catalogue.mjs 'path\Raw CSV.csv' windows-1252
node scripts/pilot-metadata.mjs
# Before/after browser verification, with preview stopped:
node scripts/metadata-qa-fixture.mjs
node scripts/metadata-qa-fixture.mjs clean
# With the marked preview running:
python scripts/qa-metadata.py
```

The bounded pilot deliberately samples 25 titles across eras/styles/languages; it is not a random sample or an accuracy audit. The first pilot exposed inappropriate version/date suggestions from automatic candidate selection. That behaviour was removed before delivery; preliminary unapproved snapshots are retained separately. Three explicit engineering selections demonstrate detail evidence without approving their correspondence to the karaoke audio. Actual-phone, NAS container and MP3+G testing remain future work.

Fork of [Karaoke Eternal](https://github.com/bhj/KaraokeEternal), retaining its ISC licence and existing playback, rooms, favourites and round-robin queue. Based on upstream v2.1.0, commit `5d46aca8cdea867d6a3c6933e63e480adba525b5`.

This is a separate local test instance. Nothing here installs an Android app or deploys to a NAS.

## Try it on this PC

With Node 24+ and npm 11+, from the checkout:

```powershell
npm ci
npm run build:preview
# Only for a new sample database:
python -m pip install Pillow imageio-ffmpeg
python scripts/generate-demo.py
npm run test:seed
npm run test:preview
```

Open <http://127.0.0.1:8091/library?roomId=1>. The prepared local checkout already has dependencies, a build and sample data. `npm run test:preview` is sufficient there. Ctrl+C stops a foreground instance.

| Demo account | Password | Purpose |
| --- | --- | --- |
| `host` | `preview-host-2026` | Edit categories and control the room queue |
| `singer` | `preview-singer-2026` | Add songs and manage own queue entries |

These are disposable sample accounts, unrelated to production credentials. There are 12 fictional titles/artists, sharing a 45-second synthetic tone and labelled demo video. The decade/genre examples are illustrative metadata. No commercial recordings are included.

The preview binds to loopback only; a phone cannot open this address. Phone layouts are tested through mobile browser emulation. A later LAN preview can be arranged independently of the NAS and Shield.

## What changed

- Responsive songbook with combined artist/title search, genre, decade, language, voices and collection filters, favourites, sorting, empty results and 40-song pagination.
- Admin category editor. SQLite migration 008 stores curated metadata by song ID, independently of media files. Writes validate types and lengths, require an admin session, and broadcast the refreshed library to connected clients. Unknown metadata is left blank.
- Clearly labelled Add to queue buttons, duplicate queue indicators, and a queue preview using the original round-robin selector.
- Visible Skip to next and Remove actions in the full queue, plus labelled Browse / Queue / Account navigation. Existing secondary queue actions remain available. Skip/remove prompts confirm the specific action.
- Original search, artist browsing and provider search remain available through “Original search”. The underlying playback and queue engines are retained.
- `/player` checks authentication before the admin gate, preserving its destination through a cold sign-in. This change exists only in the fork.
- Portable preview build, configurable bind host, and a Windows path correction in an upstream provider test. Dependency licence extraction is constrained to node_modules to handle Windows resource paths; upstream licence text remains included.

Genre, language, decade, Solo/Duet/Group and named collections are host-curated. No metadata service, scraping or automatic categorisation is configured. Existing real libraries would initially appear uncategorised until tagged; importing or bulk editing a real library is a future step.

## Isolation

The launcher fixes its database to `.test-instance/database.sqlite3`, port 8091 and host `127.0.0.1`; clears inherited KES/PUID/PGID settings; requires a test marker; and refuses external provider configuration or media paths outside `.test-instance/`. Seeding refuses to overwrite an existing database. Sample media watching and QR display start disabled. Databases, logs, screenshots and media are ignored by Git.

Use this launcher for review rather than the upstream default `npm run serve`, which uses the normal application data directory. The runtime is otherwise the full upstream server, including its admin settings; keep all test media local.

## Validation

Verified locally on Windows on 18 November 2026: production preview build and TypeScript checks passed; 589 tests across 29 files passed with the settings below; all 12 browser checks passed with no JavaScript errors. MP4 sample playback time advanced, Skip changed the current song, Pause stopped the video, and cold `/player` login returned to the player. Actual phones, a large real song library and MP3+G media are not covered by this preview run.

```powershell
npm run typecheck
npm test -- --maxWorkers=2 --testTimeout=15000
# Start the isolated instance, then in another terminal:
python -m pip install playwright
python scripts/qa-browser.py
```

Browser checks require Microsoft Edge. They refuse a server without the test marker, exercise only the disposable sample data, and save results/screenshots to `qa-artifacts/`. They alter queue history and restore category/favourite examples. Do not use this QA script with a library you want to preserve.

Upstream build warnings remain for large player/visualiser bundles and missing licence files in some dependency tarballs; the production build succeeds. The broad initial parallel test run exceeded two 5-second timeouts on this PC. The documented worker/time settings pass without changing playback code.
