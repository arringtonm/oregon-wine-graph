/// <reference types="vite/client" />

// Set in vite.config.ts: the public version ("v1.00") and the commit the site was built from
declare const __SITE_VERSION__: string
declare const __BUILD_COMMIT__: string
// Set in vite.config.ts: when the site was built, as an ISO timestamp
declare const __BUILD_DATE__: string

interface ImportMetaEnv {
  // A deployed endpoint for "Ask", which holds the decision model's key server side
  readonly VITE_ASK_URL?: string
  // Where the published site sends flags (functions/api/flags.ts)
  readonly VITE_FLAGS_URL?: string
  // Cloudflare Turnstile site key (public); its secret is a server-side Pages secret
  readonly VITE_TURNSTILE_SITE_KEY?: string
}
