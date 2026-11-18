import { describe, it, expect } from 'vitest'
import { decodeCatalogue, entryKey, parseCatalogue, parseCsv, validateInput } from './metadata.js'

describe('catalogue ingestion', () => {
  it('preserves accents from UTF-8 and legacy Windows song books', () => {
    expect(decodeCatalogue(new TextEncoder().encode('Beyoncé')).text).toBe('Beyoncé')
    expect(decodeCatalogue(new Uint8Array([67,97,102,233]))).toEqual({ text: 'Café', encoding: 'Windows-1252' })
  })
  it('reads quoted commas, escaped quotes, CRLF and BOM without guessing columns', () => {
    expect(parseCatalogue('\uFEFFArtist,Title\r\n"Earth, Wind & Fire","September [SC Karaoke]"\r\n"A ""Band""",Other', 'book.csv')).toEqual([
      { artist: 'Earth, Wind & Fire', title: 'September', provider: 'SC Karaoke', sourceTitle: 'September [SC Karaoke]', source: 'book.csv' },
      { artist: 'A "Band"', title: 'Other', provider: '', sourceTitle: 'Other', source: 'book.csv' },
    ])
  })
  it('preserves versions and distinguishes punctuation rather than guessing identity', () => {
    expect(validateInput({ artist: 'Artist', title: 'Song (Live) [SBI Karaoke]' }).title).toBe('Song (Live)')
    expect(entryKey(' A ', 'Song')).toBe(entryKey('a', ' song '))
    expect(entryKey('A', 'Song (Live)')).not.toBe(entryKey('A', 'Song'))
  })
  it('handles quoted newlines but rejects unsafe control characters in fields', () => {
    expect(parseCsv('a,"b\nc"')).toEqual([['a', 'b\nc']])
    expect(() => parseCatalogue('Artist,Title\na,"b\nc"', 'a.csv')).toThrow('Row 2')
    expect(() => parseCsv('a,"b')).toThrow('Unclosed')
  })
  it('requires headers and validates JSON records', () => {
    expect(() => parseCatalogue('A,B', 'a.csv')).toThrow('headings')
    expect(() => parseCatalogue('[{"artist":"A","title":""}]', 'a.json')).toThrow('title')
    expect(parseCatalogue('[{"artist":"A","title":"B"}]', 'a.json')[0].title).toBe('B')
  })
})
