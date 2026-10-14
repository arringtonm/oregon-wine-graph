// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useGraph } from '../composables/useGraph'
import GraphControls from './GraphControls.vue'

// jsdom has no matchMedia; `compact` stands in for a tablet-width screen
let compact = false
window.matchMedia = ((query: string) => ({
  matches: compact,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia

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
  it('exposes results as a listbox and moves through them with the arrow keys', async () => {
    const wrapper = mountControls()
    const input = wrapper.get('input[role="combobox"]')
    expect(input.attributes('aria-expanded')).toBe('false')

    await input.setValue('eyrie')
    await flushPromises()
    expect(input.attributes('aria-expanded')).toBe('true')
    const options = wrapper.findAll('[role="option"]')
    expect(options.length).toBeGreaterThan(1)
    expect(state.announcement).toMatch(/^\d+ results/)

    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(input.attributes('aria-activedescendant')).toBe('search-option-0')
    expect(options[0].attributes('aria-selected')).toBe('true')
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(input.attributes('aria-activedescendant')).toBe('search-option-1')
    await input.trigger('keydown', { key: 'ArrowUp' })
    await input.trigger('keydown', { key: 'ArrowUp' })
    // Wraps from the first result to the last
    expect(input.attributes('aria-activedescendant')).toBe(`search-option-${options.length - 1}`)
    wrapper.unmount()
  })

  it('picks the highlighted result with Enter and asks for focus on its details', async () => {
    const wrapper = mountControls()
    const input = wrapper.get('input[role="combobox"]')
    await input.setValue('David Lett')
    await input.trigger('keydown', { key: 'ArrowDown' })
    const requests = state.focusDetailsRequest

    await input.trigger('keydown', { key: 'Enter' })
    expect(state.selectedId).toBe('david-lett')
    expect(state.focusDetailsRequest).toBe(requests + 1)
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(input.attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('clears the search with Escape', async () => {
    const wrapper = mountControls()
    const input = wrapper.get('input[role="combobox"]')
    await input.setValue('ponzi')
    await input.trigger('keydown', { key: 'Escape' })
    expect((input.element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
  })
})

describe('filter drawer', () => {
  it('is a plain labelled landmark on wide screens', async () => {
    const wrapper = mountControls()
    state.filtersOpen = true
    await flushPromises()
    const aside = wrapper.get('aside')
    expect(aside.attributes('aria-label')).toBe('Search and filters')
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
    expect(document.activeElement?.id).toBe('search')

    await aside.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(state.filtersOpen).toBe(false)
    expect(document.activeElement).toBe(toggle)
    expect(aside.attributes('role')).toBeUndefined()
    wrapper.unmount()
  })

  it('leaves focus on the chosen node, not the toggle, when a search result closes it', async () => {
    compact = true
    const wrapper = mountControls()
    state.filtersOpen = true
    await flushPromises()
    const input = wrapper.get('input[role="combobox"]')
    await input.setValue('Jason Lett')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(state.filtersOpen).toBe(false)
    expect(document.activeElement).not.toBe(toggle)
    wrapper.unmount()
  })
})
