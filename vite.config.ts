import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { reviewPlugin } from './tools/reviewPlugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), reviewPlugin()],
})
