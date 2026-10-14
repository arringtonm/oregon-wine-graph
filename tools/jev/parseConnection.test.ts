import { describe, expect, it } from 'vitest'
import { loadGraph } from '../../src/data'
import { REVIEW_THRESHOLD, findCandidates, findUnknownNames, parseConnection } from './parseConnection'
import { stubModel, type Answer, type DecisionModel } from './model'

const graph = await loadGraph()
const node = (id: string) => graph.nodes.find((candidate) => candidate.id === id)!
const parse = (text: string, contextId: string, model: DecisionModel = stubModel()) =>
  parseConnection(text, contextId, graph, model)

// A model that answers a fixed set of questions with full confidence, as Jev would return them
function recorded(choices: Record<string, string>, nouls: Record<string, number> = {}): DecisionModel {
  return {
    name: 'jev',
    async ask(_state, questions) {
      const answers: Record<string, Answer> = {}
      for (const [id, question] of Object.entries(questions)) {
        answers[id] =
          question.type === 'noul'
            ? { type: 'noul', noul: nouls[id] ?? 0.95 }
            : { type: 'choice', choice: choices[id] ?? 'none', confidence: 0.97, probabilities: {} }
      }
      return answers
    },
  }
}

describe('findCandidates', () => {
  it('resolves a first name to the person connected to the page it was typed on', () => {
    const [first] = findCandidates('Dan and Jeanne are married', node('dan-diephouse'), graph)
    expect(first.id).toBe('jeanne-feldkamp')
  })

  it('matches a business by its name without the generic suffix', () => {
    const ids = findCandidates('He was winemaker at Eyrie', node('jason-lett'), graph).map((found) => found.id)
    expect(ids).toContain('the-eyrie-vineyards')
  })

  it('does not treat ordinary lower-case words as first names', () => {
    expect(findCandidates('they will grace the stage', node('dan-diephouse'), graph)).toEqual([])
  })
})

describe('findUnknownNames', () => {
  const unknown = (text: string, contextId: string) =>
    findUnknownNames(text, node(contextId), findCandidates(text, node(contextId), graph))

  it('finds a name that is neither the page nor a candidate', () => {
    expect(unknown('Corollary Wines sources fruit from Quuxbury Hollow', 'corollary-wines')).toEqual(['Quuxbury Hollow'])
  })

  it('ignores known names and a verb that opens the sentence', () => {
    expect(unknown('Founded by David Lett in 1966', 'the-eyrie-vineyards')).toEqual([])
    expect(unknown('Dan and Jeanne are married', 'dan-diephouse')).toEqual([])
  })
})

