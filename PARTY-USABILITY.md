# Party usability release — 20 November 2026

This release implements the feedback from the first evening on the NAS.
Building and packaging it does not deploy it or change the Shield APK.

- Search and category cards lead the browser. Promotional heroes and the
  Browser Preview label are removed. Artwork is in Account > Appearance.
- Selecting a category shows compact song rows, inline Add, Versions and a
  persistent All categories exit. Pagination is above and below the list.
  URL state and browser Back preserve filters/page; queue changes preserve scroll.
- Recommended uses the existing editorial seeds, host picks, favourites and
  completed local plays. It does not invent a listening history or claim chart
  measurements. Adding to the queue no longer changes recommendation order.
- Empty metadata filters are hidden. Playable-library refinements use the
  selected categories. Unverified language, decade and voice labels remain absent.
- Queue separates Now playing, Up next and collapsed History. Host controls
  include Pause/Next, Remove, Clear upcoming and Clear history. Singers retain
  control of their own turns. Fair rotation and explicit backing-track choices
  remain in place.
- Add again makes one new entry for the played version. Host Play now also
  creates a fresh entry, interrupts the current turn, then continues to unplayed
  songs. It never truncates history to replay the old queue tail.
- History and completion counts now persist. Migration 012 preserves existing
  queue rows, users and media. Pre-upgrade finished-state was only in the player:
  retained rows without available player history cannot be retroactively labelled
  finished. Completion counts start with this release and survive Clear history.
- MP3+G and video completion use the media engine's ended state, with recovery
  when the event is missed and guards against duplicate advancement. Imported
  duration and elapsed wall time never decide when to skip a song.

## Local verification

Run `npm run typecheck`, `npm test`, and `npm run build:preview`.
The isolated fictional playback fixture is `node scripts/party-preview.mjs`, at
http://127.0.0.1:18072/library?roomId=1. It needs Python with `imageio_ffmpeg` to
generate synthetic video and CBR/VBR MP3+G. It creates a fresh marked database
under `.test-instance`, never opens an existing account database, and binds to
loopback. Stop it with Ctrl+C.

Fixture-only logins: host / preview-host-2026 and singer / preview-singer-2026.
`python scripts/qa-party.py` uses Playwright/Edge against that fixture. It checks
desktop and 390px phone layouts, recommendations, paging/scroll, Appearance,
version selection, playback/pause/end recovery, independent replay, persisted
history, host/singer controls and safe clearing. Reports/screenshots go into
`qa-artifacts/party`.

## Remaining hardware acceptance

The suspected StarDisk-specific stall has not been reproduced. Synthetic CBR,
VBR and MP4 tests establish media-engine completion recovery, not a diagnosis of
that report. Check a previously affected file on the physical Shield after the
NAS update, plus the physical-phone QR journey and audible playback.

The Shield adapter's player container/header/Play-Pause/Play Next contract is
unchanged. Server-side browser changes do not require a new APK. The visualiser
remains off by default; existing preferences are retained.
