/// <reference types="vite/client" />

// Set in vite.config.ts: the commit the site was built from
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  // A deployed endpoint for "Ask", which holds the decision model's key server side
  readonly VITE_ASK_URL?: string
}
