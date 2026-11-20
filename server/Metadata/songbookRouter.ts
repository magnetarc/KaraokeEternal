import Router, { type RouterContext } from '@koa/router'
import { songbook } from './Songbook.js'
import { metadataStore } from './Store.js'
import Library from '../Library/Library.js'
import Categories from '../Library/Categories.js'
import { validateCategories } from '../../shared/catalog.js'
import { LIBRARY_PUSH } from '../../shared/actionTypes.js'
const router = new Router({ prefix: '/api/songbook' })
router.use(async (ctx, next) => {
  if (ctx.user.userId == null) ctx.throw(403, 'Sign in to browse the songbook')
  try {
    await next()
  } catch (err) {
    if (err.status) throw err
    ctx.throw(400, err.message)
  }
})
router.get('/options', (ctx) => {
  ctx.body = songbook.options()
})
router.get('/', (ctx) => {
  const q = ctx.query
  ctx.body = songbook.list({ query: String(q.q ?? ''), genre: String(q.genre ?? ''), language: String(q.language ?? ''), decade: String(q.decade ?? ''), performance: String(q.performance ?? ''), collection: String(q.collection ?? ''), sort: String(q.sort ?? 'popular'), offset: Number(q.offset) || 0, favourites: q.favourites === '1', available: q.available === '1', untagged: q.untagged === '1' }, ctx.user.userId)
})
const id = (ctx: RouterContext) => {
  const value = Number(ctx.params.id)
  if (!Number.isSafeInteger(value) || value <= 0) ctx.throw(400, 'Invalid songbook identifier')
  return value
}
router.post('/:id/star', (ctx) => {
  const body = ctx.request.body as { starred?: boolean }
  if (typeof body?.starred !== 'boolean') ctx.throw(400, 'Choose starred true or false')
  songbook.setStar(id(ctx), ctx.user.userId, body.starred)
  Library.starCountsCache.version = null
  ctx.body = { starred: body.starred }
})
router.post('/:id/feature', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(403, 'Only the host can promote a song')
  const body = ctx.request.body as { featured?: boolean }
  if (typeof body?.featured !== 'boolean') ctx.throw(400, 'Choose featured true or false')
  metadataStore.update(id(ctx), { discoveryFeatured: body.featured })
  ctx.body = { featured: body.featured }
})
router.post('/:id/categories', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(403, 'Only the host can edit categories')
  const body = ctx.request.body as { confirmed?: boolean, categories?: unknown }
  if (body?.confirmed !== true) ctx.throw(400, 'Confirm that you checked this song and version')
  const categories = validateCategories(body.categories)
  const entry = metadataStore.get(id(ctx))
  if (entry.state === 'working') ctx.throw(409, 'Wait for this lookup to finish before editing categories')
  const reviewedAt = new Date().toISOString()
  metadataStore.sql.exec('BEGIN IMMEDIATE')
  try {
    metadataStore.update(entry.entryId, { approved: categories, state: 'approved', reviewedAt, reviewedBy: ctx.user.userId })
    if (entry.librarySongId) Categories.set(entry.librarySongId, categories)
    metadataStore.sql.run('INSERT INTO catalogueReviews(entryId,userId,reviewedAt,action,data) VALUES (?,?,?,?,?)', [entry.entryId, ctx.user.userId, reviewedAt, 'manual_categories', JSON.stringify({ categories })])
    metadataStore.sql.exec('COMMIT')
  } catch (err) {
    metadataStore.sql.exec('ROLLBACK')
    throw err
  }
  Library.cache.version = null
  ctx.io.emit('action', { type: LIBRARY_PUSH, payload: Library.get() })
  ctx.body = { categories }
})
export default router
