import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const data = fileURLToPath(new URL('../.test-instance/', import.meta.url))
const database = path.join(data, 'database.sqlite3')
if (existsSync(database)) throw new Error('Test database already exists; leaving it unchanged')
mkdirSync(path.join(data, 'media'), { recursive: true })
if (!existsSync(path.join(data, 'media', 'demo.mp4'))) throw new Error('Generate .test-instance/media/demo.mp4 first (see MODERN-BROWSER.md)')
const { initLogger } = await import('../build/server/lib/Log.js')
initLogger('seed', { console: { level: 2 }, file: { level: 0 } })
const { open, close } = await import('../build/server/lib/Database.js')
const { default: User } = await import('../build/server/User/User.js')
const { default: Rooms } = await import('../build/server/Rooms/Rooms.js')
const { default: Library } = await import('../build/server/Library/Library.js')
const { default: Categories } = await import('../build/server/Library/Categories.js')
const { default: Queue } = await import('../build/server/Queue/Queue.js')
const db = open({ file: database, ro: false })
try {
  db.run("INSERT INTO prefs (key,data) VALUES ('modernTestInstance','true')")
  db.run("UPDATE prefs SET data='false' WHERE key='isFirstRun'")
  await User.create({ username: 'host', newPassword: 'preview-host-2026', newPasswordConfirm: 'preview-host-2026', name: 'Demo host' }, 'admin')
  await User.create({ username: 'singer', newPassword: 'preview-singer-2026', newPasswordConfirm: 'preview-singer-2026', name: 'Demo singer' }, 'standard')
  await Rooms.set(undefined, { name: 'Modern browser · test room', status: 'open', prefs: { qr: { isEnabled: false }, roles: {} } })
  const roomId = db.get('SELECT roomId FROM rooms').roomId
  const host = User.getByUsername('host').userId
  const singer = User.getByUsername('singer').userId
  db.run('INSERT INTO paths (path,priority,data) VALUES (?,0,?)', [path.join(data, 'media'), JSON.stringify({ prefs: { isWatchingEnabled: false, isVideoKeyingEnabled: false } })])
  const pathId = db.get('SELECT pathId FROM paths').pathId
  // Fictional titles and artists; these are not commercial recordings.
  const samples = [
    ['After the Applause', 'The Neon Hours', 'Pop', 'English', '2020s', 'Solo', 'Party starters'],
    ['All Together Tonight', 'The Weekend Crowd', 'Pop', 'English', '2010s', 'Group', 'Crowd favourites'],
    ['Back to the Dancefloor', 'Velvet Arcade', 'Disco', 'English', '1970s', 'Solo', 'Party starters'],
    ['Blue Sky Duet', 'June & Jasper', 'Country', 'English', '1990s', 'Duet', 'Better together'],
    ['City of Paper Lanterns', 'The River Lights', 'Pop', 'Mandarin', '2020s', 'Solo', 'Late night'],
    ['Dancing in the Kitchen', 'Ruby Sunday', 'Soul', 'English', '1960s', 'Solo', 'Crowd favourites'],
    ['Electric Hearts', 'Velvet Arcade', 'Rock', 'English', '1980s', 'Duet', 'Better together'],
    ['Encore for Everyone', 'The Weekend Crowd', 'Rock', 'English', '2000s', 'Group', 'Crowd favourites'],
    ['Golden Hour Road', 'June & Jasper', 'Country', 'English', '1990s', 'Duet', 'Better together'],
    ['Midnight City Lights', 'The Neon Hours', 'Pop', 'English', '1980s', 'Solo', 'Party starters'],
    ['One More Chorus', 'Ruby Sunday', 'Soul', 'English', '2000s', 'Solo', 'Late night'],
    ['Under the Same Moon', 'Luna Azul', 'Latin', 'Spanish', '2010s', 'Duet', 'Better together'],
  ]
  const ids = []
  for (const [title, artist, genre, language, decade, performance, collection] of samples) {
    const { songId } = Library.matchSong({ artist, artistNorm: artist.toLowerCase(), title, titleNorm: title.toLowerCase() })
    db.run('INSERT INTO media (songId,pathId,relPath,duration) VALUES (?,?,?,45)', [songId, pathId, 'demo.mp4'])
    Categories.set(songId, { genre, language, decade, performance, collections: [collection] })
    ids.push(songId)
  }
  Library.starSong(ids[0], host)
  Library.starSong(ids[6], host)
  Queue.add({ roomId, songId: ids[0], userId: host })
  Queue.add({ roomId, songId: ids[3], userId: singer })
  Queue.add({ roomId, songId: ids[6], userId: host })
  console.log('Created 12 fictional songs and a sample queue in the isolated test database.')
} finally { close() }
