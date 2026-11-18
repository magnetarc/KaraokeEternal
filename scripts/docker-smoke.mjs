// Run on a disposable Docker host. Uses only fictional metadata and owned resources.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const image = process.argv[2] ?? 'karaoke-modern-test:ci'
const name = 'ke-modern-ci-' + process.pid
const volume = name + '-config'
const seed = mkdtempSync(path.join(os.tmpdir(), name))
chmodSync(seed, 0o755)
const entries = ['First Fictional Song', 'Second Fictional Song'].map(title => ({ artist: 'Synthetic CI artist', title, data: {}, sources: [{ artist: 'Synthetic CI artist', title, sourceTitle: title, source: 'Fictional CI fixture', provider: '' }], suggestion: null }))
writeFileSync(path.join(seed, 'test.json'), JSON.stringify({ schema: 1, kind: 'karaoke-modern-metadata-only', entries, artists: [] }), { mode: 0o644 })
const docker = (...args) => {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Docker failed')
  return result.stdout.trim()
}
try {
  docker('volume', 'create', volume)
  const imported = docker('run', '--rm', '--mount', `type=volume,source=${volume},target=/config`, '--mount', `type=bind,source=${seed},target=/seed,readonly`, image, 'node', 'scripts/catalogue-bundle.mjs', 'import', '--database', '/config/database.sqlite3', '--bundle', '/seed/test.json', '--isolated-test')
  assert.equal(JSON.parse(imported).added, 2)
  docker('run', '-d', '--name', name, '--mount', `type=volume,source=${volume},target=/config`, '-p', '127.0.0.1::8080', image)
  const address = docker('port', name, '8080/tcp').split('\n')[0]
  const base = 'http://' + address
  let ready = false
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(base + '/api/instance', { signal: AbortSignal.timeout(2000) })
      if (response.ok && (await response.json()).isTest === true) { ready = true; break }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  assert.equal(ready, true, 'Container did not become ready')
  for (const route of ['/account', '/songbook', '/library', '/player']) assert.equal((await fetch(base + route)).status, 200, route)
  assert.equal((await fetch(base + '/api/songbook/')).status, 403)
  const probe = "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync('/config/database.sqlite3',{readOnly:true}); console.log(JSON.stringify({entries:db.prepare('SELECT COUNT(*) AS n FROM catalogueEntries').get().n,users:db.prepare('SELECT COUNT(*) AS n FROM users').get().n,paths:db.prepare('SELECT COUNT(*) AS n FROM paths').get().n})); db.close();"
  const counts = JSON.parse(docker('exec', name, 'node', '--input-type=module', '-e', probe))
  assert.deepEqual(counts, { entries: 2, users: 0, paths: 0 })
  console.log('PASS: non-root Docker image imports isolated metadata, starts HTTP, serves all routes and guards the songbook API')
  console.log('PASS: persisted test metadata survives startup; no accounts or media paths are seeded')
} catch (error) {
  try { console.error(docker('logs', name)) } catch {}
  throw error
} finally {
  spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8' })
  spawnSync('docker', ['volume', 'rm', volume], { encoding: 'utf8' })
}
