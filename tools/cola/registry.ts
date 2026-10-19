// A polite client for TTB's Public COLA Registry (ttbonline.gov), which has no API: a search
// form, a CSV export of the results, a printable form per approval and its label images.
// TTB publishes no rate limits, so this stays well under anything a person clicking through
// would do: one connection, one request every two seconds, backing off on errors and
// stopping after a few failures in a row. Every response is cached under .cache/cola/.
import { X509Certificate } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { rootCertificates } from 'node:tls'
import { Agent, fetch, type RequestInit, type Response } from 'undici'
import { decodeEntities } from '../check/html'

const BASE = 'https://ttbonline.gov/colasonline'
export const CACHE_DIR = resolve('.cache/cola')
const DELAY_MS = 2000
const MAX_FAILURES_IN_A_ROW = 3

// The page a citation links to; it opens without a session
export function colaUrl(ttbId: string): string {
  return `${BASE}/viewColaDetails.do?action=publicDisplaySearchBasic&ttbid=${ttbId}`
}

// Only approvals filed electronically have a printable form and label images: their ids carry
// 001 in digits 6 to 8. Paper filings (000, 002, 003) and the 8 or 9 digit ids of the 1980s
// and early 1990s have a detail page and nothing more.
export function hasForm(ttbId: string): boolean {
  return ttbId.length === 14 && ttbId.slice(5, 8) === '001'
}

export function ttbIdOf(url: string): string | null {
  const match = url.match(/^https:\/\/(?:www\.)?ttbonline\.gov\/colasonline\/viewColaDetails\.do\?.*ttbid=(\d{8,14})\b/)
  return match ? match[1] : null
}

// One row of a search's CSV export
export interface ColaRow {
  ttbId: string
  permit: string
  serial: string
  completed: string // YYYY-MM-DD
  fanciful: string
  brand: string
  origin: string
  originDesc: string
  classType: string
  classDesc: string
}

export interface LabelImage {
  // What the form calls it, such as "Brand (front) or keg collar" or "Back"
  kind: string
  filename: string
}

// The fields of a printable approval form that describe the wine and who filed it. The
// applicant's phone number and the agent's name are deliberately not kept.
export interface ColaForm {
  ttbId: string
  status: string
  permit: string
  applicant: string
  brand: string
  fanciful: string
  varietals: string
  appellation: string
  // Only the 2009 edition of the form has a vintage box
  vintage?: number
  classDesc: string
  issued: string // YYYY-MM-DD
  images: LabelImage[]
}

const isoDate = (us: string) => {
  const [month, day, year] = us.split('/')
  return `${year}-${month}-${day}`
}
const usDate = (iso: string) => {
  const [year, month, day] = iso.split('-')
  return `${month}/${day}/${year}`
}

// Splits CSV text into rows of fields, honouring double quotes (which may span lines)
function csvRows(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i]
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') field += csv[i++]
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field || row.length) rows.push([...row, field])
  return rows
}

