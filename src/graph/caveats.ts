// The caveats tools/cola/caveats.ts keeps in the notes of connections that rest on federal
// label approvals. A record card lists many such connections together (a winery's AVAs), so
// it says a caveat once for the group rather than under every connection.

// "Evidence goes only as far as federal label approvals (TTB, 2014–2024); no other source ..."
export const LABEL_ONLY =
  /\s*Evidence goes only as far as (?:a )?federal label approvals? \(TTB, [^)]+\); no other source confirms the wine was released\./
export const IMAGE_ONLY = /\s*Checked automatically against the label images?, an early-stage method with lower confidence\./

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// "A", "A and B", "A, B and C"
export function listNames(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// Each caveat as said once for several connections. It names the connections it covers, or,
// when that is shorter, the ones it doesn't ("all of these but Willamette Valley AVA")
type Covered = { names: string[] } | { except: string[] }
const covered = (c: Covered) =>
  'names' in c ? listNames(c.names) : c.except.length ? `all of these but ${listNames(c.except)}` : 'all of these'

export const SHARED_CAVEATS: { pattern: RegExp; text: (covers: Covered) => string }[] = [
  {
    pattern: LABEL_ONLY,
    text: (covers) =>
      `For ${covered(covers)}, the evidence goes only as far as federal label approvals; no other source confirms the wines were released.`,
  },
  {
    pattern: IMAGE_ONLY,
    text: (covers) =>
      `${capitalize(covered(covers))} were checked automatically against the label images, an early-stage method with lower confidence.`,
  },
]

// Takes each caveat shared by two or more of the rows out of their notes, and returns it once
export function shareCaveats<Row extends { name: string; notes: string[] }>(rows: Row[]): { rows: Row[]; caveats: string[] } {
  const caveats: string[] = []
  let result = rows
  for (const { pattern, text } of SHARED_CAVEATS) {
    const named = result.filter((row) => row.notes.some((note) => pattern.test(note)))
    if (named.length < 2) continue
    const except = result.filter((row) => !named.includes(row)).map((row) => row.name)
    caveats.push(text(except.length < named.length ? { except } : { names: named.map((row) => row.name) }))
    result = result.map((row) =>
      named.includes(row) ? { ...row, notes: row.notes.map((note) => note.replace(pattern, '').trim()).filter(Boolean) } : row,
    )
  }
  return { rows: result, caveats }
}
