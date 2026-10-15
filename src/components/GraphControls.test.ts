// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useGraph } from '../composables/useGraph'
import GraphControls from './GraphControls.vue'
import SearchBox from './SearchBox.vue'

// jsdom has no matchMedia; `compact` stands in for a tablet-width screen
let compact = false
window.matchMedia = ((query: string) => ({
  matches: compact,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia

// jsdom lacks these; Reka's combobox and popovers call them
Element.prototype.scrollIntoView ??= () => {}
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const { state, init } = useGraph()

beforeAll(async () => {
  await init()
})

let toggle: HTMLButtonElement
beforeEach(() => {
  state.filtersOpen = false
  state.selectedId = null
  // The drawer returns focus to this button, which lives in the graph toolbar
  toggle = document.createElement('button')
  toggle.id = 'filters-toggle'
  document.body.append(toggle)
})
afterEach(() => {
  toggle.remove()
  compact = false
})

function mountControls() {
  return mount(GraphControls, { attachTo: document.body })
}

describe('search combobox', () => {
  const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')]
  const key = async (input: Element, name: string) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))
    await flushPromises()
  }

  it('lists matches as options and moves through them with the arrow keys', async () => {
    const wrapper = mount(SearchBox, { attachTo: document.body })
    const input = wrapper.get('input[role="combobox"]')
    expect(input.attributes('aria-expanded')).toBe('false')

    await input.setValue('eyrie')
    await flushPromises()
    expect(input.attributes('aria-expanded')).toBe('true')
    expect(options().length).toBeGreaterThan(1)
    expect(state.announcement).toMatch(/^\d+ results/)

    await key(input.element, 'ArrowDown')
    await key(input.element, 'ArrowDown')
    const highlighted = options().find((option) => option.hasAttribute('data-highlighted'))
    expect(highlighted).toBeTruthy()
    // The input points assistive tech at the highlighted option
    expect(input.attributes('aria-activedescendant')).toBe(highlighted!.id)
    wrapper.unmount()
  })

  it('picks the highlighted result with Enter and asks for focus on its details', async () => {
    const wrapper = mount(SearchBox, { attachTo: document.body })
    const input = wrapper.get('input[role="combobox"]')
    await input.setValue('David Lett')
    await flushPromises()
    await key(input.element, 'ArrowDown')
    const requests = state.focusDetailsRequest

    await key(input.element, 'Enter')
    expect(state.selectedId).toBe('david-lett')
    expect(state.focusDetailsRequest).toBe(requests + 1)
    expect((input.element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
  })

  it('clears the search with Escape', async () => {
    const wrapper = mount(SearchBox, { attachTo: document.body })
    const input = wrapper.get('input[role="combobox"]')
    await input.setValue('ponzi')
    await flushPromises()
    await key(input.element, 'Escape')
    expect((input.element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
  })
})

describe('collapsing the sidebar on desktop', () => {
  it('takes the hidden sidebar out of the tab order and the accessibility tree', async () => {
    const wrapper = mountControls()
    state.filtersCollapsed = true
    await flushPromises()
    const aside = wrapper.get('aside')
    expect(aside.classes()).toContain('controls--collapsed')
    expect(aside.attributes('inert')).toBeDefined()
    state.filtersCollapsed = false
    await flushPromises()
    expect(aside.attributes('inert')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('filter drawer', () => {
  it('is a plain labelled landmark on wide screens', async () => {
    const wrapper = mountControls()
    state.filtersOpen = true
    await flushPromises()
    const aside = wrapper.get('aside')
    expect(aside.attributes('aria-label')).toBe('Filters')
    expect(aside.attributes('role')).toBeUndefined()
    wrapper.unmount()
  })

  it('acts as a modal dialog on small screens, taking focus and giving it back on Escape', async () => {
    compact = true
    const wrapper = mountControls()
    toggle.focus()

    state.filtersOpen = true
    await flushPromises()
    const aside = wrapper.get('aside')
    expect(aside.attributes('role')).toBe('dialog')
    expect(aside.attributes('aria-modal')).toBe('true')
    // Focus moves into the drawer, to its first control
    expect(aside.element.contains(document.activeElement)).toBe(true)

    await aside.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(state.filtersOpen).toBe(false)
    expect(document.activeElement).toBe(toggle)
    expect(aside.attributes('role')).toBeUndefined()
    wrapper.unmount()
  })

  it('closes when a search result is picked, leaving focus off the toggle', async () => {
    compact = true
    const wrapper = mountControls()
    const search = mount(SearchBox, { attachTo: document.body })
    state.filtersOpen = true
    await flushPromises()
    const input = search.get('input[role="combobox"]')
    await input.setValue('Jason Lett')
    await flushPromises()
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await flushPromises()
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(state.filtersOpen).toBe(false)
    expect(state.selectedId).toBe('jason-lett')
    expect(document.activeElement).not.toBe(toggle)
    search.unmount()
    wrapper.unmount()
  })
})
