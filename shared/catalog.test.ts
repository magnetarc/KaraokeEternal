import { describe, it, expect } from 'vitest'
import { emptyCategories, validateCategories } from './catalog.js'

describe('curated categories', () => {
  it('normalizes curated values, deduplicates collections and ignores unknown fields', () => {
    expect(validateCategories({ genre: ' Rock ', decade: '1980s', performance: 'Duet', collections: ['Party', ' Party '], secret: 'ignored' })).toEqual({ ...emptyCategories, genre: 'Rock', decade: '1980s', performance: 'Duet', collections: ['Party'] })
  })
  it('clears omitted values', () => expect(validateCategories({})).toEqual(emptyCategories))
  it.each([null, [], { genre: 1 }, { language: 'x'.repeat(41) }, { genre: 'bad\nvalue' }, { decade: '1987' }, { performance: 'anything' }, { collections: [null] }, { collections: [''] }, { collections: Array(13).fill('test') }])('rejects invalid metadata %j', input => {
    expect(() => validateCategories(input)).toThrow()
  })
})
