import { describe, expect, it } from 'vitest'
import type { GraphNode } from '../../src/data/schema'
import { parsePage } from './owha'
import { displayTitle, sourceTitle } from './owhaLink'
import { candidatesFor, peopleInTitle } from './owhaMatch'

// Trimmed copies of the archive's page markup
const interview = {
  link: 'https://oregonwinehistoryarchive.org/interviews/ken-wright/',
  title: { rendered: 'KEN WRIGHT' },
  content: {
    rendered: `<iframe src="https://www.youtube.com/embed/nnVDg3uKbyk?feature=oembed"></iframe>
<p><strong>Interviewer</strong></p><p>Miglavs, Janis</p>
<p><strong>Transcript</strong></p><p><a href="https://www.dropbox.com/s/4on2nx8g3765oz6/Ken%20Wright%20FULL.pdf?dl=0">Full transcript</a></p>
<p><strong>Duration</strong></p><p>37 minutes</p>
<p><strong>Date</strong></p><p>August 27, 2007</p>
<p><strong>Interview Summary</strong></p>
<p>This interview is with Ken Wright, founder of Ken Wright Cellars in Carlton, Oregon, established in 1994.</p>
<p><strong>Rights</strong></p><p>Linfield University</p>`,
  },
}

const collection = {
  link: 'https://oregonwinehistoryarchive.org/regions/willamette-valley/abbey-ridge-vineyard-collection/',
  title: { rendered: 'ABBEY RIDGE VINEYARD COLLECTION' },
  content: {
    rendered: `<iframe src="https://www.youtube.com/embed/AbCdEf12345"></iframe>
<p>This interview is with Bill and Julia Wayne of Abbey Ridge Vineyard. It was conducted by Rich Schmidt on July 13, 2023.</p>`,
  },
}

describe('parsePage', () => {
  it('reads an interview page’s labelled fields', () => {
    const page = parsePage(interview)
    expect(page).toMatchObject({
      kind: 'interview',
      title: 'KEN WRIGHT',
      interviewer: 'Janis Miglavs',
      date: '2007-08-27',
      minutes: 37,
      videoUrl: 'https://www.youtube.com/watch?v=nnVDg3uKbyk',
    })
    expect(page.transcriptUrl).toContain('dropbox.com')
    expect(page.summary).toMatch(/^This interview is with Ken Wright/)
    expect(page.summary).not.toContain('Linfield University')
  })

  it('reads a collection page, taking its date from the summary', () => {
    const page = parsePage(collection)
    expect(page).toMatchObject({ kind: 'collection', region: 'willamette-valley', date: '2023-07-13' })
    expect(page.summary).toMatch(/^This interview is with Bill and Julia Wayne/)
  })
})

describe('matching pages to nodes', () => {
  const node = (id: string, type: GraphNode['type'], name: string, aka?: string[]) =>
    ({ id, type, name, aka, summary: '', sources: [], verified: false }) as unknown as GraphNode
  const nodes = [
    node('ken-wright', 'person', 'Ken Wright'),
    node('ken-wright-cellars', 'winery', 'Ken Wright Cellars'),
    node('abbey-ridge-vineyard', 'vineyard', 'Abbey Ridge Vineyard'),
    node('michael-wisnovsky', 'person', 'Michael Wisnovsky', ['Mike Wisnovsky']),
    node('mark-wisnovsky', 'person', 'Mark Wisnovsky'),
  ]

  it('splits joint interview titles into full names', () => {
    expect(peopleInTitle('MARK AND MIKE WISNOVSKY')).toEqual(['mark wisnovsky', 'mike wisnovsky'])
    expect(peopleInTitle('BILL FULLER 2')).toEqual(['bill fuller'])
  })

  it('matches an interview to its person and a collection to its place', () => {
    expect(candidatesFor(parsePage(interview), nodes).map((n) => n.id)).toEqual(['ken-wright'])
    expect(candidatesFor(parsePage(collection), nodes).map((n) => n.id)).toEqual(['abbey-ridge-vineyard'])
    const joint = { ...parsePage(interview), title: 'MARK & MIKE WISNOVSKY' }
    expect(candidatesFor(joint, nodes).map((n) => n.id).sort()).toEqual(['mark-wisnovsky', 'michael-wisnovsky'])
  })

  it('matches nothing for someone absent from the graph', () => {
    expect(candidatesFor({ ...parsePage(interview), title: 'BRIANA SEELEY' }, nodes)).toEqual([])
  })
})

describe('archive source titles', () => {
  it('reads naturally', () => {
    expect(displayTitle('ABBEY RIDGE VINEYARD COLLECTION')).toBe('Abbey Ridge Vineyard collection')
    expect(sourceTitle(parsePage(interview))).toBe('Oral history interview with Ken Wright, 2007 (Oregon Wine History Archive)')
  })
})
