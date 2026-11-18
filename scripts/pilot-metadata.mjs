// A bounded, resumable real-data pilot. No approvals and no audio/NAS writes.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const source = fileURLToPath(new URL('../', import.meta.url))
const out = fileURLToPath(new URL('../../Catalogue/', import.meta.url))
if (existsSync(path.join(source, '.test-instance/preview-server.pid'))) throw new Error('Stop the preview server before this offline pilot')
const { initLogger } = await import('../build/server/lib/Log.js')
initLogger('metadata-pilot', { console: { level: 2 }, file: { level: 0 } })
const { open, close } = await import('../build/server/lib/Database.js')
const { MetadataStore } = await import('../build/server/Metadata/Store.js')
const { MusicBrainzClient, MetadataWorker } = await import('../build/server/Metadata/MusicBrainz.js')
const db = open({ file: path.join(source, '.test-instance/database.sqlite3'), ro: false })
try {
  if (db.get("SELECT data FROM prefs WHERE key='modernTestInstance'")?.data !== 'true') throw new Error('Refusing an unmarked database')
  const store = new MetadataStore(() => db)
  // Deliberately span eras, styles and languages; do not call this a random sample.
  const targets = [
    ['Abba','Dancing Queen'], ['Queen','Bohemian Rhapsody'], ['Garth Brooks','Friends In Low Places'],
    ['Shakira','Hips Don'], ['Johnny Cash','Ring Of Fire'], ['Frank Sinatra','My Way'],
    ['Adele','Someone Like You'], ['Michael Jackson','Billie Jean'], ['Beatles','Hey Jude'],
    ['Gloria Gaynor','I Will Survive'], ['Neil Diamond','Sweet Caroline'], ['Dolly Parton','Jolene'],
    ['Oasis','Wonderwall'], ['Los Lobos','La Bamba'], ['Bon Jovi','Livin'],
    ['Amy Winehouse','Valerie'], ['Guns','Sweet Child'], ['Idina Menzel','Let It Go'],
    ['John Denver','Take Me Home'], ['Bruno Mars','Uptown Funk'], ['Pharrell','Happy'],
    ['Luis Fonsi','Despacito'], ['Psy','Gangnam Style'], ['Abba','Mamma Mia'], ['Journey','Stop Believin'],
  ]
  const chosen = []; const missing = []
  for (const [artist, title] of targets) {
    const row = db.get('SELECT entryId,artist,title FROM catalogueEntries WHERE artist LIKE ? AND title LIKE ? ORDER BY length(title),entryId LIMIT 1', [`%${artist}%`, `%${title}%`])
    if (row) { if (!chosen.some(c => c.entryId === row.entryId)) chosen.push(row) } else missing.push({ artist, title })
  }
  const worker = new MetadataWorker(store, new MusicBrainzClient(store))
  worker.initialize()
  if (process.argv.includes('--refresh-searches')) {
    const reportPath = path.join(out, 'pilot-report.json')
    if (existsSync(reportPath)) copyFileSync(reportPath, path.join(out, 'pilot-preliminary-unapproved.json'))
    for (const c of chosen) {
      if (store.get(c.entryId).state === 'approved') throw new Error('Do not reset approved reviews')
      store.search(c.entryId, { artist: c.artist, title: c.title })
    }
  }
  const fresh = chosen.filter(c => ['new','failed'].includes(store.get(c.entryId).state)).map(c => c.entryId)
  if (fresh.length) store.queue(fresh)
  // Work on the pilot IDs only, never sweep the rest of the catalogue.
  const before = db.get('SELECT COUNT(*) AS n FROM musicbrainzCache').n
  let stopped = false
  process.on('SIGINT', () => { stopped = true; console.log('Finishing current entry, then saving progress…') })
  for (const c of chosen) {
    if (stopped) break
    const entry = store.get(c.entryId)
    if (entry.state !== 'queued') continue
    db.run('UPDATE catalogueEntries SET nextAttempt=0 WHERE entryId=?', [c.entryId])
    await worker.step(c.entryId)
    const result = store.get(c.entryId)
    console.log(`${result.state}: ${result.artist} — ${result.title}; candidates=${result.candidates.length}; proposed=${!!result.proposal}`)
  }
  const entries = chosen.map(c => store.get(c.entryId))
  const report = {
    createdAt: new Date().toISOString(), sampleMethod: 'Deliberate selection across eras/styles/languages, not random; coverage is not accuracy.',
    source: 'Rigmar song book; karaoke variants grouped by exact normalized artist/title', selected: chosen.length, missing,
    completed: entries.filter(e => e.state === 'review').length,
    proposals: entries.filter(e => e.proposal).length,
    genreEvidence: entries.filter(e => e.proposal?.categories.genre).length,
    lyricLanguageEvidence: entries.filter(e => e.proposal?.categories.language).length,
    decadeEvidence: entries.filter(e => e.proposal?.categories.decade).length,
    cachedRequestsAdded: db.get('SELECT COUNT(*) AS n FROM musicbrainzCache').n - before,
    approvals: 0, entries,
  }
  mkdirSync(out, { recursive: true }); writeFileSync(path.join(out, 'pilot-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, entries: undefined }, null, 2))
} finally { close() }
