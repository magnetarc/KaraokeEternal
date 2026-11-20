import path from 'node:path'
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { DatabaseWrapper } from '../lib/Database.js'
import { MetadataStore } from './Store.js'
import { Songbook, fullTextQuery } from './Songbook.js'
import { emptyCategories } from '../../shared/catalog.js'
import { linkCatalogueSong } from './linkSong.js'
import MetaParser from '../Scanner/MetaParser/MetaParser.js'
let db: DatabaseWrapper
let book: Songbook
let store: MetadataStore
beforeEach(() => {
  db = new DatabaseWrapper(':memory:')
  db.migrate({ migrationsPath: path.resolve(import.meta.dirname, '../lib/schemas') })
  db.run('INSERT INTO users(username,password,name,roleId) VALUES (\'a\',\'not-a-real-password\',\'A\',1),(\'b\',\'not-a-real-password\',\'B\',3)')
  book = new Songbook(() => db)
  store = new MetadataStore(() => db)
  store.import([{ artist: 'Ed Sheeran', title: 'Perfect' }, { artist: 'Other singer', title: 'Perfect' }, { artist: 'Beyoncé', title: 'Perfectly Good' }])
  for (const [id, popularity, genres] of [[1, 3, ['Pop']], [2, 1, ['Rock']], [3, 3, ['Pop', 'R&B/Soul']]] as [number, number, string[]][]) {
    const categories = { ...emptyCategories, genre: genres[0], genres, language: 'English', languages: ['English'] }
    db.run('INSERT INTO catalogueSuggestions VALUES (?,?,?,?)', [id, JSON.stringify({ categories, popularity, styleBasis: 'song_suggestion' }), 'gpt-6-luna', '2026-11-18'])
  }
})
afterEach(() => db.close())
describe('full indexed songbook', () => {
  it('orders exact Perfect matches before partial titles and uses editorial popularity within that tier', () => {
    expect(book.list({ query: 'perfect' }, 1).entries.map(s => s.entryId)).toEqual([1, 2, 3])
    store.update(2, { discoveryFeatured: true })
    expect(book.list({ query: 'perfect' }, 1).entries.map(s => s.entryId)).toEqual([2, 1, 3])
  })
  it('combines indexed artist/title words, ignores accents and treats query operators as text', () => {
    expect(book.list({ query: 'beyonce perf' }, 1).entries.map(s => s.entryId)).toEqual([3])
    expect(book.list({ query: 'perfect OR missing' }, 1).entries).toEqual([])
    expect(fullTextQuery('  ed perfect ')).toBe('"ed"* AND "perfect"*')
    expect(book.list({ query: '*' }, 1).total).toBe(0)
  })
  it('filters overlapping styles and keeps unscanned entries unavailable', () => {
    const result = book.list({ genre: 'R&B/Soul', language: 'English' }, 1)
    expect(result.entries.map(s => s.entryId)).toEqual([3])
    expect(result.entries[0].available).toBe(false)
    expect(book.list({ available: true }, 1).total).toBe(0)
    expect(book.options().genre).toEqual(['Pop', 'R&B/Soul', 'Rock'])
    expect(result.stats).toMatchObject({ total: 3, processed: 3, styled: 3, available: 0 })
  })
  it('stores independent personal favourites while sharing their popularity contribution', () => {
    book.setStar(2, 1, true)
    expect(book.list({ favourites: true }, 1).entries.map(s => s.entryId)).toEqual([2])
    expect(book.list({ favourites: true }, 2).total).toBe(0)
    book.setStar(2, 1, true)
    expect(db.all('SELECT * FROM catalogueStars')).toHaveLength(1)
    book.setStar(2, 1, false)
    expect(book.list({ favourites: true }, 1).total).toBe(0)
  })
  it('respects reviewed decisions including intentionally blank fields', () => {
    store.update(1, { approved: { ...emptyCategories, genre: 'Jazz/Swing' } })
    expect(book.list({ query: 'Ed Sheeran' }, 1).entries[0]).toMatchObject({ categorySource: 'reviewed', categories: { genre: 'Jazz/Swing', language: '' } })
    store.update(1, { approved: { ...emptyCategories } })
    expect(book.list({ untagged: true }, 1).entries.map(s => s.entryId)).toEqual([1])
  })
  it('keeps the search index correct across imports and deletes', () => {
    store.import([{ artist: 'New Artist', title: 'New Entry' }])
    expect(book.list({ query: 'new entry' }, 1).total).toBe(1)
    db.run('DELETE FROM catalogueEntries WHERE entryId=4')
    expect(book.list({ query: 'new entry' }, 1).total).toBe(0)
  })
  it('links exact scanned identities, moves saved favourites, and does not guess versions', () => {
    db.run('INSERT INTO artists(name,nameNorm) VALUES (\'Ed Sheeran\',\'ed sheeran\')')
    db.run('INSERT INTO songs(artistId,title,titleNorm) VALUES (1,\'Perfect\',\'perfect\'),(1,\'Perfect (Live)\',\'perfect live\')')
    book.setStar(1, 1, true)
    expect(linkCatalogueSong('Ed Sheeran', 'Perfect (Live)', 2, db)).toBe(false)
    expect(linkCatalogueSong('ED SHEERAN', ' Perfect ', 1, db)).toBe(true)
    expect(db.all('SELECT * FROM catalogueStars')).toHaveLength(0)
    expect(db.get('SELECT * FROM songStars')).toMatchObject({ userId: 1, songId: 1 })
    expect(book.list({ favourites: true }, 1).entries[0].librarySongId).toBe(1)
    book.setStar(1, 1, false)
    expect(book.list({ favourites: true }, 1).total).toBe(0)
    expect(linkCatalogueSong('Ed Sheeran', 'Perfect', 2, db)).toBe(false)
  })
  it('links the real scanner article display variants and preserves version qualifiers', () => {
    store.import([{ artist: 'The Rolling Stones', title: 'The Last Time' }, { artist: 'The Test Band', title: 'A New Song (Live)' }])
    db.run('INSERT INTO artists(name,nameNorm) VALUES (\'Rolling Stones, The\',\'Rolling Stones\'),(\'Test Band, The\',\'Test Band\')')
    db.run('INSERT INTO songs(artistId,title,titleNorm) VALUES (1,\'Last Time, The\',\'Last Time\'),(2,\'New Song, A (Live)\',\'New Song A Live\')')
    const parser = MetaParser()
    const parsed = parser({ name: 'The Rolling Stones - The Last Time [SC Karaoke]' })
    expect(linkCatalogueSong(parsed.artist, parsed.title, 1, db)).toBe(true)
    expect(linkCatalogueSong('Test Band, The', 'New Song, A (Live)', 2, db)).toBe(true)
    expect(linkCatalogueSong('Test Band, The', 'New Song, A (Remix)', 2, db)).toBe(false)
  })
  it('rejects ambiguous article aliases and refreshes the lookup after new imports', () => {
    db.run('INSERT INTO artists(name,nameNorm) VALUES (\'Example\',\'Example\')')
    db.run('INSERT INTO songs(artistId,title,titleNorm) VALUES (1,\'Song\',\'Song\')')
    expect(linkCatalogueSong('Example, The', 'Song', 1, db)).toBe(false)
    store.import([{ artist: 'The Example', title: 'Song' }])
    expect(linkCatalogueSong('Example, The', 'Song', 1, db)).toBe(true)
    db.run('UPDATE catalogueEntries SET librarySongId=NULL')
    store.import([{ artist: 'Example', title: 'Song' }])
    expect(linkCatalogueSong('Example, The', 'Song', 1, db)).toBe(false)
    expect(linkCatalogueSong('Example', 'Song', 1, db)).toBe(true)
  })
})
