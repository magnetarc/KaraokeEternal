import { emptyCategories } from '../../shared/catalog.js'
import { identity, type Candidate, type Evidence, type Proposal } from '../../shared/metadata.js'
import { metadataStore, type MetadataStore } from './Store.js'

const ROOT = 'https://musicbrainz.org/ws/2/'
const USER_AGENT = 'KaraokeEternalModern/0.2 (https://github.com/magnetarc/KaraokeEternal)'
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
type Json = Record<string, any>
export class LookupError extends Error {
  constructor (message: string, public retryable: boolean, public retryAfter = 0) { super(message) }
}
export const quoteQuery = (value: string) => '"' + value.replace(/([+\-!(){}\[\]^"~*?:\\/|&])/g, '\\$1') + '"'
const artistName = (r: Json) => (r['artist-credit'] ?? []).map((a: Json) => typeof a === 'string' ? a : (a.name ?? a.artist?.name ?? '') + (a.joinphrase ?? '')).join('')
const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())
const languages: Record<string, string> = { eng: 'English', fra: 'French', deu: 'German', spa: 'Spanish', ita: 'Italian', por: 'Portuguese', zho: 'Chinese', cmn: 'Mandarin Chinese', yue: 'Cantonese', jpn: 'Japanese', kor: 'Korean', rus: 'Russian', nld: 'Dutch', swe: 'Swedish', dan: 'Danish', nor: 'Norwegian', fin: 'Finnish', gle: 'Irish', cym: 'Welsh', lat: 'Latin', hin: 'Hindi', ara: 'Arabic', pol: 'Polish', tur: 'Turkish', tha: 'Thai', vie: 'Vietnamese' }

export class MusicBrainzClient {
  private tail: Promise<unknown> = Promise.resolve()
  private lastStart = 0
  private cooldown = 0
  private failures = 0
  constructor (private store: MetadataStore = metadataStore, private fetcher: typeof fetch = fetch, private now = Date.now, private wait = sleep, private spacing = 1200) {}
  // Every request, including retries and work lookups, shares this one lane.
  get (resource: string, params: Record<string, string> = {}): Promise<{ data: Json, url: string, retrievedAt: string }> {
    if (!/^(recording|work|artist)(\/[a-f0-9-]{36})?$/.test(resource)) return Promise.reject(new Error('Invalid MusicBrainz resource'))
    const url = new URL(resource, ROOT)
    for (const [k, v] of Object.entries({ ...params, fmt: 'json' })) url.searchParams.set(k, v)
    const key = url.href
    const run = async () => {
      const cached = this.store.sql.get<{ data: string, retrievedAt: string }>('SELECT data,retrievedAt FROM musicbrainzCache WHERE url=?', [key])
      if (cached) return { data: JSON.parse(cached.data), url: key, retrievedAt: cached.retrievedAt }
      await this.wait(Math.max(0, Math.max(this.lastStart + this.spacing, this.cooldown) - this.now()))
      this.lastStart = this.now()
      let response: Response
      try { response = await this.fetcher(key, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(20000), redirect: 'error' }) } catch {
        this.cooldown = this.now() + 3000
        throw new LookupError('MusicBrainz could not be reached; the lookup is saved for retry.', true)
      }
      if (!response.ok) {
        const retry = response.headers.get('retry-after')
        const seconds = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Math.max(0, Date.parse(retry) - this.now()) : 0
        const retryable = response.status === 429 || response.status >= 500
        const retryAfter = Number.isFinite(seconds) ? seconds : 0
        if (retryable) this.cooldown = this.now() + Math.max(retryAfter, 3000 * 2 ** Math.min(this.failures++, 4))
        throw new LookupError(`MusicBrainz returned HTTP ${response.status}`, retryable, retryAfter)
      }
      let data: Json
      try { data = await response.json() } catch { throw new LookupError('MusicBrainz returned invalid JSON', true) }
      this.failures = 0
      const retrievedAt = new Date(this.now()).toISOString()
      this.store.sql.run('INSERT INTO musicbrainzCache(url,data,retrievedAt) VALUES (?,?,?) ON CONFLICT(url) DO UPDATE SET data=excluded.data,retrievedAt=excluded.retrievedAt', [key, JSON.stringify(data), retrievedAt])
      return { data, url: key, retrievedAt }
    }
    const result = this.tail.then(run)
    this.tail = result.catch(() => {})
    return result
  }
  async search (artist: string, title: string): Promise<Candidate[]> {
    let response = await this.get('recording', { query: `recording:${quoteQuery(title)} AND artist:${quoteQuery(artist)}`, limit: '100' })
    let searchNote = ''
    const leadArtist = artist.split(/\s+(?:&|and|feat\.?|featuring)\s+/i)[0].trim()
    if (!response.data.recordings?.length && leadArtist && leadArtist !== artist) {
      response = await this.get('recording', { query: `recording:${quoteQuery(title)} AND artist:${quoteQuery(leadArtist)}`, limit: '100' })
      searchNote = 'Search used the first artist credit; check all performers before selecting.'
    }
    const { data, url, retrievedAt } = response
    return (data.recordings ?? []).filter((r: Json) => UUID.test(r.id)).map((r: Json) => ({ id: r.id, title: r.title ?? '', artist: artistName(r), score: Number(r.score) || 0, date: r['first-release-date'] ?? '', note: r.disambiguation ?? '', exact: identity(r.title ?? '') === identity(title) && identity(artistName(r)) === identity(artist), searchUrl: url, searchRetrievedAt: retrievedAt, searchNote }))
  }
  async proposal (candidate: Candidate): Promise<Proposal> {
    if (!UUID.test(candidate.id)) throw new Error('Invalid recording identifier')
    const response = await this.get(`recording/${candidate.id}`, { inc: 'genres+tags+artist-credits+work-rels+releases' })
    const { data, url, retrievedAt } = response
    const evidence: Evidence[] = []
    const warnings: string[] = ['Confirm the original artist and recording version. A search score ranks results; it is not a probability.']
    const genres = [...new Set<string>((data.genres ?? []).filter((g: Json) => (g.count ?? 0) > 0 && typeof g.name === 'string' && g.name.length <= 40).sort((a: Json, b: Json) => b.count - a.count).map((g: Json) => titleCase(g.name)))].slice(0, 16)
    const tags = (data.tags ?? []).filter((t: Json) => t.count > 0).map((t: Json) => `${t.name} (${t.count})`)
    if (genres.length) evidence.push({ field: 'genres', values: genres, url, retrievedAt, description: 'Recording genres with positive community votes; styles can overlap.' })
    if (tags.length) evidence.push({ field: 'tags', values: tags, url, retrievedAt, description: 'Community tags for reference; these are not automatically treated as genres.' })
    // A recording's first release is not the date of the karaoke file or remaster.
    const date = data['first-release-date'] || candidate.date
    const year = /^(18|19|20)\d{2}(?:-|$)/.test(date) ? Number(date.slice(0, 4)) : 0
    const decade = year ? `${Math.floor(year / 10) * 10}s` : ''
    if (decade) evidence.push({ field: 'decade', values: [decade], url: data['first-release-date'] ? url : candidate.searchUrl ?? `https://musicbrainz.org/recording/${candidate.id}`, retrievedAt: data['first-release-date'] ? retrievedAt : candidate.searchRetrievedAt ?? retrievedAt, description: `Earliest release reported for this recording: ${date}. Check covers and later recordings against the intended version.` })
    const works: string[] = [...new Set<string>((data.relations ?? []).filter((r: Json) => r['target-type'] === 'work' && r.type === 'performance' && UUID.test(r.work?.id ?? '')).map((r: Json) => r.work.id))]
    const languageValues: string[] = []
    for (const id of works.slice(0, 4)) {
      const work = await this.get(`work/${id}`)
      const codes = work.data.languages ?? (work.data.language ? [work.data.language] : [])
      const values = [...new Set<string>(codes.filter((c: unknown) => typeof c === 'string' && c !== 'zxx' && c !== 'und' && c !== 'mul').map((c: string) => languages[c] ?? c))]
      languageValues.push(...values)
      if (values.length) evidence.push({ field: 'languages', values, url: work.url, retrievedAt: work.retrievedAt, description: `Linked work language (${work.data.title ?? id}); verify translations against your track.` })
    }
    if (works.length > 1) warnings.push('Several works are linked. Check medleys and translated versions before choosing a language.')
    if (works.length > 4) warnings.push('Only the first four linked works were checked; leave language unknown until reviewed.')
    const lang = [...new Set(languageValues)].slice(0, 16)
    if (!genres.length) warnings.push('No positively voted recording genre was found. Genre is left unknown.')
    if (!lang.length) warnings.push('No supported lyric language was found on linked works. Language is left unknown.')
    warnings.push('Solo, duet, group and party collections need a human decision; artist credits do not establish vocal parts.')
    const genreVotes = Object.fromEntries((data.genres ?? []).filter((g: Json) => typeof g.name === 'string').map((g: Json) => [titleCase(g.name), Number(g.count) || 0]))
    return { recording: { ...candidate, title: data.title ?? candidate.title, artist: artistName(data) || candidate.artist, note: data.disambiguation ?? candidate.note }, categories: { ...emptyCategories, genre: genres[0] ?? '', genres, language: lang[0] ?? '', languages: lang, decade }, evidence, warnings, genreVotes }
  }
}

export class MetadataWorker {
  active = false
  private running: Promise<void> | null = null
  private initialized = false
  constructor (public store: MetadataStore = metadataStore, public client = new MusicBrainzClient(store)) {}
  initialize () { if (!this.initialized) { this.store.recover(); this.initialized = true } }
  start () {
    this.initialize(); this.active = true
    if (!this.running) this.running = this.loop().finally(() => { this.running = null; this.active = false })
  }
  pause () { this.active = false }
  async settle () { this.pause(); await this.running }
  async step (entryId?: number) {
    const entry = this.store.next(entryId)
    if (!entry) return false
    this.store.update(entry.entryId, { state: 'working' })
    try {
      const candidates = entry.candidates.length ? entry.candidates : await this.client.search(entry.searchArtist || entry.artist, entry.searchTitle || entry.title)
      this.store.update(entry.entryId, { candidates }) // search checkpoint before any detail lookup
      // Exact text is insufficient: live takes, remasters and original recordings
      // can share it. A person must choose a recording before field proposals.
      const selected = candidates.find(c => c.id === entry.selected)
      let proposal: Proposal = null
      if (selected) {
        this.store.update(entry.entryId, { selected: selected.id })
        proposal = await this.client.proposal(selected)
        if ((entry.searchArtist && entry.searchArtist !== entry.artist) || (entry.searchTitle && entry.searchTitle !== entry.title)) proposal.warnings.unshift('Search wording was edited. Compare the original catalogue entry before approving this match.')
        if (candidates.filter(c => c.exact).length > 1) proposal.warnings.unshift('Several recordings share this artist and title. Check the selected version and its release date.')
        if (!selected.exact) proposal.warnings.unshift('Artist or title differs from your catalogue. Check this match carefully.')
      }
      this.store.update(entry.entryId, { candidates, proposal, state: 'review', error: '', attempts: 0, nextAttempt: 0 })
    } catch (err) {
      const attempts = entry.attempts + 1
      const retry = err instanceof LookupError && err.retryable && attempts < 4
      const delay = Math.max(err instanceof LookupError ? err.retryAfter : 0, 3000 * (2 ** (attempts - 1)) + Math.floor(Math.random() * 1000))
      this.store.update(entry.entryId, { state: retry ? 'queued' : 'failed', attempts, error: err.message, nextAttempt: retry ? Date.now() + delay : 0 })
    }
    return true
  }
  private async loop () {
    while (this.active) {
      if (!await this.step()) {
        const waiting = this.store.sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM catalogueEntries WHERE state='queued'").n
        if (!waiting) break
        await sleep(500)
      }
    }
  }
}
export const metadataWorker = new MetadataWorker()
