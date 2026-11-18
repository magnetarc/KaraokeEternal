import type { SongCategories } from './catalog.js'
export interface SongbookEntry {
  entryId: number
  artist: string
  title: string
  librarySongId: number | null
  categories: SongCategories
  categorySource: 'library' | 'reviewed' | 'suggested' | 'unknown'
  styleBasis: string
  available: boolean
  starred: boolean
  featured: boolean
  popularity: number
}
export interface SongbookFilters {
  query: string, genre: string, language: string, decade: string, collection: string,
  performance: string, favourites: boolean, available: boolean, untagged: boolean,
  sort: string, offset: number,
}
export const songbookDefaults: SongbookFilters = { query: '', genre: '', language: '', decade: '', collection: '', performance: '', favourites: false, available: false, untagged: false, sort: 'popular', offset: 0 }
export interface SongbookStats { total: number, processed: number, styled: number, available: number, reviewed: number }
export interface SongbookListing { entries: SongbookEntry[], total: number, offset: number, limit: number, stats: SongbookStats }
export interface SongbookOptions { genre: string[], language: string[], decade: string[], collection: string[], performance: string[] }
