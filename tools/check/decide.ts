// Turns the model's raw scores for a record, across all its sources, into one verdict.
// Raw scores are stored, so the threshold can change without asking the model again.

export interface SourceCheck {
  url: string
  // read: the model judged it; absent: readable but the record's parties are not mentioned;
  // unreadable: the page could not be fetched as text
  status: 'read' | 'absent' | 'unreadable'
  // Probability of each level for the main claim: contradicted, not mentioned, implied, stated
  levels?: [number, number, number, number]
  // Probability that each detail claim is supported
  details?: Record<string, number>
  // image: judged from images (a label approval's labels) as well as text. Jev's image reading
  // is an early-stage feature, so these must clear IMAGE_THRESHOLD rather than the usual one.
  // combined: the passages of all the record's readable sources read together, asked only
  // about details no single source supported; it counts for details, never as the source
  // shown to readers, and never for the main claim
  medium?: 'image' | 'combined'
  // Whether the source states the record's own relationship between the two ends (perhaps
  // among others), or only a different one: the probability of each. See RELATIONSHIP_FIT.
  relationship?: [number, number]
}

export type Verdict = 'supported' | 'partial' | 'conflict' | 'unsupported' | 'unchecked'

export interface Decision {
  verdict: Verdict
  // Best probability, over the sources, that the main claim is implied or stated
  support: number
  // Worst probability, over the sources, that the main claim is contradicted
  contradiction: number
  // Detail claims no source supports to the threshold
  failing: string[]
  bestSource?: string
  // Supported only by image checks, so trusted less (readers are told as much)
  byImage?: boolean
}

export const CONTRADICTION_THRESHOLD = 0.5
// Chosen from the calibration run of 13 October 2026 (1.2% of deliberately corrupted records
// still approved). Rerun on 18 October 2026 with summary sentences checked one by one,
// combined readings, the relationship test below and only genuinely false swaps: 1.0%
export const APPLY_THRESHOLD = 0.9
// A source supports a connection only if it states the record's own relationship rather than
// only a different one: the first probability must be at least this share of the second.
// Without it, 12% of false relationship swaps passed at 0.9; at 0.5, 6% (mostly swaps that
// turned out true, such as a founder who is also the winemaker), at a cost of 0.5% of real
// connections. Set from the calibration run of 18 October 2026 (npm run check:calibrate)
export const RELATIONSHIP_FIT = 0.5

export function relationshipFit(check: SourceCheck): number {
  if (!check.relationship) return 1
  const [own, other] = check.relationship
  return own >= other ? 1 : own / other
}
// For records supported only by label images. Calibrated on 18 October 2026 against 38
// corrupted label-backed records (another party, relationship, or another vineyard the same
// winery uses): none passed at any level from 0.8, so it matches the usual threshold. The
// sample is small; recalibrate as label approvals grow (npm run check:calibrate -- --images).
// Records verified this way still say so in their note, as the method is early-stage.
export const IMAGE_THRESHOLD = 0.9

export function decide(
  checks: SourceCheck[],
  detailIds: string[],
  threshold: number,
  imageThreshold = Math.max(threshold, IMAGE_THRESHOLD),
  fitThreshold = RELATIONSHIP_FIT,
): Decision {
  const read = checks.filter((check) => check.status === 'read' && check.levels)
  const decision: Decision = { verdict: 'unchecked', support: 0, contradiction: 0, failing: [] }
  if (read.length === 0) {
    // Sources that were readable but silent count against the record; unreadable ones do not
    if (checks.some((check) => check.status === 'absent')) decision.verdict = 'unsupported'
    return decision
  }

  // Text sources first, so that among equal scores the one a reader can check easily is shown
  const ordered = [...read].sort((a, b) => Number(a.medium === 'image') - Number(b.medium === 'image'))
  const bar = (check: SourceCheck) => (check.medium === 'image' ? imageThreshold : threshold)
  // A source describing a different relationship between the two doesn't support this one
  const support = (check: SourceCheck) => (relationshipFit(check) >= fitThreshold ? check.levels![2] + check.levels![3] : 0)
  // The best source is the one that clears its bar by the most, or failing that scores highest
  for (const check of ordered) {
    const best = decision.bestSource === undefined ? undefined : ordered.find((other) => other.url === decision.bestSource)!
    const margin = support(check) - bar(check)
    if (!best || margin > support(best) - bar(best)) {
      decision.support = support(check)
      decision.bestSource = check.url
      decision.byImage = check.medium === 'image'
    }
    decision.contradiction = Math.max(decision.contradiction, check.levels![0])
  }
  const best = ordered.find((check) => check.url === decision.bestSource)!
  const forDetails = checks.filter((check) => check.status === 'read')
  // Alternatives ("founded", "founded@1965") are one detail, which any of them can satisfy
  const holds = (id: string) => forDetails.some((check) => (check.details?.[id] ?? 0) >= bar(check))
  const groups = new Map<string, string[]>()
  for (const id of detailIds) groups.set(id.split('@')[0], [...(groups.get(id.split('@')[0]) ?? []), id])
  decision.failing = [...groups].filter(([, ids]) => !ids.some(holds)).map(([group]) => group)
  if (!decision.byImage) delete decision.byImage

  if (decision.contradiction >= CONTRADICTION_THRESHOLD) decision.verdict = 'conflict'
  else if (decision.support < bar(best)) decision.verdict = 'unsupported'
  else decision.verdict = decision.failing.length > 0 ? 'partial' : 'supported'
  return decision
}
