import { expect, it } from 'vitest'
import { browseOptions } from './browseOptions'
import { defaultFilters } from './catalogBrowse'
import { emptyCategories } from 'shared/catalog'
it('offers only factual refinements supported inside the selected category', () => {
  const songs = [
    { songId: 1, artistId: 1, title: 'Pop', duration: 1, numMedia: 1, categories: { ...emptyCategories, genre: 'Pop' } },
    { songId: 2, artistId: 1, title: 'Rock', duration: 1, numMedia: 1, categories: { ...emptyCategories, genre: 'Rock', language: 'English', decade: '1980s' } },
  ]
  expect(browseOptions(songs).language).toEqual(['English'])
  expect(browseOptions(songs, { ...defaultFilters, genre: 'Pop' }).language).toEqual([])
  expect(browseOptions(songs, { ...defaultFilters, genre: 'Pop' }).decade).toEqual([])
})
