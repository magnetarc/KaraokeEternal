export interface QueueOrderMove {
  queueId: number
  afterQueueId: number | null
}

// Replay deliberate host moves over the fair rotation. New arrivals still enter
// the normal rotation; a manual move changes only its chosen item's position.
export function applyQueueMoves (upcoming: number[], moves: QueueOrderMove[]): number[] {
  const ordered = [...upcoming]
  for (const { queueId, afterQueueId } of moves) {
    const index = ordered.indexOf(queueId)
    if (index < 0 || queueId === afterQueueId) continue
    ordered.splice(index, 1)
    const after = afterQueueId === null ? -1 : ordered.indexOf(afterQueueId)
    ordered.splice(after + 1, 0, queueId)
  }
  return ordered
}
