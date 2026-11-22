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
  it('keeps cached search text current after title or artist changes', () => {
    const song = { ...songs[0] }
    const names = { 1: { ...artists[1] } }
    const find = (query: string) => browseSongs([song], names, new Set(), { ...defaultFilters, query })
    expect(find('beyonce night')).toEqual([song])
    names[1] = { ...names[1], name: 'New Singer' }
    expect(find('beyonce')).toEqual([])
    expect(find('new night')).toEqual([song])
    song.title = 'Morning Light'
    expect(find('night')).toEqual([])
    expect(find('new morning')).toEqual([song])
  })
  it('recalculates recommendations and stars even when search text is cached', () => {
    const options = songs.map(song => ({ ...song, title: 'Perfect', categories: { ...emptyCategories } }))
    const filters = { ...defaultFilters, query: 'perfect' }
    expect(browseSongs(options, artists, new Set(), filters)[0].songId).toBe(1)
    options[1].completedPlays = 10
    expect(browseSongs(options, artists, new Set(), filters)[0].songId).toBe(2)
    expect(browseSongs(options, artists, new Set([1]), { ...filters, favourites: true }).map(song => song.songId)).toEqual([1])
  })
  it('seeds category recommendations before history exists and learns from completed plays', () => {
    const seeded = [{ ...songs[0], title: 'Zulu', recommendation: 3 }, { ...songs[1], title: 'Alpha', recommendation: 0 }]
    expect(browseSongs(seeded, artists, new Set(), defaultFilters).map(s => s.title)).toEqual(['Zulu', 'Alpha'])
    const learned = seeded.map(s => ({ ...s, recommendation: 1, completedPlays: s.title === 'Zulu' ? 4 : 0 }))
    expect(browseSongs(learned, artists, new Set(), defaultFilters).map(s => s.title)).toEqual(['Zulu', 'Alpha'])
  })
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
  it('puts a promoted Perfect by Ed Sheeran above other exact matches, while keeping all matches', () => {
    const options: Song[] = [
      { ...songs[0], songId: 10, artistId: 2, title: 'Perfect', categories: { ...emptyCategories, featured: false } },
      { ...songs[0], songId: 11, artistId: 3, title: 'Perfect', categories: { ...emptyCategories, featured: true } },
      { ...songs[0], songId: 12, artistId: 3, title: 'Perfectly Fine', categories: { ...emptyCategories, featured: true } },
    ]
    const names = { 2: { artistId: 2, name: 'Other artist', songIds: [10] }, 3: { artistId: 3, name: 'Ed Sheeran', songIds: [11, 12] } }
    expect(browseSongs(options, names, new Set(), { ...defaultFilters, query: 'perfect' }, { songs: { 10: 100 } }).map(s => s.songId)).toEqual([11, 10, 12])
    expect(browseSongs(options.map(s => ({ ...s, categories: { ...emptyCategories } })), names, new Set(), { ...defaultFilters, query: 'perfect' }, { songs: { 11: 8 } }).map(s => s.songId)).toEqual([11, 10, 12])
  })
})
