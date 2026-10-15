import { describe, expect, it } from 'vitest'
import { consoleGreeting } from './consoleGreeting'

describe('the console greeting', () => {
  const message = consoleGreeting('v1.02')

  it('says hello with the version and the website', () => {
    expect(message).toContain('🥂 Oregon Wine Graph v1.02')
    expect(message).toContain('https://www.arrington.tech')
  })

  it('is plain text, without styling', () => {
    expect(message).not.toContain('%c')
  })

  it('writes the email address out rather than whole', () => {
    expect(message).toContain('michael [at] maple [dot] casa')
    expect(message).not.toMatch(/\S+@\S+/)
  })
})
