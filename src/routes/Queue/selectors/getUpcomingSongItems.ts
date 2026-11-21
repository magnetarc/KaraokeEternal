import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from 'store/store'
import getRoundRobinQueue from './getRoundRobinQueue'
import getPlayerHistory from './getPlayerHistory'

export default createSelector(
  [getRoundRobinQueue, getPlayerHistory, (state: RootState) => state.status.queueId],
  (queue, history, current) => {
    const result: Record<number, number> = {}
    for (const id of queue.result) {
      if (id === current || history.includes(id)) continue
      const songId = queue.entities[id].songId
      result[songId] ??= id
    }
    return result
  },
)
