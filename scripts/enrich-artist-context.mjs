// Public, batched artist-style context. These are not song-level genre facts.
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const source = fileURLToPath(new URL('../', import.meta.url))
const output = fileURLToPath(new URL('../../Catalogue/musicbrainz-artists-report.json', import.meta.url))
if (existsSync(path.join(source, '.test-instance/preview-server.pid'))) throw new Error('Stop preview before offline enrichment')
const { initLogger } = await import('../build/server/lib/Log.js')
initLogger('artist-context', { console: { level: 2 }, file: { level: 0 } })
const { open, close } = await import('../build/server/lib/Database.js')
const { MusicBrainzClient, LookupError, quoteQuery } = await import('../build/server/Metadata/MusicBrainz.js')
const { identity } = await import('../build/shared/metadata.js')
const db = open({ file: path.join(source, '.test-instance/database.sqlite3'), ro: false })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
function broadStyles(tags) {
  const scores = new Map()
  const mappings = [
    ['Rock',/rock/i],['Pop',/\bpop\b|europop|synthpop/i],['Country',/country|bluegrass|honky.tonk/i],
    ['R&B/Soul',/rhythm.and.blues|r&b|\bsoul\b|motown/i],['Hip-Hop/Rap',/hip.hop|\brap\b/i],
    ['Dance/Electronic',/electronic|\bdance\b|techno|\bhouse\b|trance|dubstep|drum.and.bass/i],
    ['Jazz/Swing',/jazz|swing|big.band/i],['Blues',/\bblues\b/i],['Folk/Acoustic',/\bfolk\b|\bacoustic\b/i],
    ['Reggae/Ska',/reggae|\bska\b/i],['Latin',/\blatin\b|salsa|bachata|reggaeton/i],['Classical/Opera',/classical|opera|operatic/i],
    ['Musical Theatre',/musical.theat|broadway/i],['Film/TV',/soundtrack|film.score/i],["Children's",/children|nursery/i],
    ['Gospel/Christian',/gospel|christian|worship/i],['World',/world.music/i],['Easy Listening',/easy.listening|crooner|traditional.pop/i],
    ['Punk',/punk/i],['Metal',/metal/i],['Disco',/disco/i],['Funk',/\bfunk\b/i],
  ]
  for (const tag of tags) {
    if (!Number.isFinite(tag.count) || tag.count <= 0 || typeof tag.name !== 'string') continue
    for (const [style, regex] of mappings) if (regex.test(tag.name)) scores.set(style, (scores.get(style) ?? 0) + tag.count)
  }
  return [...scores].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([style])=>style)
}
let stopped = false
process.on('SIGINT', () => { stopped = true })
try {
  if (db.get("SELECT data FROM prefs WHERE key='modernTestInstance'")?.data !== 'true') throw new Error('Unmarked database')
  db.exec('PRAGMA busy_timeout=10000')
  const rows = db.all("SELECT artist,COUNT(*) AS songs FROM catalogueEntries WHERE artist NOT IN (SELECT artist FROM artistContexts) GROUP BY artist ORDER BY songs DESC,artist")
  const client = new MusicBrainzClient()
  let batches = 0
  for (let offset = 0; offset < rows.length && !stopped; offset += 12) {
    const batch = rows.slice(offset,offset+12)
    let response = null; let error = ''
    for (let attempt = 0; attempt < 4 && !stopped; attempt++) {
      try {
        response = await client.get('artist', { query: `artist:(${batch.map(r=>quoteQuery(r.artist)).join(' OR ')})`, limit:'100' })
        break
      } catch (err) {
        error = err.message
        if (!(err instanceof LookupError) || !err.retryable) break
        await wait(Math.max(err.retryAfter, 3000*2**attempt) + Math.floor(Math.random()*1000))
      }
    }
    if (stopped) break
    const stamp = new Date().toISOString()
    const normal = s => identity(s).replace(/^the /,'')
    for (const row of batch) {
      const matches = (response?.data.artists ?? []).filter(a=>normal(a.name ?? '')===normal(row.artist))
      const artist = matches.length===1 ? matches[0] : null
      const data = { kind:'artist_style_context', state:response ? artist ? 'candidate' : matches.length ? 'ambiguous' : 'missing' : 'failed',
        artistId:artist?.id ?? null, name:artist?.name ?? '', disambiguation:artist?.disambiguation ?? '',
        styles:artist ? broadStyles(artist.tags ?? []) : [], tags:artist?.tags ?? [],
        url:response?.url ?? '', retrievedAt:response?.retrievedAt ?? stamp,
        error:response ? '' : error, reviewed:false, warning:'Artist-style context only; matching text is not a reviewed identity or a song-level genre.' }
      db.run('INSERT INTO artistContexts(artist,data,updatedAt) VALUES (?,?,?) ON CONFLICT(artist) DO UPDATE SET data=excluded.data,updatedAt=excluded.updatedAt',[row.artist,JSON.stringify(data),stamp])
    }
    batches++
    const counts = db.all("SELECT json_extract(data,'$.state') AS state,COUNT(*) AS n FROM artistContexts GROUP BY state")
    const report = { updatedAt:stamp, batchesThisRun:batches, remaining:Math.max(0,rows.length-offset-batch.length), counts, kind:'Unreviewed artist-style context; no song-level fields or approvals changed.' }
    writeFileSync(output,JSON.stringify(report,null,2))
    if (batches%10===0) console.log(JSON.stringify(report))
  }
} finally { close() }
