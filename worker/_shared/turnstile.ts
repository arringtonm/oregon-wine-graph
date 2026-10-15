// Cloudflare Turnstile: a free, privacy-friendly check that a request comes from a person.
// The token comes from the widget on the page; the secret stays on the server.
export async function passesTurnstile(secret: string, token: unknown, ip: string | null): Promise<boolean> {
  if (typeof token !== 'string' || !token) return false
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  if (!response.ok) return false
  return ((await response.json()) as { success?: boolean }).success === true
}
