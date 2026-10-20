// The caveats tools/cola/caveats.ts keeps in the notes of connections that rest on federal
// label approvals. They are about the evidence, not the connection, so a record card leaves
// them out of the connection's note and its verification note says them instead.

// "Evidence goes only as far as federal label approvals (TTB, 2014–2024); no other source ..."
export const LABEL_ONLY =
  /\s*Evidence goes only as far as (?:a )?federal label approvals? \(TTB, [^)]+\); no other source confirms the wine was released\./
export const IMAGE_ONLY = /\s*Checked automatically against the label images?, an early-stage method with lower confidence\./

export interface Caveats {
  labelOnly: boolean
  byImage: boolean
}

export function caveatsOf(note: string | undefined): Caveats {
  return { labelOnly: !!note && LABEL_ONLY.test(note), byImage: !!note && IMAGE_ONLY.test(note) }
}

// The note as a card shows it beside the connection, without the caveats
export function withoutCaveats(note: string | undefined): string | undefined {
  return note?.replace(LABEL_ONLY, '').replace(IMAGE_ONLY, '').trim() || undefined
}
