import React, { useEffect, useRef } from 'react'
import { useAppSelector } from 'store/hooks'
import { ensureState } from 'redux-optimistic-ui'
import { Link } from 'react-router'
import getRoundRobinQueue from '../selectors/getRoundRobinQueue'
import getPendingQueue from '../selectors/getPendingQueue'
import QueueList from '../components/QueueList/QueueList'
import Spinner from 'components/Spinner/Spinner'
import TextOverlay from 'components/TextOverlay/TextOverlay'
import styles from './QueueView.css'

const QUEUE_ITEM_HEIGHT = 92

const QueueView = () => {
  const { innerWidth, innerHeight, headerHeight, footerHeight } = useAppSelector(state => state.ui)
  const isInRoom = useAppSelector(state => !!state.user.roomId)
  const isAdmin = useAppSelector(state => state.user.isAdmin)
  const isLoading = useAppSelector(state => ensureState(state.queue).isLoading)
  const queue = useAppSelector(getRoundRobinQueue)
  const pending = useAppSelector(getPendingQueue)
  const queueId = useAppSelector(state => state.status.queueId)
  const containerRef = useRef<HTMLDivElement>(null)

  // ensure current song is in view on first mount only
  useEffect(() => {
    if (containerRef.current) {
      const i = queue.result.indexOf(queueId)
      containerRef.current.scrollTop = QUEUE_ITEM_HEIGHT * i
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={styles.container}
      ref={containerRef}
      style={{
        paddingTop: headerHeight,
        paddingBottom: footerHeight,
        width: innerWidth,
        height: innerHeight,
      }}
    >
      {!isInRoom && (
        <TextOverlay>
          <h1>Get a Room!</h1>
          <p>
            <Link to='/account'>Sign in to a room</Link>
            {' '}
            to start queueing songs.
          </p>
        </TextOverlay>
      )}

      {isLoading && <Spinner />}

      {!isLoading && queue.result.length === 0 && pending.length === 0 && (
        <TextOverlay>
          <h1>Queue Empty</h1>
          <p>
            Tap a song in the
            {' '}
            <Link to='/library'>library</Link>
            {' '}
            to queue it.
          </p>
        </TextOverlay>
      )}

      {isInRoom && <header className={styles.summary}><h1>Tonight’s queue</h1><p>{isAdmin ? 'Host controls: skip the current song or remove any upcoming song.' : 'Remove your upcoming songs here. Skip is available when your own song is current; the host controls other singers’ songs.'}</p><Link to='/library'>＋ Find another song</Link></header>}
      <QueueList />
    </div>
  )
}

export default QueueView
