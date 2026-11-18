import { describe, expect, it } from 'vitest'
import { browseSongs, defaultFilters } from './catalogBrowse'
import type { Song } from 'shared/types'
import { emptyCategories } from 'shared/catalog'
const artists = { 1: { artistId: 1, name: 'Beyoncé Demo', songIds: [1, 2] } }
const songs: Song[] = [
  { artistId: 1, songId: 1, title: 'One More Night', duration: 180, numMedia: 1, categories: { ...emptyCategories, genre: 'Pop', decade: '1980s', performance: 'Duet', collections: ['Party'] } },
  { artistId: 1, songId: 2, title: 'Another Dawn', duration: 120, numMedia: 1 },
]
describe('modern song browser', () => {
  it('searches artist and title words together, ignoring accents and casing', () => {
    expect(browseSongs(songs, artists, new Set(), { ...defaultFilters, query: 'BEYONCE night' }).map(s => s.songId)).toEqual([1])
  })
  it('combines categories and favourites', () => {
    expect(browseSongs(songs, artists, new Set([1]), { ...defaultFilters, favourites: true, genre: 'Pop', performance: 'Duet', collection: 'Party' }).map(s => s.songId)).toEqual([1])
    expect(browseSongs(songs, artists, new Set(), { ...defaultFilters, favourites: true, genre: 'Pop' })).toEqual([])
  })
  it('keeps untagged songs discoverable', () => expect(browseSongs(songs, artists, new Set(), { ...defaultFilters, untagged: true }).map(s => s.songId)).toEqual([2]))
  it('sorts without mutating the received library', () => {
    expect(browseSongs(songs, artists, new Set(), { ...defaultFilters, sort: 'duration' }).map(s => s.songId)).toEqual([2, 1])
    expect(songs.map(s => s.songId)).toEqual([1, 2])
  })
})
