// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { Fact } from '../services/facts'
import VerificationSummary from './VerificationSummary.vue'

// jsdom lacks this; Reka's popover calls it
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const facts = [
  {
    kind: 'node',
    record: { id: 'x', sources: [{ title: 'Winery history', url: 'https://example.com/history' }], verified: true, verifiedBy: 'person' },
    label: 'A winery in the hills.',
    flagLabel: 'X: A winery in the hills.',
  },
  {
    kind: 'edge',
    record: { id: 'y', sources: [{ title: 'A newsletter issue' }], verified: false },
    label: 'X founded by Y',
    flagLabel: 'X founded by Y',
    years: '1970',
  },
] as unknown as Fact[]

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the card’s verification', () => {
  it('counts the verified facts', () => {
    const wrapper = mount(VerificationSummary, { props: { facts, name: 'X' } })
    expect(wrapper.text()).toContain('1 of 2 verified')
    expect(wrapper.get('button').attributes('aria-label')).toBe('Verification: 1 of 2 facts verified')
  })

  it('says so when nothing is verified yet', () => {
    const none = facts.map((fact) => ({ ...fact, record: { ...fact.record, verified: false } })) as Fact[]
    expect(mount(VerificationSummary, { props: { facts: none, name: 'X' } }).text()).toContain('Not yet verified')
  })

  it('lists every fact with how it was checked and its sources', async () => {
    const wrapper = mount(VerificationSummary, { props: { facts, name: 'X' }, attachTo: document.body })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    const note = document.querySelector('.verification-note')!
    // Each fact's lines: what it says, how it was checked, its sources
    const items = [...note.querySelectorAll('li')].map((item) =>
      [...item.querySelectorAll('p')].map((line) => line.textContent?.replace(/\s+/g, ' ').trim()),
    )
    expect(items).toEqual([
      ['A winery in the hills.', 'Reviewed by Oregon Wine Graph', 'Winery history (opens in a new tab)'],
      ['X founded by Y (1970)', 'Not yet verified', 'A newsletter issue'],
    ])
    expect(note.querySelector('a')?.getAttribute('href')).toBe('https://example.com/history')
    wrapper.unmount()
  })
})
