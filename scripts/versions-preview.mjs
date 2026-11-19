// Fictional, loopback-only fixture; never opens a NAS or existing application DB.
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const data = path.join(root, '.test-instance', 'versions-qa-' + Date.now())
const media = path.join(data, 'media')
mkdirSync(media, { recursive: true })
const demo = path.join(root, '.test-instance/media/demo.mp4')
if (!existsSync(demo)) throw Error('Missing synthetic demo video')
const { initLogger } = await import('../build/server/lib/Log.js')
initLogger('versions-fixture', { console: { level: 2 }, file: { level: 0 } })
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
  await Rooms.set(undefined, { name: 'Version selector QA', status: 'open', prefs: { qr: { isEnabled: false }, roles: {} } })
  const folder = Number(db.run('INSERT INTO paths(path,priority,data) VALUES (?,0,?)', [media, JSON.stringify({ prefs: { isWatchingEnabled: false } })]).lastID)
  for (const [artist, title, count] of [['The Neon Hours', 'After the Applause', 3], ['Another Fictional Band', 'After the Applause', 1], ['The Neon Hours', 'After the Applause (Acoustic)', 1]]) {
    const { songId } = Library.matchSong({ artist, artistNorm: artist.toLowerCase(), title, titleNorm: title.toLowerCase() })
    const mediaIds = []
    for (let i = 0; i < count; i++) {
      const relPath = `Demo studio ${String.fromCharCode(65 + i)} - ${title}.mp4`
      copyFileSync(demo, path.join(media, relPath))
      mediaIds.push(Media.add({ songId, pathId: folder, relPath, duration: 45 }))
    }
    Media.setPreferred(mediaIds[0], true)
    Categories.set(songId, { genre: 'Pop', language: '', decade: '', performance: '', collections: [] })
    metadataStore.import([{ artist, title, source: 'Synthetic version QA' }], new Map([[entryKey(artist, title), songId]]))
    songs.push({ songId, artist, title, mediaIds })
  }
} finally { close() }
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('KES_') && !['PUID', 'PGID'].includes(key)))
const child = spawn(process.execPath, [path.join(root, 'build/server/main.js')], { cwd: root, stdio: 'inherit', env: { ...env, NODE_ENV: 'production', KES_PATH_DATA: data, KES_HOST: '127.0.0.1', KES_PORT: '18071', KES_SERVER_LOG_LEVEL: '0', KES_SERVER_CONSOLE_LEVEL: '3' } })
const report = { data, database, songs, pid: child.pid, url: 'http://127.0.0.1:18071' }
mkdirSync(path.join(root, 'qa-artifacts/versions'), { recursive: true })
writeFileSync(path.join(root, 'qa-artifacts/versions/fixture.json'), JSON.stringify(report, null, 2))
console.log('Version selector preview: ' + report.url + '/library?roomId=1')
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => process.exit(code || 0))
