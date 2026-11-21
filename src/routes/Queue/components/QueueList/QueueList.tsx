import React from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import ProviderQueueItem from '../ProviderQueueItem/ProviderQueueItem'
import { formatSeconds } from 'lib/dateTime'
import styles from '../../views/QueueView.css'
import { requestPlay, requestPause, requestPlayNext, requestReplay } from 'store/modules/status'
import { queueSong, removeItem, moveItem, reorderItem } from '../../modules/queue'
import { providerFetchCancel, providerFetchRequest } from '../../../Library/modules/library'
import getPlayerHistory from '../../selectors/getPlayerHistory'
import getRoundRobinQueue from '../../selectors/getRoundRobinQueue'
import getDisplayQueue from '../../selectors/getDisplayQueue'
import getWaits from '../../selectors/getWaits'
import type { PendingQueueItem } from '../../selectors/getPendingQueue'

const QueueList = ({ section }: { section: 'current' | 'upcoming' | 'history' }) => {
  const artists = useAppSelector(state => state.artists)
  const { errorMessage, isAtQueueEnd, isPlaying, queueId } = useAppSelector(state => state.status)

  const playerHistory = useAppSelector(getPlayerHistory)
  const queue = useAppSelector(getRoundRobinQueue)
  const rows = useAppSelector(getDisplayQueue)
  const songs = useAppSelector(state => state.songs)
  const user = useAppSelector(state => state.user)
  const waits = useAppSelector(getWaits)

  // actions
  const dispatch = useAppDispatch()
  const upcoming = queue.result.filter(id => id !== queueId && !playerHistory.includes(id))
  const handleMove = (id: number, direction: 'up' | 'down' | 'top') => {
    const owner = queue.entities[id].userId
    const order = user.isAdmin ? upcoming : upcoming.filter(qId => queue.entities[qId].userId === owner)
    const index = order.indexOf(id)
    if (index < 0 || (direction === 'up' && index === 0) || (direction === 'down' && index === order.length - 1)) return
    const after = direction === 'top' ? null : direction === 'down' ? order[index + 1] : order[index - 2] ?? null
    if (user.isAdmin) {
      dispatch(reorderItem({ queueId: id, afterQueueId: after }))
    } else {
      dispatch(moveItem({ queueId: id, swapQueueId: order[index + (direction === 'up' ? -1 : 1)] }))
    }
  }

  const handleProviderCancel = (providerId: number, itemId: string, userId: number) => {
    dispatch(providerFetchCancel({ providerId, itemId, userId }))
  }

  // retries as the row's singer (only an admin may name someone else)
  const handleProviderRetry = (p: PendingQueueItem) => {
    dispatch(providerFetchRequest({
      providerId: p.providerId,
      itemId: p.itemId,
      title: p.title,
      artist: p.artist,
      source: p.source,
      iconUrl: p.iconUrl,
      duration: p.duration,
      userId: p.userId,
      userDisplayName: p.userDisplayName,
      userDateUpdated: p.userDateUpdated,
    }))
  }

  const formatWait = (key: string) => waits[key] === undefined ? undefined : formatSeconds(waits[key], true) // fuzzy

  // build children array
  const items: React.ReactElement[] = []
  for (const row of rows) {
    if (row.kind === 'pending') {
      if (section !== 'upcoming') continue
      const p = row.item
      const isOwner = p.userId === user.userId

      items.push(
        <ProviderQueueItem
          key={row.key}
          providerId={p.providerId}
          itemId={p.itemId}
          title={p.title}
          artist={p.artist}
          source={p.source}
          iconUrl={p.iconUrl}
          status={p.status}
          progress={p.progress}
          error={p.error}
          userId={p.userId}
          userDisplayName={p.userDisplayName}
          userDateUpdated={p.userDateUpdated}
          wait={p.duration === undefined ? undefined : formatWait(row.key)}
          isAdmin={user.isAdmin}
          isOwner={isOwner}
          isCancelable={isOwner || user.isAdmin}
          isRetryable={(isOwner || user.isAdmin) && p.status === 'error'}
          onCancel={handleProviderCancel}
          onRetry={() => handleProviderRetry(p)}
        />,
      )
      continue
    }

    const qId = row.queueId
    const item = queue.entities[qId]
    const song = songs.entities[item.songId]
    // Library state may briefly lag the queue (e.g. a provider ingest just
    // pushed QUEUE_PUSH with a new songId; LIBRARY_PUSH lands a tick later).
    // Skip rendering until the song is available rather than crashing.
    if (!song) continue
    const isCurrent = (qId === queueId) && !isAtQueueEnd
    const isUpcoming = qId !== queueId && !playerHistory.includes(qId)
    const isOwner = item.userId === user.userId

    const group = isCurrent ? 'current' : playerHistory.includes(qId) ? 'history' : 'upcoming'
    if (group !== section) continue
    const canControl = user.isAdmin || isOwner
    const moveOrder = user.isAdmin ? upcoming : upcoming.filter(id => queue.entities[id].userId === item.userId)
    const moveIndex = moveOrder.indexOf(qId)

    items.push(
      <article key={qId} data-queue-id={qId} className={`${styles.row} ${isCurrent ? styles.current : ''}`} aria-label={`${song.title} by ${artists.entities[song.artistId]?.name ?? ''}`}>
        <div className={styles.song}>
          <h3>{song.title}</h3>
          <p>{artists.entities[song.artistId]?.name}</p>
          <p className={styles.singer}>
            {item.userDisplayName}
            {isOwner ? ' · You' : ''}
            {isUpcoming && formatWait(row.key) ? ` · ${formatWait(row.key)}` : ''}
          </p>
          {item.versionLabel && (
            <small>{`Version: ${item.versionLabel}`}</small>
          )}
          {isCurrent && errorMessage && <p role='alert'>{errorMessage}</p>}
        </div>
        <div className={styles.actions}>
          {isCurrent && canControl && (
            <>
              <button onClick={() => dispatch(isPlaying ? requestPause() : requestPlay())}>{isPlaying ? 'Pause' : 'Play'}</button>
              <button onClick={() => { if (confirm('Skip this song?')) dispatch(requestPlayNext()) }}>Next song</button>
            </>
          )}
          {isCurrent && user.isAdmin && <button onClick={() => dispatch(requestReplay(qId))}>Restart song</button>}
          {isUpcoming && canControl && (
            <>
              <button className={styles.moveArrow} aria-label='Move up' title={user.isAdmin ? 'Move up' : 'Move up in your songs'} disabled={moveIndex <= 0} onClick={() => handleMove(qId, 'up')}>↑</button>
              <button className={styles.moveArrow} aria-label='Move down' title={user.isAdmin ? 'Move down' : 'Move down in your songs'} disabled={moveIndex < 0 || moveIndex === moveOrder.length - 1} onClick={() => handleMove(qId, 'down')}>↓</button>
              <button className={styles.danger} onClick={() => dispatch(removeItem({ queueId: qId }))}>Remove</button>
              {user.isAdmin && (
                <details className={styles.moreMenu}>
                  <summary aria-label={`More options for ${song.title}`}>⋯</summary>
                  <div>
                    <button
                      disabled={moveIndex <= 0}
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open')
                        handleMove(qId, 'top')
                      }}
                    >
                      Move to top
                    </button>
                  </div>
                </details>
              )}
            </>
          )}
          {group === 'history' && <button onClick={() => dispatch(queueSong(item.songId, item.mediaId))}>Add again</button>}
          {group === 'history' && user.isAdmin && <button onClick={() => { if (confirm('Play this song now? The current song will stop.')) dispatch(requestReplay(qId)) }}>Play now</button>}
        </div>
      </article>,
    )
  }

  return <div className={styles.rows}>{items.length ? items : <p className={styles.empty}>{section === 'current' ? 'Nothing playing right now.' : section === 'upcoming' ? 'No songs waiting. Choose a song to get started.' : 'Finished songs will appear here.'}</p>}</div>
}

export default QueueList
