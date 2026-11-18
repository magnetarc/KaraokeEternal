import KoaRouter from '@koa/router'
import Media from '../Media/Media.js'
import Categories from './Categories.js'
import Library from './Library.js'
import Prefs from '../Prefs/Prefs.js'
import { LIBRARY_PUSH } from '../../shared/actionTypes.js'
const router = new KoaRouter({ prefix: '/api' })

router.get('/instance', (ctx) => { ctx.body = { isTest: Prefs.get().modernTestInstance === true } })

router.put('/song/:songId/categories', async (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(403, 'Only the host can edit categories')
  const songId = Number(ctx.params.songId)
  if (!Number.isSafeInteger(songId) || songId <= 0) ctx.throw(400, 'Invalid songId')
  if (!Media.search({ songId }).result.length) ctx.throw(404, 'Song not found')
  let categories
  try {
    categories = Categories.set(songId, (ctx.request as unknown as { body: unknown }).body)
  } catch (err) {
    ctx.throw(400, err.message)
  }
  Library.cache.version = null
  ctx.io.emit('action', { type: LIBRARY_PUSH, payload: Library.get() })
  ctx.body = categories
})

// lists underlying media for a given song
router.get('/song/:songId', async (ctx) => {
  // must be admin
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const songId = parseInt(ctx.params.songId, 10)

  if (Number.isNaN(songId)) {
    ctx.throw(401, 'Invalid songId')
  }

  const res = Media.search({ songId })

  if (!res.result.length) {
    ctx.throw(404)
  }

  ctx.body = res
})

export default router
