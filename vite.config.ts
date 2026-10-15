import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { reviewPlugin } from './tools/reviewPlugin'

// The commit the site was built from, shown at the foot of the filters and recorded with
// each flag so reports can be matched to what the reader saw. Cloudflare's builds also name
// it in WORKERS_CI_COMMIT_SHA, in case git isn't available there
function appVersion(): string {
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
    __APP_VERSION__: JSON.stringify(appVersion()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
})
