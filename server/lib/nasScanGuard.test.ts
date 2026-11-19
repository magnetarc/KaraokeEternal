import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const script = readFileSync(new URL('../../scripts/nas-scan-check.cjs', import.meta.url), 'utf8')
function check (processes: Record<string, string | Error>) {
  let output = ''
  const fs = {
    readdirSync: () => ['self', 'net', ...Object.keys(processes)],
    readFileSync: (file: string) => { const value = processes[file.split('/')[2]]; if (value instanceof Error) throw value; return value },
  }
  runInNewContext(script, { require: () => fs, console: { log: (value: string) => { output = value } } })
  return output
}
describe('NAS update scan guard', () => {
  it('recognizes the real scanner worker argument', () => {
    expect(check({ '1': 'node\0/app/build/server/main.js\0', '20': 'node\0/app/build/server/scannerWorker.js\0--pathIds=all\0' })).toBe('busy')
  })
  it('does not mistake a watcher or the check itself for an active scan', () => {
    expect(check({ '1': 'node\0/app/build/server/main.js\0', '2': 'node\0/app/build/server/watcherWorker.js\0', '3': "node\0-e\0const text='/app/build/server/scannerWorker.js';\0" })).toBe('idle')
  })
  it('ignores exited processes but refuses to call an unreadable process list idle', () => {
    expect(check({ '2': Object.assign(new Error('gone'), { code: 'ENOENT' }) })).toBe('idle')
    expect(() => check({ '2': Object.assign(new Error('denied'), { code: 'EACCES' }) })).toThrow('denied')
  })
})
