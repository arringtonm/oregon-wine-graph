// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Fact } from '../services/facts'
import { submitFlag } from '../services/flags'

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

const source = [{ title: 'A source', url: 'https://example.com/' }]
const facts = [
  {
    kind: 'node',
    record: { id: 'the-eyrie-vineyards', sources: source, verified: true },
    label: 'Pioneering Pinot noir producer.',
    flagLabel: 'The Eyrie Vineyards: Pioneering Pinot noir producer.',
  },
  {
    kind: 'edge',
    record: { id: 'david-lett--founded--the-eyrie-vineyards', sources: source, verified: false },
    label: 'The Eyrie Vineyards founded by David Lett',
    flagLabel: 'The Eyrie Vineyards founded by David Lett',
  },
] as unknown as Fact[]

const form = () => document.querySelector('.flag-form')
const submit = async () => {
  document.querySelector('.flag-form form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  await flushPromises()
}
// The radios in order: the facts first, then the reasons
const radio = (index: number) => document.querySelectorAll<HTMLButtonElement>('.flag-form__radio')[index]

async function openForm(list: Fact[] = facts) {
  const wrapper = mount(FlagButton, { props: { facts: list }, attachTo: document.body })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  return wrapper
}

afterEach(() => {
  vi.useRealTimers()
  vi.mocked(submitFlag).mockClear()
  document.body.innerHTML = ''
})

describe('flagging a fact', () => {
  it('asks which of the card’s facts is wrong, and files the flag under that fact', async () => {
    const wrapper = await openForm()
    expect(form()?.textContent).toContain('The Eyrie Vineyards founded by David Lett')

    radio(facts.length).click() // a reason, but no fact yet
    await flushPromises()
    await submit()
    expect(form()?.textContent).toMatch(/Choose the fact to flag/)
    expect(submitFlag).not.toHaveBeenCalled()

    radio(1).click()
    await flushPromises()
    await submit()
    expect(submitFlag).toHaveBeenCalledWith(
      expect.objectContaining({
        recordKind: 'edge',
        recordId: 'david-lett--founded--the-eyrie-vineyards',
        recordLabel: 'The Eyrie Vineyards founded by David Lett',
      }),
      undefined,
    )
    wrapper.unmount()
  })

  it('needs no choosing when the card has one fact', async () => {
    const wrapper = await openForm(facts.slice(0, 1))
    radio(1).click() // the first reason
    await flushPromises()
    await submit()
    expect(submitFlag).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'the-eyrie-vineyards' }), undefined)
    wrapper.unmount()
  })

  it('thanks the reader, then closes by itself after ten seconds', async () => {
    vi.useFakeTimers()
    const wrapper = await openForm(facts.slice(0, 1))
    radio(1).click()
    await flushPromises()
    await submit()
    expect(form()?.textContent).toMatch(/Thanks, flagged for review/)

    vi.advanceTimersByTime(9_000)
    await flushPromises()
    expect(form()).not.toBeNull()

    vi.advanceTimersByTime(1_000)
    await flushPromises()
    expect(form()).toBeNull()
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })
})
