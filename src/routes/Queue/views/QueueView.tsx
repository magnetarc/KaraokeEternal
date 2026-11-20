import React from 'react'
import { Link } from 'react-router'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import getRoundRobinQueue from '../selectors/getRoundRobinQueue'
import getPlayerHistory from '../selectors/getPlayerHistory'
import getPendingQueue from '../selectors/getPendingQueue'
import { removeItem } from '../modules/queue'
import QueueList from '../components/QueueList/QueueList'
import styles from './QueueView.css'

export default function QueueView () {
  const { innerHeight, headerHeight, footerHeight } = useAppSelector(state => state.ui)
  const user = useAppSelector(state => state.user)
  const status = useAppSelector(state => state.status)
  const queue = useAppSelector(getRoundRobinQueue)
  const history = useAppSelector(getPlayerHistory)
  const pending = useAppSelector(getPendingQueue)
  const dispatch = useAppDispatch()
  const current = status.isAtQueueEnd ? undefined : status.queueId
  const past = queue.result.filter(id => history.includes(id) && id !== current)
  const upcoming = queue.result.filter(id => !history.includes(id) && id !== current)
  const clear = (ids: number[], message: string) => {
    if (ids.length && confirm(message)) dispatch(removeItem({ queueId: ids }))
  }
  return (
    <main className={styles.container} style={{ paddingTop: headerHeight + 16, paddingBottom: footerHeight + 24, height: innerHeight }}>
      <div className={styles.shell}>
        <header className={styles.summary}>
          <div>
            <h1>Tonight’s queue</h1>
            <p>Everyone gets a turn.</p>
          </div>
          <Link to='/library'>Choose songs</Link>
        </header>
        {!user.roomId
          ? (
              <p>
                <Link to='/account'>Join a room</Link>
                {' '}
                to see its queue.
              </p>
            )
          : (
              <>
                <section aria-label='Now playing'>
                  <h2>Now playing</h2>
                  <QueueList section='current' />
                </section>
                <section aria-label='Up next'>
                  <div className={styles.sectionHeading}>
                    <h2>
                      Up next
                      <span>{upcoming.length + pending.length}</span>
                    </h2>
                    {user.isAdmin && upcoming.length > 0 && <button className={styles.danger} onClick={() => clear(upcoming, 'Remove all upcoming songs? Current playback and history will be kept.')}>Clear upcoming</button>}
                  </div>
                  <QueueList section='upcoming' />
                </section>
                <details className={styles.history}>
                  <summary>
                    History
                    <span>{past.length}</span>
                  </summary>
                  <p>Finished songs are kept here. Add again creates a fresh turn for that version.</p>
                  {user.isAdmin && past.length > 0 && <button className={styles.danger} onClick={() => clear(past, 'Clear this room’s history? Upcoming songs and playback will be kept.')}>Clear history</button>}
                  <QueueList section='history' />
                </details>
              </>
            )}
      </div>
    </main>
  )
}
