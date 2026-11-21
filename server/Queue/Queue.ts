import path from 'path'
import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'
import sql from 'sqlate'
import { QueueItem } from '../../shared/types.js'
import { versionDisplay } from '../../shared/songVersions.js'
import type { QueueOrderMove } from '../../shared/queueOrder.js'

const log = getLogger('Queue')

interface QueueEntityBuilding {
  playedAt?: number | null
  queueId: number
  songId: number
  userId: number
  prevQueueId: number | null
  mediaId: number | null
  relPath?: string | null
  pitch: number | null
  userPitch: number | null
  rgTrackGain: number | null
  rgTrackPeak: number | null
  userDisplayName: string
  userDateUpdated: number
  pathId: number | null
  pathData?: string | null
  isPreferred?: number | null
  mediaType?: 'cdg' | 'mp4'
  isVideoKeyingEnabled?: boolean
  selectedMediaId: number | null
  versionLabel?: string
}

class Queue {
  /**
   * Add a songId to a room's queue
   */
  static add ({ roomId, songId, userId, mediaId }: { roomId: number, songId: number, userId: number, mediaId?: number }): number {
    if (!Number.isSafeInteger(songId) || songId <= 0) throw new Error('Invalid song identifier')
    if (mediaId !== undefined && (!Number.isSafeInteger(mediaId) || mediaId <= 0 || !db.get('SELECT 1 FROM media WHERE mediaId=? AND songId=?', [mediaId, songId]))) {
      throw new Error('This version is no longer available for this song. Refresh and choose again.')
    }
    const fields = new Map()
    fields.set('roomId', roomId)
    fields.set('songId', songId)
    fields.set('userId', userId)
    if (mediaId !== undefined) fields.set('selectedMediaId', mediaId)
    fields.set('prevQueueId', sql`(
      SELECT queueId
      FROM queue
      WHERE roomId = ${roomId} AND queueId NOT IN (
        SELECT prevQueueId
        FROM queue
        WHERE prevQueueId IS NOT NULL AND roomId = ${roomId}
      )
    )`)

    const query = sql`
      INSERT INTO queue ${sql.tuple(Array.from(fields.keys()).map(sql.column))}
      VALUES ${sql.tuple(Array.from(fields.values()))}
    `
    const res = db.run(String(query), query.parameters)

    if (res.changes !== 1) {
      throw new Error('Could not add song to queue')
    }
    return Number(res.lastID)
  }

