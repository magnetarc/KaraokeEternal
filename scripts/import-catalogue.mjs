// Read a song book; write ONLY the marked local preview database and project reports.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const source = fileURLToPath(new URL('../', import.meta.url))
const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/import-catalogue.mjs <CSV path> [encoding=utf-8]')
if (existsSync(path.join(source, '.test-instance/preview-server.pid'))) throw new Error('Stop the preview server before the offline import')
const { initLogger } = await import('../build/server/lib/Log.js')
initLogger('catalogue-import', { console: { level: 2 }, file: { level: 0 } })
const { open, close } = await import('../build/server/lib/Database.js')
const { MetadataStore } = await import('../build/server/Metadata/Store.js')
const { parseCsv, validateInput } = await import('../build/shared/metadata.js')
const db = open({ file: path.join(source, '.test-instance/database.sqlite3'), ro: false })
try {
  if (db.get("SELECT data FROM prefs WHERE key='modernTestInstance'")?.data !== 'true') throw new Error('Refusing an unmarked database')
  const bytes = readFileSync(input)
  const encoding = process.argv[3] ?? 'utf-8'
  const rows = parseCsv(new TextDecoder(encoding, { fatal: true }).decode(bytes))
  const header = rows.shift().map(s => s.trim().toLowerCase())
  const ai = header.indexOf('artist'); const ti = header.indexOf('title')
  if (ai < 0 || ti < 0) throw new Error('CSV must have Artist and Title headings')
  const store = new MetadataStore(() => db)
  const valid = []; const issues = []
  for (const [i, row] of rows.entries()) {
    try { valid.push(validateInput({ artist: row[ai], title: row[ti], source: path.basename(input) })) } catch (err) { issues.push({ row: i + 2, artist: row[ai], title: row[ti], error: err.message }) }
  }
  const out = path.join(root, 'Catalogue')
  mkdirSync(out, { recursive: true })
  copyFileSync(input, path.join(out, 'Rigmar-source.csv'))
  let added = 0; let variants = 0
  for (let i = 0; i < valid.length; i += 100) {
    const result = store.import(valid.slice(i, i + 100)); added += result.added; variants += result.variants
  }
  const counts = store.list().counts
  const report = { importedAt: new Date().toISOString(), sourceFile: path.basename(input), encoding, sourceBytes: bytes.length, sourceRows: rows.length, validRows: valid.length, quarantinedRows: issues.length, added, addedSourceVariants: variants, counts, issues }
  writeFileSync(path.join(out, 'import-report.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.join(out, 'normalised-songbook.json'), JSON.stringify(valid))
  console.log(JSON.stringify({ ...report, issues: issues.slice(0, 5) }, null, 2))
} finally { close() }
