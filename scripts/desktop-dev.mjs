/**
 * `npm run dev:desktop`: starts Vite and opens the desktop app pointed at it, so changes to the
 * app show up live. Changes to electron/ need a restart (close the window and run it again).
 */
import { spawn, spawnSync } from 'node:child_process'
import electron from 'electron'
import { createServer } from 'vite'

const server = await createServer({ mode: 'desktop', server: { host: '127.0.0.1' } })
await server.listen()
const url = server.resolvedUrls.local[0]

const built = spawnSync(process.execPath, ['scripts/build-electron.mjs', '--dev'], { stdio: 'inherit' })
if (built.status !== 0) process.exit(built.status ?? 1)

// Editors like VS Code set ELECTRON_RUN_AS_NODE for their own tools, which would start Electron
// as plain Node with no window.
const env = { ...process.env, VITE_DEV_SERVER_URL: url }
delete env.ELECTRON_RUN_AS_NODE
const app = spawn(electron, ['.'], { stdio: 'inherit', env })
app.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})
