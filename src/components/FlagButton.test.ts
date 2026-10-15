// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Sending is stubbed: this is about the form, not the flag stores
vi.mock('../services/flags', async (original) => ({
  ...(await original<typeof import('../services/flags')>()),
  submitFlag: vi.fn(async () => {}),
}))
vi.mock('../services/turnstile', () => ({ turnstileSiteKey: '', renderTurnstile: vi.fn() }))

import FlagButton from './FlagButton.vue'

// jsdom lacks these; Reka's popover calls them
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('flagging a fact', () => {
  it('thanks the reader, then closes by itself after ten seconds', async () => {
    vi.useFakeTimers()
    const wrapper = mount(FlagButton, {
      props: { kind: 'node', id: 'the-eyrie-vineyards', label: 'The Eyrie Vineyards' },
      attachTo: document.body,
    })
    await wrapper.get('button').trigger('click')
    await flushPromises()

    const reason = document.querySelector<HTMLButtonElement>('.flag-form__radio')!
    reason.click()
    await flushPromises()
    document.querySelector('.flag-form form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    expect(document.querySelector('.flag-form')?.textContent).toMatch(/Thanks, flagged for review/)

    vi.advanceTimersByTime(9_000)
    await flushPromises()
    expect(document.querySelector('.flag-form')).not.toBeNull()

    vi.advanceTimersByTime(1_000)
    await flushPromises()
    expect(document.querySelector('.flag-form')).toBeNull()
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })
})
