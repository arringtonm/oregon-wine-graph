// POST /api/ask (routed in worker/index.ts): a question about the graph, read by Jev and answered from the records,
// exactly as on the dev server (tools/jev/askGraph.ts). The Jev key is a Worker secret and
// never reaches the browser. Identical questions are answered from cache for a day.
import { askGraph, type AskOverride } from '../../tools/jev/askGraph'
import { jevModel } from '../../tools/jev/model'
import { graph } from '../_shared/graph'
import { error, json, readJson } from '../_shared/http'

export interface AskEnv {
  JEV_API_KEY?: string
}

const QUESTION_LIMIT = 300

async function cacheKey(request: Request, body: unknown): Promise<Request> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)))
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return new Request(new URL(`/api/ask/cached/${hash}`, request.url))
}

export async function handleAsk(request: Request, env: AskEnv, ctx: ExecutionContext): Promise<Response> {
  if (!env.JEV_API_KEY) return error(503, 'Questions are not available right now.')
  const body = await readJson(request)
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question || question.length > QUESTION_LIMIT) return error(400, 'Ask a question of up to 300 characters.')
  const override = (body?.override ?? undefined) as AskOverride | undefined

  const key = await cacheKey(request, { question: question.toLowerCase(), override })
  const cache = caches.default
  const cached = await cache.match(key)
  if (cached) return cached

  try {
    const answer = await askGraph(question, graph, jevModel(env.JEV_API_KEY), override)
    const response = json(answer, { headers: { 'cache-control': 'public, max-age=86400' } })
    ctx.waitUntil(cache.put(key, response.clone()))
    return response
  } catch {
    return error(502, 'The question could not be answered right now; please try again.')
  }
}
