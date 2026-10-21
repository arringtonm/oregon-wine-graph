// The connected core: what the graph opens on. Records with fewer than two connections are
// dropped, then any left with fewer than two, until none are (the graph's 2-core). Most of
// what goes is unconnected dots and one-connection leaves, which crowded the opening view
// without adding to its shape: on the full data the core keeps about 59% of the records and
// 82% of the connections. A dropped record comes back beside its neighbour when that
// neighbour, or the record itself, is selected.

export interface Link {
  source: string
  target: string
}

export function twoCore(ids: Iterable<string>, links: Link[]): Set<string> {
  const neighbours = new Map<string, string[]>()
  for (const id of ids) neighbours.set(id, [])
  for (const { source, target } of links) {
    if (source === target || !neighbours.has(source) || !neighbours.has(target)) continue
    neighbours.get(source)!.push(target)
    neighbours.get(target)!.push(source)
  }
  const degree = new Map([...neighbours].map(([id, list]) => [id, list.length]))
  const kept = new Set(neighbours.keys())
  const queue = [...kept].filter((id) => degree.get(id)! < 2)
  while (queue.length > 0) {
    const id = queue.pop()!
    if (!kept.delete(id)) continue
    for (const other of neighbours.get(id)!) {
      if (!kept.has(other)) continue
      const left = degree.get(other)! - 1
      degree.set(other, left)
      if (left < 2) queue.push(other)
    }
  }
  return kept
}

// The core, plus the selected record and everything it connects to, so a selection never
// lands on a record that isn't drawn
export function coreWithSelection(core: Set<string>, links: Link[], selected: string | null): Set<string> {
  if (!selected) return core
  const shown = new Set(core)
  shown.add(selected)
  for (const { source, target } of links) {
    if (source === selected) shown.add(target)
    if (target === selected) shown.add(source)
  }
  return shown
}
