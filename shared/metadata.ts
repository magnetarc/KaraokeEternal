import type { SongCategories } from './catalog.js'

export type CatalogueInput = { artist: string, title: string, sourceTitle?: string, provider?: string, source?: string }
export type Candidate = { id: string, title: string, artist: string, score: number, date: string, note: string, exact: boolean, searchUrl?: string, searchRetrievedAt?: string, searchNote?: string }
export type Evidence = { field: string, values: string[], url: string, retrievedAt: string, description: string }
export type Proposal = { categories: SongCategories, evidence: Evidence[], warnings: string[], recording: Candidate, genreVotes?: Record<string, number> }
export type EntryState = 'new' | 'queued' | 'working' | 'review' | 'approved' | 'rejected' | 'failed'
export type CatalogueEntry = CatalogueInput & {
  entryId: number, librarySongId: number | null, state: EntryState, variants: number,
  candidates: Candidate[], selected: string, proposal: Proposal | null,
  error: string, attempts: number, nextAttempt: number, reviewedBy?: number, reviewedAt?: string,
  approved?: SongCategories, applied?: string[], skipped?: string[],
  searchArtist?: string, searchTitle?: string,
  candidateCount?: number,
}
export const identity = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
export const entryKey = (artist: string, title: string) => JSON.stringify([identity(artist), identity(title)])

export function decodeCatalogue (bytes: Uint8Array): { text: string, encoding: string } {
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' } } catch {
    return { text: new TextDecoder('windows-1252', { fatal: true }).decode(bytes), encoding: 'Windows-1252' }
  }
}

// RFC 4180 quoting, including quoted newlines. Do not guess artist/title order.
export function parseCsv (text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []; let cell = ''; let quoted = false
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++ } else if (!cell || quoted) { quoted = !quoted } else { cell += c }
    } else if (c === ',' && !quoted) { row.push(cell); cell = '' } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (quoted) throw new Error('Unclosed CSV quote')
  row.push(cell); if (row.some(v => v.trim())) rows.push(row)
  return rows
}

export function validateInput (input: unknown): CatalogueInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Each row needs an artist and title')
  const source = input as Record<string, unknown>
  const read = (key: string, required = false) => {
    const v = source[key] ?? ''
    if (typeof v !== 'string' || v.length > 500 || /[\u0000-\u001f]/.test(v) || (required && !v.trim())) throw new Error(`Invalid ${key}`)
    return v.trim()
  }
  const title = read('title', true)
  const providerMatch = title.match(/\s*\[([^\[\]]{1,80} Karaoke)\]\s*$/i)
  const clean = providerMatch ? title.slice(0, providerMatch.index).trim() : title
  if (!clean) throw new Error('Empty song title')
  return { artist: read('artist', true), title: clean, sourceTitle: read('sourceTitle') || title, provider: read('provider') || providerMatch?.[1] || '', source: read('source') }
}

export function parseCatalogue (text: string, filename: string): CatalogueInput[] {
  if (text.length > 20 * 1024 * 1024) throw new Error('Use a catalogue file smaller than 20 MB')
  if (/\.json$/i.test(filename)) {
    const value = JSON.parse(text)
    if (!Array.isArray(value)) throw new Error('JSON must be an array of artist/title objects')
    return value.map(validateInput)
  }
  const rows = parseCsv(text)
  if (!rows.length) throw new Error('Empty catalogue')
  const headers = rows[0].map(v => v.trim().toLowerCase())
  const artistColumn = headers.indexOf('artist'); const titleColumn = headers.indexOf('title')
  if (artistColumn < 0 || titleColumn < 0) throw new Error('CSV needs Artist and Title column headings. Use Raw CSV.csv for the Rigmar collection.')
  return rows.slice(1).map((row, i) => {
    try { return validateInput({ artist: row[artistColumn], title: row[titleColumn], source: filename }) } catch (err) { throw new Error(`Row ${i + 2}: ${err.message}`) }
  })
}
