import { EDGE_CATEGORY_LABELS, NODE_TYPE_LABELS, type EdgeCategory, type NodeType } from '../data/schema'
import { HIDDEN_TYPES } from './format'

// The filters that differ from the opening ones, in readers' words, one to a line for the
// count's note ("Why only some show"): "People hidden", "Fruit sourcing connections hidden",
// "In Dundee Hills", "Verified records only". "Show all records" and the AVA regions layer
// add records rather than hide them, so they aren't listed.
export interface FilterState {
  nodeTypes: Partial<Record<NodeType, boolean>>
  categories: Record<EdgeCategory, boolean>
  oregonOnly: boolean
  verifiedOnly: boolean
  avas: string[]
  focus: string | null
}

export function describeFilters(
  filters: FilterState,
  names: { ava: (id: string) => string; focus: (id: string) => string | undefined },
): string[] {
  const phrases: string[] = []
  const hiddenTypes = (Object.entries(filters.nodeTypes) as [NodeType, boolean][])
    .filter(([type, on]) => !on && !HIDDEN_TYPES.has(type))
    .map(([type]) => NODE_TYPE_LABELS[type])
  if (hiddenTypes.length > 0) phrases.push(`${joinWords(lowerAfterFirst(hiddenTypes))} hidden`)
  const hiddenCategories = (Object.entries(filters.categories) as [EdgeCategory, boolean][])
    .filter(([category, on]) => !on && category !== 'geography')
    .map(([category]) => EDGE_CATEGORY_LABELS[category])
  if (hiddenCategories.length > 0) {
    phrases.push(`${joinWords(lowerAfterFirst(hiddenCategories))} connections hidden`)
  }
  if (filters.avas.length > 0) phrases.push(`In ${joinWords(filters.avas.map(names.ava))}`)
  if (filters.focus) phrases.push(names.focus(filters.focus) ?? 'A guide’s selection')
  if (filters.oregonOnly) phrases.push('Oregon only')
  if (filters.verifiedOnly) phrases.push('Verified records only')
  return phrases
}

// "A", "A and B", "A, B and C"
export function joinWords(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

// Type and connection names are capitalised labels ("Organizations"); within a phrase only
// the first keeps its capital: "People and organizations hidden"
function lowerAfterFirst(labels: string[]): string[] {
  return labels.map((label, index) => (index === 0 ? label : label.toLowerCase()))
}
