import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ensureState } from 'redux-optimistic-ui'
import HttpApi from 'lib/HttpApi'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { queueSong } from 'routes/Queue/modules/queue'
import SongVersions, { type VersionSong } from '../components/SongVersions/SongVersions'
import { toggleSongStarred } from 'store/modules/userStars'
import getSongsStatus from '../selectors/getSongsStatus'
import { songbookDefaults, type SongbookFilters, type SongbookListing, type SongbookOptions, type SongbookEntry } from 'shared/songbook'
import styles from './ModernLibrary.css'
import bookStyles from './SongbookView.css'
import { type SongCategories } from 'shared/catalog'
import CategoryBrowser, { type CategoryMode } from './CategoryBrowser'

const api = new HttpApi('songbook')
const emptyOptions: SongbookOptions = { genre: [], language: [], decade: [], collection: [], performance: [] }

function EditDetails ({ song, close, saved }: { song: SongbookEntry, close: () => void, saved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [tags, setTags] = useState<SongCategories>(song.categories)
  const [genres, setGenres] = useState((tags.genres ?? [tags.genre]).filter(Boolean).join(', '))
  const [collections, setCollections] = useState(tags.collections.join(', '))
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    const styles = genres.split(',').map(v => v.trim()).filter(Boolean)
    try {
      await api.post(`/${song.entryId}/categories`, { body: { confirmed, categories: { ...tags, genres: styles, genre: styles[0] ?? '', languages: tags.language ? [tags.language] : [], collections: collections.split(',').map(v => v.trim()).filter(Boolean) } } })
      saved(); close()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby='edit-song-details' onCancel={close}><form onSubmit={submit}>
    <p className={styles.eyebrow}>HOST CATEGORIES</p><h2 id='edit-song-details'>Edit song details</h2><p>{song.title} · {song.artist}</p>
    <p className={styles.muted}>Check the credited version. Leave uncertain details blank. Saving records your categories and protects them from automatic suggestions.</p>
    <label>Styles (separate with commas)<input type='text' value={genres} onChange={e => setGenres(e.target.value)} /></label>
    <div className={styles.editGrid}>{(['language', 'decade'] as const).map(key => <label key={key}>{key === 'language' ? 'Lyric language' : 'First release decade (e.g. 1980s)'}<input type='text' maxLength={40} value={tags[key]} onChange={e => setTags({ ...tags, [key]: e.target.value })} /></label>)}<label>Voices<select aria-label='Voices' value={tags.performance} onChange={e => setTags({ ...tags, performance: e.target.value })}><option value=''>Unknown</option>{['Solo', 'Duet', 'Group'].map(v => <option key={v}>{v}</option>)}</select></label></div>
    <label>Collections (separate with commas)<input type='text' value={collections} onChange={e => setCollections(e.target.value)} /></label>
    <label className={styles.untagged}><input type='checkbox' required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I checked this song, version and the categories above.</label>
    {error && <p role='alert'>{error}</p>}<div className={styles.dialogActions}><button type='button' onClick={close} disabled={busy}>Cancel</button><button className={styles.primary} disabled={busy || !confirmed}>{busy ? 'Saving…' : 'Save categories'}</button></div>
  </form></dialog>
}

export default function SongbookView () {
  const dispatch = useAppDispatch()
  const user = useAppSelector(s => s.user)
  const { headerHeight, footerHeight, innerHeight } = useAppSelector(s => s.ui)
  const songStatus = useAppSelector(getSongsStatus)
  const linkedStars = useAppSelector(s => ensureState(s.userStars).starredSongs)
  const librarySongs = useAppSelector(s => s.songs.entities)
  const [versionSong, setVersionSong] = useState<VersionSong | null>(null)
  const [filters, setFilters] = useState<SongbookFilters>(songbookDefaults)
  const [options, setOptions] = useState(emptyOptions)
  const [result, setResult] = useState<SongbookListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, refresh] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [editing, setEditing] = useState<SongbookEntry | null>(null)
  const [categoryMode, setCategoryMode] = useState<CategoryMode>('cards')
  const searchInput = useRef<HTMLInputElement>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const container = useRef<HTMLElement>(null)
  const update = (patch: Partial<SongbookFilters>) => setFilters(previous => ({ ...previous, ...patch, offset: 0 }))
  const showResults = () => requestAnimationFrame(() => resultHeading.current?.focus({ preventScroll: true }))
  useEffect(() => { api.get<SongbookOptions>('/options').then(setOptions).catch(err => setError(err.message)) }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(() => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(filters)) if (value !== '' && value !== false) params.set(key === 'query' ? 'q' : key, value === true ? '1' : String(value))
      api.get<SongbookListing>('/?' + params, { signal: controller.signal }).then(data => {
        if (!controller.signal.aborted) { setResult(data); setError(''); setLoading(false) }
      }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setLoading(false) } })
    }, 200)
    return () => { clearTimeout(timer); controller.abort() }
  }, [filters, revision, linkedStars])
  const star = async (song: SongbookEntry) => {
    if (song.librarySongId && song.available) { dispatch(toggleSongStarred(song.librarySongId)); return }
    setBusy(song.entryId)
    try { await api.post(`/${song.entryId}/star`, { body: { starred: !song.starred } }); refresh(v => v + 1) } catch (err) { setError(err.message) } finally { setBusy(null) }
  }
  const promote = async (song: SongbookEntry) => {
    setBusy(song.entryId)
    try { await api.post(`/${song.entryId}/feature`, { body: { featured: !song.featured } }); refresh(v => v + 1) } catch (err) { setError(err.message) } finally { setBusy(null) }
  }
  const active = Object.entries(filters).some(([key, value]) => !['offset', 'sort'].includes(key) && !!value)
  const page = Math.floor(filters.offset / 40) + 1
  const pages = Math.max(1, Math.ceil((result?.total ?? 0) / 40))
  return <main ref={container} className={`${styles.browser} ${bookStyles.songbook}`} style={{ paddingTop: headerHeight + 24, paddingBottom: footerHeight + 28, height: innerHeight }}>
    <div className={styles.shell}>
      <div className={styles.topline}><span className={styles.brand}>♫ <strong>Karaoke Eternal</strong></span><div><Link to='/library'>Playable library</Link> · <Link to='/queue'>Tonight’s queue</Link>{user.isAdmin && <> · <Link to='/catalogue'>Organise</Link></>}</div></div>
      <header className={styles.hero}><p className={styles.eyebrow}>THE WHOLE COLLECTION</p><h1>One song away<br />{' '}from <em>a great night.</em></h1><p>Search the songbook. Save a favourite. Find your chorus.</p><div className={styles.stats}><span><b>{result?.stats.total.toLocaleString() ?? '…'}</b> songs indexed</span><span><b>{result?.stats.styled.toLocaleString() ?? '…'}</b> with styles</span><span><b>{result?.stats.available.toLocaleString() ?? '…'}</b> ready to sing</span></div><span className={styles.heroNote} aria-hidden='true'>♪</span></header>
      {result && result.stats.available < result.stats.total && <p className={styles.tip}>Browse and save favourites now. Songs become ready to sing after their media is scanned into this instance.</p>}
      <div className={styles.shortcuts} aria-label='Quick categories'>
        <button aria-pressed={!active} onClick={() => update(songbookDefaults)}><span>♫</span>All songs<small>The whole collection</small></button>
        <button aria-pressed={filters.favourites} onClick={() => update({ favourites: !filters.favourites })}><span>★</span>Favourites<small>Your saved singalongs</small></button>
        <button aria-pressed={filters.available} onClick={() => update({ available: !filters.available })}><span>▶</span>Ready to sing<small>Scanned and playable</small></button>
      </div>
      <div className={styles.searchbox}><span aria-hidden='true'>⌕</span><input ref={searchInput} type='search' aria-label='Search full songbook' placeholder='Song, artist, or both…' value={filters.query} onChange={e => { setCategoryMode('search'); update({ query: e.target.value }) }} />{filters.query && <button aria-label='Clear songbook search' onClick={() => update({ query: '' })}>×</button>}</div>
      <CategoryBrowser options={options} filters={filters} mode={categoryMode} resultsReady={!loading} onModeChange={setCategoryMode} onChange={update} onResults={showResults} onSearch={() => { setFiltersOpen(true); requestAnimationFrame(() => searchInput.current?.focus()) }} />
      <button className={styles.filterToggle} aria-expanded={filtersOpen} aria-controls='songbook-filters' onClick={() => { setCategoryMode('search'); setFiltersOpen(!filtersOpen) }}>Refine search <span>{filtersOpen ? '−' : '+'}</span><small>Styles · Collections · Verified song details</small></button>
      <div id='songbook-filters' className={`${styles.filters} ${bookStyles.categories} ${filtersOpen ? styles.filtersOpen : ''}`}>
        {(['genre', 'collection', 'decade', 'language', 'performance'] as const).filter(key => options[key].length > 0).map(key => <label key={key}>{key === 'genre' ? 'Style' : key === 'performance' ? 'Voices' : key[0].toUpperCase() + key.slice(1)}<select aria-label={key === 'genre' ? 'Style' : key === 'performance' ? 'Voices' : key[0].toUpperCase() + key.slice(1)} value={filters[key]} onChange={e => { setCategoryMode('search'); update({ [key]: e.target.value }) }}><option value=''>Any</option>{options[key].map(v => <option key={v}>{v}</option>)}</select></label>)}
      </div>
      <details className={bookStyles.notes}><summary>About styles and Popular first</summary><p>Styles include unreviewed AI suggestions and artist context. Unknown song details stay blank. Popular first uses editorial suggestions, host picks and shared favourites; it is not a chart ranking.</p></details>
      <div className={styles.resultsTop}><div><h2 ref={resultHeading} tabIndex={-1} style={{ scrollMarginTop: headerHeight + 16 }}>{filters.favourites ? 'Your favourites' : active ? 'Your matches' : 'Explore the songbook'}</h2><p aria-live='polite'>{loading ? 'Searching…' : `${result?.total.toLocaleString() ?? 0} songs`}{active && <> · <button onClick={() => update(songbookDefaults)}>Clear filters</button></>}</p></div><label>Sort by<select aria-label='Sort songbook' value={filters.sort} onChange={e => update({ sort: e.target.value })}><option value='popular'>Popular first</option><option value='title'>Song title</option><option value='artist'>Artist</option></select></label></div>
      {user.isAdmin && <label className={styles.untagged}><input type='checkbox' checked={filters.untagged} onChange={e => update({ untagged: e.target.checked })} /> Show songs without a style</label>}
      {error && <p role='alert' className={bookStyles.error}>{error} <button onClick={() => refresh(v => v + 1)}>Try again</button></p>}
      <p role='status' className={styles.srOnly}>{message}</p>
      <div className={styles.songlist} aria-busy={loading}>
        {result?.entries.map((song, index) => {
          const queued = !!song.librarySongId && (songStatus.upcoming.has(song.librarySongId) || songStatus.current === song.librarySongId)
          const starred = song.librarySongId && song.available ? linkedStars.includes(song.librarySongId) : song.starred
          return <article key={song.entryId} className={styles.song} aria-label={`${song.title} by ${song.artist}`}>
            <div className={styles.songNumber}>{filters.offset + index + 1}</div>
            <div className={styles.songInfo}><h3>{song.title}</h3><p>{song.artist}</p><div className={styles.tags}>{[...(song.categories.genres ?? [song.categories.genre]), song.categories.decade, song.categories.language, ...song.categories.collections].filter(Boolean).map((tag, i) => <span key={i}>{tag}</span>)}</div><small className={bookStyles.basis}>{song.categorySource === 'suggested' ? song.styleBasis.startsWith('artist_') ? 'Artist style · unreviewed' : 'AI suggestion · unreviewed' : song.categorySource === 'reviewed' || song.categorySource === 'library' ? 'Host categories' : 'Details not categorised'}</small>{user.isAdmin && <><button className={styles.edit} onClick={() => setEditing(song)}>Edit song details</button><button disabled={busy === song.entryId} className={styles.edit} onClick={() => promote(song)}>{song.featured ? '★ Host pick · remove promotion' : 'Promote in Popular first'}</button></>}</div>
            {song.available && song.librarySongId && (librarySongs[song.librarySongId]?.numMedia ?? 0) > 1 && <button className={styles.versions} aria-label={`Choose version of ${song.title}`} onClick={() => setVersionSong({ songId: song.librarySongId, title: song.title, artist: song.artist })}>Versions ({librarySongs[song.librarySongId].numMedia})</button>}
            <button className={styles.star} aria-pressed={starred} aria-label={`${starred ? 'Unfavourite' : 'Favourite'} ${song.title}`} disabled={busy === song.entryId} onClick={() => star(song)}>{starred ? '★' : '☆'}</button>
            <button className={styles.add} disabled={!song.available || !song.librarySongId || !user.roomId || queued} onClick={() => { dispatch(queueSong(song.librarySongId)); setMessage(`${song.title} added to your queue`) }}>{!song.available ? 'Media not scanned' : queued ? '✓ Queued' : '+ Add to queue'}</button>
          </article>
        })}
      </div>
      {!loading && result?.total === 0 && <div className={styles.empty}><h3>No songs found</h3><p>Try fewer words or a different category.</p><button onClick={() => update(songbookDefaults)}>Clear filters</button></div>}
      {pages > 1 && <nav className={styles.pagination} aria-label='Songbook pages'><button disabled={loading || page === 1} onClick={() => { setFilters(f => ({ ...f, offset: Math.max(0, f.offset - 40) })); container.current?.scrollTo(0, 0) }}>← Previous</button><span>Page {page.toLocaleString()} of {pages.toLocaleString()}</span><button disabled={loading || page >= pages} onClick={() => { setFilters(f => ({ ...f, offset: f.offset + 40 })); container.current?.scrollTo(0, 0) }}>Next →</button></nav>}
    </div>
    {editing && <EditDetails song={editing} close={() => setEditing(null)} saved={() => { refresh(v => v + 1); api.get<SongbookOptions>('/options').then(setOptions).catch(err => setError(err.message)) }} />}
    {versionSong && <SongVersions key={versionSong.songId} song={versionSong} canQueue={!!user.roomId && !songStatus.upcoming.has(versionSong.songId) && songStatus.current !== versionSong.songId} unavailableReason={!user.roomId ? 'Join a room to add this song to the queue.' : 'This song is already queued.'} onClose={() => setVersionSong(null)} onQueue={mediaId => { dispatch(queueSong(versionSong.songId, mediaId)); setMessage(`Adding ${versionSong.title} with your selected version`); setVersionSong(null) }} />}
  </main>
}
