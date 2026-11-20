import { beforeEach, afterEach, it, expect } from 'vitest'
import { open, close, db } from '../lib/Database.js'
import Queue from './Queue.js'
import Media from '../Media/Media.js'
import handlers from '../Player/socket.js'
import { PLAYER_REQ_REPLAY, PLAYER_CMD_REPLAY, PLAYER_EMIT_STATUS } from '../../shared/actionTypes.js'
let user: number, room: number, song: number, first: number, second: number, a: number, b: number
const put = (sql: string, args: unknown[] = []) => Number(db.run(sql, args).lastID)
beforeEach(() => {
  open({ file: ':memory:', ro: false })
  const artist = put('INSERT INTO artists(name,nameNorm) VALUES(\'Fixture\',\'fixture\')')
  song = put('INSERT INTO songs(artistId,title,titleNorm) VALUES(?,\'Song\',\'song\')', [artist])
  const path = put('INSERT INTO paths(path,priority) VALUES(\'/fixture\',0)')
  user = put('INSERT INTO users(username,password,name,roleId) VALUES(\'fixture\',\'x\',\'Fixture\',1)')
  room = put('INSERT INTO rooms(name,status) VALUES(\'Fixture\',\'open\')')
  first = Media.add({ songId: song, pathId: path, relPath: 'first.mp4', duration: 3 })
  second = Media.add({ songId: song, pathId: path, relPath: 'second.mp4', duration: 3 })
  a = Queue.add({ roomId: room, songId: song, userId: user })
  b = Queue.add({ roomId: room, songId: song, userId: user })
})
afterEach(close)
it('singer sockets cannot forge persisted history, completion counts or immediate replay', () => {
  const actions = []
  const sock = { user: { roomId: room, userId: user, isAdmin: false }, server: { to: () => ({ emit: (...args) => actions.push(args) }) } }
  handlers[PLAYER_EMIT_STATUS](sock, { payload: { queueId: a, mediaId: first, historyJSON: JSON.stringify([a]), completedQueueId: a } })
  handlers[PLAYER_REQ_REPLAY](sock, { payload: { queueId: a } })
  expect(actions).toEqual([])
  expect(db.get('SELECT playedAt,completedAt FROM queue WHERE queueId=?', [a])).toEqual({ playedAt: null, completedAt: null })
  expect(Queue.get(room).result).toHaveLength(2)
})
it('pins actual playback and retains one completion count after history is cleared', () => {
  Queue.recordPlayback(room, { queueId: a, mediaId: second, historyJSON: '[]' })
  Media.setPreferred(first, true)
  const payload = { queueId: b, mediaId: first, historyJSON: JSON.stringify([a]), completedQueueId: a }
  Queue.recordPlayback(room, payload)
  Queue.recordPlayback(room, payload)
  expect(Queue.get(room).entities[a]).toMatchObject({ playedAt: expect.any(Number), mediaId: second })
  expect(db.get('SELECT plays FROM songPlayCounts WHERE songId=?', [song])).toEqual({ plays: 1 })
  Queue.remove(a)
  expect(Queue.get(room).result).toEqual([b])
  expect(db.get('SELECT plays FROM songPlayCounts WHERE songId=?', [song])).toEqual({ plays: 1 })
})
it('rejects cross-room history/completion/media changes and malformed history', () => {
  Queue.recordPlayback(room + 1, { queueId: a, mediaId: second, historyJSON: JSON.stringify([a]), completedQueueId: a })
  expect(db.get('SELECT playedAt,selectedMediaId FROM queue WHERE queueId=?', [a])).toEqual({ playedAt: null, selectedMediaId: null })
  expect(db.get('SELECT COUNT(*) AS n FROM songPlayCounts')).toEqual({ n: 0 })
  expect(Queue.recordPlayback(room, { historyJSON: 'broken' })).toBe(false)
})
it('Play now creates one fresh version-specific entry without rewinding historical entries', () => {
  Queue.recordPlayback(room, { queueId: a, mediaId: second, historyJSON: '[]' })
  Queue.recordPlayback(room, { queueId: b, mediaId: first, historyJSON: JSON.stringify([a]) })
  const status = { queueId: b, isAtQueueEnd: false, historyJSON: JSON.stringify([a]) }
  const actions = []
  const server = { of: () => ({ sockets: new Map([['player', { user: { roomId: room }, _lastPlayerStatus: status }]]) }), to: () => ({ emit: (_: string, action) => actions.push(action) }) }
  handlers[PLAYER_REQ_REPLAY]({ user: { roomId: room, userId: user, isAdmin: true }, server }, { payload: { queueId: a } })
  const replay = actions.find(action => action.type === PLAYER_CMD_REPLAY).payload.queueId
  expect(replay).not.toBe(a)
  expect(Queue.get(room).entities[replay]).toMatchObject({ mediaId: second, selectedMediaId: second })
  expect(Queue.get(room).entities[a].playedAt).toBeTruthy()
  expect(status.historyJSON).toBe(JSON.stringify([a]))
  actions.length = 0
  handlers[PLAYER_REQ_REPLAY]({ user: { roomId: room, userId: user, isAdmin: true }, server }, { payload: { queueId: b } })
  expect(actions).toEqual([{ type: PLAYER_CMD_REPLAY, payload: { queueId: b } }])
  expect(Queue.get(room).result).toHaveLength(3)
})
