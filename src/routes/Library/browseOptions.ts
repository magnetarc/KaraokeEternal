import type { Song } from 'shared/types'
import type { BrowseFilters } from './catalogBrowse'
export const filterKeys = ['genre', 'decade', 'language', 'performance', 'collection'] as const
export function browseOptions (songs: Song[], filters?: Pick<BrowseFilters, typeof filterKeys[number]>) {
  const result = { genre: [], decade: [], language: [], performance: [], collection: [] } as Record<typeof filterKeys[number], string[]>
  const values = (song: Song, key: typeof filterKeys[number]) => {
    const c = song.categories
    if (!c) return []
    return (key === 'genre' ? [c.genre, ...c.genres ?? []] : key === 'language' ? [c.language, ...c.languages ?? []] : key === 'collection' ? c.collections ?? [] : [c[key]]).filter(Boolean)
  }
  for (const key of filterKeys) {
    const pool = filters ? songs.filter(song => filterKeys.every(other => other === key || !filters[other] || values(song, other).includes(filters[other]))) : songs
    result[key] = [...new Set(pool.flatMap(song => values(song, key)))].sort()
  }
  return result
}
