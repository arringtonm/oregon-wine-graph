// The site's Worker. Cloudflare serves the built site (dist/) as static assets; only /api/*
// and /guides/* reach this code (run_worker_first in wrangler.toml).
import { handleAsk, type AskEnv } from './api/ask'
import { handleFlags, type FlagsEnv } from './api/flags'
import { error } from './_shared/http'
import { guideAsset } from './guides'

type Env = AskEnv & FlagsEnv & { ASSETS: Fetcher }

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url
    // A guide's page is a file (dist/guides/<id>.html); a record open in a guide is served
    // the record's own page, whose canonical link names /<id>, so search engines see one page
    // per record. The app reads the full address either way
    if (pathname.startsWith('/guides/')) {
      const asset = guideAsset(pathname)
      return env.ASSETS.fetch(asset === pathname ? request : new Request(new URL(asset, url), request))
    }
    const route = pathname === '/api/ask' ? 'ask' : pathname === '/api/flags' ? 'flags' : null
    if (!route) return error(404, 'Not found')
    if (request.method !== 'POST') return error(405, 'Use POST')
    return route === 'ask' ? handleAsk(request, env, ctx) : handleFlags(request, env)
  },
} satisfies ExportedHandler<Env>
