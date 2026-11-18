import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const run = args => {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } })
  if (result.status !== 0) process.exit(result.status || 1)
}
run(['node_modules/typescript/bin/tsc', '-p', 'config/tsconfig.server.json'])
mkdirSync(new URL('../build/server/lib/', import.meta.url), { recursive: true })
cpSync(new URL('../server/lib/schemas/', import.meta.url), new URL('../build/server/lib/schemas/', import.meta.url), { recursive: true })
run(['node_modules/webpack-cli/bin/cli.js', '--config', 'config/webpack.config.js'])
