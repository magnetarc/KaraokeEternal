// Disposable Linux CI only: reproduce group-protected NAS media, then run the repair.
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, chmodSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = path.resolve(import.meta.dirname, '..')
const media = '/volume1/Media/10 - KARAOKE'
const volume = 'karaoke-modern_karaoke-modern-config'
const uid = process.getuid()
const gid = process.getgid()
assert.notEqual(uid, 1000, 'CI identity must differ from the image node user')
function command (bin, args, ok = true) {
  const result = spawnSync(bin, args, { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  if (ok) assert.equal(result.status, 0, result.stdout + result.stderr)
  return result
}
const docker = (...args) => command('docker', args).stdout.trim()
const compose = (...args) => docker('compose', '-p', 'karaoke-modern', '-f', 'compose.yaml', ...args)
const base = 'http://127.0.0.1:8092'
const password = 'synthetic-only-2026!'
async function ready () {
  for (let n = 0; n < 30; n++) {
    try { if ((await fetch(base + '/api/instance')).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw Error('HTTP did not become ready')
}
try {
  docker('tag', process.argv[2] ?? 'karaoke-modern:ci', 'karaoke-modern:local')
  command('sudo', ['mkdir', '-p', media])
  command('sudo', ['chown', `${uid}:${gid}`, media])
  chmodSync(media, 0o750)
  for (const name of ['OTHER', 'RIGMAR', 'SUNFLY']) mkdirSync(path.join(media, name), { mode: 0o750 })
  const modeBefore = statSync(media).mode
  mkdirSync(path.join(root, 'seed'), { recursive: true })
  const entries = ['Synthetic first', 'Synthetic second'].map(title => ({ artist: 'Fictional artist', title, data: {}, sources: [], suggestion: null }))
  writeFileSync(path.join(root, 'seed/catalogue-metadata.json'), JSON.stringify({ schema: 1, kind: 'karaoke-modern-metadata-only', entries, artists: [] }), { mode: 0o644 })
  docker('volume', 'create', volume)
  compose('--profile', 'import', 'run', '--rm', 'import-metadata')
  compose('up', '-d', '--no-build', 'karaoke-modern')
  await ready()
  let container = compose('ps', '-q', 'karaoke-modern')
  const denied = command('docker', ['exec', container, 'node', '-e', "require('node:fs').readdirSync('/media')"], false)
  assert.notEqual(denied.status, 0)
  assert.match(denied.stderr, /EACCES/)
  const setup = await fetch(base + '/api/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'cihost', name: 'Synthetic host', newPassword: password, newPasswordConfirm: password }) })
  assert.equal(setup.status, 200, await setup.text())
  const ownerBefore = docker('exec', container, 'stat', '-c', '%u:%g', '/config/database.sqlite3')
  console.log('PASS: default image reproduces NAS EACCES; existing host account created before repair')
  const repair = command('sudo', ['sh', 'repair-media-access.sh'])
  console.log(repair.stdout)
  await ready()
  container = compose('ps', '-q', 'karaoke-modern')
  assert.equal(docker('exec', container, 'id', '-u'), '1000')
  assert.ok(docker('exec', container, 'id', '-G').split(' ').includes(String(gid)))
  assert.equal(docker('exec', container, 'stat', '-c', '%u:%g', '/config/database.sqlite3'), ownerBefore)
  docker('exec', container, 'node', '-e', "require('node:fs').readdirSync('/media/RIGMAR')")
  const write = command('docker', ['exec', container, 'node', '-e', "require('node:fs').writeFileSync('/media/should-not-write','x')"], false)
  assert.notEqual(write.status, 0)
  assert.match(write.stderr, /EROFS/)
  assert.equal(statSync(media).mode, modeBefore)
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'cihost', password }) })
  assert.equal(login.status, 200, await login.text())
  const counts = JSON.parse(docker('exec', container, 'node', '--input-type=module', '-e', "import{DatabaseSync}from'node:sqlite';const d=new DatabaseSync('/config/database.sqlite3',{readOnly:true});console.log(JSON.stringify({users:d.prepare('SELECT COUNT(*) AS n FROM users').get().n,entries:d.prepare('SELECT COUNT(*) AS n FROM catalogueEntries').get().n}));d.close()"))
  assert.deepEqual(counts, { users: 1, entries: 2 })
  console.log('PASS: repair adds NAS groups while retaining application UID/database ownership, read-only media/modes, and host login/catalogue')
  // Exercise the real updater, including its scanner wait, against this disposable service.
  const release = 'a'.repeat(40)
  const architecture = docker('info', '--format', '{{.Architecture}}')
  const arch = ['x86_64', 'amd64'].includes(architecture) ? 'amd64' : 'arm64'
  const bundle = path.join(root, 'release-images', release, arch)
  mkdirSync(bundle, { recursive: true })
  const archive = path.join(bundle, 'karaoke-modern-image.tar.gz')
  command('docker', ['save', '-o', archive, 'karaoke-modern:local'])
  const hash = createHash('sha256').update(readFileSync(archive)).digest('hex')
  writeFileSync(path.join(bundle, 'karaoke-modern-image.tar.gz.sha256'), `${hash}  karaoke-modern-image.tar.gz\n`)
  writeFileSync(path.join(bundle, 'source-commit.txt'), release + '\n')
  writeFileSync(path.join(bundle, 'image-id.txt'), docker('image', 'inspect', '--format', '{{.Id}}', 'karaoke-modern:local') + '\n')
  writeFileSync(path.join(root, 'release-images/current-version'), release + '\n')
  docker('exec', '-d', container, 'node', '-e', 'setTimeout(()=>{},8000)', '/fixture/scannerWorker.js')
  const update = command('sudo', ['sh', 'update-nas.sh'])
  console.log(update.stdout)
  assert.match(update.stdout, /Media indexing is still running/)
  await ready()
  const updated = JSON.parse(readFileSync(path.join(root, 'diagnostics/update-result.json'), 'utf8'))
  assert.equal(updated.state, 'ready')
  assert.equal(updated.database, 'ok')
  assert.equal(updated.users, 1)
  assert.equal(updated.catalogueEntries, 2)
  container = compose('ps', '-q', 'karaoke-modern')
  assert.equal(docker('exec', container, 'stat', '-c', '%u:%g', '/config/database.sqlite3'), ownerBefore)
  docker('exec', container, 'node', '-e', "require('node:fs').readdirSync('/media/RIGMAR')")
  const loginAfterUpdate = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'cihost', password }) })
  assert.equal(loginAfterUpdate.status, 200, await loginAfterUpdate.text())
  console.log('PASS: prebuilt updater waits for scanning, backs up config and retains NAS groups, catalogue, ownership and host login')
} finally {
  command('sudo', ['docker', 'compose', '-p', 'karaoke-modern', '-f', 'compose.yaml', '-f', 'compose.nas.yaml', 'down'], false)
  command('docker', ['volume', 'rm', volume], false)
}
