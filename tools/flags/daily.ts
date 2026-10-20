// The daily flag job, run each morning by .github/workflows/flags-daily.yml. For each flag
// from the published site it hasn't seen, it re-checks the flagged record against its cited
// sources, and against the reader's source if they gave one, with the same check as
// `npm run check`, and notes whether the flag holds. It acts only within the usual rules:
//   - a reader's source is added when it supports the record on its own;
//   - a correction is written only when the check supports the corrected record (verify:apply's
//     judge), and is logged in tools/verify/corrections.json. Claude Haiku, through Claude
//     Code on the owner's plan, reads the reader's note and source to propose it; Jev decides.
// What it found goes in the flag's row in D1, and a recap in .cache/flags/recap.md, which the
// workflow posts as the pull request carrying the changes, or as an issue when nothing changed.
// Flags acted on are resolved once that pull request is merged. Readers' notes stay in D1:
// the repository is public, so the recap says only that a note exists.
// Run with: npm run flags:daily [-- --dry-run] [--propose (locally, with Claude Code signed in)]
// and, once the workflow has opened the pull request: npm run flags:daily -- --record-pr <url>
import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { loadEnv } from 'vite'
import type { Graph, GraphEdge, GraphNode, Source } from '../../src/data/schema'
import { FLAG_REASONS } from '../../src/services/flagTypes'
import { checkRecord } from '../check/checkRecord'
import { claimsFingerprint, claimsFor, recordKey, type CheckedRecord } from '../check/claims'
import { APPLY_THRESHOLD, CONTRADICTION_THRESHOLD, decide, type Decision, type SourceCheck } from '../check/decide'
import { fetchAndCache, readCached, type CachedSource } from '../check/fetchSources'
import { compact, readChecks, writeChecks } from '../check/store'
import { jevModel, type DecisionModel } from '../jev/model'
import { readGraph } from '../reviewPlugin'
import { CORRECTIONS_FILE, correctionsFor, judge, revised, writeRecord, type Correction } from '../verify/apply'
import type { StoredFlag } from './localStore'
import { query, sqlText, toStoredFlag } from './remoteStore'

const run = promisify(execFile)
const OUT_DIR = resolve('.cache/flags')
const RECAP_FILE = join(OUT_DIR, 'recap.md')
const ACTED_FILE = join(OUT_DIR, 'acted.json')
// Fields a reader's flag may correct: verify:apply's, less the note, which is ours to write, and
// alsoDated: where sources disagree on a year the record shows them all, and only a person
// settles that
const EDGE_FIELDS = ['role', 'startYear', 'endYear', 'ongoing']
const NODE_FIELDS = ['summary', 'born', 'died', 'founded', 'closed', 'planted', 'established', 'firstHeld', 'lastHeld']

export interface Proposal {
  changes: Record<string, unknown>
  finding: string
}

// Reads a flag's note and the reader's source and proposes a correction, or none
export type Proposer = (input: { kind: 'node' | 'edge'; record: GraphNode | GraphEdge; flag: StoredFlag; sourceText?: string }) => Promise<Proposal | null>

