// Engineering inspection of three candidate recordings. These are NOT approvals
// or claims that the specific karaoke tracks reproduce these exact recordings.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const source = fileURLToPath(new URL('../', import.meta.url))
if (existsSync(path.join(source, '.test-instance/preview-server.pid'))) throw new Error('Stop preview before offline inspection')
const { initLogger } = await import('../build/server/lib/Log.js')
initLogger('metadata-inspection', { console: { level: 2 }, file: { level: 0 } })
const { open, close } = await import('../build/server/lib/Database.js')
const { MetadataStore } = await import('../build/server/Metadata/Store.js')
const { MetadataWorker } = await import('../build/server/Metadata/MusicBrainz.js')
const db = open({ file: path.join(source, '.test-instance/database.sqlite3'), ro: false })
try {
  if (db.get("SELECT data FROM prefs WHERE key='modernTestInstance'")?.data !== 'true') throw new Error('Unmarked database')
  const store = new MetadataStore(() => db); const worker = new MetadataWorker(store)
  const choices = [
    ['Queen','Bohemian Rhapsody','b1a9c0e9-d987-4042-ae91-78d6a3267d69'],
    ['Oasis','Wonderwall','580f4553-e29a-4d19-989c-1b097b76de48'],
    ['ABBA','Mamma Mia','5e0aa7e4-01cb-441c-9fc2-d89e890cb981'],
  ]
  for (const [artist, title, mbid] of choices) {
    const row = db.get('SELECT entryId FROM catalogueEntries WHERE artist=? COLLATE NOCASE AND title=? COLLATE NOCASE', [artist,title])
    const entry = row ? store.get(row.entryId) : null
    if (!entry?.candidates.some(c => c.id === mbid)) throw new Error(`Inspection candidate absent: ${artist} / ${title}`)
    store.select(entry.entryId, mbid)
    await worker.step(entry.entryId)
    const result = store.get(entry.entryId)
    if (result.proposal) {
      result.proposal.warnings.unshift('Selected for engineering inspection only; identity has not been checked against the karaoke audio. No approval has been recorded.')
      store.update(entry.entryId, { proposal: result.proposal })
    }
    console.log(JSON.stringify({ artist, title, state: result.state, categories: result.proposal?.categories, approved: !!result.approved }))
  }
} finally { close() }
