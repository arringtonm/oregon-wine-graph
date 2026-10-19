// Turning fetched HTML into plain text. Kept apart from fetchSources so that tools it
// calls (such as the COLA registry client) can use these without importing it.

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…',
  szlig: 'ß', aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', ccedil: 'ç', Ccedil: 'Ç',
}
// Accented letters arrive as a base letter plus a mark name: &eacute; &ntilde; &ouml; ...
const MARKS: Record<string, string> = { acute: '\u0301', grave: '\u0300', circ: '\u0302', uml: '\u0308', tilde: '\u0303', ring: '\u030a' }

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      if (ENTITIES[name] ?? ENTITIES[name.toLowerCase()]) return ENTITIES[name] ?? ENTITIES[name.toLowerCase()]
      const accent = name.match(/^([a-z])(acute|grave|circ|uml|tilde|ring)$/i)
      return accent ? (accent[1] + MARKS[accent[2].toLowerCase()]).normalize('NFC') : match
    })
}

function stripMarkup(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?(p|div|br|li|tr|h[1-6]|section|article|blockquote|td)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t ​‌]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

export function htmlToText(html: string): string {
  return decodeEntities(stripMarkup(html))
    .replace(/[ \t\u00a0]+/g, ' ')
    .trim()
}
