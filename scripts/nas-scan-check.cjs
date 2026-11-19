// Passed to node -e in the existing container, including older installed images.
const fs = require('node:fs')
let busy = false
for (const pid of fs.readdirSync('/proc').filter(p => /^\d+$/.test(p))) {
  try {
    const args = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\0')
    if (args.some(arg => /(^|[\\/])scannerWorker\.js$/.test(arg))) busy = true
  } catch (error) {
    if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
  }
}
console.log(busy ? 'busy' : 'idle')
