import React, { useEffect, useRef, useState } from 'react'
import HttpApi from 'lib/HttpApi'
import { formatDuration } from 'lib/dateTime'
import type { SongVersion } from 'shared/songVersions'
import styles from './SongVersions.css'

export interface VersionSong { songId: number, title: string, artist: string }
const api = new HttpApi()
export default function SongVersions ({ song, canQueue, unavailableReason, onQueue, onClose }: {
  song: VersionSong, canQueue: boolean, unavailableReason?: string, onQueue(mediaId: number): void, onClose(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [versions, setVersions] = useState<SongVersion[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    return () => { if (element?.open) element.close(); if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setSelected(null)
    api.get<{ versions: SongVersion[] }>(`song/${song.songId}/versions`, { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return
      setVersions(value.versions); setSelected(value.versions[0]?.mediaId ?? null); setLoading(false)
      requestAnimationFrame(() => dialog.current?.querySelector<HTMLInputElement>('input:checked')?.focus())
    }).catch(err => { if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : 'Could not load versions'); setLoading(false) } })
    return () => controller.abort()
  }, [song.songId, retry])
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby='versions-title' aria-describedby='versions-description' onCancel={event => { event.preventDefault(); onClose() }}>
    <header className={styles.header}><div><p className={styles.eyebrow}>CHOOSE YOUR BACKING TRACK</p><h2 id='versions-title'>{song.title}</h2><p>{song.artist}</p></div><button type='button' className={styles.close} aria-label='Close versions' onClick={onClose}>×</button></header>
    <p id='versions-description'>Choose a version for your turn. “Host choice” marks the preferred backing track.</p>
    {loading ? <p role='status'>Loading playable versions…</p> : error ? <div role='alert' className={styles.error}><p>{error}</p><button type='button' onClick={() => setRetry(value => value + 1)}>Try again</button></div> : <fieldset className={styles.list}><legend>{versions.length} playable {versions.length === 1 ? 'version' : 'versions'}</legend>
      {versions.map((version, index) => <label key={version.mediaId} className={`${styles.version} ${selected === version.mediaId ? styles.selected : ''}`}>
        <input type='radio' name='song-version' value={version.mediaId} checked={selected === version.mediaId} onChange={() => setSelected(version.mediaId)} aria-label={`Version ${index + 1}: ${version.label}`} />
        <span className={styles.info}><strong>{version.label}</strong><span className={styles.details}>{version.collection && <span>{version.collection}</span>}<span>{version.format}</span><span>{formatDuration(version.duration)}</span>{version.isPreferred && <span className={styles.preferred}>Host choice</span>}</span><small>{version.fileName}</small></span>
      </label>)}
    </fieldset>}
    {!canQueue && <p className={styles.notice}>{unavailableReason || 'Join a room to add this song to the queue.'}</p>}
    <footer className={styles.actions}><button type='button' onClick={onClose}>Cancel</button><button type='button' className={styles.primary} disabled={loading || !!error || selected === null || !canQueue} onClick={() => { if (selected !== null && canQueue) onQueue(selected) }}>Add selected version</button></footer>
  </dialog>
}
