// Disposable CI only: export from the modern store and import into Docker 24.
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const name = 'ke-docker24-' + process.pid
const directory = mkdtempSync(path.join(os.tmpdir(), name))
const archive = path.join(directory, 'image.tar')
function command (bin, args, options = {}) {
  const result = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...options })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  return result.stdout.trim()
}
const docker = (...args) => command('docker', args)
try {
  docker('tag', process.argv[2] ?? 'karaoke-modern:ci', 'karaoke-modern:local')
  const exported = docker('image', 'inspect', '--format', '{{.Id}}', 'karaoke-modern:local')
  docker('save', '-o', archive, 'karaoke-modern:local')
  const config = command('python3', ['scripts/image-config-id.py', archive, '--arch', 'amd64'])
  docker('run', '--privileged', '--rm', '-d', '--name', name, '-e', 'DOCKER_TLS_CERTDIR=', '-p', '127.0.0.1::2375', 'docker:24.0.2-dind', '--storage-driver=vfs', '--iptables=false', '--bridge=none')
  const endpoint = 'tcp://' + docker('port', name, '2375/tcp').split('\n')[0]
  let version = ''
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = spawnSync('docker', ['--host', endpoint, 'version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' })
    if (result.status === 0) { version = result.stdout.trim(); break }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  assert.equal(version, '24.0.2')
  docker('--host', endpoint, 'load', '-i', archive)
  const observed = docker('--host', endpoint, 'image', 'inspect', '--format', '{{.Id}}', 'karaoke-modern:local')
  assert.equal(observed, config)
  command('sh', ['-c', '. ./scripts/nas-image-identity.sh; verify_image_identity "$@"', 'check', exported, config, observed])
  console.log(`PASS: Docker24 imports modern export; exported=${exported}, classic=${observed}`)
  console.log(command(process.execPath, ['scripts/docker-versions-smoke.mjs', 'karaoke-modern:local'], { env: { ...process.env, DOCKER_HOST: endpoint } }))
} catch (error) {
  const logs = spawnSync('docker', ['logs', '--tail', '60', name], { encoding: 'utf8' })
  console.error(logs.stdout + logs.stderr)
  throw error
} finally {
  spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8' })
}
