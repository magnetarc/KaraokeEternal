import { fileURLToPath } from 'node:url'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const source = fileURLToPath(new URL('../', import.meta.url))
if (existsSync(path.join(source, '.test-instance/preview-server.pid'))) throw new Error('Stop preview before fixture setup/cleanup')
const { initLogger } = await import('../build/server/lib/Log.js')
initLogger('metadata-qa', { console: { level: 2 }, file: { level: 0 } })
const { open, close } = await import('../build/server/lib/Database.js')
const { MetadataStore } = await import('../build/server/Metadata/Store.js')
const { emptyCategories } = await import('../build/shared/catalog.js')
const db = open({ file: path.join(source, '.test-instance/database.sqlite3'), ro: false })
try {
  if (db.get("SELECT data FROM prefs WHERE key='modernTestInstance'")?.data !== 'true') throw new Error('Unmarked database')
  db.run("DELETE FROM catalogueEntries WHERE artist='QA synthetic artist' OR artist='QA Café'")
  if (process.argv[2] !== 'clean') {
    const store = new MetadataStore(() => db)
    store.import([{ artist: 'QA synthetic artist', title: 'QA review fixture', source: 'Synthetic browser test; not a real MusicBrainz match' }])
    const id = db.get("SELECT entryId FROM catalogueEntries WHERE artist='QA synthetic artist'").entryId
    const recording = { id: '01234567-89ab-cdef-0123-456789abcdef', title: 'QA review fixture', artist: 'QA synthetic artist', exact: true, score: 100, date: '1982', note: 'Synthetic browser test only' }
    store.update(id, { state: 'review', selected: recording.id, candidates: [recording], proposal: { recording, categories: { ...emptyCategories, genre: 'Pop', genres: ['Pop', 'Rock'], language: 'English', languages: ['English'], decade: '1980s' }, evidence: [{ field: 'genres', values: ['Pop','Rock'], url: 'https://musicbrainz.org/doc/Genre', retrievedAt: new Date().toISOString(), description: 'Synthetic QA fixture, not fetched recording evidence.' }], warnings: ['Synthetic browser test only. This fixture is removed after verification.'] } })
    writeFileSync(path.join(source, '.test-instance/metadata-qa-id.json'), JSON.stringify({ id }))
    console.log('Prepared synthetic QA fixture', id)
  }
} finally { close() }
