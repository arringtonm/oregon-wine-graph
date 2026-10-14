// Jev (TypeSafe AI) is a decision model: one call takes a state and a set of typed
// questions and returns an answer with probabilities for each. It does not write text.
// Everything that needs a decision goes through this one interface, so the real client
// and the keyword stand-in used before credentials exist are interchangeable.

export type Question =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  // Ordered levels, lowest first; the answer's score is the expected level
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'noul'; instructions: string }

export type Answer =
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> }
  | { type: 'noul'; noul: number }

export interface DecisionModel {
  name: 'jev' | 'stub'
  ask(state: string, questions: Record<string, Question>): Promise<Record<string, Answer>>
}

export function jevModel(apiKey: string): DecisionModel {
  return {
    name: 'jev',
    async ask(state, questions) {
      // Retry rate limits and server errors a few times, backing off
      for (let attempt = 0; ; attempt++) {
        const response = await fetch('https://api.typesafe.ai/v1/systemone', {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'jev-latest', state, questions }),
        })
        if (response.ok) return ((await response.json()) as { answers: Record<string, Answer> }).answers
        if (attempt >= 4 || (response.status !== 429 && response.status < 500)) {
          throw new Error(`Jev request failed: HTTP ${response.status} ${await response.text()}`)
        }
        await new Promise((done) => setTimeout(done, 1000 * 2 ** attempt))
      }
    },
  }
}

// What the stand-in reports for every answer: deliberately below the review threshold,
// so nothing it produces is presented as settled.
export const STUB_CONFIDENCE = 0.6

const TYPE_KEYWORDS: [string, RegExp][] = [
  ['family', /\b(married|wife|husband|spouse|father|mother|son|daughter|parent|child|brother|sister|sibling)\b/],
  ['mentored', /\b(mentor(ed|s)?|protege|protégé|apprentic\w+|trained under|learned from)\b/],
  ['founded', /\b(co-?founded|founded|co-?founders?|founders?|started|established|planted)\b/],
  ['acquired', /\b(acquired|bought|purchased)\b/],
  ['successor_of', /\b(successor|succeeded|renamed|formerly)\b/],
  ['winemaker', /\b(wine ?maker|makes? the wines?|made the wines?)\b/],
  ['consulted', /\b(consult\w*)\b/],
  ['sources_from', /\b(sources?|buys?|purchases?) (fruit|grapes)\b|\bfruit from\b|\bgrapes from\b/],
  ['studied_at', /\b(studied|graduated|degree|alum\w*)\b/],
  ['located_in', /\b(located in|is in the|sits in)\b/],
  ['draws_from', /\b(grapes|fruit) from the\b|\bdraws? (fruit|grapes)\b/],
  ['within', /\b(within|sub-?ava|nested)\b/],
  ['hosts', /\b(hosts?|hosted)\b/],
  ['participated_in', /\b(took part|participated|poured at|attended)\b/],
  ['member_of', /\b(member|board|chair|president of)\b/],
  ['owns', /\b(owns?|owned|owner|co-?owner|estate vineyard)\b/],
  ['worked_at', /\b(work(s|ed)?|manag\w+|assistant|cellar|interned|harvest)\b/],
]

const FAMILY_ROLES: [string, RegExp][] = [
  ['spouse', /\b(married|wife|husband|spouse)\b/],
  ['parent', /\b(father|mother|parent) (of|to)\b/],
  ['child', /\b(son|daughter|child) of\b/],
  ['sibling', /\b(brother|sister|sibling)\b/],
]

// Keyword rules that answer the questions parseConnection asks, in Jev's answer shape.
// Good enough to exercise the whole feature; not a substitute for the model.
export function stubModel(): DecisionModel {
  const choice = (question: Extract<Question, { type: 'choice' }>, wanted: string | undefined): Answer => {
    const options = Object.keys(question.criteria)
    const picked = wanted && options.includes(wanted) ? wanted : options[options.length - 1]
    const rest = (1 - STUB_CONFIDENCE) / Math.max(1, options.length - 1)
    return {
      type: 'choice',
      choice: picked,
      confidence: STUB_CONFIDENCE,
      probabilities: Object.fromEntries(options.map((option) => [option, option === picked ? STUB_CONFIDENCE : rest])),
    }
  }

  return {
    name: 'stub',
    async ask(state, questions) {
      const sentence = (state.match(/^Sentence: (.*)$/m)?.[1] ?? state).toLowerCase()
      const years = [...sentence.matchAll(/\b(1[789]\d\d|20\d\d)\b/g)].map((match) => match[1])
      const type = TYPE_KEYWORDS.find(([, pattern]) => pattern.test(sentence))?.[0]
      const passive = /\b(founded|owned|acquired|bought|mentored|trained|taught|hosted|made|planted) by\b/.test(sentence)
      const ended = /\b(until|left|former(ly)?|was|were|used to|sold)\b/.test(sentence)

      const answers: Record<string, Answer> = {}
      for (const [id, question] of Object.entries(questions)) {
        if (question.type === 'score') {
          answers[id] = { type: 'score', score: 1, confidence: STUB_CONFIDENCE, probabilities: { '1': 1 } }
        } else if (question.type === 'noul') {
          answers[id] = { type: 'noul', noul: id === 'ongoing' ? (ended ? 0.2 : 0.7) : type ? 0.8 : 0.2 }
        } else if (id === 'type') {
          answers[id] = choice(question, type)
        } else if (id === 'other_party') {
          answers[id] = choice(question, Object.keys(question.criteria)[0])
        } else if (id === 'direction') {
          answers[id] = choice(question, passive ? 'context_is_target' : 'context_is_source')
        } else if (id === 'family_role') {
          answers[id] = choice(question, FAMILY_ROLES.find(([, pattern]) => pattern.test(sentence))?.[0])
        } else if (id === 'start_year') {
          const start = years.length > 1 ? Math.min(...years.map(Number)) : ended ? undefined : years[0]
          answers[id] = choice(question, start === undefined ? undefined : String(start))
        } else if (id === 'end_year') {
          const end = years.length > 1 ? Math.max(...years.map(Number)) : ended ? years[0] : undefined
          answers[id] = choice(question, end === undefined ? undefined : String(end))
        } else {
          answers[id] = choice(question, undefined)
        }
      }
      return answers
    },
  }
}
