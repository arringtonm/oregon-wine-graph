import { describe, expect, it } from 'vitest'
import { avaIdFor, avasAt, contains, loadBoundaries } from './boundaries'
import { findAddresses, guessSites, ownSites } from './locate'
import type { GraphNode } from '../../src/data/schema'

const boundaries = await loadBoundaries()

describe('AVA boundaries', () => {
  it('maps official names onto graph ids', () => {
    expect(avaIdFor('The Rocks District of Milton-Freewater')).toBe('rocks-district-of-milton-freewater')
    expect(avaIdFor('Red Hill Douglas County, Oregon')).toBe('red-hill-douglas-county')
    expect(avaIdFor('Eola-Amity Hills')).toBe('eola-amity-hills')
    expect(avaIdFor('Southern Oregon')).toBe('southern-oregon')
    expect(avaIdFor('Elkton Oregon')).toBe('elkton-oregon')
  })

  it('places a Dundee Hills address inside Dundee Hills and Willamette Valley, most specific first', () => {
    // Sokol Blosser, 5000 NE Sokol Blosser Lane, Dayton
    const ids = avasAt(boundaries, 45.25013, -123.048).map((ava) => ava.id)
    expect(ids[0]).toBe('dundee-hills')
    expect(ids).toContain('willamette-valley')
    expect(ids).not.toContain('eola-amity-hills')
  })

  it('places a Roseburg address in the Umpqua Valley and not in the Willamette Valley', () => {
    const ids = avasAt(boundaries, 43.12487, -123.45112).map((ava) => ava.id)
    expect(ids).toContain('umpqua-valley')
    expect(ids).toContain('southern-oregon')
    expect(ids).not.toContain('willamette-valley')
  })

  it('finds no AVA in Bend, east of the Cascades', () => {
    expect(avasAt(boundaries, 44.0582, -121.3153)).toEqual([])
    const willamette = boundaries.find((ava) => ava.id === 'willamette-valley')!
    expect(contains(willamette, 44.0582, -121.3153)).toBe(false)
  })
})

describe('locating addresses', () => {
  it('reads street addresses and ignores times, years and phone numbers', () => {
    const text =
      'Open daily 11:00 AM - 5:00 PM 12550 NE Worden Hill Rd Newberg, OR 97132. Est 1978 Alloro Vineyard 22185 SW Lebeau Road Sherwood, OR 97140. Call 503 555 1212.'
    expect(findAddresses(text, 'x').map((candidate) => candidate.address)).toEqual([
      '12550 NE Worden Hill Rd Newberg, OR 97132',
      '22185 SW Lebeau Road Sherwood, OR 97140',
    ])
  })

  const node = (name: string, urls: string[]) =>
    ({ id: 'x', type: 'winery', name, summary: 's', verified: false, sources: urls.map((url) => ({ title: 't', url })) }) as GraphNode

  it("recognises a business's own site among its sources", () => {
    expect(ownSites(node('Sokol Blosser Winery', ['https://www.sokolblosser.com/about', 'https://en.wikipedia.org/wiki/X']))).toEqual([
      'https://www.sokolblosser.com',
    ])
    expect(ownSites(node('The Eyrie Vineyards', ['https://www.princeofpinot.com/article/1']))).toEqual([])
  })

  it('guesses the usual domain patterns', () => {
    expect(guessSites(node('Big Table Farm', []))).toContain('https://www.bigtablefarmwines.com')
    expect(guessSites(node("Winter's Hill Estate", []))[0]).toBe('https://www.wintershill.com')
  })
})
