import { describe, expect, it } from 'vitest'
import { chooseLabels, type LabelBox } from './labelGrid'

const view = { left: 0, top: 0, width: 800, height: 600 }
const label = (id: string, x: number, y: number, priority: number, always = false): LabelBox => ({
  id,
  x,
  y,
  radius: 8,
  width: 100,
  height: 14,
  priority,
  always,
})

describe('choosing which names to show, and where', () => {
  it('names a hub below its record, and moves a neighbouring name to another side', () => {
    const chosen = chooseLabels([label('minor', 100, 104, 2), label('hub', 100, 100, 20)], view)
    expect(chosen.get('hub')).toBe('below')
    expect(chosen.get('minor')).toBe('above')
  })

  it('leaves out a name that fits on no side', () => {
    const crowd = [label('hub', 300, 300, 9), label('n', 300, 260, 8), label('s', 300, 340, 8), label('e', 420, 300, 8), label('w', 180, 300, 8)]
    const chosen = chooseLabels([...crowd, label('minor', 300, 302, 1)], view)
    expect(chosen.has('minor')).toBe(false)
    expect(chosen.size).toBe(5)
  })

  it('always names the selection and its neighbours, ahead of any hub', () => {
    const chosen = chooseLabels([label('hub', 100, 100, 50), label('neighbour', 100, 100, 1, true)], view)
    expect(chosen.get('neighbour')).toBe('below')
    expect(chosen.get('hub')).toBe('above')
  })

  it('skips names not wholly in view, which take no room from those that are', () => {
    const chosen = chooseLabels([label('off', -300, 100, 99), label('on', 100, 100, 1)], view)
    expect([...chosen.keys()]).toEqual(['on'])
    // Behind a sidebar counts as out of view
    expect(chooseLabels([label('behind', 100, 100, 1)], { ...view, left: 400 }).size).toBe(0)
  })

  it("keeps names off other records' icons", () => {
    const chosen = chooseLabels([label('a', 100, 100, 1)], view, [{ x: 100, y: 125, radius: 20 }])
    expect(chosen.get('a')).toBe('above')
  })
})
