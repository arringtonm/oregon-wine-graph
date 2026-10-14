import type { Graph } from '../../src/data/schema'
import type { DecisionModel, Question } from '../jev/model'
import { claimsFor, type CheckedRecord } from './claims'
import type { SourceCheck } from './decide'
import type { CachedSource } from './fetchSources'
import { extractPassages } from './passages'

const LEVELS = [
  'The text contradicts the statement.',
  'The text does not address the statement.',
  'The text implies the statement without stating it outright.',
  'The text states this outright.',
]

// Judges one record against each page it cites. `readSource` returns the cached page, or
// null if it was never fetched.
export async function checkRecord(
  item: CheckedRecord,
  graph: Graph,
  model: DecisionModel,
  readSource: (url: string) => CachedSource | null,
): Promise<SourceCheck[]> {
  const claims = claimsFor(item, graph)
  const checks: SourceCheck[] = []

  for (const source of item.record.sources) {
    if (!source.url) continue
    const cached = readSource(source.url)
    if (!cached || cached.status !== 'ok') {
      checks.push({ url: source.url, status: 'unreadable' })
      continue
    }
    const passages = extractPassages(cached.text, claims.parties)
    if (!passages.mentioned.some(Boolean)) {
      checks.push({ url: source.url, status: 'absent' })
      continue
    }

    const questions: Record<string, Question> = {
      main: {
        type: 'score',
        instructions: `How well does the text support this statement? ${claims.main}`,
        criteria: LEVELS,
      },
    }
    for (const [id, statement] of Object.entries(claims.details)) {
      questions[`detail_${id}`] = { type: 'noul', instructions: `The text supports this statement: ${statement}` }
    }
    const answers = await model.ask(passages.text, questions)

    const main = answers.main
    const check: SourceCheck = { url: source.url, status: 'read', details: {} }
    if (main?.type === 'score') {
      check.levels = [0, 1, 2, 3].map((level) => main.probabilities[String(level)] ?? 0) as SourceCheck['levels']
    }
    for (const id of Object.keys(claims.details)) {
      const answer = answers[`detail_${id}`]
      check.details![id] = answer?.type === 'noul' ? answer.noul : 0
    }
    checks.push(check)
  }
  return checks
}
