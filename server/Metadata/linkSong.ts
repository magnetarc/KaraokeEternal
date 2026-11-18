import { db, type DatabaseWrapper } from '../lib/Database.js'
import { entryKey } from '../../shared/metadata.js'

// Exact catalogue identity only. Provider suffixes were removed during import;
// live/remix/version wording remains part of the identity.
export function linkCatalogueSong (artist: string, title: string, songId: number, sql: DatabaseWrapper = db) {
  const entry = sql.get<{ entryId: number, librarySongId: number | null }>('SELECT entryId,librarySongId FROM catalogueEntries WHERE identityKey=?', [entryKey(artist, title)])
  if (!entry || (entry.librarySongId !== null && entry.librarySongId !== songId)) return false
  sql.run('UPDATE catalogueEntries SET librarySongId=? WHERE entryId=?', [songId, entry.entryId])
  sql.run('INSERT OR IGNORE INTO songStars(songId,userId) SELECT ?,userId FROM catalogueStars WHERE entryId=?', [songId, entry.entryId])
  sql.run('DELETE FROM catalogueStars WHERE entryId=?', [entry.entryId])
  return true
}
