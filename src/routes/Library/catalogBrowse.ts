import type { Song, Artist } from 'shared/types'

export type BrowseFilters = { query: string, genre: string, decade: string, language: string, performance: string, collection: string, favourites: boolean, untagged: boolean, sort: string }
export const defaultFilters: BrowseFilters = { query: '', genre: '', decade: '', language: '', performance: '', collection: '', favourites: false, untagged: false, sort: 'popular' }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
const textCache = new WeakMap<Song, { title: string, artist: string, normalizedTitle: string, haystack: string }>()
function searchText (song: Song, artists: Record<number, Artist>) {
  const artist = artists[song.artistId]?.name ?? ''
  const previous = textCache.get(song)
  if (previous?.title === song.title && previous.artist === artist) return previous
  const text = { title: song.title, artist, normalizedTitle: normalize(song.title), haystack: normalize(`${song.title} ${artist}`) }
  textCache.set(song, text)
  return text
}

export type Popularity = { songs?: Record<number, number>, artists?: Record<number, number>, queued?: Record<number, number> }
export function browseSongs (songs: Song[], artists: Record<number, Artist>, stars: Set<number>, filters: BrowseFilters, popularity: Popularity = {}): Song[] {
  const query = normalize(filters.query).trim()
  const words = query.split(/\s+/).filter(Boolean)
  const matches = songs.filter((song) => {
    const tags = song.categories
    if (filters.favourites && !stars.has(song.songId)) return false
    if (filters.untagged && tags && (tags.genre || tags.language || tags.decade || tags.performance || tags.collections.length)) return false
    for (const key of ['genre', 'decade', 'language', 'performance'] as const) {
      const values = key === 'genre' ? tags?.genres : key === 'language' ? tags?.languages : undefined
      if (filters[key] && tags?.[key] !== filters[key] && !values?.includes(filters[key])) return false
    }
    if (filters.collection && !tags?.collections.includes(filters.collection)) return false
    if (!words.length) return true
    const { haystack } = searchText(song, artists)
    return words.every(word => haystack.includes(word))
  })
  const compare = (a: Song, b: Song) => {
    if (filters.sort === 'duration') return a.duration - b.duration || a.songId - b.songId
    if (filters.sort === 'artist') return (artists[a.artistId]?.name ?? '').localeCompare(artists[b.artistId]?.name ?? '') || a.title.localeCompare(b.title)
    return a.title.localeCompare(b.title) || a.songId - b.songId
  }
  if (filters.sort !== 'popular') return matches.sort(compare)
  // Compute each song's text rank and score once, rather than normalising strings
  // again on every comparison in a full-library sort.
  return matches.map((song) => {
    const title = query ? searchText(song, artists).normalizedTitle : ''
    return {
      song,
      relevance: !query || title === query ? 0 : title.startsWith(query) ? 1 : title.includes(query) ? 2 : 3,
      featured: Number(!!song.categories?.featured),
      score: 20 * (song.recommendation ?? 0) + 8 * Math.log2(1 + (song.completedPlays ?? 0)) + 5 * (popularity.songs?.[song.songId] ?? 0) + (popularity.artists?.[song.artistId] ?? 0),
    }
  }).sort((a, b) => a.relevance - b.relevance || b.featured - a.featured || b.score - a.score || compare(a.song, b.song)).map(row => row.song)
}
