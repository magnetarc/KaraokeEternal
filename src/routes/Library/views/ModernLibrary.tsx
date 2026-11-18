import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ensureState } from 'redux-optimistic-ui'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { queueSong, removeItem } from 'routes/Queue/modules/queue'
import getRoundRobinQueue from 'routes/Queue/selectors/getRoundRobinQueue'
import getSongsStatus from '../selectors/getSongsStatus'
import { toggleSongStarred } from 'store/modules/userStars'
import { requestPlayNext } from 'store/modules/status'
import { formatDuration } from 'lib/dateTime'
import HttpApi from 'lib/HttpApi'
import type { Song } from 'shared/types'
import { emptyCategories, type SongCategories } from 'shared/catalog'
import { browseSongs, defaultFilters, type BrowseFilters } from '../catalogBrowse'
import styles from './ModernLibrary.css'

const PAGE_SIZE = 40
const api = new HttpApi()

function CategoryEditor ({ song, onClose }: { song: Song, onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [tags, setTags] = useState<SongCategories>({ ...emptyCategories, ...song.categories })
  const [collections, setCollections] = useState(tags.collections.join(', '))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { dialog.current?.showModal() }, [])
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.put(`song/${song.songId}/categories`, { body: { ...tags, collections: collections.split(',').map(v => v.trim()).filter(Boolean) } })
      onClose()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save categories') } finally { setSaving(false) }
  }
  return (
    <dialog ref={dialog} className={styles.dialog} onCancel={onClose} aria-labelledby='category-title'>
      <form onSubmit={save}>
        <p className={styles.eyebrow}>ORGANISE YOUR LIBRARY</p>
        <h2 id='category-title'>Edit categories</h2>
        <p>{song.title}</p>
        <div className={styles.editGrid}>
          {(['genre', 'language', 'decade'] as const).map(key => (
            <label key={key}>{key === 'decade' ? 'Decade (e.g. 1980s)' : key === 'genre' ? 'Genre' : 'Language'}
              <input type='text' maxLength={40} value={tags[key]} onChange={e => setTags({ ...tags, [key]: e.target.value, ...(key === 'genre' ? { genres: undefined } : key === 'language' ? { languages: undefined } : {}) })} />
            </label>
          ))}
          <label>Performance<select value={tags.performance} onChange={e => setTags({ ...tags, performance: e.target.value })}>
            <option value=''>Uncategorised</option>{['Solo', 'Duet', 'Group'].map(v => <option key={v}>{v}</option>)}
          </select></label>
        </div>
        <label>Collections (separate with commas)<input type='text' value={collections} onChange={e => setCollections(e.target.value)} placeholder='Party starters, Crowd favourites' /></label>
        <label><input type='checkbox' checked={!!tags.featured} onChange={e => setTags({ ...tags, featured: e.target.checked })} /> Promote in Popular first</label>
        <p className={styles.muted}>Categories are shared with everyone. Leave a field blank if you are unsure.</p>
        {error && <p role='alert'>{error}</p>}
        <div className={styles.dialogActions}><button type='button' onClick={onClose} disabled={saving}>Cancel</button><button className={styles.primary} disabled={saving}>{saving ? 'Saving…' : 'Save categories'}</button></div>
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
  const queue = useAppSelector(getRoundRobinQueue)
  const status = useAppSelector(state => state.status)
  const songStatus = useAppSelector(getSongsStatus)
  const [filters, setFilters] = useState<BrowseFilters>(defaultFilters)
  const [page, setPage] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editing, setEditing] = useState<Song | null>(null)
  const [message, setMessage] = useState('')
  const [isTest, setIsTest] = useState(false)
  useEffect(() => {
    let mounted = true
    api.get<{ isTest: boolean }>('instance').then(value => { if (mounted) setIsTest(value.isTest) }).catch(() => {})
    return () => { mounted = false }
  }, [])
  const container = useRef<HTMLDivElement>(null)
  const allSongs = useMemo(() => songs.result.map(id => songs.entities[id]), [songs])
  const options = useMemo(() => {
    const values = (key: 'genre' | 'decade' | 'language' | 'performance' | 'collections') => [...new Set(allSongs.flatMap(s => key === 'genre' ? [s.categories?.genre, ...(s.categories?.genres ?? [])] : key === 'language' ? [s.categories?.language, ...(s.categories?.languages ?? [])] : s.categories?.[key] ?? []).filter(Boolean))].sort()
    return { genre: values('genre'), decade: values('decade'), language: values('language'), performance: values('performance'), collection: values('collections') }
  }, [allSongs])
  const popularity = useMemo(() => {
    const queued: Record<number, number> = {}
    for (const id of queue.result) { const songId = queue.entities[id].songId; queued[songId] = (queued[songId] ?? 0) + 1 }
    return { songs: sharedStars.songs, artists: sharedStars.artists, queued }
  }, [sharedStars, queue])
  const results = useMemo(() => browseSongs(allSongs, artists, stars, filters, popularity), [allSongs, artists, stars, filters, popularity])
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const safePage = Math.min(page, pages - 1)
  const update = (patch: Partial<BrowseFilters>) => { setFilters(previous => ({ ...previous, ...patch })); setPage(0) }
  const currentIndex = queue.result.indexOf(status.queueId)
  const current = status.isAtQueueEnd ? undefined : queue.entities[status.queueId]
  const upcoming = queue.result.slice(currentIndex + 1).filter(id => id !== current?.queueId).map(id => queue.entities[id])
  const active = filters.query || filters.genre || filters.decade || filters.language || filters.performance || filters.collection || filters.favourites || filters.untagged

  return (
    <main className={styles.browser} ref={container} style={{ paddingTop: headerHeight + 24, paddingBottom: footerHeight + 28, height: innerHeight }}>
      <div className={styles.shell}>
        <div className={styles.topline}><span className={styles.brand}>♫ <strong>Karaoke Eternal</strong><span className={styles.preview}>BROWSER PREVIEW</span></span><span>{user.isAdmin && <Link to='/catalogue'>Organise library · </Link>}<Link to='/library?view=classic'>Original search ↗</Link></span></div>
        {isTest && <p className={styles.demo}>TEST LIBRARY · This instance is separate from your live karaoke setup.</p>}
        <p className={styles.tip}><Link to='/songbook'>Explore the full songbook →</Link> · Search the indexed collection and save favourites.</p>
        <div className={styles.layout}>
          <section className={styles.main} aria-label='Song browser'>
            <header className={styles.hero}>
              <p className={styles.eyebrow}>YOUR NIGHT. YOUR SONG.</p>
              <h1>Find your next<br />{' '}<em>big moment.</em></h1>
              <p>Old favourites. New discoveries. One more chorus.</p>
              <div className={styles.stats}><span><b>{allSongs.length.toLocaleString()}</b> songs</span><span><b>{stars.size}</b> favourites</span><span><b>{upcoming.length}</b> up next</span></div>
              <span className={styles.heroNote} aria-hidden='true'>♪</span>
            </header>
            <div className={styles.shortcuts} aria-label='Quick categories'>
              <button aria-pressed={!active} onClick={() => update(defaultFilters)}><span>♫</span>All songs<small>The whole collection</small></button>
              <button aria-pressed={filters.favourites} onClick={() => update({ favourites: !filters.favourites })}><span>★</span>Favourites<small>Your saved singalongs</small></button>
              <button aria-pressed={filters.performance === 'Duet'} onClick={() => update({ performance: filters.performance === 'Duet' ? '' : 'Duet' })}><span>♬</span>Duets<small>Better together</small></button>
            </div>
            <div className={styles.searchbox}><span aria-hidden='true'>⌕</span><input type='search' aria-label='Search songs or artists' placeholder='What do you feel like singing?' value={filters.query} onChange={e => update({ query: e.target.value })} />{filters.query && <button onClick={() => update({ query: '' })} aria-label='Clear song search'>×</button>}</div>
            <button className={styles.filterToggle} aria-expanded={filtersOpen} aria-controls='browser-category-filters' onClick={() => setFiltersOpen(!filtersOpen)}>Browse categories <span>{filtersOpen ? '−' : '+'}</span><small>Genre · Decade · Language · Voices · Collections</small></button>
            <div id='browser-category-filters' className={`${styles.filters} ${filtersOpen ? styles.filtersOpen : ''}`}>
              {(['genre', 'decade', 'language', 'performance', 'collection'] as const).map(key => (
                <label key={key}>{key === 'performance' ? 'Voices' : key[0].toUpperCase() + key.slice(1)}<select aria-label={key === 'performance' ? 'Voices' : key[0].toUpperCase() + key.slice(1)} value={filters[key]} onChange={e => update({ [key]: e.target.value })}>
                  <option value=''>All {key === 'performance' ? 'voices' : key === 'collection' ? 'collections' : key + 's'}</option>
                  {[...new Set([...options[key], ...(filters[key] ? [filters[key]] : [])])].sort().map(v => <option key={v}>{v}</option>)}
                </select></label>
              ))}
            </div>
            {options.genre.length === 0 && !library.isLoading && <p className={styles.tip}>A little organisation goes a long way. {user.isAdmin ? 'Use “Edit categories” on a song to add genres, decades and collections.' : 'Your host can add genres, decades and collections.'}</p>}
            <div className={styles.resultsTop}><div><h2>{active ? 'Your matches' : 'The songbook'}</h2><p aria-live='polite'>{library.isLoading ? 'Loading library…' : `${results.length.toLocaleString()} songs`}{active && <> · <button onClick={() => update(defaultFilters)}>Clear filters</button></>}</p></div><label>Sort by<select aria-label='Sort by' value={filters.sort} onChange={e => update({ sort: e.target.value })}><option value='popular'>Popular first</option><option value='title'>Song title</option><option value='artist'>Artist</option><option value='duration'>Shortest first</option></select></label></div>
            {filters.sort === 'popular' && <p className={styles.muted}>Exact title matches first, then host picks, shared favourites and this room’s queue activity.</p>}
            {user.isAdmin && <label className={styles.untagged}><input type='checkbox' checked={filters.untagged} onChange={e => update({ untagged: e.target.checked })} /> Show uncategorised songs</label>}
            <p className={styles.srOnly} role='status'>{message}</p>
            <div className={styles.songlist}>
              {results.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map((song, index) => {
                const isQueued = songStatus.upcoming.has(song.songId) || songStatus.current === song.songId
                return <article key={song.songId} className={styles.song} aria-label={`${song.title} by ${artists[song.artistId]?.name ?? ''}`}>
                  <div className={styles.songNumber}>{String(safePage * PAGE_SIZE + index + 1).padStart(2, '0')}</div>
                  <div className={styles.songInfo}><h3>{song.title}</h3><p>{artists[song.artistId]?.name}</p><div className={styles.tags}>{[song.categories?.genre, song.categories?.decade, song.categories?.language, song.categories?.performance === 'Duet' ? 'Duet' : '', ...song.categories?.collections ?? []].filter(Boolean).map((tag, i) => <span key={`${tag}-${i}`}>{tag}</span>)}</div>{user.isAdmin && <button className={styles.edit} onClick={() => setEditing(song)}>Edit categories</button>}</div>
                  <span className={styles.duration}>{formatDuration(song.duration)}</span>
                  <button className={styles.star} aria-pressed={stars.has(song.songId)} aria-label={`${stars.has(song.songId) ? 'Unfavourite' : 'Favourite'} ${song.title}`} onClick={() => dispatch(toggleSongStarred(song.songId))}>{stars.has(song.songId) ? '★' : '☆'}</button>
                  <button className={styles.add} disabled={isQueued || !user.roomId} onClick={() => { dispatch(queueSong(song.songId)); setMessage(`${song.title} added to your queue`) }} aria-label={`Add ${song.title} to queue`}>{isQueued ? '✓ Queued' : '+ Add to queue'}</button>
                </article>
              })}
            </div>
            {!library.isLoading && results.length === 0 && <div className={styles.empty}><h3>{allSongs.length ? 'No songs found' : 'Your songbook is waiting'}</h3><p>{allSongs.length ? 'Try a different search or clear a category.' : 'Add a local media folder in Account to start your collection.'}</p>{allSongs.length > 0 ? <button onClick={() => update(defaultFilters)}>Clear filters</button> : user.isAdmin && <Link to='/account'>Open account settings</Link>}</div>}
            {!user.roomId && <p className={styles.tip}><Link to='/account'>Join a room</Link> to add songs to the queue.</p>}
            {pages > 1 && <nav className={styles.pagination} aria-label='Song pages'><button disabled={safePage === 0} onClick={() => { setPage(safePage - 1); container.current?.scrollTo(0, 0) }}>← Previous</button><span>Page {safePage + 1} of {pages}</span><button disabled={safePage + 1 >= pages} onClick={() => { setPage(safePage + 1); container.current?.scrollTo(0, 0) }}>Next →</button></nav>}
          </section>
          <aside className={styles.queuePanel} aria-label='Queue preview'>
            <div className={styles.queueHeading}><h2>Tonight’s queue</h2><span>{upcoming.length}</span></div>
            <p className={styles.muted}>A fair turn for every singer.</p>
            <div className={styles.now}><p className={styles.eyebrow}>{current ? status.isPlaying ? 'NOW SINGING' : 'READY TO SING' : 'THE STAGE IS YOURS'}</p><div className={styles.record} aria-hidden='true'>♫</div><h3>{current ? songs.entities[current.songId]?.title : 'Pick your first song'}</h3><p>{current ? current.userDisplayName : 'Add a song and start the night.'}</p>{current && (user.isAdmin || current.userId === user.userId) && <button className={styles.queueAction} onClick={() => { if (confirm('Skip the current song and play the next one?')) dispatch(requestPlayNext()) }}>Skip to next →</button>}</div>
            <h3 className={styles.upNextTitle}>UP NEXT</h3>
            {upcoming.slice(0, 4).map((item, i) => <div key={item.queueId} className={styles.miniSong}><span>{i + 1}</span><div><strong>{songs.entities[item.songId]?.title}</strong><small>{item.userDisplayName}</small></div>{(user.isAdmin || item.userId === user.userId) && <button aria-label={`Remove ${songs.entities[item.songId]?.title} from queue`} onClick={() => { if (confirm('Remove this song from the queue?')) dispatch(removeItem({ queueId: item.queueId })) }}>Remove</button>}</div>)}
            {!upcoming.length && <p className={styles.muted}>No songs waiting yet.</p>}
            <Link className={styles.viewQueue} to='/queue'>Open full queue →</Link>
            <p className={styles.queueHelp}>{user.isAdmin ? 'Host controls: skip the current song or remove any upcoming song.' : 'You can remove your upcoming songs and skip your own current song. The host controls the rest.'}</p>
          </aside>
        </div>
      </div>
      {editing && <CategoryEditor key={editing.songId} song={editing} onClose={() => setEditing(null)} />}
    </main>
  )
}
