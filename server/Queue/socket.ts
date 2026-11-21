import Queue from './Queue.js'
import Rooms from '../Rooms/Rooms.js'
import { QUEUE_ADD, QUEUE_MOVE, QUEUE_REORDER, QUEUE_REMOVE, QUEUE_PUSH } from '../../shared/actionTypes.js'

// ------------------------------------
// Action Handlers
// ------------------------------------
const ACTION_HANDLERS = {
  [QUEUE_ADD]: async (sock, { payload }, acknowledge) => {
    const { songId, mediaId, position } = payload

    try {
      await Rooms.validate(sock.user.roomId, null, { validatePassword: false })
      if (position !== undefined && (position !== 'next' || !sock.user.isAdmin)) throw new Error('Only the host can choose Play next')
      const queueId = Queue.add({ roomId: sock.user.roomId, songId, userId: sock.user.userId, ...(mediaId !== undefined ? { mediaId } : {}) })
      if (position === 'next') Queue.reorder(sock.user.roomId, queueId, null)
    } catch (err) {
      return acknowledge({
        type: QUEUE_ADD + '_ERROR',
        error: err.message,
      })
    }

    // success
    acknowledge({ type: QUEUE_ADD + '_SUCCESS' })

    // to all in room
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: QUEUE_PUSH,
      payload: Queue.get(sock.user.roomId),
    })
  },
  [QUEUE_REORDER]: async (sock, { payload }, acknowledge) => {
    try {
      await Rooms.validate(sock.user.roomId, null, { validatePassword: false })
      if (!sock.user.isAdmin) throw new Error('Only the host can reorder the shared queue')
      const status = Rooms.getLastPlayerStatus(sock.server, sock.user.roomId)
      Queue.reorder(sock.user.roomId, payload.queueId, payload.afterQueueId, status?.isAtQueueEnd ? undefined : status?.queueId)
      acknowledge({ type: QUEUE_REORDER + '_SUCCESS' })
      sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', { type: QUEUE_PUSH, payload: Queue.get(sock.user.roomId) })
    } catch (err) {
      acknowledge({ type: QUEUE_REORDER + '_ERROR', error: err.message })
    }
  },
  [QUEUE_MOVE]: async (sock, { payload }, acknowledge) => {
    const { queueId, prevQueueId, swapQueueId } = payload

    try {
      await Rooms.validate(sock.user.roomId, null, { validatePassword: false })
    } catch (err) {
      return acknowledge({
        type: QUEUE_MOVE + '_ERROR',
        error: err.message,
      })
    }

    if (!sock.user.isAdmin && !(Queue.isOwner(sock.user.userId, swapQueueId === undefined ? queueId : [queueId, swapQueueId]))) {
      return acknowledge({
        type: QUEUE_MOVE + '_ERROR',
        error: 'Cannot move another user\'s song',
      })
    }

    if (swapQueueId !== undefined) {
      const status = Rooms.getLastPlayerStatus(sock.server, sock.user.roomId)
      Queue.swap(sock.user.roomId, queueId, swapQueueId, status?.isAtQueueEnd ? undefined : status?.queueId)
    } else {
      Queue.move({ prevQueueId, queueId, roomId: sock.user.roomId })
    }

    // success
    acknowledge({ type: QUEUE_MOVE + '_SUCCESS' })

    // tell room
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: QUEUE_PUSH,
      payload: Queue.get(sock.user.roomId),
    })
  },
  [QUEUE_REMOVE]: (sock, { payload }, acknowledge) => {
    const { queueId } = payload
    const ids = Array.isArray(queueId) ? queueId : [queueId]

    if (!sock.user.isAdmin && !(Queue.isOwner(sock.user.userId, ids))) {
      return acknowledge({
        type: QUEUE_REMOVE + '_ERROR',
        error: 'Cannot remove another user\'s song',
      })
    }

    for (const id of ids) {
      Queue.remove(id)
    }

    // success
    acknowledge({ type: QUEUE_REMOVE + '_SUCCESS' })

    // tell room
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: QUEUE_PUSH,
      payload: Queue.get(sock.user.roomId),
    })
  },
}

export default ACTION_HANDLERS
