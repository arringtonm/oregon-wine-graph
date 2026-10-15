// Cloudflare Turnstile: a free, privacy-friendly check that a request comes from a person.
// The token comes from the widget on the page; the secret stays on the server. Returns
// Cloudflare's error codes when the check fails (for example "invalid-input-secret" when the
// secret doesn't match the widget, "timeout-or-duplicate" for a used or expired token), or
// our own when the token was issued for another action or site.
const HOSTNAMES = new Set(['oregonwine.app', 'www.oregonwine.app'])

export async function checkTurnstile(secret: string, token: unknown, ip: string | null, action: string): Promise<string[]> {
  if (typeof token !== 'string' || !token || token.length > 2048) return ['missing-input-response']
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  let response: Response
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return ['siteverify-unreachable']
  }
  // Refusals can come with a 4xx status; the reasons are in the body either way
  const result = (await response.json().catch(() => ({}))) as {
    success?: boolean
    action?: string
    hostname?: string
    'error-codes'?: string[]
  }
  if (!result.success) return result['error-codes']?.length ? result['error-codes'] : [`siteverify-http-${response.status}`]
  if (result.action !== action) return ['wrong-action']
  if (!result.hostname || !HOSTNAMES.has(result.hostname)) return ['wrong-hostname']
  return []
}
