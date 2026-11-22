# Responsive search

Library and full-songbook search keep typing in a small local input component.
They submit the current text after 300 ms without typing; Enter searches at once,
and clear cancels the pending search and keeps focus in the field. IME composition
submits only after composition finishes. Browser Back/Forward and category changes
restore the URL state and cancel unfinished edits. Leaving the browser cancels its
timer. Acknowledging a submitted search does not replace newer text in the field.

The playable-library sorter reuses normalised title/artist text, updates that cache
when either changes, and calculates relevance/popularity once per matching song.
Recommendations, matching, ordering, favourites and song versions retain their
existing meaning. Category refinements no longer recalculate for query or page
changes. Full-songbook requests still abort superseded work and reject stale
responses; only the shared input applies a typing delay.

No server, database, metadata, playback, queue or Android APK changes are required.

Validation includes real rapid key events against 52,494 fictional songs on a
loopback-only instance, desktop and phone layouts under 4x browser CPU throttling,
composition, Enter/clear, replacement/backspace, navigation and pending requests.
`scripts/qa-search.py` uses only the marked local fixture; existing menu, queue and
playback checks remain available in the other QA scripts.
