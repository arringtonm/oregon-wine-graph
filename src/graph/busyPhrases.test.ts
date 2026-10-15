import { describe, expect, it } from 'vitest'
import { BUSY_PHRASES, pickBusyPhrase, pickInvite, RANDOM_INVITES } from './busyPhrases'

describe('busy phrases', () => {
  it('picks one of the phrases', () => {
    expect(BUSY_PHRASES).toContain(pickBusyPhrase())
    expect(pickBusyPhrase(undefined, () => 0)).toBe('Uncorking')
    expect(pickBusyPhrase(undefined, () => 0.999)).toBe(BUSY_PHRASES.at(-1))
  })

  it('picks the random button’s label the same way', () => {
    expect(RANDOM_INVITES).toContain(pickInvite())
    for (let i = 0; i < 50; i++) expect(pickInvite('Mystery Pour')).not.toBe('Mystery Pour')
  })

  it('never repeats the one just shown', () => {
    expect(pickBusyPhrase('Uncorking', () => 0)).toBe('Decanting')
    for (let i = 0; i < 50; i++) expect(pickBusyPhrase('Swirling')).not.toBe('Swirling')
  })
})
