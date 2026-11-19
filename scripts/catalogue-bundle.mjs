// Portable metadata only: never copies users, passwords, sessions, queues or media paths.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
const { values, positionals } = parseArgs({ allowPositionals: true, options: { database: { type: 'string' }, bundle: { type: 'string' }, 'isolated-test': { type: 'boolean' }, 'fresh-instance': { type: 'boolean' } } })
const [command] = positionals
if (!['export', 'import'].includes(command) || !values.database || !values.bundle) throw new Error('Usage: node scripts/catalogue-bundle.mjs export|import --database ABSOLUTE_PATH --bundle ABSOLUTE_PATH [--fresh-instance|--isolated-test]')
if (!path.isAbsolute(values.database) || !path.isAbsolute(values.bundle)) throw new Error('Use absolute paths')
if (command === 'export') {
  const db = new DatabaseSync(values.database, { readOnly: true })
  try {
    db.exec('BEGIN')
    const sources = new Map()
    for (const row of db.prepare('SELECT entryId,data FROM catalogueSources ORDER BY entryId,sourceKey').all()) {
      if (!sources.has(row.entryId)) sources.set(row.entryId, [])
      sources.get(row.entryId).push(JSON.parse(row.data))
    }
    const suggestions = new Map(db.prepare('SELECT entryId,data,model,updatedAt FROM catalogueSuggestions').all().map(r => [r.entryId, { data: JSON.parse(r.data), model: r.model, updatedAt: r.updatedAt }]))
    const entries = db.prepare('SELECT entryId,artist,title,data FROM catalogueEntries ORDER BY entryId').all().map(row => {
      const saved = JSON.parse(row.data)
      // Only persisted metadata decisions, no desktop user identifiers or transient jobs.
      const data = Object.fromEntries(['approved','discoveryFeatured','selected','proposal'].filter(k => saved[k] !== undefined).map(k => [k, saved[k]]))
      return { artist: row.artist, title: row.title, data, sources: sources.get(row.entryId) ?? [], suggestion: suggestions.get(row.entryId) ?? null }
    })
    const artists = db.prepare('SELECT artist,data,updatedAt FROM artistContexts ORDER BY artist').all().map(row => ({ ...row, data: JSON.parse(row.data) }))
    const bundle = { schema: 1, kind: 'karaoke-modern-metadata-only', exportedAt: new Date().toISOString(), entries, artists }
    const body = JSON.stringify(bundle)
    writeFileSync(values.bundle, body)
    console.log(JSON.stringify({ entries: entries.length, sources: [...sources.values()].reduce((n, rows) => n + rows.length, 0), suggestions: suggestions.size, artists: artists.length, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') }))
    db.exec('COMMIT')
  } finally { db.close() }
} else {
  if (!!values['isolated-test'] === !!values['fresh-instance']) throw new Error('Import requires exactly one of --fresh-instance or --isolated-test')
  const marker = values['isolated-test'] ? 'modernTestInstance' : 'modernManagedInstance'
  const otherMarker = values['isolated-test'] ? 'modernManagedInstance' : 'modernTestInstance'
  const raw = readFileSync(values.bundle)
  if (raw.length > 300 * 1024 * 1024) throw new Error('Metadata bundle exceeds 300 MB')
  const bundle = JSON.parse(raw)
  if (bundle.schema !== 1 || bundle.kind !== 'karaoke-modern-metadata-only' || !Array.isArray(bundle.entries) || bundle.entries.length > 200000 || !Array.isArray(bundle.artists)) throw new Error('Invalid metadata bundle')
  const { identity, entryKey, validateInput } = await import('../build/shared/metadata.js')
  const { validateCategories } = await import('../build/shared/catalog.js')
  // Validate everything before opening or mutating the destination.
  const entries = bundle.entries.map(entry => {
    const input = validateInput(entry)
    const approved = entry.data?.approved ? validateCategories(entry.data.approved) : null
    const suggestion = entry.suggestion ? { ...entry.suggestion, data: { ...entry.suggestion.data, categories: validateCategories(entry.suggestion.data.categories) } } : null
    const sources = entry.sources.map(validateInput)
    if (sources.length > 2000 || sources.some(s => entryKey(s.artist, s.title) !== entryKey(input.artist, input.title))) throw new Error('Source identity differs from entry')
    return { input, approved, featured: entry.data?.discoveryFeatured === true, suggestion, sources }
  })
  const { initLogger } = await import('../build/server/lib/Log.js')
  initLogger('metadata-bundle', { console: { level: 1 }, file: { level: 0 } })
  const { DatabaseWrapper } = await import('../build/server/lib/Database.js')
  mkdirSync(path.dirname(values.database), { recursive: true })
  const db = new DatabaseWrapper(values.database)
  try {
    const hasPrefs = db.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='prefs'")
    if (hasPrefs && (db.get('SELECT data FROM prefs WHERE key=?', [marker])?.data !== 'true' || db.get('SELECT data FROM prefs WHERE key=?', [otherMarker])?.data === 'true')) throw new Error('Refusing an existing database without the matching instance marker')
    if (!hasPrefs && db.get("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").n !== 0) throw new Error('Refusing an unknown existing database')
    db.migrate({ migrationsPath: path.resolve(import.meta.dirname, '../build/server/lib/schemas') })
    db.exec('PRAGMA busy_timeout=10000; BEGIN IMMEDIATE')
    let added = 0; let suggestions = 0
    try {
      db.run('INSERT OR IGNORE INTO prefs(key,data) VALUES (?,?)', [marker, 'true'])
      const links = new Map(db.all('SELECT songs.songId,artists.name,songs.title FROM songs JOIN artists USING(artistId)').map(r => [entryKey(r.name, r.title), r.songId]))
      for (const { input, approved, featured, suggestion, sources } of entries) {
        const key = entryKey(input.artist, input.title)
        const inserted = db.run('INSERT INTO catalogueEntries(identityKey,artist,title,librarySongId) VALUES (?,?,?,?) ON CONFLICT DO NOTHING', [key, input.artist, input.title, links.get(key) ?? null])
        added += Number(inserted.changes)
        const row = db.get('SELECT entryId,data FROM catalogueEntries WHERE identityKey=?', [key])
        // Existing reviews/pins are kept. Portable approvals apply only to newly inserted entries.
        if (inserted.changes) db.run('UPDATE catalogueEntries SET data=?,state=? WHERE entryId=?', [JSON.stringify({ ...(approved ? { approved } : {}), discoveryFeatured: featured }), approved ? 'approved' : 'new', row.entryId])
        for (const source of sources) db.run('INSERT OR IGNORE INTO catalogueSources(entryId,sourceKey,data) VALUES (?,?,?)', [row.entryId, JSON.stringify([source.source, source.sourceTitle, source.provider]), JSON.stringify(source)])
        if (suggestion) suggestions += Number(db.run('INSERT INTO catalogueSuggestions(entryId,data,model,updatedAt) VALUES (?,?,?,?) ON CONFLICT DO NOTHING', [row.entryId, JSON.stringify(suggestion.data), String(suggestion.model).slice(0, 80), suggestion.updatedAt]).changes)
      }
      for (const row of bundle.artists) {
        if (typeof row.artist !== 'string' || !identity(row.artist) || !row.data || typeof row.data !== 'object') throw new Error('Invalid artist context')
        db.run('INSERT INTO artistContexts(artist,data,updatedAt) VALUES (?,?,?) ON CONFLICT DO NOTHING', [row.artist, JSON.stringify(row.data), row.updatedAt])
      }
      db.exec('COMMIT')
      console.log(JSON.stringify({ entries: entries.length, added, suggestions, artists: bundle.artists.length, metadataOnly: true }))
    } catch (err) { db.exec('ROLLBACK'); throw err }
  } finally { db.close() }
}
