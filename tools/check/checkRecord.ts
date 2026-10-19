import type { Graph } from '../../src/data/schema'
import { imageAsset } from '../jev/image'
import type { DecisionModel, ImageAsset, Question } from '../jev/model'
import { claimsFor, type CheckedRecord } from './claims'
import { APPLY_THRESHOLD, type SourceCheck } from './decide'
import type { CachedSource } from './fetchSources'
import { extractPassages } from './passages'

const LEVELS = [
  'The text contradicts the statement.',
  'The text does not address the statement.',
  'The text implies the statement without stating it outright.',
  'The text states this outright.',
]
// For a source with images (a label approval): the form's text and the labels together
const IMAGE_LEVELS = LEVELS.map((level) => level.replace('The text', 'The approval (its text and label images)'))
const MAX_IMAGES = 4
// The combined reading: each source's passages up to this, and all of them up to the total
const COMBINED_PER_SOURCE = 4000
const COMBINED_TOTAL = 14000

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
  // What each readable source contributed, for the combined reading below
  const evidence: string[] = []

  for (const source of item.record.sources) {
    if (!source.url) continue
    const cached = readSource(source.url)
    if (!cached || cached.status !== 'ok') {
      checks.push({ url: source.url, status: 'unreadable' })
      continue
    }
    // A label names its vineyard in the image, not the text, so image sources are read whole
    const images = cached.images?.slice(0, MAX_IMAGES) ?? []
    const passages = extractPassages(cached.text, claims.parties)
    if (images.length === 0 && !passages.mentioned.some(Boolean)) {
      checks.push({ url: source.url, status: 'absent' })
      continue
    }

    const what = images.length > 0 ? 'approval' : 'text'
    const questions: Record<string, Question> = {
      main: {
        type: 'score',
        instructions: `How well does the ${what} support this statement? ${claims.main}`,
        criteria: images.length > 0 ? IMAGE_LEVELS : LEVELS,
      },
    }
    for (const [id, statement] of Object.entries(claims.details)) {
      questions[`detail_${id}`] = { type: 'noul', instructions: `The ${what} supports this statement: ${statement}` }
    }
    // Whether the source states this relationship or only a different one between the same
    // two. Asked as one choice, so a page saying "X founded Y" can't pass for "X worked at Y",
    // while a page naming both (a founder who is also the winemaker) still counts
    if (claims.relationships) {
      const own = claims.relationships.options[claims.relationships.own]!
      const others = Object.entries(claims.relationships.options)
        .filter(([type]) => type !== claims.relationships!.own)
        .map(([, statement]) => statement.replace(/\.$/, ''))
      questions.relationship = {
        type: 'choice',
        instructions: `How does the ${what} describe the relationship between these two?`,
        criteria: {
          own: `It states this relationship, possibly among others: ${own}`,
          other: `It describes only a different relationship between them, such as: ${others.join('; ')}.`,
          none: 'It does not say how the two are related.',
        },
      }
    }
    evidence.push((images.length > 0 ? cached.text : passages.text).slice(0, COMBINED_PER_SOURCE))
    let answers
    if (images.length > 0) {
      const refs = images.map((_, index) => `label-image-${index + 1}`)
      const assets: Record<string, ImageAsset> = {}
      for (const [index, path] of images.entries()) assets[refs[index]] = await imageAsset(path)
      answers = await model.ask({ text: cached.text, labels: refs.join(' ') }, questions, assets)
    } else {
      answers = await model.ask(passages.text, questions)
    }

    const main = answers.main
    const check: SourceCheck = {
      url: source.url,
      status: 'read',
      ...(images.length > 0 ? { medium: 'image' as const } : {}),
      details: {},
    }
    if (main?.type === 'score') {
      check.levels = [0, 1, 2, 3].map((level) => main.probabilities[String(level)] ?? 0) as SourceCheck['levels']
    }
    for (const id of Object.keys(claims.details)) {
      const answer = answers[`detail_${id}`]
      check.details![id] = answer?.type === 'noul' ? answer.noul : 0
    }
    const relationship = answers.relationship
    if (claims.relationships && relationship?.type === 'choice') {
      check.relationship = [relationship.probabilities.own ?? 0, relationship.probabilities.other ?? 0]
    }
    checks.push(check)
  }

  // A detail can rest on facts spread across sources (a year in one, a role in another).
  // When the main claim holds but some detail has no single source behind it, read all the
  // sources together, asking only about those details.
  const mainHolds = checks.some((check) => check.levels && check.levels[2] + check.levels[3] >= APPLY_THRESHOLD)
  const unsupported = Object.keys(claims.details).filter(
    (id) => !checks.some((check) => (check.details?.[id] ?? 0) >= APPLY_THRESHOLD),
  )
  if (mainHolds && unsupported.length > 0 && evidence.length > 1) {
    const state = evidence
      .map((text, index) => `[Source ${index + 1}]\n${text}`)
      .join('\n\n')
      .slice(0, COMBINED_TOTAL)
    const questions: Record<string, Question> = {}
    for (const id of unsupported) {
      questions[`detail_${id}`] = {
        type: 'noul',
        instructions: `Taken together, the sources support this statement: ${claims.details[id]}`,
      }
    }
    const answers = await model.ask(state, questions)
    const details: Record<string, number> = {}
    for (const id of unsupported) {
      const answer = answers[`detail_${id}`]
      details[id] = answer?.type === 'noul' ? answer.noul : 0
    }
    checks.push({ url: 'combined', status: 'read', medium: 'combined', details })
  }
  return checks
}
