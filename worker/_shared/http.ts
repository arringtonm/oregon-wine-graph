export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
  })
}

export function error(status: number, message: string): Response {
  return json({ error: message }, { status })
}

// A JSON body, refusing other content types so other sites can't post here without a preflight
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return null
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}
