import type { Song, Artist } from 'shared/types'

export type BrowseFilters = { query: string, genre: string, decade: string, language: string, performance: string, collection: string, favourites: boolean, untagged: boolean, sort: string }
export const defaultFilters: BrowseFilters = { query: '', genre: '', decade: '', language: '', performance: '', collection: '', favourites: false, untagged: false, sort: 'title' }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()

export function browseSongs (songs: Song[], artists: Record<number, Artist>, stars: Set<number>, filters: BrowseFilters): Song[] {
  const words = normalize(filters.query).trim().split(/\s+/).filter(Boolean)
  return songs.filter(song => {
    const tags = song.categories
    if (filters.favourites && !stars.has(song.songId)) return false
    if (filters.untagged && tags && (tags.genre || tags.language || tags.decade || tags.performance || tags.collections.length)) return false
    for (const key of ['genre', 'decade', 'language', 'performance'] as const) {
      if (filters[key] && tags?.[key] !== filters[key]) return false
    }
    if (filters.collection && !tags?.collections.includes(filters.collection)) return false
    const haystack = normalize(`${song.title} ${artists[song.artistId]?.name ?? ''}`)
    return words.every(word => haystack.includes(word))
  }).sort((a, b) => {
    if (filters.sort === 'duration') return a.duration - b.duration || a.songId - b.songId
    if (filters.sort === 'artist') return (artists[a.artistId]?.name ?? '').localeCompare(artists[b.artistId]?.name ?? '') || a.title.localeCompare(b.title)
    return a.title.localeCompare(b.title) || a.songId - b.songId
  })
}
