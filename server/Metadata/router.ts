import Router from '@koa/router'
import { LIBRARY_PUSH } from '../../shared/actionTypes.js'
import Library from '../Library/Library.js'
import { metadataStore as store, libraryLinks } from './Store.js'
import { metadataWorker as worker } from './MusicBrainz.js'

const router = new Router({ prefix: '/api/catalogue' })
router.use(async (ctx, next) => {
  if (!ctx.user.isAdmin) ctx.throw(403, 'Only the host can organise the catalogue')
  worker.initialize()
  try { await next() } catch (err) { if (err.status) throw err; ctx.throw(400, err.message) }
})
const id = (ctx: any) => {
  const value = Number(ctx.params.id)
  if (!Number.isSafeInteger(value) || value <= 0) ctx.throw(400, 'Invalid entry identifier')
  return value
}
router.get('/', ctx => {
  const q = String(ctx.query.q ?? '').slice(0, 150)
  const state = String(ctx.query.state ?? '')
  const offset = Math.max(0, Math.min(1000000, Math.floor(Number(ctx.query.offset) || 0)))
  ctx.body = { ...store.list(q, state, offset), active: worker.active }
})
router.post('/import', ctx => { ctx.body = store.import(ctx.request.body, libraryLinks()) })
router.post('/library', ctx => {
  const library = Library.get()
  const rows = library.songs.result.map(id => { const song = library.songs.entities[id]; return { artist: library.artists.entities[song.artistId].name, title: song.title, source: 'Current library' } })
  let added = 0; const links = libraryLinks()
  for (let i = 0; i < rows.length; i += 100) added += store.import(rows.slice(i, i + 100), links).added
  ctx.body = { added }
})
router.post('/queue', ctx => { store.queue((ctx.request.body as { ids?: unknown })?.ids); ctx.body = { ok: true } })
router.post('/start', ctx => { worker.start(); ctx.body = { active: true } })
router.post('/pause', ctx => { worker.pause(); ctx.body = { active: false } })
router.get('/export', ctx => { ctx.set('Content-Disposition', 'attachment; filename="reviewed-catalogue.json"'); ctx.body = store.export() })
router.get('/:id', ctx => { const value = id(ctx); const suggestion = store.sql.get<{ data: string }>('SELECT data FROM catalogueSuggestions WHERE entryId=?', [value]); ctx.body = { ...store.get(value), sources: store.sources(value), discoverySuggestion: suggestion ? JSON.parse(suggestion.data) : null } })
router.post('/:id/select', ctx => { ctx.body = store.select(id(ctx), String((ctx.request.body as { recordingId?: unknown })?.recordingId ?? '')) })
router.post('/:id/search', ctx => { ctx.body = store.search(id(ctx), ctx.request.body) })
router.post('/:id/approve', ctx => {
  ctx.body = store.approve(id(ctx), ctx.request.body, ctx.user.userId)
  Library.cache.version = null
  ctx.io.emit('action', { type: LIBRARY_PUSH, payload: Library.get() })
})
router.post('/:id/reject', ctx => { store.reject(id(ctx), ctx.user.userId); ctx.body = { ok: true } })
export default router
