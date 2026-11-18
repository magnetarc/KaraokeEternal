import { db, type DatabaseWrapper } from '../lib/Database.js'
import { emptyCategories } from '../../shared/catalog.js'
import { songbookDefaults, type SongbookFilters, type SongbookListing, type SongbookOptions, type SongbookEntry, type SongbookStats } from '../../shared/songbook.js'

export function fullTextQuery (value: string) {
  return value.trim().split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).slice(0, 12).map(w => '"' + w.slice(0, 80).replace(/"/g, '""') + '"*').join(' AND ')
}
export class Songbook {
  constructor (private database: () => DatabaseWrapper = () => db) {}
  get sql () { return this.database() }
  private cachedStats: { version: string, value: SongbookStats } | null = null
  private cachedOptions: { version: string, value: SongbookOptions } | null = null
  private version () { return JSON.stringify([this.sql.get('PRAGMA data_version'), this.sql.get('SELECT total_changes() AS changes')]) }
  stats (): SongbookStats {
    const version = this.version()
    if (this.cachedStats?.version === version) return this.cachedStats.value
    const row = this.sql.get<{ total: number, styled: number, available: number, reviewed: number }>(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(json_extract(categories,'$.genre'),'')<>'' THEN 1 ELSE 0 END) AS styled,
      SUM(available) AS available, SUM(CASE WHEN categorySource IN ('reviewed','library') THEN 1 ELSE 0 END) AS reviewed FROM catalogueBrowse`)
    const value = { total: row.total, styled: row.styled || 0, available: row.available || 0, reviewed: row.reviewed || 0, processed: this.sql.get<{ n: number }>('SELECT COUNT(*) AS n FROM catalogueSuggestions').n }
    this.cachedStats = { version, value }
    return value
  }
  options (): SongbookOptions {
    const version = this.version()
    if (this.cachedOptions?.version === version) return this.cachedOptions.value
    const sets = { genre: new Set<string>(), language: new Set<string>(), decade: new Set<string>(), collection: new Set<string>(), performance: new Set<string>() }
    for (const row of this.sql.all<{ categories: string }>('SELECT categories FROM catalogueBrowse')) {
      const c = { ...emptyCategories, ...JSON.parse(row.categories) }
      for (const v of [c.genre, ...(c.genres ?? [])]) if (v) sets.genre.add(v)
      for (const v of [c.language, ...(c.languages ?? [])]) if (v) sets.language.add(v)
      for (const v of c.collections) sets.collection.add(v)
      if (c.decade) sets.decade.add(c.decade)
      if (c.performance) sets.performance.add(c.performance)
    }
    const value = Object.fromEntries(Object.entries(sets).map(([k, values]) => [k, [...values].sort()])) as unknown as SongbookOptions
    this.cachedOptions = { version, value }
    return value
  }
  list (input: Partial<SongbookFilters>, userId: number, roomId: number | null): SongbookListing {
    const filters = { ...songbookDefaults, ...input }
    const query = String(filters.query).slice(0, 200).trim()
    const offset = Math.max(0, Math.min(1000000, Math.floor(Number(filters.offset) || 0)))
    const conditions: string[] = []; const params: unknown[] = []
    if (query) {
      const match = fullTextQuery(query)
      if (match) { conditions.push('b.entryId IN (SELECT rowid FROM catalogueSearch WHERE catalogueSearch MATCH ?)'); params.push(match) } else conditions.push('0')
    }
    const category = (key: string, plural: string, value: string) => {
      if (!value) return
      conditions.push(`(json_extract(b.categories,'$.${key}')=? OR EXISTS(SELECT 1 FROM json_each(b.categories,'$.${plural}') v WHERE v.value=?))`)
      params.push(String(value).slice(0, 40), String(value).slice(0, 40))
    }
    category('genre', 'genres', filters.genre)
    category('language', 'languages', filters.language)
    if (filters.decade) { conditions.push("json_extract(b.categories,'$.decade')=?"); params.push(String(filters.decade).slice(0, 40)) }
    if (filters.performance) { conditions.push("json_extract(b.categories,'$.performance')=?"); params.push(String(filters.performance).slice(0, 40)) }
    if (filters.collection) { conditions.push("EXISTS(SELECT 1 FROM json_each(b.categories,'$.collections') v WHERE v.value=?)"); params.push(String(filters.collection).slice(0, 40)) }
    const starred = '(EXISTS(SELECT 1 FROM catalogueStars cs WHERE cs.entryId=b.entryId AND cs.userId=?) OR EXISTS(SELECT 1 FROM songStars ss WHERE ss.songId=b.librarySongId AND ss.userId=?))'
    if (filters.favourites) { conditions.push(starred); params.push(userId, userId) }
    if (filters.available) conditions.push('b.available=1')
    if (filters.untagged) conditions.push("COALESCE(json_extract(b.categories,'$.genre'),'')=''")
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''
    const stats = this.stats()
    const total = conditions.length ? this.sql.get<{ n: number }>('SELECT COUNT(*) AS n FROM catalogueBrowse b' + where, params).n : stats.total
    let order = 'b.title COLLATE NOCASE,b.artist COLLATE NOCASE,b.entryId'
    const orderParams: unknown[] = []
    if (filters.sort === 'artist') order = 'b.artist COLLATE NOCASE,b.title COLLATE NOCASE,b.entryId'
    if (filters.sort === 'popular') {
      const escaped = query.toLocaleLowerCase().replace(/[!%_]/g, '!$&')
      const relevance = query ? "CASE WHEN lower(b.title)=? THEN 0 WHEN lower(b.title) LIKE ? ESCAPE '!' THEN 1 WHEN lower(b.title) LIKE ? ESCAPE '!' THEN 2 ELSE 3 END," : ''
      if (query) orderParams.push(query.toLocaleLowerCase(), escaped + '%', '%' + escaped + '%')
      const score = `(b.popularity*20 + 5*(SELECT COUNT(DISTINCT userId) FROM (SELECT userId FROM catalogueStars WHERE entryId=b.entryId UNION SELECT userId FROM songStars WHERE songId=b.librarySongId)) + 2*(SELECT COUNT(*) FROM queue WHERE songId=b.librarySongId AND roomId=?))`
      order = relevance + 'b.featured DESC,' + score + ' DESC,' + order
      orderParams.push(roomId)
    }
    const rows = this.sql.all<Omit<SongbookEntry, 'categories'> & { categories: string }>(`SELECT b.*,${starred} AS starred FROM catalogueBrowse b${where} ORDER BY ${order} LIMIT 40 OFFSET ?`, [userId, userId, ...params, ...orderParams, offset])
    return { entries: rows.map(row => ({ ...row, categories: { ...emptyCategories, ...JSON.parse(row.categories) }, starred: !!row.starred, available: !!row.available, featured: !!row.featured })), total, offset, limit: 40, stats }
  }
  setStar (entryId: number, userId: number, starred: boolean) {
    const entry = this.sql.get<{ librarySongId: number | null }>('SELECT librarySongId FROM catalogueEntries WHERE entryId=?', [entryId])
    if (!entry) throw new Error('Songbook entry not found')
    if (entry.librarySongId) {
      this.sql.run('DELETE FROM catalogueStars WHERE entryId=? AND userId=?', [entryId, userId])
      if (starred) this.sql.run('INSERT OR IGNORE INTO songStars(songId,userId) VALUES (?,?)', [entry.librarySongId, userId])
      else this.sql.run('DELETE FROM songStars WHERE songId=? AND userId=?', [entry.librarySongId, userId])
    } else if (starred) this.sql.run('INSERT INTO catalogueStars(entryId,userId) VALUES (?,?) ON CONFLICT DO NOTHING', [entryId, userId])
    else this.sql.run('DELETE FROM catalogueStars WHERE entryId=? AND userId=?', [entryId, userId])
  }
}
export const songbook = new Songbook()
