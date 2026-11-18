import { db } from '../lib/Database.js'
import { validateCategories, type SongCategories } from '../../shared/catalog.js'

export default class Categories {
  static getAll (): Record<number, SongCategories> {
    return Object.fromEntries(db.all<{ songId: number, data: string }>('SELECT songId, data FROM songCategories').map(row => [row.songId, JSON.parse(row.data)]))
  }

  static set (songId: number, input: unknown): SongCategories {
    const categories = validateCategories(input)
    db.run('INSERT INTO songCategories (songId, data) VALUES (?, ?) ON CONFLICT(songId) DO UPDATE SET data = excluded.data', [songId, JSON.stringify(categories)])
    return categories
  }
}
