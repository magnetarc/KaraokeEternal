import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseWrapper } from '../lib/Database.js'
import { MetadataStore } from './Store.js'
import { LookupError, MetadataWorker, MusicBrainzClient, quoteQuery } from './MusicBrainz.js'
import { emptyCategories } from '../../shared/catalog.js'
import { entryKey, type Candidate, type Proposal } from '../../shared/metadata.js'

let db: DatabaseWrapper; let store: MetadataStore
const ID = '01234567-89ab-cdef-0123-456789abcdef'
const candidate: Candidate = { id: ID, title: 'Song', artist: 'Artist', exact: true, score: 100, date: '1982-01-01', note: '' }
const proposal: Proposal = { recording: candidate, categories: { ...emptyCategories, genre: 'Pop', genres: ['Pop', 'Rock'], language: 'English', languages: ['English'], decade: '1980s' }, evidence: [], warnings: [] }
beforeEach(() => {
  db = new DatabaseWrapper(':memory:')
  db.migrate({ migrationsPath: path.resolve(import.meta.dirname, '../lib/schemas') })
  store = new MetadataStore(() => db)
})
afterEach(() => db.close())

describe('persistent catalogue review', () => {
  it('deduplicates exact songs, retains provider variants and safely resumes imports', () => {
    const rows = [{ artist: 'Artist', title: 'Song [SC Karaoke]' }, { artist: 'artist', title: 'Song [CB Karaoke]' }]
    expect(store.import(rows)).toMatchObject({ added: 1, variants: 2 })
    expect(store.import(rows)).toMatchObject({ added: 0, variants: 0 })
    expect(store.get(1).variants).toBe(2)
    expect(store.sources(1)).toHaveLength(2)
    expect(() => store.import([{ artist: 'Good', title: 'Good' }, { artist: '', title: 'Bad' }])).toThrow()
    expect(store.list().total).toBe(1)
  })
  it('recovers interrupted work but does not start outgoing lookups on construction', () => {
    store.import([{ artist: 'Artist', title: 'Song' }]); store.update(1, { state: 'working' })
    const worker = new MetadataWorker(store)
    expect(worker.active).toBe(false)
    worker.initialize()
    expect(store.get(1).state).toBe('queued')
  })
  it('requires reviewed evidence, retains an audit trail and protects manual categories', () => {
    db.run("INSERT INTO artists(name,nameNorm) VALUES ('Artist','artist')")
    db.run("INSERT INTO songs(artistId,title,titleNorm) VALUES (1,'Song','song')")
    db.run('INSERT INTO songCategories VALUES (1,?)', [JSON.stringify({ ...emptyCategories, genre: 'My genre' })])
    db.run("INSERT INTO categoryProtection(songId,locked) VALUES (1,1)")
    store.import([{ artist: 'Artist', title: 'Song' }], new Map([[entryKey('Artist', 'Song'), 1]]))
    store.update(1, { state: 'review', proposal, selected: ID, candidates: [candidate] })
    expect(() => store.approve(1, { categories: proposal.categories }, 1)).toThrow('Confirm')
    expect(() => store.approve(1, { confirmed: true, categories: { ...emptyCategories, genre: 'Invented' } }, 1)).toThrow('source')
    const result = store.approve(1, { confirmed: true, categories: proposal.categories, apply: true }, 1)
    expect(result.applied).toEqual([])
    expect(result.skipped).toContain('genre')
    expect(JSON.parse(db.get<{ data: string }>('SELECT data FROM songCategories').data).genre).toBe('My genre')
    expect(db.all('SELECT * FROM catalogueReviews')).toHaveLength(1)
    expect(store.export()).toHaveLength(1)
  })
  it('fills empty linked categories only after approval, with source evidence', () => {
    db.run("INSERT INTO artists(name,nameNorm) VALUES ('Artist','artist')")
    db.run("INSERT INTO songs(artistId,title,titleNorm) VALUES (1,'Song','song')")
    store.import([{ artist: 'Artist', title: 'Song' }], new Map([[entryKey('Artist', 'Song'), 1]]))
    store.update(1, { state: 'review', proposal })
    store.approve(1, { confirmed: true, categories: proposal.categories, apply: true }, 1)
    expect(JSON.parse(db.get<{ data: string }>('SELECT data FROM songCategories').data).genres).toEqual(['Pop', 'Rock'])
    expect(db.get('SELECT evidence FROM categoryProtection')).toBeTruthy()
  })
})