  // Persist completed/skipped rows separately from the active turn order. Pin
  // the actual media on first playback so history requeues the same version.
  static recordPlayback (roomId: number, status: { queueId?: number, mediaId?: number, historyJSON?: string, completedQueueId?: number | null }): boolean {
    let history: number[] = []
    try {
      const value = JSON.parse(status.historyJSON ?? '[]')
      if (Array.isArray(value)) history = value.filter(Number.isSafeInteger)
    } catch {
      return false
    }
    let changes = 0
    const now = Date.now()
    db.exec('BEGIN IMMEDIATE')
    try {
      if (Number.isSafeInteger(status.mediaId) && Number.isSafeInteger(status.queueId)) {
        changes += db.run(`UPDATE queue SET selectedMediaId=? WHERE roomId=? AND queueId=? AND selectedMediaId IS NULL
          AND EXISTS(SELECT 1 FROM media WHERE mediaId=? AND media.songId=queue.songId)`, [status.mediaId, roomId, status.queueId, status.mediaId]).changes
      }
      for (const [index, id] of [...new Set(history)].entries()) {
        changes += db.run('UPDATE queue SET playedAt=? WHERE roomId=? AND queueId=? AND playedAt IS NULL', [now + index, roomId, id]).changes
      }
      changes += db.run('DELETE FROM queueOrderMoves WHERE roomId=? AND queueId IN (SELECT queueId FROM queue WHERE playedAt IS NOT NULL)', [roomId]).changes
      if (typeof status.completedQueueId === 'number' && history.includes(status.completedQueueId)) {
        const result = db.run('UPDATE queue SET completedAt=? WHERE roomId=? AND queueId=? AND completedAt IS NULL', [now, roomId, status.completedQueueId])
        if (result.changes) {
          db.run(`INSERT INTO songPlayCounts(songId,plays) SELECT songId,1 FROM queue WHERE queueId=? AND roomId=?
            ON CONFLICT(songId) DO UPDATE SET plays=plays+1`, [status.completedQueueId, roomId])
          changes += result.changes
        }
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return changes > 0
  }

  /**
   * Get queued items for a given room
   */
  static get (roomId: number): { result: number[], entities: Record<number, QueueItem>, moves?: QueueOrderMove[] } {
    const chain: number[] = []
    const orphaned = new Set<number>()
    const entities: Record<number, QueueEntityBuilding> = {}
    const map = new Map()
    const pathData = new Map()
    let curQueueId = null

    // media and paths are LEFT JOINed so that queue items whose media was
    // removed (e.g. mid-scan) still anchor the prevQueueId chain; they're
    // kept out of the payload below
    const query = sql`
      SELECT queueId, queue.songId, queue.userId, prevQueueId, queue.selectedMediaId, queue.playedAt,
        media.mediaId, media.relPath, media.pitch, userPitches.pitch AS userPitch,
        media.rgTrackGain, media.rgTrackPeak,
        users.name AS userDisplayName, users.dateUpdated AS userDateUpdated,
        paths.pathId, paths.data AS pathData,
        -- the only aggregate here, so sqlite's bare column rule makes every
        -- media.* above come from the row it picked: adding a second aggregate
        -- would break that, and a song's media could then disagree. userPitches
        -- is unique per (userId, mediaId), so it adds no rows and its pitch is
        -- the one for the picked media.
        MAX(isPreferred) AS isPreferred
      FROM queue
        INNER JOIN users USING(userId)
        LEFT JOIN media ON media.songId = queue.songId
          AND (queue.selectedMediaId IS NULL OR media.mediaId = queue.selectedMediaId)
        LEFT JOIN paths USING(pathId)
        LEFT JOIN userPitches ON userPitches.mediaId = media.mediaId AND userPitches.userId = queue.userId
      WHERE roomId = ${roomId}
      GROUP BY queueId
      ORDER BY queueId
    `
    const rows = db.all<{
      queueId: number
      songId: number
      userId: number
      prevQueueId: number
      mediaId: number | null
      relPath: string | null
      pitch: number | null
      userPitch: number | null
      rgTrackGain: number | null
      rgTrackPeak: number | null
      userDisplayName: string
      userDateUpdated: number
      pathId: number | null
      pathData: string | null
      isPreferred: number | null
      selectedMediaId: number | null
      playedAt: number | null
    }>(String(query), query.parameters)

    for (const row of rows) {
      // every row participates in the chain, orphaned or not
      if (row.prevQueueId === null) {
        // found the first item
        chain.push(row.queueId)
        curQueueId = row.queueId
      } else {
        // map indexed by prevQueueId
        map.set(row.prevQueueId, row.queueId)
      }

      const { relPath, pathId } = row

      if (row.mediaId === null || relPath === null || pathId === null) {
        orphaned.add(row.queueId)
        continue
      }

      if (!pathData.has(pathId)) {
        pathData.set(pathId, row.pathData === null ? null : JSON.parse(row.pathData))
      }

      const pathPrefs = pathData.get(pathId)?.prefs

      entities[row.queueId] = row
      if (row.playedAt === null) delete entities[row.queueId].playedAt
      entities[row.queueId].mediaType = this.getType(relPath)
      entities[row.queueId].isVideoKeyingEnabled = !!pathPrefs?.isVideoKeyingEnabled
      if (row.selectedMediaId !== null) entities[row.queueId].versionLabel = versionDisplay(relPath).label

      // don't send over the wire
      delete entities[row.queueId].relPath
      delete entities[row.queueId].isPreferred
      delete entities[row.queueId].pathData
    }

    while (chain.length < rows.length) {
      // get the item whose prevQueueId references the current one
      const nextQueueId = map.get(curQueueId)

      if (nextQueueId === undefined) {
        log.error('queue chain broken in room %s at queueId %s', roomId, curQueueId)

        // degrade to insertion order for the unreachable remainder
        for (const row of rows) {
          if (!chain.includes(row.queueId)) chain.push(row.queueId)
        }

        break
      }

      chain.push(nextQueueId)
      curQueueId = nextQueueId
    }

    const result = chain.filter(queueId => !orphaned.has(queueId))
    const moves = db.all<QueueOrderMove>('SELECT queueId,afterQueueId FROM queueOrderMoves WHERE roomId=? ORDER BY moveId', [roomId])
    return { result, entities: entities as unknown as Record<number, QueueItem>, ...(moves.length ? { moves } : {}) }
  }

  static reorder (roomId: number, queueId: number, afterQueueId: number | null, currentQueueId?: number): void {
    const pending = (id: number) => Number.isSafeInteger(id) && id !== currentQueueId
      && !!db.get('SELECT 1 FROM queue WHERE roomId=? AND queueId=? AND playedAt IS NULL', [roomId, id])
    if (!pending(queueId) || queueId === afterQueueId || (afterQueueId !== null && !pending(afterQueueId))) {
      throw new Error('Only upcoming songs in this room can be reordered. Refresh the queue and try again.')
    }
    db.run('INSERT INTO queueOrderMoves(roomId,queueId,afterQueueId) VALUES (?,?,?)', [roomId, queueId, afterQueueId])
  }

  // Swap a singer's songs in their existing slots, including explicit host
  // ordering. Moving the raw chain head would otherwise change singer priority.
  static swap (roomId: number, first: number, second: number, currentQueueId?: number): void {
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second) || first === second || [first, second].includes(currentQueueId)) throw new Error('Choose two upcoming songs')
    db.exec('BEGIN IMMEDIATE')
    db.exec('PRAGMA defer_foreign_keys = ON')
    try {
      const rows = db.all<{ queueId: number, userId: number, prevQueueId: number | null }>('SELECT queueId,userId,prevQueueId FROM queue WHERE roomId=? AND queueId IN (?,?) AND playedAt IS NULL', [roomId, first, second])
      if (rows.length !== 2 || rows[0].userId !== rows[1].userId) throw new Error('Only your own upcoming songs can be swapped')
      const parent = (id: number) => rows.find(row => row.queueId === id).prevQueueId
      const exchange = (id: number | null) => id === first ? second : id === second ? first : id
      db.run(`UPDATE queue SET prevQueueId=CASE
        WHEN queueId=? THEN ? WHEN queueId=? THEN ?
        WHEN prevQueueId=? THEN ? WHEN prevQueueId=? THEN ? ELSE prevQueueId END WHERE roomId=?`,
      [first, exchange(parent(second)), second, exchange(parent(first)), first, second, second, first, roomId])
      db.run(`UPDATE queueOrderMoves SET queueId=CASE WHEN queueId=? THEN ? WHEN queueId=? THEN ? ELSE queueId END,
        afterQueueId=CASE WHEN afterQueueId=? THEN ? WHEN afterQueueId=? THEN ? ELSE afterQueueId END WHERE roomId=?`,
      [first, second, second, first, first, second, second, first, roomId])
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  /**
   * Move a queue item
   */
  static move ({ prevQueueId, queueId, roomId }: { prevQueueId: number | null, queueId: number, roomId: number }): void {
    if (queueId === prevQueueId) {
      throw new Error('Invalid prevQueueId')
    }

    if (prevQueueId === -1) prevQueueId = null

    db.exec('BEGIN IMMEDIATE')
    db.exec('PRAGMA defer_foreign_keys = ON')

    try {
      // get the current parent and validate prevQueueId
      const curQuery = sql`
        SELECT q.prevQueueId,
          CASE WHEN ${prevQueueId} IS NULL THEN 1
               WHEN EXISTS (SELECT 1 FROM queue WHERE queueId = ${prevQueueId} AND roomId = ${roomId}) THEN 1
               ELSE 0
          END AS prevValid
        FROM queue q
        WHERE q.queueId = ${queueId} AND q.roomId = ${roomId}
      `
      const curRow = db.get<{ prevQueueId: number | null, prevValid: number }>(String(curQuery), curQuery.parameters)

      if (!curRow) {
        throw new Error(`queueId ${queueId} not found in room ${roomId}`)
      }

      if (!curRow.prevValid) {
        throw new Error(`prevQueueId ${prevQueueId} not found in room ${roomId}`)
      }

      const curParent = curRow.prevQueueId

      // already in correct position?
      if (curParent === prevQueueId) {
        db.exec('COMMIT')
        return
      }

      // perform the move
      const updateQuery = sql`
        UPDATE queue
        SET prevQueueId = CASE
          WHEN prevQueueId = ${queueId} THEN ${curParent}
          WHEN queueId != ${queueId} AND prevQueueId ${prevQueueId === null ? sql`IS NULL` : sql`= ${prevQueueId}`} THEN ${queueId}
          WHEN queueId = ${queueId} THEN ${prevQueueId}
          ELSE prevQueueId
        END
        WHERE roomId = ${roomId} 
          AND (
            prevQueueId = ${queueId} 
            OR (queueId != ${queueId} AND prevQueueId ${prevQueueId === null ? sql`IS NULL` : sql`= ${prevQueueId}`})
            OR queueId = ${queueId}
          )
      `
      db.run(String(updateQuery), updateQuery.parameters)

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  /**
   * Delete a queue item
   */
  static remove (queueId: number): void {
    db.exec('BEGIN IMMEDIATE')
    db.exec('PRAGMA defer_foreign_keys = ON') // v0.9 betas didn't have prevQueueId DEFERRABLE

    try {
      const deleteQuery = sql`
        DELETE FROM queue
        WHERE queueId = ${queueId}
        RETURNING prevQueueId
      `
      const deletedRow = db.get<{ prevQueueId: number | null }>(String(deleteQuery), deleteQuery.parameters)

      if (deletedRow === undefined) {
        throw new Error(`Could not remove queueId: ${queueId}`)
      }

      // close the gap
      const updateQuery = sql`
        UPDATE queue
        SET prevQueueId = ${deletedRow.prevQueueId}
        WHERE prevQueueId = ${queueId}
      `
      db.run(String(updateQuery), updateQuery.parameters)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  /**
   * Check if user owns queue item(s)
   */
  static isOwner (userId: number, queueId: number | number[]): boolean {
    const ids = Array.isArray(queueId) ? queueId : [queueId]
    if (ids.length === 0) return false

    const query = sql`
      SELECT COUNT(*) AS count
      FROM queue
      WHERE userId = ${userId} AND queueId IN ${sql.tuple(ids)}
    `
    const res = db.get<{ count: number }>(String(query), query.parameters)
    return res.count === ids.length
  }

  /**
   * Get media type from file extension
   */
  static getType (file: string): 'cdg' | 'mp4' {
    return /\.mp4/i.test(path.extname(file)) ? 'mp4' : 'cdg'
  }
}

export default Queue
