// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia

const { default: ControlsGuide } = await import('./ControlsGuide.vue')

const press = (key: string, target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

describe('controls guide', () => {
  it('opens and closes with ?, and says so to assistive tech', async () => {
    const wrapper = mount(ControlsGuide, { attachTo: document.body })
    const toggle = wrapper.get('button')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    press('?')
    await flushPromises()
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#controls-guide').isVisible()).toBe(true)
    press('?')
    await flushPromises()
    expect(toggle.attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('ignores ? typed into a text field', async () => {
    const wrapper = mount(ControlsGuide, { attachTo: document.body })
    const input = document.createElement('input')
    document.body.append(input)
    press('?', input)
    await flushPromises()
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
    input.remove()
    wrapper.unmount()
  })

  it('takes Escape while open, so it closes before the selection does', async () => {
    const wrapper = mount(ControlsGuide, { attachTo: document.body })
    press('?')
    await flushPromises()
    const escape = press('Escape')
    await flushPromises()
    expect(escape.defaultPrevented).toBe(true)
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
    // Closed, it leaves Escape alone for the app
    expect(press('Escape').defaultPrevented).toBe(false)
    wrapper.unmount()
  })

  it('names keys for a Mac or a PC, not both', () => {
    const wrapper = mount(ControlsGuide)
    const text = wrapper.text()
    expect(text.includes('⌘ + Scroll') !== text.includes('Ctrl + Scroll')).toBe(true)
    wrapper.unmount()
  })
})
