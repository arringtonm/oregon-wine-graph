// The site's Worker. Cloudflare serves the built site (dist/) as static assets; only /api/*
// reaches this code (run_worker_first in wrangler.toml).
import { handleAsk, type AskEnv } from './api/ask'
import { handleFlags, type FlagsEnv } from './api/flags'
import { error } from './_shared/http'

type Env = AskEnv & FlagsEnv

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url)
    const route = pathname === '/api/ask' ? 'ask' : pathname === '/api/flags' ? 'flags' : null
    if (!route) return error(404, 'Not found')
    if (request.method !== 'POST') return error(405, 'Use POST')
    return route === 'ask' ? handleAsk(request, env, ctx) : handleFlags(request, env)
  },
} satisfies ExportedHandler<Env>
