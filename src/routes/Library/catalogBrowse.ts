import type { Song, Artist } from 'shared/types'

export type BrowseFilters = { query: string, genre: string, decade: string, language: string, performance: string, collection: string, favourites: boolean, untagged: boolean, sort: string }
export const defaultFilters: BrowseFilters = { query: '', genre: '', decade: '', language: '', performance: '', collection: '', favourites: false, untagged: false, sort: 'popular' }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()

export type Popularity = { songs?: Record<number, number>, artists?: Record<number, number>, queued?: Record<number, number> }
export function browseSongs (songs: Song[], artists: Record<number, Artist>, stars: Set<number>, filters: BrowseFilters, popularity: Popularity = {}): Song[] {
  const words = normalize(filters.query).trim().split(/\s+/).filter(Boolean)
  return songs.filter((song) => {
    const tags = song.categories
    if (filters.favourites && !stars.has(song.songId)) return false
    if (filters.untagged && tags && (tags.genre || tags.language || tags.decade || tags.performance || tags.collections.length)) return false
    for (const key of ['genre', 'decade', 'language', 'performance'] as const) {
      const values = key === 'genre' ? tags?.genres : key === 'language' ? tags?.languages : undefined
      if (filters[key] && tags?.[key] !== filters[key] && !values?.includes(filters[key])) return false
    }
    if (filters.collection && !tags?.collections.includes(filters.collection)) return false
    const haystack = normalize(`${song.title} ${artists[song.artistId]?.name ?? ''}`)
    return words.every(word => haystack.includes(word))
  }).sort((a, b) => {
    if (filters.sort === 'popular') {
      const query = normalize(filters.query).trim()
      const relevance = (s: Song) => !query ? 0 : normalize(s.title) === query ? 0 : normalize(s.title).startsWith(query) ? 1 : normalize(s.title).includes(query) ? 2 : 3
      const text = relevance(a) - relevance(b)
      if (text) return text
      const promoted = Number(!!b.categories?.featured) - Number(!!a.categories?.featured)
      if (promoted) return promoted
      const score = (s: Song) => 20 * (s.recommendation ?? 0) + 8 * Math.log2(1 + (s.completedPlays ?? 0)) + 5 * (popularity.songs?.[s.songId] ?? 0) + (popularity.artists?.[s.artistId] ?? 0)
      const rank = score(b) - score(a)
      if (rank) return rank
    }
    if (filters.sort === 'duration') return a.duration - b.duration || a.songId - b.songId
    if (filters.sort === 'artist') return (artists[a.artistId]?.name ?? '').localeCompare(artists[b.artistId]?.name ?? '') || a.title.localeCompare(b.title)
    return a.title.localeCompare(b.title) || a.songId - b.songId
  })
}
