import { RootState } from 'store/store'
import { createSelector } from '@reduxjs/toolkit'
import { ensureState } from 'redux-optimistic-ui'

const getPlayerHistoryJSON = (state: RootState) => state.status.historyJSON

const getPlayerHistory = createSelector(
  [getPlayerHistoryJSON, (state: RootState) => ensureState(state.queue).entities],
  (history, entities) => [...new Set([
    ...Object.values(entities).filter(item => item.isOptimistic !== true && item.playedAt)
      .sort((a, b) => ('playedAt' in a ? a.playedAt : 0) - ('playedAt' in b ? b.playedAt : 0)).map(item => item.queueId),
    ...JSON.parse(history) as number[],
  ])],
)

export default getPlayerHistory
