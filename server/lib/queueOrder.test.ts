import { expect, it } from 'vitest'
import { applyQueueMoves } from '../../shared/queueOrder.js'

it('leaves the default fair rotation unchanged without explicit host moves', () => {
  expect(applyQueueMoves([3, 4, 2], [])).toEqual([3, 4, 2])
})

it('replays consecutive up, down and top moves without losing earlier moves', () => {
  expect(applyQueueMoves([1, 2, 3], [
    { queueId: 3, afterQueueId: null },
    { queueId: 1, afterQueueId: 2 },
    { queueId: 3, afterQueueId: 2 },
  ])).toEqual([2, 3, 1])
})

it('retains normal turns for new arrivals behind a deliberate next-song choice', () => {
  expect(applyQueueMoves([1, 2, 5, 3, 4], [{ queueId: 4, afterQueueId: null }])).toEqual([4, 1, 2, 5, 3])
})

it('ignores finished/removed actors and treats a removed anchor as the front', () => {
  expect(applyQueueMoves([2, 3, 4], [
    { queueId: 1, afterQueueId: null },
    { queueId: 4, afterQueueId: 1 },
    { queueId: 2, afterQueueId: 2 },
  ])).toEqual([4, 2, 3])
})
