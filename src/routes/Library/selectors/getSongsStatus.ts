import { RootState } from 'store/store'
import { createSelector, type Selector } from '@reduxjs/toolkit'
import { ensureState } from 'redux-optimistic-ui'
import getPlayerHistory from 'routes/Queue/selectors/getPlayerHistory'

const getQueue = (state: RootState) => ensureState(state.queue)
const getCurrentQueueId = (state: RootState) => state.status.isAtQueueEnd ? undefined : state.status.queueId

type SongsStatus = {
  played: Set<number>
  upcoming: Set<number>
  current: number | undefined
}

const getSongsStatus: Selector<RootState, SongsStatus> = createSelector(
  [getQueue, getCurrentQueueId, getPlayerHistory],
  (queue, curId, history): SongsStatus => {
    const historySet = new Set(history)
    const played = new Set<number>()
    const upcoming = new Set<number>()

    queue.result.forEach((queueId) => {
      const songId = queue.entities[queueId].songId
      if (historySet.has(queueId)) {
        played.add(songId)
      } else if (queueId !== curId) {
        upcoming.add(songId)
      }
    })

    return { played, upcoming, current: queue.entities[curId]?.songId }
  },
)

export default getSongsStatus
