import { db } from '../lib/Database.js'
import { validateCategories, type SongCategories } from '../../shared/catalog.js'

export default class Categories {
  static getAll (): Record<number, SongCategories> {
    // Explicit library decisions, including intentional blanks, always win.
    return Object.fromEntries(db.all<{ songId: number, data: string }>(`SELECT librarySongId AS songId,categories AS data FROM catalogueBrowse WHERE librarySongId IS NOT NULL
      UNION ALL SELECT songId,data FROM songCategories`).map(row => [row.songId, JSON.parse(row.data)]))
  }

  static set (songId: number, input: unknown, manual = true): SongCategories {
    const categories = validateCategories(input)
    db.run('INSERT INTO songCategories (songId, data) VALUES (?, ?) ON CONFLICT(songId) DO UPDATE SET data = excluded.data', [songId, JSON.stringify(categories)])
    if (manual) db.run('INSERT INTO categoryProtection(songId,locked,evidence) VALUES (?,1,?) ON CONFLICT(songId) DO UPDATE SET locked=1,evidence=excluded.evidence', [songId, '{}'])
    return categories
  }
}
