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
}

export const CONTRADICTION_THRESHOLD = 0.5
// Chosen from the calibration run of 13 October 2026: 1.2% of deliberately corrupted
// records were still approved at this level, all by swapping in a neighbouring relationship
export const APPLY_THRESHOLD = 0.9

export function decide(checks: SourceCheck[], detailIds: string[], threshold: number): Decision {
  const read = checks.filter((check) => check.status === 'read' && check.levels)
  const decision: Decision = { verdict: 'unchecked', support: 0, contradiction: 0, failing: [] }
  if (read.length === 0) {
    // Sources that were readable but silent count against the record; unreadable ones do not
    if (checks.some((check) => check.status === 'absent')) decision.verdict = 'unsupported'
    return decision
  }

  for (const check of read) {
    const support = check.levels![2] + check.levels![3]
    if (support > decision.support || decision.bestSource === undefined) {
      decision.support = support
      decision.bestSource = check.url
    }
    decision.contradiction = Math.max(decision.contradiction, check.levels![0])
  }
  decision.failing = detailIds.filter(
    (id) => !read.some((check) => (check.details?.[id] ?? 0) >= threshold),
  )

  if (decision.contradiction >= CONTRADICTION_THRESHOLD) decision.verdict = 'conflict'
  else if (decision.support < threshold) decision.verdict = 'unsupported'
  else decision.verdict = decision.failing.length > 0 ? 'partial' : 'supported'
  return decision
}
