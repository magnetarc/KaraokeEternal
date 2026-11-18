import { db, type DatabaseWrapper } from '../lib/Database.js'
import Library from '../Library/Library.js'
import { emptyCategories, validateCategories, type SongCategories } from '../../shared/catalog.js'
import { entryKey, validateInput, type CatalogueEntry, type EntryState, type Proposal } from '../../shared/metadata.js'
import { invalidateCatalogueLinkIndex } from './linkSong.js'

type Row = { entryId: number, artist: string, title: string, librarySongId: number | null, state: EntryState, data: string, attempts: number, nextAttempt: number, variants?: number }
export class MetadataStore {
  constructor (private database: () => DatabaseWrapper = () => db) {}
  get sql () { return this.database() }
  unpack (row: Row): CatalogueEntry {
    return { candidates: [], selected: '', proposal: null, error: '', variants: 0, ...JSON.parse(row.data), ...row, data: undefined } as CatalogueEntry
  }
  get (id: number) {
    const row = this.sql.get<Row>('SELECT *, (SELECT COUNT(*) FROM catalogueSources s WHERE s.entryId=e.entryId) AS variants FROM catalogueEntries e WHERE entryId=?', [id])
    if (!row) throw new Error('Catalogue entry not found')
    return this.unpack(row)
  }
  update (id: number, patch: Partial<CatalogueEntry>) {
    const entry = { ...this.get(id), ...patch }
    const { entryId, artist, title, librarySongId, state, attempts, nextAttempt, variants, ...data } = entry
    this.sql.run('UPDATE catalogueEntries SET state=?, data=?, attempts=?, nextAttempt=? WHERE entryId=?', [state, JSON.stringify(data), attempts, nextAttempt, id])
    return this.get(id)
  }
  list (query = '', state = '', offset = 0) {
    const pattern = '%' + query.replace(/[!%_]/g, '!$&') + '%'
    const params = [pattern, pattern, state, state]
    const where = "WHERE (artist LIKE ? ESCAPE '!' OR title LIKE ? ESCAPE '!') AND (?='' OR state=?)"
    const total = this.sql.get<{ n: number }>('SELECT COUNT(*) AS n FROM catalogueEntries ' + where, params).n
    const entries = this.sql.all<Row>('SELECT *, (SELECT COUNT(*) FROM catalogueSources s WHERE s.entryId=e.entryId) AS variants FROM catalogueEntries e ' + where + ' ORDER BY entryId LIMIT 30 OFFSET ?', [...params, offset]).map(r => {
      const entry = this.unpack(r)
      // Lists need counts, not all 100 candidates for every song on each poll.
      return { ...entry, candidateCount: entry.candidates.length, candidates: entry.candidates.slice(0, 1) }
    })
    const counts = Object.fromEntries(this.sql.all<{ state: string, n: number }>('SELECT state, COUNT(*) AS n FROM catalogueEntries GROUP BY state').map(r => [r.state, r.n]))
    return { entries, total, counts, cacheSize: this.sql.get<{ n: number }>('SELECT COUNT(*) AS n FROM musicbrainzCache').n }
  }
  import (input: unknown, links: Map<string, number> = new Map()) {
    if (!Array.isArray(input) || input.length < 1 || input.length > 100) throw new Error('Import 1–100 entries per batch')
    const rows = input.map(validateInput) // validate whole batch before writing
    let added = 0; let variants = 0
    this.sql.exec('BEGIN IMMEDIATE')
    try {
      for (const row of rows) {
        const key = entryKey(row.artist, row.title)
        const songId = links.get(key) ?? null
        added += Number(this.sql.run('INSERT INTO catalogueEntries(identityKey,artist,title,librarySongId) VALUES (?,?,?,?) ON CONFLICT(identityKey) DO NOTHING', [key, row.artist, row.title, songId]).changes)
        const { entryId } = this.sql.get<{ entryId: number }>('SELECT entryId FROM catalogueEntries WHERE identityKey=?', [key])
        if (songId) this.sql.run('UPDATE catalogueEntries SET librarySongId=? WHERE entryId=? AND librarySongId IS NULL', [songId, entryId])
        variants += Number(this.sql.run('INSERT INTO catalogueSources(entryId,sourceKey,data) VALUES (?,?,?) ON CONFLICT DO NOTHING', [entryId, JSON.stringify([row.source, row.sourceTitle, row.provider]), JSON.stringify(row)]).changes)
      }
      this.sql.exec('COMMIT')
      if (added) invalidateCatalogueLinkIndex()
    } catch (err) { this.sql.exec('ROLLBACK'); throw err }
    return { added, variants, rows: rows.length }
  }
  sources (id: number) { return this.sql.all<{ data: string }>('SELECT data FROM catalogueSources WHERE entryId=? ORDER BY sourceKey', [id]).map(r => JSON.parse(r.data)) }
  queue (ids: unknown) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 25 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Select 1–25 entries')
    const entries = ids.map(id => this.get(id))
    for (const entry of entries) {
      if (['new', 'failed'].includes(entry.state)) this.update(entry.entryId, { state: 'queued', attempts: 0, nextAttempt: 0, error: '' })
    }
  }
  recover () { this.sql.run("UPDATE catalogueEntries SET state='queued' WHERE state='working'") }
  next (entryId?: number) {
    const row = this.sql.get<Row>("SELECT * FROM catalogueEntries WHERE state='queued' AND nextAttempt<=? AND (? IS NULL OR entryId=?) ORDER BY entryId LIMIT 1", [Date.now(), entryId ?? null, entryId ?? null])
    return row ? this.unpack(row) : null
  }
  select (id: number, recordingId: string) {
    const entry = this.get(id)
    if (entry.state === 'working') throw new Error('Wait for this lookup to finish')
    if (!entry.candidates.some(c => c.id === recordingId)) throw new Error('Choose one of this entry’s search results')
    return this.update(id, { selected: recordingId, proposal: null, approved: undefined, applied: [], skipped: [], state: 'queued', attempts: 0, nextAttempt: 0, error: '' })
  }
  approve (id: number, input: unknown, userId: number) {
    // Search wording is stored separately from the immutable source entries.
    const entry = this.get(id)
    const body = input as { confirmed?: boolean, categories?: unknown, apply?: boolean }
    if (!entry.proposal || !['review', 'approved'].includes(entry.state) || body?.confirmed !== true) throw new Error('Confirm the recording match before approving')
    const categories = validateCategories(body.categories)
    const proposal = entry.proposal
    for (const [plural, single] of [['genres', 'genre'], ['languages', 'language']] as const) {
      const allowed = proposal.categories[plural] ?? [proposal.categories[single]].filter(Boolean)
      if ((categories[plural] ?? [categories[single]].filter(Boolean)).some(v => !allowed.includes(v))) throw new Error(`Choose ${plural} from the source evidence`)
    }
    if (categories.decade && categories.decade !== proposal.categories.decade) throw new Error('Choose the proposed decade or leave it unknown')
    const applied: string[] = []; const skipped: string[] = []
    this.sql.exec('BEGIN IMMEDIATE')
    try {
      if (body.apply && entry.librarySongId) {
        const songId = entry.librarySongId
        const locked = this.sql.get<{ locked: number }>('SELECT locked FROM categoryProtection WHERE songId=?', [songId])?.locked
        const old = this.sql.get<{ data: string }>('SELECT data FROM songCategories WHERE songId=?', [songId])
        const current: SongCategories = old ? JSON.parse(old.data) : { ...emptyCategories }
        const merged = { ...current }
        for (const key of ['genre', 'language', 'decade', 'performance', 'collections', 'genres', 'languages'] as const) {
          const value = categories[key]
          if (!(Array.isArray(value) ? value.length : value)) continue
          if (locked || (Array.isArray(current[key]) ? current[key].length : current[key])) { skipped.push(key); continue }
          Object.assign(merged, { [key]: value }); applied.push(key)
        }
        this.sql.run('INSERT INTO songCategories(songId,data) VALUES (?,?) ON CONFLICT(songId) DO UPDATE SET data=excluded.data', [songId, JSON.stringify(merged)])
        const oldEvidence = this.sql.get<{ evidence: string }>('SELECT evidence FROM categoryProtection WHERE songId=?', [songId])
        const evidence = { ...(oldEvidence ? JSON.parse(oldEvidence.evidence) : {}), [String(id)]: { applied, proposal, approved: categories } }
        this.sql.run('INSERT INTO categoryProtection(songId,locked,evidence) VALUES (?,0,?) ON CONFLICT(songId) DO UPDATE SET evidence=excluded.evidence', [songId, JSON.stringify(evidence)])
      }
      const reviewedAt = new Date().toISOString()
      this.update(id, { state: 'approved', approved: categories, applied, skipped, reviewedBy: userId, reviewedAt })
      this.sql.run('INSERT INTO catalogueReviews(entryId,userId,reviewedAt,action,data) VALUES (?,?,?,?,?)', [id, userId, reviewedAt, 'approve', JSON.stringify({ categories, applied, skipped, recordingId: proposal.recording.id, evidence: proposal.evidence })])
      this.sql.exec('COMMIT')
    } catch (err) { this.sql.exec('ROLLBACK'); throw err }
    return this.get(id)
  }
  reject (id: number, userId: number) {
    if (this.get(id).state === 'working') throw new Error('Wait for this lookup to finish')
    this.update(id, { state: 'rejected' })
    this.sql.run('INSERT INTO catalogueReviews(entryId,userId,reviewedAt,action,data) VALUES (?,?,?,?,?)', [id, userId, new Date().toISOString(), 'reject', '{}'])
  }
  search (id: number, input: unknown) {
    if (this.get(id).state === 'working') throw new Error('Wait for this lookup to finish')
    const row = validateInput(input)
    return this.update(id, { searchArtist: row.artist, searchTitle: row.title, candidates: [], selected: '', proposal: null, approved: undefined, applied: [], skipped: [], state: 'queued', attempts: 0, nextAttempt: 0, error: '' })
  }
  export () {
    return this.sql.all<Row>("SELECT *, (SELECT COUNT(*) FROM catalogueSources s WHERE s.entryId=e.entryId) AS variants FROM catalogueEntries e WHERE state='approved' ORDER BY entryId").map(r => ({ ...this.unpack(r), sources: this.sources(r.entryId) }))
  }
}

export const metadataStore = new MetadataStore()
export function libraryLinks () {
  const lib = Library.get()
  const links = new Map<string, number>(); const ambiguous = new Set<string>()
  for (const id of lib.songs.result) {
    const s = lib.songs.entities[id]
    let row
    try { row = validateInput({ artist: lib.artists.entities[s.artistId].name, title: s.title }) } catch { continue }
    const key = entryKey(row.artist, row.title)
    if (links.has(key)) ambiguous.add(key)
    links.set(key, id)
  }
  for (const key of ambiguous) links.delete(key)
  return links
}
