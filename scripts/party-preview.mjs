// Fictional, loopback-only fixture; never opens a NAS or existing application DB.
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const data = path.join(root, '.test-instance', 'party-qa-' + Date.now())
const media = path.join(data, 'media')
mkdirSync(media, { recursive: true })
const ffmpegProbe = spawnSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' })
if (ffmpegProbe.status !== 0) throw Error('The fictional playback fixture needs Python imageio_ffmpeg')
const ffmpeg = ffmpegProbe.stdout.trim()
const demo = path.join(media, 'fixture.mp4')
const video = spawnSync(ffmpeg, ['-v','error','-y','-f','lavfi','-i','color=c=0x24334a:s=640x360:d=45','-f','lavfi','-i','sine=frequency=330:duration=45','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',demo], { encoding: 'utf8' })
if (video.status !== 0) throw Error(video.stderr)
const { initLogger } = await import('../build/server/lib/Log.js')
initLogger('party-fixture', { console: { level: 2 }, file: { level: 0 } })
const { open, close } = await import('../build/server/lib/Database.js')
const { default: User } = await import('../build/server/User/User.js')
const { default: Rooms } = await import('../build/server/Rooms/Rooms.js')
const { default: Library } = await import('../build/server/Library/Library.js')
const { default: Categories } = await import('../build/server/Library/Categories.js')
const { default: Media } = await import('../build/server/Media/Media.js')
const { metadataStore } = await import('../build/server/Metadata/Store.js')
const { entryKey } = await import('../build/shared/metadata.js')
const database = path.join(data, 'database.sqlite3')
const db = open({ file: database, ro: false })
const songs = []
try {
  db.run("INSERT INTO prefs(key,data) VALUES ('modernTestInstance','true')")
  db.run("UPDATE prefs SET data='false' WHERE key='isFirstRun'")
  for (const [name, role] of [['host', 'admin'], ['singer', 'standard']]) await User.create({ username: name, name: 'Demo ' + name, newPassword: `preview-${name}-2026`, newPasswordConfirm: `preview-${name}-2026` }, role)
  await Rooms.set(undefined, { name: 'Party browser QA', status: 'open', prefs: { qr: { isEnabled: false }, roles: {} } })
  const folder = Number(db.run('INSERT INTO paths(path,priority,data) VALUES (?,0,?)', [media, JSON.stringify({ prefs: { isWatchingEnabled: false } })]).lastID)
  const cases = [['The Neon Hours', 'Zebra Encore', 2], ...Array.from({ length: 89 }, (_, i) => ['The Demo Band', `Alpha Song ${String(i + 1).padStart(3, '0')}`, 1]), ...['Rock','Country','R&B/Soul','Dance/Electronic','Hip-Hop/Rap','Jazz/Swing','Musical Theatre',"Children's"].map(genre => ['Fictional ensemble', `${genre} fixture`, 1])]
  for (const [artist, title, count] of cases) {
    const { songId } = Library.matchSong({ artist, artistNorm: artist.toLowerCase(), title, titleNorm: title.toLowerCase() })
    const mediaIds = []
    for (let i = 0; i < count; i++) {
      const relPath = `Demo studio ${String.fromCharCode(65 + i)} - ${title}.mp4`.replace(/[\\/]/g, '_')
      copyFileSync(demo, path.join(media, relPath))
      mediaIds.push(Media.add({ songId, pathId: folder, relPath, duration: 45 }))
    }
    Media.setPreferred(mediaIds[0], true)
    const genre = title.endsWith(' fixture') ? title.slice(0, -8) : 'Pop'
    Categories.set(songId, { genre, language: '', decade: '', performance: '', collections: [] })
    metadataStore.import([{ artist, title, source: 'Synthetic version QA' }], new Map([[entryKey(artist, title), songId]]))
    const entry = db.get('SELECT entryId FROM catalogueEntries WHERE librarySongId=?', [songId])
    db.run('INSERT INTO catalogueSuggestions(entryId,data,model,updatedAt) VALUES(?,?,?,?)', [entry.entryId, JSON.stringify({ categories: { genre, collections: [] }, popularity: title === 'Zebra Encore' ? 3 : 0, styleBasis: 'song_suggestion' }), 'fixture-only', new Date().toISOString()])
    songs.push({ songId, artist, title, mediaIds })
  }
  for (const variable of [false, true]) {
    const title = variable ? 'Synthetic VBR ending' : 'Synthetic CBR ending'
    const filename = variable ? 'synthetic-vbr.mp3' : 'synthetic-cbr.mp3'
    const generated = spawnSync(ffmpeg, ['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=2.4','-codec:a','libmp3lame', ...(variable ? ['-q:a','4'] : ['-b:a','128k']), path.join(media, filename)], { encoding: 'utf8' })
    if (generated.status !== 0) throw Error(generated.stderr)
    writeFileSync(path.join(media, filename.replace('.mp3','.cdg')), new Uint8Array(24 * 900))
    const artist = 'Synthetic audio fixture'
    const { songId } = Library.matchSong({ artist, artistNorm: artist.toLowerCase(), title, titleNorm: title.toLowerCase() })
    const mediaId = Media.add({ songId, pathId: folder, relPath: filename, duration: 999 })
    Categories.set(songId, { genre: 'Rock', language: '', decade: '', performance: '', collections: [] })
    metadataStore.import([{ artist, title, source: 'Synthetic audio QA' }], new Map([[entryKey(artist,title),songId]]))
    songs.push({ songId, artist, title, mediaIds: [mediaId] })
  }
} finally { close() }
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('KES_') && !['PUID', 'PGID'].includes(key)))
const child = spawn(process.execPath, [path.join(root, 'build/server/main.js')], { cwd: root, stdio: 'inherit', env: { ...env, NODE_ENV: 'production', KES_PATH_DATA: data, KES_HOST: '127.0.0.1', KES_PORT: '18072', KES_SERVER_LOG_LEVEL: '0', KES_SERVER_CONSOLE_LEVEL: '3' } })
const report = { data, database, songs, pid: child.pid, url: 'http://127.0.0.1:18072' }
mkdirSync(path.join(root, 'qa-artifacts/party'), { recursive: true })
writeFileSync(path.join(root, 'qa-artifacts/party/fixture.json'), JSON.stringify(report, null, 2))
console.log('Party browser preview: ' + report.url + '/library?roomId=1')
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => process.exit(code || 0))
