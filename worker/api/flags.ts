// POST /api/flags (routed in worker/index.ts): a reader flags a fact for review. Checked with the same rules as the dev
// server (src/services/flagRecord.ts), confirmed as human by Turnstile when a secret is set,
// and stored in D1. Nothing personal is kept: not even the IP address, which only Turnstile sees.
import { parseFlagRecord } from '../../src/services/flagRecord'
import { error, json, readJson } from '../_shared/http'
import { passesTurnstile } from '../_shared/turnstile'

export interface FlagsEnv {
  FLAGS_DB: D1Database
  TURNSTILE_SECRET?: string
}

export async function handleFlags(request: Request, env: FlagsEnv): Promise<Response> {
  const body = await readJson(request)
  if (!body) return error(400, 'Send the flag as JSON.')

  if (env.TURNSTILE_SECRET) {
    const human = await passesTurnstile(env.TURNSTILE_SECRET, body.turnstileToken, request.headers.get('cf-connecting-ip'))
    if (!human) return error(403, "Couldn't confirm you're a person; please try again.")
  }

  let flag
  try {
    flag = parseFlagRecord(body, crypto.randomUUID())
  } catch (problem) {
    return error(400, problem instanceof Error ? problem.message : 'Bad flag')
  }

  await env.FLAGS_DB.prepare(
    `INSERT INTO flags (id, record_kind, record_id, record_label, reason, note, source_url, page_url, app_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      flag.id,
      flag.recordKind,
      flag.recordId,
      flag.recordLabel,
      flag.reason,
      flag.note ?? null,
      flag.sourceUrl ?? null,
      flag.pageUrl,
      flag.appVersion,
      flag.createdAt,
    )
    .run()

  return json({ id: flag.id }, { status: 201 })
}
