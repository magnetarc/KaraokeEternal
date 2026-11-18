import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import net from 'node:net'
const root = fileURLToPath(new URL('../', import.meta.url))
const data = path.join(root, '.test-instance')
mkdirSync(data, { recursive: true })
if (!existsSync(path.join(root, 'build/client/index.html'))) throw new Error('Build first: npm run build:preview')
const database = path.join(data, 'database.sqlite3')
if (!existsSync(database)) throw new Error('Create the sample test database first: npm run test:seed')
const db = new DatabaseSync(database, { readOnly: true })
try {
  const marker = db.prepare("SELECT data FROM prefs WHERE key='modernTestInstance'").get()
  if (!marker || marker.data !== 'true') throw new Error('Refusing a database without the isolated test marker')
  const paths = db.prepare('SELECT path FROM paths').all()
  if (paths.some(item => !path.resolve(item.path).startsWith(path.resolve(data) + path.sep))) throw new Error('Test media must stay inside .test-instance')
  if (db.prepare('SELECT COUNT(*) AS n FROM providers').get().n !== 0) throw new Error('External providers are disabled in this test instance')
} finally { db.close() }
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('KES_') && !['PUID', 'PGID'].includes(key)))
// Refuse a second launch before writing the PID file or starting the server.
await new Promise((resolve, reject) => {
  const probe = net.createServer()
  probe.once('error', () => reject(new Error('Port 8091 is already in use; use the existing preview or stop it first')))
  probe.listen(8091, '127.0.0.1', () => probe.close(resolve))
})
console.log('Isolated preview: http://127.0.0.1:8091/library')
console.log('Demo accounts are listed in MODERN-BROWSER.md. Synthetic media only.')
const child = spawn(process.execPath, [path.join(root, 'build/server/main.js')], {
  cwd: root, stdio: 'inherit',
  env: { ...environment, NODE_ENV: 'production', KES_PATH_DATA: data, KES_PORT: '8091', KES_HOST: '127.0.0.1', KES_SERVER_LOG_LEVEL: '0', KES_SERVER_CONSOLE_LEVEL: '3', KES_CONSOLE_COLORS: 'false' },
})
const pidFile = path.join(data, 'preview-server.pid')
if (child.pid) writeFileSync(pidFile, String(child.pid))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => {
  if (existsSync(pidFile) && readFileSync(pidFile, 'utf8') === String(child.pid)) unlinkSync(pidFile)
  process.exit(code || 0)
})
