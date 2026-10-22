import { describe, expect, it } from 'vitest'
import { avaIdFor, avasAt, contains, loadBoundaries } from './boundaries'
import { findAddresses, guessSites, ownSites } from './locate'
import { labelPoint, simplifyRing } from './mapAvas'
import { listingAddress, matchListings } from './directory'
import { formatStreet, nameCore, parsePermits } from './permits'
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

describe('AVA outlines for the map', () => {
  it('drops points that lie on a straight edge, keeping the ring closed', () => {
    const square: [number, number][] = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5], [0, 0]]
    const simplified = simplifyRing(square, 0.001)
    expect(simplified).toEqual([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]])
  })

  it('names each AVA at a point inside it', () => {
    for (const boundary of boundaries) {
      const [lng, lat] = labelPoint(boundary)
      expect(contains(boundary, lat, lng), boundary.id).toBe(true)
    }
  })
})

describe('Tasting Room Directory', () => {
  it('builds a street address from the listing, or from its one-line address', () => {
    expect(listingAddress({ street_number: '17940', street_name_short: 'NE Kings Grade', city: 'Newberg', state_short: 'OR', post_code: '97132' })).toBe(
      '17940 NE Kings Grade, Newberg, OR 97132',
    )
    expect(listingAddress({ address: '6750 NE Breyman Orchards Rd, Dayton, OR 97114, USA' })).toBe('6750 NE Breyman Orchards Rd, Dayton, OR 97114')
    expect(listingAddress({ address: '173 Northeast 3rd Avenue, Hillsboro, OR, USA', post_code: '97124' })).toBe('173 Northeast 3rd Avenue, Hillsboro, OR 97124')
    // A town or a plus code alone is no address to cite
    expect(listingAddress({ address: 'Newberg, Oregon, USA' })).toBeNull()
    expect(listingAddress({ address: '27FW+9R Scotts Mills, OR, USA' })).toBeNull()
  })

  it('matches wineries by distinctive name, and never a name two wineries share', () => {
    const winery = (id: string, name: string, place?: string) =>
      ({ id, type: 'winery', name, summary: '-', sources: [{ title: '-' }], verified: false, place }) as GraphNode
    const listing = (name: string, address: string) => ({ name, url: `https://example.org/${name}`, website: '', address, pin: null, visits: '' })
    const matches = matchListings(
      [winery('drouhin', 'Domaine Drouhin Oregon'), winery('a', 'Twin Cellars'), winery('b', 'Twin Wines')],
      [listing('Domaine Drouhin', '6750 NE Breyman Orchards Rd, Dayton, OR 97114'), listing('Twin Winery', '1 Main St, Amity, OR 97101')],
    )
    expect(matches.map((match) => [match.node.id, 'listing' in match && match.listing.name])).toEqual([['drouhin', 'Domaine Drouhin']])
  })
})

describe('TTB permits', () => {
  it('reads Oregon rows, quoted commas and all, and tidies the street', () => {
    const csv =
      '﻿"Permit_Number","Owner_Name","Operating_Name","Street","City","State","Prem_Zip","Prem_County","Industry_Type","New_Permit_Flag"\n' +
      '"OR-W-547","GREG SANDERS, LLC","WHITE ROSE WINES","6250 NE HILLTOP LN","DAYTON","OR",97114,"YAMHILL","Wine Producer",0\n' +
      '"WA-W-1","X","Y","1 MAIN ST","SEATTLE","WA",98101,,"Wine Producer",0\n'
    const permits = parsePermits(csv)
    expect(permits).toEqual([{ permit: 'OR-W-547', owner: 'GREG SANDERS, LLC', operating: 'WHITE ROSE WINES', street: '6250 NE HILLTOP LN', city: 'DAYTON', zip: '97114' }])
    expect(nameCore(permits[0].operating)).toBe('white rose')
    expect(formatStreet('6750 NE BREYMAN ORCHARDS RD')).toBe('6750 NE Breyman Orchards Rd')
  })
})