export interface Investigation {
  flag: StoredFlag
  holds: 'yes' | 'no' | 'unclear'
  action: 'none' | 'source-added' | 'corrected' | 'gone'
  // Plain sentences, for the flag's row and the recap
  finding: string
  // The record to write, when the job changed it, and the check of it as written
  record?: GraphNode | GraphEdge
  checks?: SourceCheck[]
  corrections?: Correction[]
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function readerSource(url: string): Source {
  return { title: `Page on ${host(url)}, suggested by a reader`, url }
}

function withRecord(graph: Graph, kind: 'node' | 'edge', record: GraphNode | GraphEdge): Graph {
  return kind === 'node'
    ? { ...graph, nodes: graph.nodes.map((node) => (node.id === record.id ? (record as GraphNode) : node)) }
    : { ...graph, edges: graph.edges.map((edge) => (edge.id === record.id ? (record as GraphEdge) : edge)) }
}

// A detail claim's id as a person would say it: "sentence2" -> "summary sentence 2"
const claimName = (id: string) =>
  id
    .replace(/^sentence(\d+)$/, 'summary sentence $1')
    .replace(/^vintage(\d+)$/, 'the $1 vintage')
    .replace(/^(\w+?)Year(@\d+)?$/, 'the $1 year')

// "Its cited sources still support it (best: oregonwinepress.com)."
function citedFinding(decision: Decision, checks: SourceCheck[]): string {
  const contradicting = checks.find((check) => check.levels && check.levels[0] >= CONTRADICTION_THRESHOLD)
  if (contradicting) return `A cited source contradicts it (${host(contradicting.url)}).`
  const unreadable = checks.filter((check) => check.status === 'unreadable').length
  const note = unreadable ? ` ${unreadable} of its ${checks.length} sources couldn't be read.` : ''
  if (decision.verdict === 'supported') return `Its cited sources still support it (best: ${host(decision.bestSource ?? '')}).${note}`
  if (decision.verdict === 'partial') return `Its cited sources support the main claim but not ${decision.failing.map(claimName).join(', ')}.${note}`
  return `No cited source supports it.${note}`
}

function readerFinding(decision: Decision | undefined, checks: SourceCheck[] | undefined): string {
  if (!decision || !checks) return ''
  if (checks.every((check) => check.status === 'unreadable')) return " The reader's source couldn't be read."
  if (decision.contradiction >= CONTRADICTION_THRESHOLD) return " The reader's source contradicts it."
  if (decision.verdict === 'supported') return " The reader's source supports it."
  return " The reader's source doesn't settle it."
}

export async function investigate(
  flag: StoredFlag,
  graph: Graph,
  model: DecisionModel,
  readSource: (url: string) => CachedSource | null = readCached,
  propose?: Proposer,
): Promise<Investigation> {
  const kind = flag.recordKind
  const record = kind === 'node' ? graph.nodes.find((node) => node.id === flag.recordId) : graph.edges.find((edge) => edge.id === flag.recordId)
  if (!record) return { flag, holds: 'unclear', action: 'gone', finding: 'The record is no longer in the graph.' }
  const key = `${kind}:${record.id}`
  const item = { kind, record } as CheckedRecord
  const detailIds = Object.keys(claimsFor(item, graph).details)

  const cited = await checkRecord(item, graph, model, readSource)
  const citedDecision = decide(cited, detailIds, APPLY_THRESHOLD)
  const suggested = flag.sourceUrl && !record.sources.some((source) => source.url === flag.sourceUrl) ? readerSource(flag.sourceUrl) : undefined
  let readerChecks: SourceCheck[] | undefined
  let readerDecision: Decision | undefined
  if (suggested) {
    readerChecks = await checkRecord({ kind, record: { ...record, sources: [suggested] } } as CheckedRecord, graph, model, readSource)
    readerDecision = decide(readerChecks, detailIds, APPLY_THRESHOLD)
  }
  const contradicted =
    citedDecision.contradiction >= CONTRADICTION_THRESHOLD || (readerDecision?.contradiction ?? 0) >= CONTRADICTION_THRESHOLD
  const found = citedFinding(citedDecision, cited) + readerFinding(readerDecision, readerChecks)
  const recheck = async (next: GraphNode | GraphEdge) =>
    checkRecord({ kind, record: next } as CheckedRecord, withRecord(graph, kind, next), model, readSource)

  // The reader's source supports the record by itself: keep it
  if (suggested && readerDecision?.verdict === 'supported') {
    const next = revised(record, kind, { key, addSources: [suggested], finding: '' }, false)
    return {
      flag,
      holds: citedDecision.verdict === 'supported' || flag.reason === 'unsupported' ? 'no' : 'unclear',
      action: 'source-added',
      finding: `${found} Added it as a source.`,
      record: next,
      checks: await recheck(next),
    }
  }

  // The record may be wrong: have the note and source read for a correction, which the
  // check must then support
  const wrong = contradicted || flag.reason === 'incorrect' || flag.reason === 'outdated'
  if (propose && wrong && (flag.note || suggested)) {
    const page = suggested && flag.sourceUrl ? readSource(flag.sourceUrl) : null
    const sourceText = page && page.status === 'ok' ? page.text.slice(0, 12_000) : undefined
    const proposal = await propose({ kind, record, flag, sourceText })
    // A year the sources already disagree on isn't changed here: the check would judge only
    // the new year, and the years it replaced would be lost
    const disputed = Object.keys((record as { alsoDated?: Record<string, number[]> }).alsoDated ?? {})
    if (proposal) proposal.changes = Object.fromEntries(Object.entries(proposal.changes).filter(([field]) => !disputed.includes(field)))
    if (proposal && Object.keys(proposal.changes).length > 0) {
      const result = { key, addSources: suggested ? [suggested] : [], changes: proposal.changes, finding: `Reader flag: ${proposal.finding}` }
      try {
        const judged = await judge(graph, result, model, readSource)
        if (judged.outcome.changes === 'applied') {
          return {
            flag,
            holds: 'yes',
            action: 'corrected',
            finding: `${found} Corrected: ${proposal.finding}`,
            record: judged.record,
            checks: await recheck(judged.record),
            corrections: correctionsFor(record, judged.record, result),
          }
        }
        return { flag, holds: contradicted ? 'yes' : 'unclear', action: 'none', finding: `${found} A proposed correction wasn't supported (${judged.outcome.reason}).` }
      } catch (problem) {
        const reason = problem instanceof Error ? problem.message : String(problem)
        return { flag, holds: contradicted ? 'yes' : 'unclear', action: 'none', finding: `${found} A proposed correction was refused (${reason}).` }
      }
    }
  }

  const holds = contradicted ? 'yes' : citedDecision.verdict === 'supported' ? 'no' : 'unclear'
  return { flag, holds, action: 'none', finding: found }
}

function proposalPrompt({ kind, record, flag, sourceText }: Parameters<Proposer>[0]): string {
  const fields = kind === 'edge' ? EDGE_FIELDS : NODE_FIELDS
  const { sources: _sources, verified: _verified, verifiedBy: _by, ...shown } = record as GraphNode & { verifiedBy?: string }
  return [
    `A reader flagged this record of the Oregon Wine Graph as "${FLAG_REASONS[flag.reason]}".`,
    `Record (${kind}): ${JSON.stringify(shown)}`,
    flag.note ? `Reader's note: ${flag.note}` : 'No note.',
    sourceText ? `Text of the page the reader suggested:\n${sourceText}` : 'The reader gave no readable source.',
    '',
    `Propose a correction only if the page text states the corrected fact; a note alone is not evidence. You may change only these fields: ${fields.join(', ')}. A year field is a number; null removes a field. A summary must be in your own words, not copied.`,
    'Reply with JSON only: {"changes": {"<field>": <value>}, "finding": "<one sentence saying what was wrong and what the page says>"}, or {"changes": {}, "finding": "<why no change>"}.',
  ].join('\n')
}

// The model's reply as a proposal, keeping only the fields a flag may correct
export function parseProposal(kind: 'node' | 'edge', reply: string): Proposal | null {
  const fields = kind === 'edge' ? EDGE_FIELDS : NODE_FIELDS
  const json = reply.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  const proposal = JSON.parse(json) as Proposal
  const changes = Object.fromEntries(Object.entries(proposal.changes ?? {}).filter(([field]) => fields.includes(field)))
  return { changes, finding: String(proposal.finding ?? '') }
}

// The proposer: one Haiku turn through Claude Code, on the owner's Claude plan
// (CLAUDE_CODE_OAUTH_TOKEN, from `claude setup-token`). No tools, so a reader's page can only
// shape the reply, never act; run outside the repository so its files aren't read in
export function claudeCodeProposer(): Proposer {
  return (input) =>
    new Promise((done, fail) => {
      const args = ['-p', '--model', 'haiku', '--tools', '', '--output-format', 'json', '--no-session-persistence']
      const child = spawn('claude', args, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] })
      let out = ''
      let err = ''
      child.stdout.on('data', (chunk) => (out += chunk))
      child.stderr.on('data', (chunk) => (err += chunk))
      child.on('error', fail)
      child.on('close', (code) => {
        if (code !== 0) return fail(new Error(`claude exited ${code}: ${err.trim().slice(0, 200)}`))
        try {
          const result = JSON.parse(out) as { result?: string; is_error?: boolean }
          if (result.is_error) return fail(new Error(`claude: ${String(result.result).slice(0, 200)}`))
          done(parseProposal(input.kind, result.result ?? ''))
        } catch (problem) {
          fail(problem)
        }
      })
      child.stdin.end(proposalPrompt(input))
    })
}

