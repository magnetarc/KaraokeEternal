# Queue controls update — 21 November 2026

Sort/Filters now share a bottom edge and 44px control height. Previous/Next have
matching heights and the page label stays centred. Song-row actions also align.

Host song menus offer **Play next**, which adds a fresh turn immediately after
the current song without interrupting playback. Multiple backing tracks open the
version picker with **Play selected next**. An already queued song instead offers
**Move to top**, preserving its existing entry, singer and selected version.
Both the playable library and full songbook offer these actions.

Upcoming queue rows have labelled up/down arrow buttons. Host arrows move one
visible position across singers; the row's extra menu also offers Move to top.
Singer arrows swap their songs within their own existing turns, including host
ordering slots. They cannot jump other singers or change another singer's song.
First/last arrows disable at their boundary. Current playback and history stay put.

The default fair rotation is unchanged. Explicit host moves are stored in room-
bound chronological order and applied over that rotation; new arrivals retain
normal turns, subject to the deliberate moves. Displayed queue order and the
player use the same result, including when provider downloads are pending.
Migration013 adds only the queueOrderMoves table/index. Completed/removed actors
leave its ordering log; existing users/media/queue/history are preserved.

The version picker closes on a genuine backdrop click/tap and Escape, restoring
focus without scrolling the song list. Clicks inside, scrolling and a drag that
starts inside do not dismiss it.

Local checks: `npm run typecheck`, `npm test -- --maxWorkers=4`, changed-TypeScript
lint, `npm run build:preview`. Start `node scripts/party-preview.mjs`, then run
`python scripts/qa-queue-controls.py` against its marked loopback-only fictional
fixture. Screenshots/report are under qa-artifacts/queue-controls. No real media,
NAS account or Shield is used by these checks.

After a later server deployment, refresh phone/PC browsers and restart the Shield
player so every client uses the new ordering code. The existing APK remains
compatible. Building this release does not deploy it.