describe('parseConnection with the stand-in model', () => {
  it('reads "Dan and Jeanne are married" on Dan\'s page', async () => {
    const proposal = await parse('Dan and Jeanne are married', 'dan-diephouse')
    expect(proposal.problems).toEqual([])
    expect(proposal.edge).toEqual({
      source: 'dan-diephouse',
      target: 'jeanne-feldkamp',
      type: 'family',
      role: 'spouse',
    })
    expect(proposal.model).toBe('stub')
    expect(proposal.confidence.type).toBeLessThan(REVIEW_THRESHOLD)
  })

  it('stores a parent/child tie with the parent as the source, from either page', async () => {
    const fromChild = await parse('Jason is the son of David Lett', 'jason-lett')
    expect(fromChild.edge).toMatchObject({ source: 'david-lett', target: 'jason-lett', type: 'family', role: 'parent' })
    const fromParent = await parse('David is the father of Jason Lett', 'david-lett')
    expect(fromParent.edge).toMatchObject({ source: 'david-lett', target: 'jason-lett', type: 'family', role: 'parent' })
  })

  it('lets the rules fix the direction when only one is allowed', async () => {
    const proposal = await parse('Founded by David Lett in 1966', 'the-eyrie-vineyards')
    expect(proposal.edge).toMatchObject({
      source: 'david-lett',
      target: 'the-eyrie-vineyards',
      type: 'founded',
      startYear: 1966,
    })
  })

  it('reads a year range', async () => {
    const proposal = await parse('Dan was winemaker at Argyle Winery from 2010 until 2014', 'dan-diephouse')
    expect(proposal.edge).toMatchObject({
      source: 'dan-diephouse',
      target: 'argyle-winery',
      type: 'winemaker',
      startYear: 2010,
      endYear: 2014,
    })
    expect(proposal.edge?.ongoing).toBeUndefined()
  })

  it('warns when the connection already exists', async () => {
    const proposal = await parse('David Lett founded The Eyrie Vineyards', 'david-lett')
    expect(proposal.edge).toMatchObject({ source: 'david-lett', target: 'the-eyrie-vineyards', type: 'founded' })
    expect(proposal.warnings.join(' ')).toContain('already exists')
  })

  it('proposes a new node for a name the graph does not have', async () => {
    const proposal = await parse('Corollary Wines sources fruit from Quuxbury Hollow', 'corollary-wines')
    expect(proposal.problems).toEqual([])
    expect(proposal.newNode).toEqual({ id: 'quuxbury-hollow', name: 'Quuxbury Hollow', type: 'vineyard' })
    expect(proposal.edge).toMatchObject({ source: 'corollary-wines', target: 'quuxbury-hollow', type: 'sources_from' })
    expect(proposal.warnings.join(' ')).toContain('not in the graph yet')
  })

  it('proposes a new person when someone unknown is named', async () => {
    const proposal = await parse('Dan is married to Zebediah Quux', 'dan-diephouse')
    expect(proposal.newNode).toEqual({ id: 'zebediah-quux', name: 'Zebediah Quux', type: 'person' })
    expect(proposal.edge).toMatchObject({ type: 'family', role: 'spouse' })
  })

  it('reports a sentence that names nobody else', async () => {
    const proposal = await parse('he makes very good wine', 'dan-diephouse')
    expect(proposal.edge).toBeNull()
    expect(proposal.problems[0]).toContain('Could not find a name')
  })

  it('reports a sentence with no known relationship', async () => {
    const proposal = await parse('Dan likes Jeanne', 'dan-diephouse')
    expect(proposal.edge).toBeNull()
    expect(proposal.problems[0]).toContain('relationship')
  })
})

describe('parseConnection with recorded model answers', () => {
  it('refuses a pairing the edge rules forbid in both directions', async () => {
    const model = recorded({ other_party: 'jeanne-feldkamp', type: 'sources_from', direction: 'context_is_source' })
    const proposal = await parse('Dan sources fruit from Jeanne', 'dan-diephouse', model)
    expect(proposal.edge).toBeNull()
    expect(proposal.problems[0]).toContain('cannot be joined')
  })

  it('marks a present-tense relationship as ongoing when the model is confident', async () => {
    const model = recorded({ other_party: 'corollary-wines', type: 'owns', direction: 'context_is_source' })
    const proposal = await parse('Dan owns Corollary Wines', 'dan-diephouse', model)
    expect(proposal.edge).toMatchObject({ source: 'dan-diephouse', target: 'corollary-wines', type: 'owns', ongoing: true })
    expect(proposal.confidence.type).toBeGreaterThanOrEqual(REVIEW_THRESHOLD)
  })

  it('falls back to the party that can take the relationship when a sentence names two', async () => {
    const model = recorded({ other_party: 'jeanne-feldkamp', type: 'owns', direction: 'context_is_source' })
    const proposal = await parse('Dan and Jeanne own Corollary Wines', 'dan-diephouse', model)
    expect(proposal.edge).toMatchObject({ source: 'dan-diephouse', target: 'corollary-wines', type: 'owns' })
    expect(proposal.warnings.join(' ')).toContain('more than one party')
    expect(proposal.confidence.other).toBeLessThan(REVIEW_THRESHOLD)
  })

  it('gives up when the model says none of the candidates is meant', async () => {
    const proposal = await parse('Dan and Jeanne are married', 'dan-diephouse', recorded({ type: 'family' }))
    expect(proposal.edge).toBeNull()
  })
})