describe('MusicBrainz queue and evidence', () => {
  it('serializes requests, identifies the app and persists successful responses across clients', async () => {
    let clock = 10000
    const starts: number[] = []
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      starts.push(clock); expect(options.headers['User-Agent']).toContain('magnetarc')
      return new Response('{"recordings":[]}', { status: 200 })
    }) as unknown as typeof fetch
    const client = new MusicBrainzClient(store, fetcher, () => clock, async ms => { clock += ms })
    await Promise.all([client.get('recording', { query: 'a' }), client.get('recording', { query: 'b' })])
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1200)
    await new MusicBrainzClient(store, fetcher).get('recording', { query: 'a' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(quoteQuery('A+B: "song"')).toBe('"A\\+B\\: \\"song\\""')
  })
  it('honours Retry-After and checkpoints retries without approving anything', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 503, headers: { 'Retry-After': '30' } })) as unknown as typeof fetch
    const client = new MusicBrainzClient(store, fetcher, Date.now, async () => {})
    await expect(client.get('recording', { query: 'test' })).rejects.toMatchObject({ retryable: true, retryAfter: 30000 })
    store.import([{ artist: 'Artist', title: 'Song' }]); store.queue([1])
    const worker = new MetadataWorker(store, client)
    const before = Date.now(); await worker.step()
    expect(store.get(1)).toMatchObject({ state: 'queued', attempts: 1, proposal: null })
    expect(store.get(1).nextAttempt).toBeGreaterThanOrEqual(before + 30000)
  })
  it('shares the service cooldown across different entries, not just retries of one URL', async () => {
    let clock = 10000; const starts: number[] = []
    const fetcher = vi.fn(async () => {
      starts.push(clock)
      return starts.length === 1 ? new Response('', { status: 503, headers: { 'Retry-After': '30' } }) : Response.json({ recordings: [] })
    }) as unknown as typeof fetch
    const client = new MusicBrainzClient(store, fetcher, () => clock, async ms => { clock += ms })
    await expect(client.get('recording', { query: 'first' })).rejects.toThrow('503')
    await client.get('recording', { query: 'different entry' })
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(30000)
    expect(db.all('SELECT * FROM musicbrainzCache')).toHaveLength(1)
  })
  it('pauses between entries and saves candidates for review without choosing a recording', async () => {
    store.import([{ artist: 'Artist', title: 'Song' }, { artist: 'Artist', title: 'Other song' }]); store.queue([1, 2])
    let release: (value: Candidate[]) => void
    const search = vi.fn(() => new Promise<Candidate[]>(resolve => { release = resolve }))
    const client = { search, proposal: async () => proposal } as unknown as MusicBrainzClient
    const worker = new MetadataWorker(store, client)
    worker.start(); worker.pause(); release([candidate]); await worker.settle()
    expect(store.get(1)).toMatchObject({ state: 'review', proposal: null, candidates: [candidate] })
    expect(store.get(2).state).toBe('queued')
    expect(store.export()).toHaveLength(0)
    expect(search).toHaveBeenCalledTimes(1)
  })
  it('retrieves category proposals only after an explicit recording choice', async () => {
    store.import([{ artist: 'Artist', title: 'Song' }]); store.queue([1])
    const lookup = vi.fn(async () => proposal)
    const client = { search: async () => [candidate, { ...candidate, id: '11234567-89ab-cdef-0123-456789abcdef', date: '1999' }], proposal: lookup } as unknown as MusicBrainzClient
    const worker = new MetadataWorker(store, client)
    await worker.step(); expect(lookup).not.toHaveBeenCalled()
    expect(store.get(1).selected).toBe('')
    store.select(1, ID); await worker.step()
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(store.get(1).proposal.categories.decade).toBe('1980s')
    expect(store.export()).toHaveLength(0)
  })
  it('keeps missing lyric language unknown, uses positive genre votes and preserves provenance', async () => {
    const fetcher = vi.fn(async () => Response.json({ title: 'Song', 'artist-credit': [{ name: 'Artist' }], genres: [{ name: 'pop', count: 4 }, { name: 'rock', count: -1 }], tags: [], relations: [], releases: [{ date: '2020', 'text-representation': { language: 'eng' } }] })) as unknown as typeof fetch
    const result = await new MusicBrainzClient(store, fetcher, Date.now, async () => {}).proposal(candidate)
    expect(result.categories).toMatchObject({ genre: 'Pop', language: '', decade: '1980s', performance: '' })
    expect(result.evidence[0].url).toContain('musicbrainz.org/ws/2/recording/')
    expect(result.warnings.some(w => w.includes('unknown'))).toBe(true)
  })
  it('stops retrying after four failures, preserving errors for the host', async () => {
    store.import([{ artist: 'Artist', title: 'Song' }]); store.queue([1]); store.update(1, { attempts: 3 })
    const client = { search: async () => { throw new LookupError('Offline', true) } } as unknown as MusicBrainzClient
    await new MetadataWorker(store, client).step()
    expect(store.get(1)).toMatchObject({ state: 'failed', attempts: 4, error: 'Offline' })
  })
})
