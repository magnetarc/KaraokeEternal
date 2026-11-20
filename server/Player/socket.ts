import Rooms from '../Rooms/Rooms.js'
import Queue from '../Queue/Queue.js'
import Library from '../Library/Library.js'

import {
  PLAYER_CMD_NEXT,
  PLAYER_CMD_OPTIONS,
  PLAYER_CMD_PAUSE,
  PLAYER_CMD_PLAY,
  PLAYER_CMD_REPLAY,
  PLAYER_CMD_VOLUME,
  PLAYER_REQ_NEXT,
  PLAYER_REQ_OPTIONS,
  PLAYER_REQ_PAUSE,
  PLAYER_REQ_PLAY,
  PLAYER_REQ_REPLAY,
  PLAYER_REQ_VOLUME,
  PLAYER_EMIT_STATUS,
  PLAYER_EMIT_LEAVE,
  PLAYER_STATUS,
  PLAYER_LEAVE,
  QUEUE_PUSH,
} from '../../shared/actionTypes.js'

// ------------------------------------
// Action Handlers
// ------------------------------------
const ACTION_HANDLERS = {
  [PLAYER_REQ_OPTIONS]: (sock, { payload }) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_OPTIONS,
      payload,
    })
  },
  [PLAYER_REQ_NEXT]: (sock) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_NEXT,
    })
  },
  [PLAYER_REQ_PAUSE]: (sock) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_PAUSE,
    })
  },
  [PLAYER_REQ_PLAY]: (sock) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_PLAY,
    })
  },
  [PLAYER_REQ_REPLAY]: (sock, { payload }) => {
    if (!sock.user.isAdmin || !Number.isSafeInteger(payload?.queueId)) return
    const item = Queue.get(sock.user.roomId).entities[payload.queueId]
    if (!item) return
    const status = sock._lastPlayerStatus
      ?? Rooms.getLastPlayerStatus(sock.server, sock.user.roomId)
    // A past item becomes a fresh queue entry, never a rewind of history.
    // Current-item restart retains its existing semantics.
    const isCurrent = status?.queueId === item.queueId && !status.isAtQueueEnd
    if (!isCurrent) {
      const queueId = Queue.add({ roomId: sock.user.roomId, songId: item.songId, userId: sock.user.userId, mediaId: item.mediaId })
      sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', { type: QUEUE_PUSH, payload: Queue.get(sock.user.roomId) })
      payload = { queueId }
    }
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_REPLAY,
      payload,
    })
  },
  [PLAYER_REQ_VOLUME]: (sock, { payload }) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_VOLUME,
      payload,
    })
  },
  [PLAYER_EMIT_STATUS]: (sock, { payload }) => {
    // Only hosts may open the player route. Do not let singer sockets persist
    // fabricated playback history or completion counters.
    if (!sock.user.isAdmin || !Number.isSafeInteger(payload?.queueId)) return
    try {
      if (!Array.isArray(JSON.parse(payload.historyJSON))) return
    } catch {
      return
    }
    if (Queue.recordPlayback(sock.user.roomId, payload)) {
      Library.cache.version = null
      sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', { type: QUEUE_PUSH, payload: Queue.get(sock.user.roomId) })
    }
    // so we can tell the room when players leave and
    // relay last known player status on client join
    sock._lastPlayerStatus = payload

    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_STATUS,
      payload,
    })
  },
  [PLAYER_EMIT_LEAVE]: (sock) => {
    sock._lastPlayerStatus = null

    // any players left in room?
    if (!Rooms.isPlayerPresent(sock.server, sock.user.roomId)) {
      sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
        type: PLAYER_LEAVE,
        payload: { socketId: sock.id },
      })
    }
  },
}

export default ACTION_HANDLERS
