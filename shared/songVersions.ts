export interface SongVersion {
  mediaId: number
  label: string
  fileName: string
  collection: string
  format: 'MP3+G' | 'Video'
  duration: number
  isPreferred: boolean
}

// File-derived display labels only; do not infer producers, vocals or arrangements.
export function versionDisplay (relPath: string) {
  const parts = relPath.split(/[\\/]/).filter(Boolean)
  const fileName = parts.at(-1) ?? ''
  return {
    label: fileName.replace(/\.[^.]+$/, '') || fileName,
    fileName,
    collection: parts.length > 1 ? parts[0] : '',
    format: (/\.mp4$/i.test(fileName) ? 'Video' : 'MP3+G') as SongVersion['format'],
  }
}