const VERDICT = { yes: 'Holds', no: "Doesn't hold", unclear: 'Unclear' } as const

export function recap(date: string, investigations: Investigation[], merged: StoredFlag[], closed: StoredFlag[]): string {
  if (investigations.length === 0 && merged.length === 0 && closed.length === 0) return ''
  const changed = investigations.filter((entry) => entry.record)
  const open = investigations.filter((entry) => !entry.record && entry.action !== 'gone')
  const line = (entry: Investigation) => {
    const { flag } = entry
    const what = flag.recordKind === 'edge' ? 'connection' : 'record'
    const extras = [flag.note ? 'with a note' : '', flag.sourceUrl ? `a suggested source on ${host(flag.sourceUrl)}` : ''].filter(Boolean)
    const fixes = (entry.corrections ?? []).map((fix) => ` ${fix.field}: ${JSON.stringify(fix.from)} → ${JSON.stringify(fix.to)}.`).join('')
    return `- **${flag.recordLabel}** (${what}), flagged "${FLAG_REASONS[flag.reason]}"${extras.length ? `, ${extras.join(' and ')}` : ''}. ${VERDICT[entry.holds]}: ${entry.finding}${fixes}`
  }
  const sections = [
    `# Reader flags, ${date}`,
    '',
    [
      `${investigations.length} new ${investigations.length === 1 ? 'flag' : 'flags'}`,
      changed.length ? `${changed.length} acted on in this pull request` : '',
      open.length ? `${open.length} left for a person in admin mode` : '',
    ]
      .filter(Boolean)
      .join('; ') + '.',
  ]
  if (changed.length) sections.push('', '## Changed (resolved when this is merged)', ...changed.map(line))
  if (open.length) sections.push('', '## For a person', ...open.map(line))
  const gone = investigations.filter((entry) => entry.action === 'gone')
  if (gone.length) sections.push('', '## Resolved: no longer in the graph', ...gone.map(line))
  if (merged.length) sections.push('', `## Earlier pull requests`, `- ${merged.length} merged; their flags are resolved.`)
  if (closed.length) sections.push('', '## Closed without merging (back to a person)', ...closed.map((flag) => `- **${flag.recordLabel}**: ${flag.prUrl}`))
  sections.push('', 'Readers\' notes are kept in the flags database, not here: open admin mode on the dev server to read them.')
  return `${sections.join('\n')}\n`
}

