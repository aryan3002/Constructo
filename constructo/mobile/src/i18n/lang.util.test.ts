import { resolveSignInLanguage } from './lang.util'

describe('resolveSignInLanguage', () => {
  it('a reinstall opens in the language saved on the server', () => {
    expect(resolveSignInLanguage({ local: 'en', server: 'hi', unsynced: false })).toEqual({
      apply: 'hi',
      push: null,
    })
  })

  it('a choice made while signed out is saved, not overwritten', () => {
    expect(resolveSignInLanguage({ local: 'hi', server: 'en', unsynced: true })).toEqual({
      apply: null,
      push: 'hi',
    })
  })

  it('nothing to do when they agree', () => {
    expect(resolveSignInLanguage({ local: 'hi', server: 'hi', unsynced: false })).toEqual({
      apply: null,
      push: null,
    })
    expect(resolveSignInLanguage({ local: 'hi', server: 'hi', unsynced: true })).toEqual({
      apply: null,
      push: null,
    })
  })

  it('keeps the local language when the server has none', () => {
    expect(resolveSignInLanguage({ local: 'hi', server: null, unsynced: false })).toEqual({
      apply: null,
      push: null,
    })
  })
})
