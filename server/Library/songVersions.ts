import Media from '../Media/Media.js'
import { versionDisplay, type SongVersion } from '../../shared/songVersions.js'

export function songVersions (songId: number): SongVersion[] {
  const media = Media.search({ songId })
  // Media.search is already in configured folder-priority order. Keep that
  // order for ties while putting the host's preferred track first.
  return media.result.map(mediaId => {
    const row = media.entities[mediaId]
    return { mediaId, ...versionDisplay(row.relPath), duration: row.duration, isPreferred: !!row.isPreferred }
  }).sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred))
}
