// Cuts a source page down to the parts that mention the parties of a record, so the
// model reads a few paragraphs instead of a whole page.

const GENERIC_WORDS = /\b(the|winery|wines?|vineyards?|cellars?|estate|family|company|co|ava|department|of|and)\b/gi
const WINDOW = 700
const MAX_LENGTH = 7000

function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A name as it may appear in running text: in full, without its generic words, or, for a
// two- or three-word personal name, by surname alone
export function nameVariants(names: string[]): string[] {
  const variants = new Set<string>()
  for (const name of names) {
    variants.add(name)
    const core = name.replace(GENERIC_WORDS, ' ').replace(/\s+/g, ' ').trim()
    if (core.length >= 4) variants.add(core)
  }
  const words = names[0].split(/\s+/)
  const surname = words[words.length - 1]
  const generic = surname.replace(GENERIC_WORDS, '').trim() === ''
  if (words.length >= 2 && words.length <= 3 && surname.length >= 4 && !generic) variants.add(surname)
  return [...variants].filter((variant) => variant.length >= 3)
}

function mentions(text: string, names: string[]): number[] {
  const positions: number[] = []
  for (const variant of nameVariants(names)) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapePattern(variant).replace(/['’]/g, "['’]")}(?![\\p{L}\\p{N}])`, 'giu')
    for (const match of text.matchAll(pattern)) positions.push(match.index)
  }
  return positions.sort((a, b) => a - b)
}

export interface Passages {
  // Whether each party is mentioned at all
  mentioned: boolean[]
  text: string
}

export function extractPassages(text: string, parties: string[][]): Passages {
  const found = parties.map((names) => mentions(text, names))
  const mentioned = found.map((positions) => positions.length > 0)
  if (text.length <= MAX_LENGTH) return { mentioned, text }

  // Windows around every mention, merged where they overlap
  const windows: { start: number; end: number; parties: Set<number> }[] = []
  found.forEach((positions, party) => {
    for (const position of positions) {
      const start = Math.max(0, position - WINDOW)
      const end = Math.min(text.length, position + WINDOW)
      const last = windows.find((window) => start <= window.end && end >= window.start)
      if (last) {
        last.start = Math.min(last.start, start)
        last.end = Math.max(last.end, end)
        last.parties.add(party)
      } else {
        windows.push({ start, end, parties: new Set([party]) })
      }
    }
  })
  // Passages naming more of the parties come first; within that, document order
  windows.sort((a, b) => b.parties.size - a.parties.size || a.start - b.start)
  const kept: typeof windows = []
  let length = 0
  for (const window of windows) {
    if (length + (window.end - window.start) > MAX_LENGTH && kept.length > 0) continue
    kept.push(window)
    length += window.end - window.start
  }
  kept.sort((a, b) => a.start - b.start)
  return { mentioned, text: kept.map((window) => text.slice(window.start, window.end).trim()).join('\n[...]\n') }
}

// A source that is a list with one entry per line (the WineEnthusiast reviews, by winery):
// its heading and the entries about the record, never a neighbouring entry that happens to
// name the same AVA or grape: the entries naming every party, or failing that the first party
export function catalogueLines(text: string, parties: string[][]): Passages {
  const [heading, ...lines] = text.split('\n')
  const mentioned = parties.map((party) => lines.some((line) => mentions(line, party).length > 0))
  const all = lines.filter((line) => parties.every((party) => mentions(line, party).length > 0))
  const kept = all.length > 0 ? all : lines.filter((line) => mentions(line, parties[0]).length > 0)
  return { mentioned, text: [heading, ...kept].join('\n') }
}
