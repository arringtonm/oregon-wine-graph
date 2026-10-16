// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraph } from '../composables/useGraph'
import GraphList from './GraphList.vue'

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia
Element.prototype.scrollIntoView ??= () => {}

const { state, init, resetFilters, degree } = useGraph()

beforeAll(async () => {
  await init()
})
beforeEach(() => {
  resetFilters()
  state.listView = false
  localStorage.removeItem('oregon-wine-graph:list-sort')
})

const jumpLabels = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('.graph-list__jump-to').map((button) => button.text().replace(/\s+/g, ' '))
const names = (wrapper: ReturnType<typeof mount>, type: string) =>
  wrapper.findAll(`section[aria-labelledby="graph-list-${type}"] li button`).map((button) => button.text())

describe('the list view', () => {
  it('offers a jump to each group showing, with its count, following the filter', async () => {
    const wrapper = mount(GraphList, { attachTo: document.body })
    expect(jumpLabels(wrapper).map((label) => label.split(' ')[0])).toEqual(['People', 'Wineries', 'Vineyards', 'Organizations'])
    state.nodeTypes.vineyard = false
    await flushPromises()
    expect(jumpLabels(wrapper).some((label) => label.startsWith('Vineyards'))).toBe(false)
    await wrapper.get('#graph-list-filter').setValue('Eyrie')
    await flushPromises()
    for (const label of jumpLabels(wrapper)) expect(Number(label.match(/\((\d+)\)/)?.[1])).toBeLessThan(20)
    wrapper.unmount()
  })

  it('sorts by name, or by connections with ties by name, and remembers the choice', async () => {
    const wrapper = mount(GraphList, { attachTo: document.body })
    const people = names(wrapper, 'person')
    expect(people).toEqual([...people].sort((a, b) => a.localeCompare(b)))
    await wrapper.get('input[value="connections"]').setValue(true)
    await flushPromises()
    const byId = new Map(state.graph!.nodes.map((node) => [node.name, node.id]))
    const counts = names(wrapper, 'person').map((name) => degree.value.get(byId.get(name)!) ?? 0)
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1])
    expect(localStorage.getItem('oregon-wine-graph:list-sort')).toBe('connections')
    wrapper.unmount()
  })

  it('jumps to a group’s heading and focuses it, leaving the address alone', async () => {
    const wrapper = mount(GraphList, { attachTo: document.body })
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    const before = window.location.href
    await wrapper.findAll('.graph-list__jump-to')[2].trigger('click')
    expect(scroll).toHaveBeenCalled()
    expect(document.activeElement?.id).toBe('graph-list-vineyard')
    expect(window.location.href).toBe(before)
    scroll.mockRestore()
    wrapper.unmount()
  })

  it('is remembered, so a reload comes back to the list', async () => {
    state.listView = true
    await flushPromises()
    expect(localStorage.getItem('oregon-wine-graph:list-view')).toBe('true')
    state.listView = false
    await flushPromises()
    expect(localStorage.getItem('oregon-wine-graph:list-view')).toBe('false')
  })
})
