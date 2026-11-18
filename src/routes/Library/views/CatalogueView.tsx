import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAppSelector } from 'store/hooks'
import HttpApi from 'lib/HttpApi'
import { decodeCatalogue, parseCatalogue, type CatalogueEntry, type CatalogueInput } from 'shared/metadata'
import type { SongCategories } from 'shared/catalog'
import styles from './CatalogueView.css'

const api = new HttpApi('catalogue')
type Listing = { entries: CatalogueEntry[], total: number, counts: Record<string, number>, cacheSize: number, active: boolean }
type Detail = CatalogueEntry & { sources: CatalogueInput[], discoverySuggestion?: { categories: SongCategories, styleBasis: string, provenance: { model: string, policy: string } } }
const initial: Listing = { entries: [], total: 0, counts: {}, cacheSize: 0, active: false }
const labels: Record<string, string> = { new: 'Not looked up', queued: 'Waiting', working: 'Looking up', review: 'Needs review', approved: 'Approved', rejected: 'Rejected', failed: 'Lookup failed' }

function Review ({ entry, close, changed }: { entry: Detail, close: () => void, changed: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const proposal = entry.proposal
  const [tags, setTags] = useState<SongCategories>(() => {
    if (entry.approved) return entry.approved
    if (!proposal) return undefined
    const c = proposal.categories
    const oneLanguage = c.languages?.length === 1
    return { ...c, genres: c.genre ? [c.genre] : [], language: oneLanguage ? c.language : '', languages: oneLanguage ? c.languages : [] }
  })
  const [confirmed, setConfirmed] = useState(false)
  const [apply, setApply] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [searchArtist, setSearchArtist] = useState(entry.searchArtist || entry.artist)
  const [searchTitle, setSearchTitle] = useState(entry.searchTitle || entry.title)
  const [candidateOrder, setCandidateOrder] = useState('rank')
  useEffect(() => { dialog.current?.showModal() }, [])
  const act = async (path: string, body = {}) => {
    setBusy(true); setError('')
    try { await api.post(`/${entry.entryId}/${path}`, { body }); changed(); close() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const toggle = (key: 'genres' | 'languages', single: 'genre' | 'language', value: string) => {
    const values = (tags[key] ?? []).includes(value) ? tags[key].filter(v => v !== value) : [...(tags[key] ?? []), value]
    setTags({ ...tags, [key]: values, [single]: values[0] ?? '' })
  }
  return <dialog ref={dialog} className={styles.dialog} onCancel={close} aria-labelledby='review-title'>
    <div className={styles.dialogTop}><span className={styles.eyebrow}>MATCH & CATEGORY REVIEW</span><button type='button' onClick={close} aria-label='Close review'>✕</button></div>
    <h2 id='review-title'>{entry.title}</h2><p className={styles.artist}>{entry.artist}</p>
    <p>{entry.variants} source {entry.variants === 1 ? 'entry' : 'entries'} · {entry.librarySongId ? 'Linked to a playable song' : 'Metadata only · audio is not imported'}</p>
    <details><summary>Original catalogue entries</summary>{entry.sources.slice(0, 30).map((s, i) => <p key={i}>{s.artist} — {s.sourceTitle} <small>({s.source})</small></p>)}</details>
    {entry.discoverySuggestion && <details><summary>Discovery suggestions · unreviewed</summary><p>{entry.discoverySuggestion.categories.genres?.join(', ') || 'No suggested styles'} · {entry.discoverySuggestion.styleBasis.replaceAll('_', ' ')}</p><p>Model: {entry.discoverySuggestion.provenance.model}. {entry.discoverySuggestion.provenance.policy}</p><p>These suggestions help browsing. They do not approve a MusicBrainz recording match. Use the full songbook’s Edit song details control to save a manual decision.</p></details>}
    <details><summary>Revise the search wording</summary><p>The original catalogue entry stays unchanged. Queue the revised search, then start or resume lookups.</p><form onSubmit={e => { e.preventDefault(); act('search', { artist: searchArtist, title: searchTitle }) }}><div className={styles.fields}><label>Search artist<input value={searchArtist} maxLength={500} required onChange={e => setSearchArtist(e.target.value)} /></label><label>Search title<input value={searchTitle} maxLength={500} required onChange={e => setSearchTitle(e.target.value)} /></label></div><button disabled={busy || entry.state === 'working'}>Queue revised search</button></form></details>
    <h3>Recording candidates</h3><p className={styles.muted}>Choose the intended recording, then resume lookups to retrieve its categories. Up to 100 results are shown; revise the search if your version is missing. Search rank and an early date do not prove originality.</p>
    {!!entry.candidates.length && <label>Order candidates <select value={candidateOrder} onChange={e => setCandidateOrder(e.target.value)}><option value='rank'>Search rank</option><option value='date'>Earliest reported release</option></select></label>}
    {!entry.candidates.length && <p>No candidates yet. Queue a lookup, or keep this entry uncategorised.</p>}
    <div className={styles.candidates}>{[...entry.candidates].sort((a, b) => candidateOrder === 'date' ? (a.date || '9999').localeCompare(b.date || '9999') : b.score - a.score).map(c => <div className={c.id === entry.selected ? styles.chosen : styles.candidate} key={c.id}>
      <div><strong>{c.title}</strong><span>{c.artist} · {c.date || 'Date unknown'}</span><small>Rank score {c.score} · {c.exact ? 'Exact artist/title text' : 'Text differs'}{c.note ? ` · ${c.note}` : ''}</small>{c.searchNote && <small>{c.searchNote}</small>}<a href={`https://musicbrainz.org/recording/${c.id}`} target='_blank' rel='noreferrer'>View recording ↗</a></div>
      <button disabled={busy || entry.state === 'working'} onClick={() => act('select', { recordingId: c.id })}>{c.id === entry.selected && proposal ? 'Look up again' : 'Queue recording details'}</button>
    </div>)}</div>
    {proposal && tags && <form onSubmit={e => { e.preventDefault(); act('approve', { confirmed, categories: tags, apply }) }}>
      <h3>Proposed categories</h3><p>{proposal.recording.artist} — {proposal.recording.title}</p>
      <div className={styles.warnings}>{proposal.warnings.map((w, i) => <p key={i}>{w}</p>)}</div>
      <div className={styles.fields}>{([['genres', 'genre', 'Genres'], ['languages', 'language', 'Lyric languages']] as const).map(([key, single, label]) => <fieldset key={key}><legend>{label}</legend>{!proposal.categories[key]?.length && <span>Unknown · no supported evidence</span>}{key === 'languages' && proposal.categories.languages?.length > 1 && <p>Several languages are listed. Select only those heard in your karaoke version.</p>}{proposal.categories[key]?.map(v => <label key={v}><input type='checkbox' checked={(tags[key] ?? []).includes(v)} onChange={() => toggle(key, single, v)} />{v}{key === 'genres' && proposal.genreVotes?.[v] !== undefined ? ` (${proposal.genreVotes[v]} votes)` : ''}</label>)}</fieldset>)}
        <label>Decade<select value={tags.decade} onChange={e => setTags({ ...tags, decade: e.target.value })}><option value=''>Unknown</option>{proposal.categories.decade && <option>{proposal.categories.decade}</option>}</select></label>
        <label>Voices (your decision)<select value={tags.performance} onChange={e => setTags({ ...tags, performance: e.target.value })}><option value=''>Unknown</option>{['Solo', 'Duet', 'Group'].map(v => <option key={v}>{v}</option>)}</select></label>
      </div>
      <details className={styles.evidence}><summary>Source evidence & retrieval dates</summary>{proposal.evidence.map((e, i) => <p key={i}><strong>{e.field}: {e.values.join(', ')}</strong><br />{e.description}<br /><a href={e.url} target='_blank' rel='noreferrer'>MusicBrainz source ↗</a> · {e.retrievedAt.slice(0, 10)}</p>)}</details>
      <label className={styles.check}><input type='checkbox' checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required />I checked the artist, title, version and selected categories.</label>
      {entry.librarySongId && <label className={styles.check}><input type='checkbox' checked={apply} onChange={e => setApply(e.target.checked)} />Also fill empty categories on the linked library song. Manual edits are protected.</label>}
      {entry.skipped?.length > 0 && <p>Protected or existing fields kept: {entry.skipped.join(', ')}.</p>}
      <div className={styles.actions}><button className={styles.primary} disabled={busy || !confirmed}>{busy ? 'Saving…' : 'Approve selected categories'}</button><button type='button' disabled={busy} onClick={() => act('reject')}>Reject match</button></div>
    </form>}
    {!proposal && entry.state !== 'working' && <button disabled={busy} onClick={() => act('reject')}>Reject / leave uncategorised</button>}
    {error && <p role='alert'>{error}</p>}
  </dialog>
}

export default function CatalogueView () {
  const { headerHeight, footerHeight, innerHeight } = useAppSelector(s => s.ui)
  const [listing, setListing] = useState(initial)
  const [query, setQuery] = useState(''); const [state, setState] = useState(''); const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  const [detail, setDetail] = useState<Detail>(null)
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [importing, setImporting] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const refresh = async () => {
    const value = await api.get<Listing>(`/?q=${encodeURIComponent(query)}&state=${state}&offset=${offset}`)
    setListing(value)
  }
  useEffect(() => {
    let live = true
    const poll = () => api.get<Listing>(`/?q=${encodeURIComponent(query)}&state=${state}&offset=${offset}`).then(v => { if (live) setListing(v) }).catch(e => { if (live) setError(e.message) })
    poll(); const timer = setInterval(poll, 2000)
    return () => { live = false; clearInterval(timer) }
  }, [query, state, offset])
  const run = async (path: string, body = {}) => {
    setError('')
    try { await api.post('/' + path, { body }); await refresh() } catch (e) { setError(e.message) }
  }
  const open = async (id: number) => { try { setDetail(await api.get<Detail>('/' + id)) } catch (e) { setError(e.message) } }
  const importFile = async (f: File) => {
    setError(''); setImporting(true)
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error('Use a catalogue file smaller than 20 MB')
      const decoded = decodeCatalogue(new Uint8Array(await f.arrayBuffer()))
      const rows = parseCatalogue(decoded.text, f.name)
      let added = 0
      for (let i = 0; i < rows.length; i += 50) {
        const result = await api.post<{ added: number }>('/import', { body: rows.slice(i, i + 50) })
        added += result.added; setMessage(`Imported ${Math.min(i + 50, rows.length).toLocaleString()} of ${rows.length.toLocaleString()} source rows…`)
      }
      setMessage(`Import complete: ${added.toLocaleString()} new artist/title entries. Read as ${decoded.encoding}. Existing reviews and source entries are preserved.`)
      await refresh()
    } catch (e) { setError(`${e.message}. Completed batches are saved; importing the same file again is safe.`) } finally { setImporting(false); if (file.current) file.current.value = '' }
  }
  const eligible = listing.entries.filter(e => ['new', 'failed'].includes(e.state)).map(e => e.entryId)
  const ids = (selected.length ? selected : eligible).slice(0, 25)
  const total = Object.values(listing.counts).reduce((sum, n) => sum + n, 0)
  return <main className={styles.page} style={{ paddingTop: headerHeight + 28, paddingBottom: footerHeight + 32, height: innerHeight }}>
    <div className={styles.shell}>
      <div className={styles.top}><Link to='/library'>← Song browser</Link><span>HOST WORKSPACE · SEPARATE METADATA CATALOGUE</span></div>
      <header className={styles.hero}><p className={styles.eyebrow}>A LITTLE ORDER. A LOT MORE MUSIC.</p><h1>Make the collection<br /><em>easy to explore.</em></h1><p>Import your song book. Check the evidence. Approve the categories.</p></header>
      <section className={styles.importer} aria-label='Catalogue import'>
        <div><h2>Start with the song book</h2><p>CSV with Artist and Title headings, or a JSON array. Karaoke-provider variants stay linked. Audio files are never copied or changed.</p><small>Rigmar collection: choose <strong>Raw CSV.csv</strong>. Imports do not make songs playable.</small></div>
        <div className={styles.actions}><input ref={file} type='file' accept='.csv,.json' aria-label='Import catalogue file' hidden onChange={e => { if (e.target.files[0]) importFile(e.target.files[0]) }} /><button className={styles.primary} disabled={importing} onClick={() => file.current?.click()}>{importing ? 'Importing…' : 'Import CSV / JSON'}</button><button disabled={importing} onClick={() => run('library')}>Use current library</button><a href={document.baseURI + 'api/catalogue/export'}>Export approved JSON ↗</a></div>
      </section>
      <div className={styles.stats}><span><b>{total.toLocaleString()}</b> artist / title entries</span><span><b>{listing.counts.review ?? 0}</b> need review</span><span><b>{listing.counts.approved ?? 0}</b> approved</span><span><b>{listing.cacheSize}</b> cached lookups</span></div>
      <section className={styles.worker} aria-label='Lookup controls'><div><strong>{listing.active ? 'Looking up your selected batch' : 'Lookups paused'}</strong><p>{(listing.counts.queued ?? 0) + (listing.counts.working ?? 0)} waiting or in progress · up to 25 entries per batch · one shared request lane</p><small>Lookups use public MusicBrainz data. Progress is saved. Restarting the app leaves lookups paused. A pause lets the current entry finish.</small></div><div className={styles.actions}><button disabled={!ids.length || importing} onClick={async () => { await run('queue', { ids }); setSelected([]) }}>Queue {selected.length ? 'selected' : 'visible'} ({ids.length})</button><button className={styles.primary} onClick={() => run(listing.active ? 'pause' : 'start')}>{listing.active ? 'Pause lookups' : 'Start / resume'}</button></div></section>
      {message && <p role='status'>{message}</p>}{error && <p className={styles.error} role='alert'>{error}</p>}
      <div className={styles.filters}><label>Find a song or artist<input type='search' value={query} onChange={e => { setQuery(e.target.value); setOffset(0); setSelected([]) }} placeholder='Search the catalogue…' /></label><label>Review status<select value={state} onChange={e => { setState(e.target.value); setOffset(0); setSelected([]) }}><option value=''>All entries</option>{Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><span>{listing.total.toLocaleString()} results</span></div>
      <section className={styles.entries} aria-label='Catalogue entries'>{listing.entries.map(e => <article key={e.entryId}>
        <input type='checkbox' aria-label={`Select ${e.title} by ${e.artist}`} disabled={!['new', 'failed'].includes(e.state)} checked={selected.includes(e.entryId)} onChange={event => setSelected(event.target.checked ? [...selected, e.entryId].slice(0, 25) : selected.filter(id => id !== e.entryId))} />
        <div className={styles.song}><strong>{e.title}</strong><span>{e.artist}</span><small>{e.variants} source {e.variants === 1 ? 'entry' : 'entries'} · {e.librarySongId ? 'Playable library link' : 'Metadata only'}{e.error && ` · ${e.error}`}</small></div>
        <span className={e.state === 'approved' ? styles.approved : styles.badge}>{labels[e.state]}</span><button disabled={e.state === 'working'} onClick={() => open(e.entryId)}>{e.proposal ? 'Review categories' : e.candidates.length ? 'Compare matches' : 'View entry'}</button>
      </article>)}{!listing.entries.length && <p className={styles.empty}>No entries here yet. Import a catalogue or choose another filter.</p>}</section>
      <div className={styles.pagination}><button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 30))}>Previous</button><span>{listing.total ? offset + 1 : 0}–{Math.min(offset + 30, listing.total)} of {listing.total.toLocaleString()}</span><button disabled={offset + 30 >= listing.total} onClick={() => setOffset(offset + 30)}>Next page</button></div>
      <p className={styles.muted}>No categories are approved automatically. Missing evidence stays unknown. Manual library edits are protected from imports.</p>
    </div>
    {detail && <Review key={`${detail.entryId}-${detail.selected}-${detail.state}`} entry={detail} close={() => setDetail(null)} changed={refresh} />}
  </main>
}
