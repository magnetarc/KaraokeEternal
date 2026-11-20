import React, { useEffect, useRef, useState } from 'react'
import { ensureState } from 'redux-optimistic-ui'
import HttpApi from 'lib/HttpApi'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { queueSong } from 'routes/Queue/modules/queue'
import useBrowseState from '../useBrowseState'
import BrowserBar from '../components/BrowserBar'
import BrowsePagination from '../components/BrowsePagination'
import SongRow from '../components/SongRow'
import SongVersions, { type VersionSong } from '../components/SongVersions/SongVersions'
import { toggleSongStarred } from 'store/modules/userStars'
import getSongsStatus from '../selectors/getSongsStatus'
import { songbookDefaults, type SongbookFilters, type SongbookListing, type SongbookOptions, type SongbookEntry } from 'shared/songbook'
import styles from './ModernLibrary.css'
import bookStyles from './SongbookView.css'
import { type SongCategories } from 'shared/catalog'
import CategoryBrowser, { type CategoryMode } from './CategoryBrowser'

const api = new HttpApi('songbook')
const browseDefaults = { ...songbookDefaults, mode: 'cards' as CategoryMode }
const emptyOptions: SongbookOptions = { genre: [], language: [], decade: [], collection: [], performance: [] }

function EditDetails ({ song, close, saved }: { song: SongbookEntry, close: () => void, saved: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [tags, setTags] = useState<SongCategories>(song.categories)
  const [genres, setGenres] = useState((tags.genres ?? [tags.genre]).filter(Boolean).join(', '))
  const [collections, setCollections] = useState(tags.collections.join(', '))
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const styles = genres.split(',').map(v => v.trim()).filter(Boolean)
    try {
      await api.post(`/${song.entryId}/categories`, { body: { confirmed, categories: { ...tags, genres: styles, genre: styles[0] ?? '', languages: tags.language ? [tags.language] : [], collections: collections.split(',').map(v => v.trim()).filter(Boolean) } } })
      saved()
      close()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby='edit-song-details' onCancel={close}>
      <form onSubmit={submit}>
        <p className={styles.eyebrow}>HOST CATEGORIES</p>
        <h2 id='edit-song-details'>Edit song details</h2>
        <p>
          {song.title}
          {' '}
          ·
          {' '}
          {song.artist}
        </p>
        <p className={styles.muted}>Check the credited version. Leave uncertain details blank. Saving records your categories and protects them from automatic suggestions.</p>
        <label>
          Styles (separate with commas)
          <input type='text' value={genres} onChange={e => setGenres(e.target.value)} />
        </label>
        <div className={styles.editGrid}>
          {(['language', 'decade'] as const).map(key => (
            <label key={key}>
              {key === 'language' ? 'Lyric language' : 'First release decade (e.g. 1980s)'}
              <input type='text' maxLength={40} value={tags[key]} onChange={e => setTags({ ...tags, [key]: e.target.value })} />
            </label>
          ))}
          <label>
            Voices
            <select aria-label='Voices' value={tags.performance} onChange={e => setTags({ ...tags, performance: e.target.value })}>
              <option value=''>Unknown</option>
              {['Solo', 'Duet', 'Group'].map(v => <option key={v}>{v}</option>)}
            </select>
          </label>
        </div>
        <label>
          Collections (separate with commas)
          <input type='text' value={collections} onChange={e => setCollections(e.target.value)} />
        </label>
        <label className={styles.untagged}>
          <input type='checkbox' required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
          I checked this song, version and the categories above.
        </label>
        {error && <p role='alert'>{error}</p>}
        <div className={styles.dialogActions}>
          <button type='button' onClick={close} disabled={busy}>Cancel</button>
          <button className={styles.primary} disabled={busy || !confirmed}>{busy ? 'Saving…' : 'Save categories'}</button>
        </div>
      </form>
    </dialog>
  )
}

export default function SongbookView () {
  const dispatch = useAppDispatch()
  const user = useAppSelector(s => s.user)
  const { headerHeight, footerHeight, innerHeight } = useAppSelector(s => s.ui)
  const songStatus = useAppSelector(getSongsStatus)
  const linkedStars = useAppSelector(s => ensureState(s.userStars).starredSongs)
  const librarySongs = useAppSelector(s => s.songs.entities)
  const [versionSong, setVersionSong] = useState<VersionSong | null>(null)
  const containerRef = useRef<HTMLElement>(null)
  const { state: filters, change, onScroll } = useBrowseState(browseDefaults, containerRef)
  const [options, setOptions] = useState(emptyOptions)
  const [result, setResult] = useState<SongbookListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [editing, setEditing] = useState<SongbookEntry | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resultHeadingRef = useRef<HTMLHeadingElement>(null)
  const update = (patch: Partial<SongbookFilters>, mode: CategoryMode = 'search') => change({ ...patch, offset: 0, mode })
  useEffect(() => {
    api.get<SongbookOptions>('/options').then(setOptions).catch(err => setError(err.message))
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the request indicator when URL filters change
    setLoading(true)
    const timer = setTimeout(() => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(filters)) if (key !== 'mode' && value !== '' && value !== false) params.set(key === 'query' ? 'q' : key, value === true ? '1' : String(value))
      api.get<SongbookListing>('/?' + params, { signal: controller.signal }).then((data) => {
        if (!controller.signal.aborted) {
          setResult(data)
          setError('')
          setLoading(false)
        }
        return
      }).catch((err) => {
        if (!controller.signal.aborted) {
          setError(err.message)
          setLoading(false)
        }
      })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [filters, revision, linkedStars])
  const star = async (song: SongbookEntry) => {
    if (song.librarySongId && song.available) {
      dispatch(toggleSongStarred(song.librarySongId))
      return
    }
    setBusy(song.entryId)
    try {
      await api.post(`/${song.entryId}/star`, { body: { starred: !song.starred } })
      setRevision(v => v + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }
  const promote = async (song: SongbookEntry) => {
    setBusy(song.entryId)
    try {
      await api.post(`/${song.entryId}/feature`, { body: { featured: !song.featured } })
      setRevision(v => v + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }
  const active = Object.entries(filters).some(([key, value]) => !['offset', 'sort', 'mode'].includes(key) && !!value)
  const page = Math.floor(filters.offset / 40)
  const pages = Math.max(1, Math.ceil((result?.total ?? 0) / 40))
  const showSongs = filters.mode === 'search' || active
  const title = filters.genre || filters.collection || filters.decade || filters.language || filters.performance || (filters.favourites ? 'Favourites' : filters.query ? 'Search results' : 'Full songbook')
  const pagination = (label: string) => <BrowsePagination label={label} page={page} pages={pages} busy={loading} onChange={page => change({ offset: page * 40, mode: 'search' })} />
  return (
    <main ref={containerRef} onScroll={onScroll} className={`${styles.browser} ${bookStyles.songbook}`} style={{ top: headerHeight, paddingBottom: footerHeight + 20, height: innerHeight - headerHeight }}>
      <div className={styles.shell}>
        <BrowserBar isAdmin={user.isAdmin} book category={title} onCategories={showSongs ? () => update(songbookDefaults, 'cards') : undefined}>
          <div className={styles.searchRow}>
            <div className={styles.searchbox}>
              <span aria-hidden='true'>⌕</span>
              <input ref={searchInputRef} type='search' aria-label='Search full songbook' placeholder='Search songs or artists' value={filters.query} onChange={e => change({ query: e.target.value, offset: 0, mode: 'search' }, true)} />
              {filters.query && <button aria-label='Clear songbook search' onClick={() => update({ query: '' })}>×</button>}
            </div>
            <button className={styles.favourites} aria-pressed={filters.favourites} onClick={() => update({ favourites: !filters.favourites })}>
              ★
              <span>Favourites</span>
            </button>
          </div>
        </BrowserBar>
        <CategoryBrowser options={options} filters={filters} mode={filters.mode} onChange={update} onResults={() => requestAnimationFrame(() => resultHeadingRef.current?.focus({ preventScroll: true }))} onSearch={() => searchInputRef.current?.focus()} />
        {!showSongs && (
          <p className={styles.librarySize}>
            {result?.stats.total.toLocaleString() ?? '…'}
            {' '}
            songbook entries ·
            {' '}
            {result?.stats.available.toLocaleString() ?? '…'}
            {' '}
            ready to sing
          </p>
        )}
        {showSongs && (
          <>
            <div className={styles.resultsTop}>
              <div>
                <h1 ref={resultHeadingRef} tabIndex={-1}>{title}</h1>
                <p aria-live='polite'>{loading ? 'Searching…' : `${result?.total.toLocaleString() ?? 0} songs`}</p>
              </div>
              <label>
                Sort
                <select aria-label='Sort songbook' value={filters.sort} onChange={e => update({ sort: e.target.value })}>
                  <option value='popular'>Recommended</option>
                  <option value='title'>Song title</option>
                  <option value='artist'>Artist</option>
                </select>
              </label>
              <button className={styles.filterToggle} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>Filters</button>
            </div>
            {filtersOpen && (
              <div className={`${styles.filters} ${styles.filtersOpen}`}>
                {(['genre', 'collection', 'decade', 'language', 'performance'] as const).filter(key => options[key].length > 0 && !(key === 'genre' && filters.genre)).map(key => (
                  <label key={key}>
                    {key === 'performance' ? 'Voices' : key}
                    <select aria-label={key === 'performance' ? 'Voices' : key} value={filters[key]} onChange={e => update({ [key]: e.target.value })}>
                      <option value=''>Any</option>
                      {options[key].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </label>
                ))}
                <label className={styles.untagged}>
                  <input type='checkbox' checked={filters.available} onChange={e => update({ available: e.target.checked })} />
                  Ready to sing only
                </label>
                {user.isAdmin && (
                  <label className={styles.untagged}>
                    <input type='checkbox' checked={filters.untagged} onChange={e => update({ untagged: e.target.checked })} />
                    Without a style
                  </label>
                )}
                <p className={styles.muted}>Styles include unreviewed suggestions. Unknown song details stay blank. Recommendations start with editorial picks and learn from completed plays.</p>
              </div>
            )}
            {error && (
              <p role='alert'>
                {error}
                {' '}
                <button onClick={() => setRevision(v => v + 1)}>Try again</button>
              </p>
            )}
            {pagination('Songbook pages top')}
            <div className={styles.songlist} aria-busy={loading}>
              {result?.entries.map((song) => {
                const queued = !!song.librarySongId && (songStatus.upcoming.has(song.librarySongId) || songStatus.current === song.librarySongId)
                const starred = song.librarySongId && song.available ? linkedStars.includes(song.librarySongId) : song.starred
                return (
                  <SongRow
                    key={song.entryId}
                    title={song.title}
                    artist={song.artist}
                    versionCount={librarySongs[song.librarySongId]?.numMedia ?? 0}
                    starred={starred}
                    queued={queued}
                    canAdd={!!song.available && !!song.librarySongId && !!user.roomId}
                    unavailable={!song.available ? 'Not ready' : 'Join room'}
                    onAdd={() => {
                      dispatch(queueSong(song.librarySongId))
                      setMessage(`${song.title} added`)
                    }}
                    onStar={() => star(song)}
                    onVersions={() => setVersionSong({ songId: song.librarySongId, title: song.title, artist: song.artist })}
                  >
                    <p>{[...song.categories.genres ?? [song.categories.genre], song.categories.decade, song.categories.language, ...song.categories.collections].filter(Boolean).join(' · ')}</p>
                    <p>{song.categorySource === 'suggested' ? 'Suggested categories · unreviewed' : song.categorySource === 'unknown' ? 'Not categorised' : 'Host categories'}</p>
                    {user.isAdmin && (
                      <>
                        <button onClick={() => setEditing(song)}>Edit song details</button>
                        <button disabled={busy === song.entryId} onClick={() => promote(song)}>{song.featured ? 'Remove host pick' : 'Make host pick'}</button>
                      </>
                    )}
                  </SongRow>
                )
              })}
            </div>
            {!loading && result?.total === 0 && (
              <div className={styles.empty}>
                <h2>No songs found</h2>
                <button onClick={() => update(songbookDefaults, 'cards')}>All categories</button>
              </div>
            )}
            {pagination('Songbook pages bottom')}
          </>
        )}
        <p role='status' className={styles.srOnly}>{message}</p>
      </div>
      {editing && (
        <EditDetails
          song={editing}
          close={() => setEditing(null)}
          saved={() => {
            setRevision(v => v + 1)
            api.get<SongbookOptions>('/options').then(setOptions).catch(err => setError(err.message))
          }}
        />
      )}
      {versionSong && (
        <SongVersions
          key={versionSong.songId}
          song={versionSong}
          canQueue={!!user.roomId && !songStatus.upcoming.has(versionSong.songId) && songStatus.current !== versionSong.songId}
          unavailableReason={!user.roomId ? 'Join a room to add this song.' : 'This song is already queued.'}
          onClose={() => setVersionSong(null)}
          onQueue={(mediaId) => {
            dispatch(queueSong(versionSong.songId, mediaId))
            setMessage(`${versionSong.title} added with your selected version`)
            setVersionSong(null)
          }}
        />
      )}
    </main>
  )
}