export function parseResultsCsv(csv: string): ColaRow[] {
  const [header, ...rows] = csvRows(csv)
  if (header?.[0] !== 'TTB ID') throw new Error(`COLA export was not the expected CSV: ${csv.slice(0, 120)}`)
  return rows
    .filter((fields) => fields.length >= 10)
    .map((fields) => {
      const [ttbId, permit, serial, completed, fanciful, brand, origin, originDesc, classType, classDesc] = fields.map(
        (field) => field.replace(/\s+/g, ' ').trim(),
      )
      return {
        ttbId: ttbId.replace(/'/g, ''),
        permit,
        serial,
        completed: isoDate(completed),
        fanciful,
        brand,
        origin,
        originDesc,
        classType,
        classDesc,
      }
    })
}

// A printable form reduced to what parseForm reads: its text, and its label images (named
// in the markup). Cached in this shape so the parser can be improved without refetching.
export interface FormPage {
  ttbId: string
  text: string
  images: LabelImage[]
}

export function formPage(ttbId: string, html: string): FormPage {
  const text = decodeEntities(html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;?/g, ' ')).replace(/\s+/g, ' ')
  const images = [...html.matchAll(/<img[^>]*src="[^"]*publicViewAttachment\.do\?filename=([^"&]*)&(?:amp;)?filetype=l"[^>]*>/g)].map(
    (match) => ({
      filename: decodeEntities(match[1]),
      kind: decodeEntities(match[0].match(/alt="Label Image: ([^"]*)"/)?.[1] ?? '').trim(),
    }),
  )
  return { ttbId, text: redact(text), images }
}

// Contact details and the name of the person who filed, which this project never keeps. Each
// value runs to the next numbered caption, as in parseForm
const PRIVATE_FIELD =
  /(PHONE NUMBER|FAX NUMBER|EMAIL ADDRESS|PRINT NAME OF APPLICANT OR AUTHORIZED AGENT)[^]*?(?= \d{1,2}[a-z]?\. [A-Z][A-Z'/]+| PART I|$)/g

export function redact(text: string): string {
  return text.replace(PRIVATE_FIELD, '$1 [not kept]')
}

// The form's fields are numbered differently in different editions (the 2009 edition has a
// vintage box the 2016 one lacks), so each is found by its caption and runs to the next
// numbered caption
const NEXT_FIELD = / \d{1,2}[a-z]?\. (?=[A-Z][A-Z'/]+)| PART I/

export function parseForm({ ttbId, text, images }: FormPage): ColaForm {
  const field = (caption: RegExp) => {
    const match = caption.exec(text)
    if (!match) return ''
    const rest = text.slice(match.index + match[0].length)
    const end = rest.search(NEXT_FIELD)
    return (end === -1 ? rest : rest.slice(0, end)).trim()
  }
  const issued = field(/DATE ISSUED/).match(/\d\d\/\d\d\/\d{4}/)?.[0]
  const vintage = field(/WINE VINTAGE DATE \(?IF ON LABEL\)?/i).match(/\b(19|20)\d\d\b/)?.[0]
  return {
    ttbId,
    status: text.match(/THE STATUS IS ([A-Z ]+?)\./)?.[1] ?? '',
    permit: field(/BREWER'S NO\. \(Required\)/),
    applicant: field(/IF USED ON LABEL \(Required\)/),
    brand: field(/BRAND NAME \(Required\)/),
    fanciful: field(/FANCIFUL NAME \(If any\)/),
    varietals: field(/GRAPE VARIETAL\(S\) \(Wine Only\)/),
    appellation: field(/WINE APPELLATION \(?IF ON LABEL\)?/i),
    ...(vintage ? { vintage: Number(vintage) } : {}),
    classDesc: field(/CLASS\/TYPE DESCRIPTION/).replace(/ EXPIRATION DATE.*$/, ''),
    issued: issued ? isoDate(issued) : '',
    images,
  }
}

// ttbonline.gov sends its certificate without the intermediate that signed it. Browsers and
// curl on macOS fill the gap themselves; Node does not, so fetch the intermediate from the
// address the certificate names (cached) and trust it alongside the usual roots.
const INTERMEDIATE_URL = 'http://crt.sectigo.com/EntrustOVTLSIssuingRSACA2.crt'

async function registryAgent(): Promise<Agent> {
  const path = join(CACHE_DIR, 'intermediate.pem')
  if (!existsSync(path)) {
    const response = await fetch(INTERMEDIATE_URL, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Could not fetch ${INTERMEDIATE_URL}: HTTP ${response.status}`)
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(path, new X509Certificate(Buffer.from(await response.arrayBuffer())).toString())
  }
  return new Agent({ connect: { ca: [...rootCertificates, readFileSync(path, 'utf8')] } })
}

export class Registry {
  private agent: Promise<Agent> | null = null
  private cookies = new Map<string, string>()
  private last = 0
  private failures = 0
  requests = 0

  private async wait() {
    const due = this.last + DELAY_MS - Date.now()
    if (due > 0) await new Promise((done) => setTimeout(done, due))
    this.last = Date.now()
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    this.agent ??= registryAgent()
    const dispatcher = await this.agent
    for (let attempt = 0; ; attempt++) {
      await this.wait()
      this.requests++
      let response: Response | null = null
      let failure = ''
      try {
        response = await fetch(`${BASE}/${path}`, {
          ...init,
          dispatcher,
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; oregon-wine-graph research; one request every 2 seconds)',
            cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
            ...init.headers,
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(60_000),
        })
      } catch (error) {
        // a timeout or network error, retried below
        failure = String((error as { cause?: unknown }).cause ?? error)
      }
      for (const header of response?.headers.getSetCookie() ?? []) {
        const [pair] = header.split(';')
        const at = pair.indexOf('=')
        this.cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim())
      }
      if (response && response.status < 400) {
        this.failures = 0
        return response
      }
      if (response && response.status < 500 && response.status !== 429) {
        throw new Error(`COLA registry: HTTP ${response.status} for ${path}`)
      }
      if (attempt >= 3) {
        if (++this.failures >= MAX_FAILURES_IN_A_ROW) {
          throw new Error(`COLA registry: ${this.failures} failures in a row; stopping. Last: ${path} (${failure})`)
        }
        throw new Error(`COLA registry: gave up on ${path} (${failure || `HTTP ${response?.status}`})`)
      }
      // 10 s, 20 s, 40 s
      await new Promise((done) => setTimeout(done, 10_000 * 2 ** attempt))
    }
  }

  private async text(path: string, init?: RequestInit): Promise<string> {
    const response = await this.request(path, init)
    return new TextDecoder('latin1').decode(await response.arrayBuffer())
  }

  // Approvals whose brand name matches `brand` (% is a wildcard), completed within the dates
  // (at most 15 years apart). Returns the rows and the total the registry reports, which is
  // larger than the rows when a search runs into the registry's cap.
  async search(brand: string, from: string, to: string): Promise<{ total: number; rows: ColaRow[] }> {
    // The export occasionally answers with an error page; a fresh search usually fixes it
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.searchOnce(brand, from, to)
      } catch (error) {
        if (attempt >= 1 || !String(error).includes('not the expected CSV')) throw error
      }
    }
  }

  private async searchOnce(brand: string, from: string, to: string): Promise<{ total: number; rows: ColaRow[] }> {
    await this.text('publicSearchColasBasic.do')
    const form = new URLSearchParams({
      'searchCriteria.dateCompletedFrom': usDate(from),
      'searchCriteria.dateCompletedTo': usDate(to),
      'searchCriteria.productOrFancifulName': brand,
      'searchCriteria.productNameSearchType': 'B',
      'searchCriteria.classTypeFrom': '',
      'searchCriteria.classTypeTo': '',
      'searchCriteria.originCode': '',
    })
    const page = await this.text('publicSearchColasBasicProcess.do?action=search', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    const total = Number(page.match(/Total Matching Records: (\d+)/)?.[1] ?? 0)
    if (total === 0) {
      if (/must not exceed|An error has occurred/i.test(page)) throw new Error(`COLA search rejected for ${brand} ${from} to ${to}`)
      return { total, rows: [] }
    }
    const csv = await this.text('publicSaveSearchResultsToFile.do?path=/publicSearchColasBasicProcess')
    return { total, rows: parseResultsCsv(csv) }
  }

  // The printable form, cached. Viewing it is also what lets this session load its images.
  async form(ttbId: string): Promise<ColaForm> {
    const path = join(CACHE_DIR, 'forms', `${ttbId}.json`)
    if (existsSync(path)) return parseForm(JSON.parse(readFileSync(path, 'utf8')) as FormPage)
    const page = formPage(ttbId, await this.text(`viewColaDetails.do?action=publicFormDisplay&ttbid=${ttbId}`))
    if (!page.text.includes(ttbId)) throw new Error(`COLA form ${ttbId} did not load`)
    mkdirSync(join(CACHE_DIR, 'forms'), { recursive: true })
    writeFileSync(path, JSON.stringify(page))
    return parseForm(page)
  }

  // The approval's label images already downloaded, without fetching any
  cachedImages(ttbId: string, form: ColaForm): string[] {
    return form.images
      .map((image, index) => join(CACHE_DIR, 'images', `${ttbId}_${index + 1}.${(image.filename.match(/\.(\w+)$/)?.[1] ?? 'jpg').toLowerCase()}`))
      .filter((path) => existsSync(path))
  }

  // Downloads an approval's label images, cached, and returns their local paths
  async images(ttbId: string): Promise<string[]> {
    const dir = join(CACHE_DIR, 'images')
    mkdirSync(dir, { recursive: true })
    const form = await this.form(ttbId)
    const paths = form.images.map((image, index) => {
      const extension = (image.filename.match(/\.(\w+)$/)?.[1] ?? 'jpg').toLowerCase()
      return join(dir, `${ttbId}_${index + 1}.${extension}`)
    })
    if (paths.every((path) => existsSync(path))) return paths
    // The registry serves images only to a session that has just opened their form
    await this.text(`viewColaDetails.do?action=publicFormDisplay&ttbid=${ttbId}`)
    for (const [index, image] of form.images.entries()) {
      if (existsSync(paths[index])) continue
      const query = new URLSearchParams({ filename: image.filename, filetype: 'l' })
      const response = await this.request(`publicViewAttachment.do?${query}`)
      const type = response.headers.get('content-type') ?? ''
      if (!type.startsWith('image/')) throw new Error(`COLA image for ${ttbId} came back as ${type}`)
      writeFileSync(paths[index], Buffer.from(await response.arrayBuffer()))
    }
    return paths
  }
}
