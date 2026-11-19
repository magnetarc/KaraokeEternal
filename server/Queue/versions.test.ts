import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { close, db, open } from '../lib/Database.js'
import Media from '../Media/Media.js'
import Queue from './Queue.js'
import { songVersions } from '../Library/songVersions.js'

const insert = (sql: string, args: unknown[] = []) => Number(db.run(sql, args).lastID)
let song: number, other: number, user: number, room: number, first: number, second: number, third: number, otherMedia: number
beforeEach(() => {
  open({ file: ':memory:', ro: false })
  const artist = insert("INSERT INTO artists(name,nameNorm) VALUES ('Synthetic artist','synthetic artist')")
  song = insert("INSERT INTO songs(artistId,title,titleNorm) VALUES (?,'One Song','one song')", [artist])
  other = insert("INSERT INTO songs(artistId,title,titleNorm) VALUES (?,'Another Song','another song')", [artist])
  const folder = insert("INSERT INTO paths(path,priority) VALUES ('/private/host/location',0)")
  user = insert("INSERT INTO users(username,password,name,roleId) VALUES ('fixture','x','Singer',(SELECT roleId FROM roles WHERE name='standard'))")
  room = insert("INSERT INTO rooms(name,status) VALUES ('Fixture room','open')")
  first = Media.add({ songId: song, pathId: folder, relPath: 'RIGMAR/SF-01 - One Song.zip', duration: 210 })
  second = Media.add({ songId: song, pathId: folder, relPath: 'SUNFLY/Alternate One Song.mp4', duration: 198 })
  third = Media.add({ songId: song, pathId: folder, relPath: 'OTHER/Another take.mp4', duration: 230 })
  otherMedia = Media.add({ songId: other, pathId: folder, relPath: 'other.mp4', duration: 180 })
  Media.setPreferred(first, true)
})
afterEach(close)

describe('selected backing tracks', () => {
  it('retains the existing preferred-track behaviour when no version is chosen', () => {
    Queue.add({ roomId: room, songId: song, userId: user })
    const queue = Queue.get(room)
    expect(queue.entities[queue.result[0]].mediaId).toBe(first)
    expect(queue.entities[queue.result[0]].selectedMediaId).toBeNull()
  })
  it('persists an explicit choice per queue entry even when the host changes the preferred track', () => {
    Media.setUserPitch(user, second, -2)
    Queue.add({ roomId: room, songId: song, userId: user, mediaId: second })
    Queue.add({ roomId: room, songId: song, userId: user })
    Media.setPreferred(third, true)
    const queue = Queue.get(room)
    expect(queue.entities[queue.result[0]]).toMatchObject({ mediaId: second, selectedMediaId: second, mediaType: 'mp4', userPitch: -2, versionLabel: 'Alternate One Song' })
    expect(queue.entities[queue.result[1]].mediaId).toBe(third)
    expect(db.get('SELECT selectedMediaId FROM queue WHERE queueId=?', [queue.result[0]])).toEqual({ selectedMediaId: second })
  })
  it('rejects missing or cross-song media before creating any queue entry', () => {
    for (const mediaId of [99999, otherMedia, 0, -1, 1.5, NaN, null, '1']) {
      expect(() => Queue.add({ roomId: room, songId: song, userId: user, mediaId: mediaId as number })).toThrow(/version/)
    }
    expect(db.get('SELECT COUNT(*) AS n FROM queue')).toEqual({ n: 0 })
  })
  it('does not substitute a different recording when a chosen file disappears, and preserves the queue chain', () => {
    Queue.add({ roomId: room, songId: song, userId: user })
    Queue.add({ roomId: room, songId: song, userId: user, mediaId: second })
    Queue.add({ roomId: room, songId: other, userId: user })
    const before = Queue.get(room).result
    db.run('DELETE FROM media WHERE mediaId=?', [second])
    const after = Queue.get(room)
    expect(after.result).toEqual([before[0], before[2]])
    expect(after.entities[before[1]]).toBeUndefined()
    expect(db.get('SELECT selectedMediaId FROM queue WHERE queueId=?', [before[1]])).toEqual({ selectedMediaId: second })
  })
  it('lists only actual versions, preferred first, with display labels but no host paths', () => {
    Media.setPreferred(second, true)
    const versions = songVersions(song)
    expect(versions).toHaveLength(3)
    expect(versions[0]).toMatchObject({ mediaId: second, label: 'Alternate One Song', collection: 'SUNFLY', format: 'Video', duration: 198, isPreferred: true })
    expect(versions.find(v => v.mediaId === first)).toMatchObject({ fileName: 'SF-01 - One Song.zip', format: 'MP3+G' })
    expect(JSON.stringify(versions)).not.toContain('/private/')
    expect(versions.some(v => 'relPath' in v || 'path' in v)).toBe(false)
    expect(songVersions(99999)).toEqual([])
  })
})
