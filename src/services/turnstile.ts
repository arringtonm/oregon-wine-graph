// Cloudflare Turnstile in the browser: loads the script once, on first use, and renders the
// widget in "interaction only" mode, so most readers never see it. Only where the site has a
// site key (VITE_TURNSTILE_SITE_KEY), and never on the dev server.
interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export const turnstileSiteKey = import.meta.env.DEV ? undefined : import.meta.env.VITE_TURNSTILE_SITE_KEY

let loading: Promise<TurnstileApi> | undefined

function load(): Promise<TurnstileApi> {
  loading ??= new Promise((done, fail) => {
    if (window.turnstile) return done(window.turnstile)
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => (window.turnstile ? done(window.turnstile) : fail(new Error('Turnstile did not load')))
    script.onerror = () => fail(new Error('Turnstile did not load'))
    document.head.append(script)
  })
  return loading
}

// Renders the check into `element`; `onToken` receives a token once the reader passes.
// Returns a function that removes the widget
export async function renderTurnstile(element: HTMLElement, onToken: (token: string) => void): Promise<() => void> {
  if (!turnstileSiteKey) return () => {}
  const api = await load()
  const id = api.render(element, {
    sitekey: turnstileSiteKey,
    appearance: 'interaction-only',
    callback: onToken,
    'expired-callback': () => onToken(''),
  })
  return () => api.remove(id)
}
