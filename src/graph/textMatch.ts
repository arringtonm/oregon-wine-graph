// Text matching that ignores case and accents, so "veronique" finds "Véronique" and
// "salud" finds "¡Salud!".
export function foldText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// True when every word of the query appears in one of the texts
export function matchesQuery(query: string, texts: (string | undefined)[]): boolean {
  const words = foldText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = foldText(texts.filter(Boolean).join(' \u0000 '))
  return words.every((word) => haystack.includes(word))
}
