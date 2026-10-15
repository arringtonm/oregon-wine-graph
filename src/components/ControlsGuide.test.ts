// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { TooltipProvider } from 'reka-ui'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia

// jsdom lacks this; Reka's tooltip and popover call it
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const { default: ControlsGuide } = await import('./ControlsGuide.vue')

// Inside the tooltip provider the app wraps everything in (App.vue)
const Guide = defineComponent(() => () => h(TooltipProvider, null, () => h(ControlsGuide)))
const mountGuide = () => mount(Guide, { attachTo: document.body })

const press = (key: string, target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}
const panel = () => document.querySelector('[role="dialog"]')

describe('controls guide', () => {
  it('opens and closes with ?, and says so to assistive tech', async () => {
    const wrapper = mountGuide()
    const toggle = wrapper.get('button')
    // Shows just "?", but is named for what it opens
    expect(toggle.attributes('aria-label')).toBe('Controls')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    press('?')
    await flushPromises()
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(panel()?.textContent).toContain('Move around')
    press('?')
    await flushPromises()
    expect(toggle.attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('opens and closes with each click of its button', async () => {
    const wrapper = mountGuide()
    const toggle = wrapper.get('button')
    await toggle.trigger('click')
    await flushPromises()
    expect(toggle.attributes('aria-expanded')).toBe('true')
    await toggle.trigger('click')
    await flushPromises()
    expect(toggle.attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('ignores ? typed into a text field', async () => {
    const wrapper = mountGuide()
    const input = document.createElement('input')
    document.body.append(input)
    press('?', input)
    await flushPromises()
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
    input.remove()
    wrapper.unmount()
  })

  it('closes on Escape', async () => {
    const wrapper = mountGuide()
    press('?')
    await flushPromises()
    press('Escape', panel() ?? document.body)
    await flushPromises()
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('names keys for a Mac or a PC, not both', async () => {
    const wrapper = mountGuide()
    press('?')
    await flushPromises()
    const text = panel()?.textContent ?? ''
    expect(text.includes('⌘ + Scroll') !== text.includes('Ctrl + Scroll')).toBe(true)
    wrapper.unmount()
  })
})
