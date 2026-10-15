// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useGraph } from '../composables/useGraph'
import NodePreview from './NodePreview.vue'

// jsdom lacks this; Reka's hover card calls it
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const { init, nodeById } = useGraph()
beforeAll(async () => {
  await init()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function mountPreview() {
  const node = nodeById.value.get('david-lett')!
  return mount(NodePreview, {
    props: { node },
    slots: { default: '<button type="button">David Lett</button>' },
    attachTo: document.body,
  })
}

const card = () => document.querySelector('.node-preview')

describe('previewing a linked record', () => {
  it('shows a card about the record, its icon beside its name, when the mouse rests on its link', async () => {
    vi.useFakeTimers()
    const wrapper = mountPreview()
    await wrapper.get('button').trigger('pointerenter', { pointerType: 'mouse' })
    vi.advanceTimersByTime(400)
    await flushPromises()
    const text = card()?.textContent ?? ''
    expect(text).toContain('David Lett')
    expect(card()?.querySelector('.node-preview__name .node-glyph--person')).not.toBeNull()
    expect(text).toMatch(/\d+ connections?/)
    expect(card()?.getAttribute('aria-hidden')).toBe('true')
    wrapper.unmount()
  })

  it('shows nothing for a touch, which goes straight to the record', async () => {
    vi.useFakeTimers()
    const wrapper = mountPreview()
    await wrapper.get('button').trigger('pointerenter', { pointerType: 'touch' })
    vi.advanceTimersByTime(400)
    await flushPromises()
    expect(card()).toBeNull()
    wrapper.unmount()
  })
})
