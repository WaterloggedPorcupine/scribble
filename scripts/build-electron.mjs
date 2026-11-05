/**
 * Bundles the desktop shell (electron/) into dist-electron/. The app itself is built by Vite;
 * this is only the small Node side. Pass --dev for readable output with source maps.
 */
import { build } from 'esbuild'
import { loadEnv } from 'vite'

const dev = process.argv.includes('--dev')
// Same .env files Vite reads, so the desktop Google keys sit next to the web ones in .env.local.
const env = loadEnv('desktop', process.cwd(), '')

await build({
  entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: dev ? 'inline' : false,
  minify: !dev,
  define: {
    __GOOGLE_DESKTOP_CLIENT_ID__: JSON.stringify(env.VITE_GOOGLE_DESKTOP_CLIENT_ID ?? ''),
    __GOOGLE_DESKTOP_CLIENT_SECRET__: JSON.stringify(env.GOOGLE_DESKTOP_CLIENT_SECRET ?? ''),
  },
  logLevel: 'warning',
})
