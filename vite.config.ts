import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { reviewPlugin } from './tools/reviewPlugin'

// The commit the site was built from, recorded with each flag so reports can be matched to
// what the reader saw
function appVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), reviewPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
})
