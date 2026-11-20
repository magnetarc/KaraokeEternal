import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ensureState } from 'redux-optimistic-ui'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { queueSong } from 'routes/Queue/modules/queue'
import getSongsStatus from '../selectors/getSongsStatus'
import { toggleSongStarred } from 'store/modules/userStars'
import { formatDuration } from 'lib/dateTime'
import HttpApi from 'lib/HttpApi'
import type { Song } from 'shared/types'
import { emptyCategories, type SongCategories } from 'shared/catalog'
import { browseSongs, defaultFilters, type BrowseFilters } from '../catalogBrowse'
import styles from './ModernLibrary.css'
import CategoryBrowser, { type CategoryMode } from './CategoryBrowser'
import useBrowseState from '../useBrowseState'
import { browseOptions } from '../browseOptions'
import BrowserBar from '../components/BrowserBar'
import BrowsePagination from '../components/BrowsePagination'
import SongRow from '../components/SongRow'
import SongVersions, { type VersionSong } from '../components/SongVersions/SongVersions'

const PAGE_SIZE = 40
const browseDefaults = { ...defaultFilters, page: 0, mode: 'cards' as CategoryMode }
const api = new HttpApi()

function CategoryEditor ({ song, onClose }: { song: Song, onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [tags, setTags] = useState<SongCategories>({ ...emptyCategories, ...song.categories })
  const [collections, setCollections] = useState(tags.collections.join(', '))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.put(`song/${song.songId}/categories`, { body: { ...tags, collections: collections.split(',').map(v => v.trim()).filter(Boolean) } })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save categories')
    } finally {
      setSaving(false)
    }
  }
  return (
    <dialog ref={dialogRef} className={styles.dialog} onCancel={onClose} aria-labelledby='category-title'>
      <form onSubmit={save}>
        <p className={styles.eyebrow}>ORGANISE YOUR LIBRARY</p>
        <h2 id='category-title'>Edit categories</h2>
        <p>{song.title}</p>
        <div className={styles.editGrid}>
          {(['genre', 'language', 'decade'] as const).map(key => (
            <label key={key}>
              {key === 'decade' ? 'Decade (e.g. 1980s)' : key === 'genre' ? 'Genre' : 'Language'}
              <input type='text' maxLength={40} value={tags[key]} onChange={e => setTags({ ...tags, [key]: e.target.value, ...(key === 'genre' ? { genres: undefined } : key === 'language' ? { languages: undefined } : {}) })} />
            </label>
          ))}
          <label>
            Performance
            <select value={tags.performance} onChange={e => setTags({ ...tags, performance: e.target.value })}>
              <option value=''>Uncategorised</option>
              {['Solo', 'Duet', 'Group'].map(v => <option key={v}>{v}</option>)}
            </select>
          </label>
        </div>
        <label>
          Collections (separate with commas)
          <input type='text' value={collections} onChange={e => setCollections(e.target.value)} placeholder='Party starters, Crowd favourites' />
        </label>
        <label>
          <input type='checkbox' checked={!!tags.featured} onChange={e => setTags({ ...tags, featured: e.target.checked })} />
          {' '}
          Promote in Popular first
        </label>
        <p className={styles.muted}>Categories are shared with everyone. Leave a field blank if you are unsure.</p>
        {error && <p role='alert'>{error}</p>}
        <div className={styles.dialogActions}>
          <button type='button' onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.primary} disabled={saving}>{saving ? 'Saving…' : 'Save categories'}</button>
        </div>
      </form>
    </dialog>
  )
}

