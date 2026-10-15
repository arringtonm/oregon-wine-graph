import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { reviewPlugin } from './tools/reviewPlugin'
import { siteVersion } from './tools/siteVersion'
// Imported rather than read, so Vite counts it as part of this config: the dev server
// restarts when it changes, and picks up a new version from `npm run release`
import packageJson from './package.json'

// The public version, "v1.00", from package.json (bumped per release: docs/DEVELOPMENT.md)
const packageVersion = packageJson.version

// The commit the site was built from: in the version line's hover title, and recorded with
// each flag so reports can be matched to exactly what the reader saw. Cloudflare's builds
// also name it in WORKERS_CI_COMMIT_SHA, in case git isn't available there
function buildCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 7) ?? 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), reviewPlugin()],
  define: {
    __SITE_VERSION__: JSON.stringify(siteVersion(packageVersion)),
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
})
