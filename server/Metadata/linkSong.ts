import { db, type DatabaseWrapper } from '../lib/Database.js'
import { entryKey, catalogueMatchKey } from '../../shared/metadata.js'

let indexedDatabase: DatabaseWrapper | null = null
let index: Map<string, number[]> | null = null
export function invalidateCatalogueLinkIndex () { index = null }
function candidates (artist: string, title: string, sql: DatabaseWrapper) {
  if (indexedDatabase !== sql || index === null) {
    indexedDatabase = sql; index = new Map()
    for (const row of sql.all<{ entryId: number, artist: string, title: string }>('SELECT entryId,artist,title FROM catalogueEntries')) {
      const key = catalogueMatchKey(row.artist, row.title)
      const ids = index.get(key) ?? []
      ids.push(row.entryId); index.set(key, ids)
    }
  }
  return index.get(catalogueMatchKey(artist, title)) ?? []
}

// Prefer exact identity, then a unique scanner display-article variant.
// Provider suffixes were removed during import; version wording stays intact.
export function linkCatalogueSong (artist: string, title: string, songId: number, sql: DatabaseWrapper = db) {
  let entry = sql.get<{ entryId: number, librarySongId: number | null }>('SELECT entryId,librarySongId FROM catalogueEntries WHERE identityKey=?', [entryKey(artist, title)])
  if (!entry) {
    const matches = candidates(artist, title, sql)
    if (matches.length !== 1) return false
    entry = sql.get('SELECT entryId,librarySongId FROM catalogueEntries WHERE entryId=?', [matches[0]])
  }
  if (!entry || (entry.librarySongId !== null && entry.librarySongId !== songId)) return false
  sql.run('UPDATE catalogueEntries SET librarySongId=? WHERE entryId=?', [songId, entry.entryId])
  sql.run('INSERT OR IGNORE INTO songStars(songId,userId) SELECT ?,userId FROM catalogueStars WHERE entryId=?', [songId, entry.entryId])
  sql.run('DELETE FROM catalogueStars WHERE entryId=?', [entry.entryId])
  return true
}
