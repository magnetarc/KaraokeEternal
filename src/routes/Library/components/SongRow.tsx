import React from 'react'
import styles from '../views/ModernLibrary.css'
export default function SongRow ({ title, artist, versionCount = 0, starred, queued, canAdd, unavailable = 'Unavailable', onAdd, onStar, onVersions, onPlayNext, onMoveTop, children }: {
  title: string
  artist: string
  versionCount?: number
  starred: boolean
  queued: boolean
  canAdd: boolean
  unavailable?: string
  onAdd(): void
  onStar(): void
  onVersions?(): void
  onPlayNext?(): void
  onMoveTop?(): void
  children?: React.ReactNode
}) {
  return (
    <article className={styles.song} aria-label={`${title} by ${artist}`}>
      <div className={styles.songInfo}>
        <h3>{title}</h3>
        <p>{artist}</p>
        {versionCount > 1 && onVersions && (
          <button className={styles.compactVersions} aria-label={`Choose version of ${title}`} onClick={onVersions}>
            {versionCount}
            {' '}
            versions
          </button>
        )}
      </div>
      <div className={styles.rowActions}>
        <button className={styles.star} aria-pressed={starred} aria-label={`${starred ? 'Unfavourite' : 'Favourite'} ${title}`} onClick={onStar}>{starred ? '★' : '☆'}</button>
        <button className={styles.add} disabled={queued || !canAdd} onClick={onAdd} aria-label={`Add ${title} to queue`}>{queued ? 'Queued' : canAdd ? 'Add' : unavailable}</button>
        {(children || onPlayNext || onMoveTop) && (
          <details className={styles.rowMenu}>
            <summary aria-label={`Details for ${title}`}>⋯</summary>
            <div>
              {onPlayNext && (
                <button onClick={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open')
                  onPlayNext()
                }}
                >
                  Play next
                </button>
              )}
              {onMoveTop && (
                <button onClick={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open')
                  onMoveTop()
                }}
                >
                  Move to top
                </button>
              )}
              {children}
            </div>
          </details>
        )}
      </div>
    </article>
  )
}
