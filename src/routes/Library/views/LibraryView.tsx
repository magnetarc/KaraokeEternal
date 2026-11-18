import React, { useEffect, useRef, useState } from 'react'
import { useAppSelector } from 'store/hooks'
import { Link } from 'react-router'
import ArtistList from '../components/ArtistList/ArtistList'
import SearchResults from '../components/SearchResults/SearchResults'
import TextOverlay from 'components/TextOverlay/TextOverlay'
import Spinner from 'components/Spinner/Spinner'
import styles from './LibraryView.css'
import { useLocation, Link as RouterLink } from 'react-router'
import ModernLibrary from './ModernLibrary'

const BrowserView = () => {
  const location = useLocation()
  return new URLSearchParams(location.search).get('view') === 'classic'
    ? <><RouterLink to='/library' style={{ position: 'fixed', top: 6, right: 12, zIndex: 20, fontSize: 12 }}>Modern browser</RouterLink><LibraryView /></>
    : <ModernLibrary />
}

const LibraryView = () => {
  const { isAdmin } = useAppSelector(state => state.user)
  const { isLoading, filterStr, filterStarred } = useAppSelector(state => state.library)
  const songsResult = useAppSelector(state => state.songs.result)
  const ui = useAppSelector(state => state.ui)

  const isSearching = !!filterStr.trim().length || filterStarred

  // ArtistList virtualizes rows against ui.headerHeight (the header includes
  // LibraryHeader on this route, measured async via ResizeObserver). Its saved
  // scroll offset is only applied once at mount, so mounting before the height
  // settles makes the restored position land off by the delta. Wait for the
  // first growth past the value at mount before rendering ArtistList.
  const initialHeaderHeightRef = useRef(ui.headerHeight)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!ready && ui.headerHeight > initialHeaderHeightRef.current) {
      setReady(true)
    }
  }, [ui.headerHeight, ready])

  if (!ready) return null

  return (
    <>
      {!isSearching && <ArtistList ui={ui} />}

      {isSearching && <SearchResults ui={ui} />}

      {isLoading && <Spinner />}

      {!isLoading && songsResult.length === 0 && (
        <TextOverlay className={styles.empty}>
          <h1>Library Empty</h1>
          {isAdmin && (
            <p>
              <Link to='/account'>Add media folders</Link>
              {' '}
              to get started.
            </p>
          )}
        </TextOverlay>
      )}
    </>
  )
}

export default BrowserView