async function prState(url: string): Promise<string> {
  const { stdout } = await run('gh', ['pr', 'view', url, '--json', 'state', '--jq', '.state'])
  return stdout.trim()
}

async function main() {
  const dry = process.argv.includes('--dry-run')
  const now = new Date().toISOString()
  const prIndex = process.argv.indexOf('--record-pr')
  if (prIndex !== -1) {
    const url = process.argv[prIndex + 1]
    const ids = existsSync(ACTED_FILE) ? (JSON.parse(readFileSync(ACTED_FILE, 'utf8')) as string[]) : []
    for (const id of ids) await query(`UPDATE flags SET pr_url = ${sqlText(url)} WHERE id = ${sqlText(id)}`)
    console.log(`Recorded ${url} on ${ids.length} flags`)
    return
  }

  const env = loadEnv('development', process.cwd(), '')
  if (!env.JEV_API_KEY) throw new Error('Set JEV_API_KEY')
  const model = jevModel(env.JEV_API_KEY)
  // In the workflow the token is a secret; locally Claude Code's own sign-in will do
  const propose = env.CLAUDE_CODE_OAUTH_TOKEN || process.argv.includes('--propose') ? claudeCodeProposer() : undefined
  if (!propose) console.log('No CLAUDE_CODE_OAUTH_TOKEN: corrections will not be proposed')
  const flags = (await query('SELECT * FROM flags WHERE resolved_at IS NULL ORDER BY created_at')).map(toStoredFlag)
  const update = (sql: string) => (dry ? console.log(`  (dry run) ${sql}`) : query(sql))

  // Flags acted on in an earlier pull request: resolved once it is merged, and back to a
  // person if it was closed without merging
  const merged: StoredFlag[] = []
  const closed: StoredFlag[] = []
  for (const flag of flags.filter((entry) => entry.prUrl)) {
    const state = await prState(flag.prUrl!)
    if (state === 'MERGED') {
      merged.push(flag)
      await update(`UPDATE flags SET resolved_at = ${sqlText(now)} WHERE id = ${sqlText(flag.id)}`)
    } else if (state === 'CLOSED') {
      closed.push(flag)
      const finding = `${flag.finding ?? ''} Its pull request was closed without merging.`.trim()
      await update(`UPDATE flags SET pr_url = NULL, finding = ${sqlText(finding)} WHERE id = ${sqlText(flag.id)}`)
    }
  }

  const dataDir = resolve('src/data')
  const fresh = flags.filter((flag) => !flag.investigatedAt)
  const investigations: Investigation[] = []
  const store = readChecks()
  const corrections = JSON.parse(readFileSync(CORRECTIONS_FILE, 'utf8')) as Correction[]
  for (const flag of fresh) {
    const graph = readGraph(dataDir)
    const record =
      flag.recordKind === 'node' ? graph.nodes.find((node) => node.id === flag.recordId) : graph.edges.find((edge) => edge.id === flag.recordId)
    // The pages to read: the record's own and the reader's, fetched here because a scheduled
    // run starts with an empty cache
    const urls = [...(record?.sources ?? []).map((source) => source.url), flag.sourceUrl].filter((url): url is string => !!url)
    for (const url of urls) if (!readCached(url)) await fetchAndCache(url)

    const result = await investigate(flag, graph, model, readCached, propose)
    investigations.push(result)
    console.log(`  ${flag.recordLabel}: ${VERDICT[result.holds]}, ${result.action}. ${result.finding}`)
    if (result.record && !dry) {
      writeRecord(dataDir, flag.recordKind, result.record)
      const item = { kind: flag.recordKind, record: result.record } as CheckedRecord
      store[recordKey(item)] = { fingerprint: claimsFingerprint(claimsFor(item, readGraph(dataDir))), checkedAt: now.slice(0, 10), sources: compact(result.checks ?? []) }
      corrections.push(...(result.corrections ?? []))
    }
    const resolved = result.action === 'gone' ? `, resolved_at = ${sqlText(now)}` : ''
    await update(`UPDATE flags SET investigated_at = ${sqlText(now)}, finding = ${sqlText(result.finding)}${resolved} WHERE id = ${sqlText(flag.id)}`)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  if (!dry) {
    writeChecks(store)
    writeFileSync(CORRECTIONS_FILE, `${JSON.stringify(corrections, null, 1)}\n`)
  }
  writeFileSync(ACTED_FILE, `${JSON.stringify(investigations.filter((entry) => entry.record).map((entry) => entry.flag.id))}\n`)
  const text = recap(now.slice(0, 10), investigations, merged, closed)
  writeFileSync(RECAP_FILE, text)
  console.log(text || 'Nothing new to report')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
