import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { open, close, db } from '../lib/Database.js'
import Queue from './Queue.js'
import handlers from './socket.js'
import Media from '../Media/Media.js'
import { QUEUE_ADD, QUEUE_PUSH, QUEUE_REORDER } from '../../shared/actionTypes.js'

let room: number, otherRoom: number, user: number, song: number, media: number, first: number, second: number, foreign: number
const put = (sql: string, args: unknown[] = []) => Number(db.run(sql, args).lastID)
const actions = []
const socket = (isAdmin: boolean) => ({
  user: { userId: user, roomId: room, isAdmin },
  server: {
    of: () => ({ sockets: new Map([['player', { user: { roomId: room }, _lastPlayerStatus: { queueId: first, isAtQueueEnd: false } }]]) }),
    to: () => ({ emit: (_: string, action) => actions.push(action) }),
  },
})

beforeEach(() => {
  open({ file: ':memory:', ro: false })
  actions.length = 0
  user = put('INSERT INTO users(username,password,name,roleId) VALUES(\'fixture\',\'x\',\'Fixture\',1)')
  room = put('INSERT INTO rooms(name,status) VALUES(\'Fixture\',\'open\')')
  otherRoom = put('INSERT INTO rooms(name,status) VALUES(\'Other\',\'open\')')
  const artist = put('INSERT INTO artists(name,nameNorm) VALUES(\'Fixture\',\'fixture\')')
  song = put('INSERT INTO songs(artistId,title,titleNorm) VALUES(?,\'Song\',\'song\')', [artist])
  const folder = put('INSERT INTO paths(path,priority) VALUES(\'/fixture\',0)')
  media = Media.add({ songId: song, pathId: folder, relPath: 'version.mp4', duration: 30 })
  first = Queue.add({ roomId: room, songId: song, userId: user })
  second = Queue.add({ roomId: room, songId: song, userId: user })
  foreign = Queue.add({ roomId: otherRoom, songId: song, userId: user })
})
afterEach(close)

it('persists room-bound host movement and cleans it when a song finishes', () => {
  Queue.reorder(room, second, null, first)
  expect(Queue.get(room).moves).toEqual([{ queueId: second, afterQueueId: null }])
  Queue.recordPlayback(room, { queueId: first, historyJSON: JSON.stringify([second]) })
  expect(Queue.get(room).moves).toBeUndefined()
  expect(() => Queue.reorder(room, second, null, first)).toThrow('Only upcoming')
})

it('rejects current songs, other-room songs, other-room anchors and malformed anchors', () => {
  expect(() => Queue.reorder(room, first, null, first)).toThrow()
  expect(() => Queue.reorder(room, foreign, null, first)).toThrow()
  expect(() => Queue.reorder(room, second, foreign, first)).toThrow()
  expect(() => Queue.reorder(room, second, undefined, first)).toThrow()
  expect(Queue.get(room).moves).toBeUndefined()
})

it('clearing an anchor keeps the remaining request valid without breaking foreign keys', () => {
  Queue.reorder(room, second, first)
  Queue.remove(first)
  expect(Queue.get(room).moves).toEqual([{ queueId: second, afterQueueId: null }])
  expect(db.all('PRAGMA foreign_key_check')).toEqual([])
})

it('swaps a singer’s existing slots and host-order anchors without changing other turns', () => {
  const third = Queue.add({ roomId: room, songId: song, userId: user })
  Queue.reorder(room, third, first)
  Queue.swap(room, first, second)
  expect(Queue.get(room).result).toEqual([second, first, third])
  expect(Queue.get(room).moves).toEqual([{ queueId: third, afterQueueId: second }])
  expect(() => Queue.swap(room, first, foreign)).toThrow()
  expect(() => Queue.swap(room, first, second, first)).toThrow()
  expect(db.all('PRAGMA foreign_key_check')).toEqual([])
})

it('Play next creates a version-specific turn and never sends a playback command', async () => {
  const ack = vi.fn()
  await handlers[QUEUE_ADD](socket(true), { payload: { songId: song, mediaId: media, position: 'next' } }, ack)
  expect(ack).toHaveBeenCalledWith({ type: QUEUE_ADD + '_SUCCESS' })
  const queue = Queue.get(room)
  expect(queue.moves).toEqual([{ queueId: queue.result.at(-1), afterQueueId: null }])
  expect(queue.entities[queue.result.at(-1)].selectedMediaId).toBe(media)
  expect(actions.map(action => action.type)).toEqual([QUEUE_PUSH])
})

it('singers cannot force a priority add or reorder the shared queue', async () => {
  const ack = vi.fn()
  await handlers[QUEUE_ADD](socket(false), { payload: { songId: song, position: 'next' } }, ack)
  expect(ack.mock.calls[0][0].type).toBe(QUEUE_ADD + '_ERROR')
  await handlers[QUEUE_REORDER](socket(false), { payload: { queueId: second, afterQueueId: null } }, ack)
  expect(ack.mock.calls[1][0].type).toBe(QUEUE_REORDER + '_ERROR')
  expect(Queue.get(room).result).toHaveLength(2)
  expect(actions).toEqual([])
})