export default function ModernLibrary () {
  const dispatch = useAppDispatch()
  const { headerHeight, footerHeight, innerHeight } = useAppSelector(state => state.ui)
  const library = useAppSelector(state => state.library)
  const songs = useAppSelector(state => state.songs)
  const artists = useAppSelector(state => state.artists.entities)
  const user = useAppSelector(state => state.user)
  const sharedStars = useAppSelector(state => state.starCounts)
  const starredSongs = useAppSelector(state => ensureState(state.userStars).starredSongs)
  const stars = useMemo(() => new Set(starredSongs), [starredSongs])
  const songStatus = useAppSelector(getSongsStatus)
  const containerRef = useRef<HTMLElement>(null)
  const { state: filters, change, onScroll } = useBrowseState(browseDefaults, containerRef)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editing, setEditing] = useState<Song | null>(null)
  const [versionSong, setVersionSong] = useState<VersionSong | null>(null)
  const [message, setMessage] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resultHeadingRef = useRef<HTMLHeadingElement>(null)
  const allSongs = useMemo(() => songs.result.map(id => songs.entities[id]), [songs])
  const options = useMemo(() => browseOptions(allSongs), [allSongs])
  const refinements = useMemo(() => browseOptions(allSongs, filters), [allSongs, filters])
  const canRefine = user.isAdmin || Object.entries(refinements).some(([key, values]) => values.length > 0 && !(key === 'genre' && filters.genre))
  // Queue additions must not reorder the list underneath the singer.
  const results = useMemo(() => browseSongs(allSongs, artists, stars, filters, { songs: sharedStars.songs, artists: sharedStars.artists }), [allSongs, artists, stars, filters, sharedStars])
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const page = Math.min(filters.page, pages - 1)
  const update = (patch: Partial<BrowseFilters>, mode: CategoryMode = 'search') => change({ ...patch, page: 0, mode })
  const active = filters.query || filters.genre || filters.decade || filters.language || filters.performance || filters.collection || filters.favourites || filters.untagged
  const showSongs = filters.mode === 'search' || !!active
  const title = filters.genre || filters.collection || filters.decade || filters.language || filters.performance || (filters.favourites ? 'Favourites' : filters.query ? 'Search results' : 'All songs')
  const pagination = (label: string) => <BrowsePagination label={label} page={page} pages={pages} onChange={page => change({ page, mode: 'search' })} />
  return (
    <main className={styles.browser} ref={containerRef} onScroll={onScroll} style={{ top: headerHeight, paddingBottom: footerHeight + 20, height: innerHeight - headerHeight }}>
      <div className={styles.shell}>
        <BrowserBar isAdmin={user.isAdmin} category={title} onCategories={showSongs ? () => update(defaultFilters, 'cards') : undefined}>
          <div className={styles.searchRow}>
            <div className={styles.searchbox}>
              <span aria-hidden='true'>⌕</span>
              <input ref={searchInputRef} type='search' aria-label='Search songs or artists' placeholder='Search songs or artists' value={filters.query} onChange={e => change({ query: e.target.value, page: 0, mode: 'search' }, true)} />
              {filters.query && <button onClick={() => update({ query: '' })} aria-label='Clear song search'>×</button>}
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
            {allSongs.length.toLocaleString()}
            {' '}
            songs ·
            {' '}
            {allSongs.reduce((n, s) => n + s.numMedia, 0).toLocaleString()}
            {' '}
            versions
          </p>
        )}
        {showSongs && (
          <>
            <div className={styles.resultsTop}>
              <div>
                <h1 ref={resultHeadingRef} tabIndex={-1}>{title}</h1>
                <p aria-live='polite'>{library.isLoading ? 'Loading…' : `${results.length.toLocaleString()} songs`}</p>
              </div>
              <label>
                Sort
                <select aria-label='Sort by' value={filters.sort} onChange={e => update({ sort: e.target.value })}>
                  <option value='popular'>Recommended</option>
                  <option value='title'>Song title</option>
                  <option value='artist'>Artist</option>
                  <option value='duration'>Shortest first</option>
                </select>
              </label>
              {canRefine && <button className={styles.filterToggle} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>Filters</button>}
            </div>
            {filtersOpen && canRefine && (
              <div className={`${styles.filters} ${styles.filtersOpen}`}>
                {(['genre', 'decade', 'language', 'performance', 'collection'] as const).filter(key => refinements[key].length > 0 && !(key === 'genre' && filters.genre)).map(key => (
                  <label key={key}>
                    {key === 'performance' ? 'Voices' : key}
                    <select aria-label={key === 'performance' ? 'Voices' : key} value={filters[key]} onChange={e => update({ [key]: e.target.value })}>
                      <option value=''>Any</option>
                      {refinements[key].map(value => <option key={value}>{value}</option>)}
                    </select>
                  </label>
                ))}
                {user.isAdmin && (
                  <label className={styles.untagged}>
                    <input type='checkbox' checked={filters.untagged} onChange={e => update({ untagged: e.target.checked })} />
                    Uncategorised
                  </label>
                )}
              </div>
            )}
            {pagination('Song pages top')}
            <div className={styles.songlist}>
              {results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(song => (
                <SongRow
                  key={song.songId}
                  title={song.title}
                  artist={artists[song.artistId]?.name ?? ''}
                  versionCount={song.numMedia}
                  starred={stars.has(song.songId)}
                  queued={songStatus.upcoming.has(song.songId) || songStatus.current === song.songId}
                  canAdd={!!user.roomId}
                  unavailable='Join room'
                  onAdd={() => {
                    dispatch(queueSong(song.songId))
                    setMessage(`${song.title} added`)
                  }}
                  onStar={() => dispatch(toggleSongStarred(song.songId))}
                  onVersions={() => setVersionSong({ songId: song.songId, title: song.title, artist: artists[song.artistId]?.name ?? '' })}
                >
                  <p>{formatDuration(song.duration)}</p>
                  <p>{[song.categories?.genre, song.categories?.decade, song.categories?.language, ...song.categories?.collections ?? []].filter(Boolean).join(' · ')}</p>
                  {user.isAdmin && <button onClick={() => setEditing(song)}>Edit categories</button>}
                </SongRow>
              ))}
            </div>
            {!library.isLoading && !results.length && (
              <div className={styles.empty}>
                <h2>No songs found</h2>
                <button onClick={() => update(defaultFilters, 'cards')}>All categories</button>
              </div>
            )}
            {pagination('Song pages bottom')}
          </>
        )}
        <p className={styles.srOnly} role='status'>{message}</p>
        {editing && <CategoryEditor key={editing.songId} song={editing} onClose={() => setEditing(null)} />}
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
      </div>
    </main>
  )
}
