import { RootState } from 'store/store'
import { ensureState } from 'redux-optimistic-ui'
import { createSelector } from '@reduxjs/toolkit'
import type { QueueItem } from 'shared/types'
import getPlayerHistory from './getPlayerHistory'
import roundRobin from './roundRobin'
import { applyQueueMoves, type QueueOrderMove } from 'shared/queueOrder'

const getResult = (state: RootState) => ensureState(state.queue).result
const getEntities = (state: RootState) => ensureState(state.queue).entities
const getQueueId = (state: RootState) => state.status.queueId
const getNextUserId = (state: RootState) => state.status.nextUserId
const noMoves: QueueOrderMove[] = []
const getMoves = (state: RootState) => ensureState(state.queue).moves ?? noMoves

// The items that aren't re-ordered: played, current, and the next user's
// locked-in item, in that order
export const getQueueHistory = createSelector(
  [getResult, getEntities, getPlayerHistory, getQueueId, getNextUserId],
  (result, entities, history, curId, nextUserId) => {
    // in case history references non-existent items or queue is still loading
    history = history.filter(queueId => result.includes(queueId))

    // consider current item played (don't re-order it)
    if (entities[curId] && history.lastIndexOf(curId) === -1) {
      history.push(curId)
    }

    // "lock in" next user's item (don't re-order it)
    let lockedQueueId: number | null = null

    if (nextUserId !== null) {
      for (const queueId of result) {
        if (!history.includes(queueId) && entities[queueId].isOptimistic !== true && entities[queueId].userId === nextUserId) {
          history.push(queueId)
          lockedQueueId = queueId
          break
        }
      }
    }

    return { history, lockedQueueId }
  },
)

// Each user's upcoming items in queue order, users in order of their first
// upcoming item
export const getUpcomingByUser = createSelector(
  [getResult, getEntities, getQueueHistory],
  (result, entities, { history }) => {
    const map = new Map<number, number[]>()

    result.forEach((queueId) => {
      if (history.includes(queueId) // only concerned with upcoming songs
        || entities[queueId].isOptimistic === true // ignore optimistic items
      ) return

      const userId = entities[queueId].userId
      const list = map.get(userId)

      if (list) list.push(queueId)
      else map.set(userId, [queueId])
    })

    return map
  },
)

const getRoundRobinQueue = createSelector(
  [getEntities, getQueueHistory, getUpcomingByUser, getMoves, getPlayerHistory, getQueueId],
  (entities, { history }, upcomingByUser, moves, played, currentId) => {
    const playedUserIds = history.map(queueId => (entities[queueId] as QueueItem).userId) // should be no optimistic items
    const normal = history.concat(roundRobin(upcomingByUser, playedUserIds))
    const fixed = new Set([...played, currentId])
    const upcoming = normal.filter(id => !fixed.has(id))

    return {
      result: normal.filter(id => fixed.has(id)).concat(applyQueueMoves(upcoming, moves)),
      entities: entities as Record<number, QueueItem>,
    }
  },
)

export default getRoundRobinQueue
