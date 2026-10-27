/// <reference types="node" />
import fs from 'fs'
import path from 'path'

import { en } from '../i18n/en'
import { hi } from '../i18n/hi'
import {
  accountExitHref,
  deleteConfirmMessageKey,
  languageNameKey,
  otherLanguage,
} from './account.util'

const APP = path.join(__dirname, '..', '..', 'app')

// Every role's account screen (App Store 5.1.1(v): deletion for every account type).
const ROLE_ACCOUNT_SCREENS = {
  owner: '(contractor)/owner/more.tsx',
  homeowner: '(homeowner)/settings.tsx',
  supervisor: '(contractor)/supervisor/profile.tsx',
  architect: '(contractor)/architect/profile.tsx',
  accountant: '(contractor)/accountant/more.tsx',
  pm: '(contractor)/pm/more.tsx',
  labor_contractor: '(contractor)/mukadam/help.tsx',
}

function lookup(bundle: object, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], bundle)
}

describe('Account section in every role', () => {
  it.each(Object.entries(ROLE_ACCOUNT_SCREENS))('%s renders the shared section', (_role, file) => {
    const src = fs.readFileSync(path.join(APP, file), 'utf8')
    expect(src).toMatch(/<AccountSection\b/)
    // No hand-rolled delete or sign-out next to it.
    expect(src).not.toMatch(/useDeleteAccount|signOut\(\)/)
  })
})

describe('account rules', () => {
  it('sends a homeowner to the front door and staff to the staff sign-in', () => {
    expect(accountExitHref('homeowner')).toBe('/')
    expect(accountExitHref('supervisor')).toBe('/(auth)/login')
    expect(accountExitHref(null)).toBe('/(auth)/login')
  })

  it('names the household or the team as the keeper of shared records', () => {
    expect(deleteConfirmMessageKey('homeowner')).toBe('account.deleteAccountConfirmMsgHome')
    expect(deleteConfirmMessageKey('pm')).toBe('account.deleteAccountConfirmMsg')
  })

  it('toggles between English and Hindi', () => {
    expect(otherLanguage('en')).toBe('hi')
    expect(otherLanguage('hi')).toBe('en')
  })

  it('has English and Hindi text for every string the section shows', () => {
    const keys = [
      'account.accountSection',
      'account.language',
      'account.opensInBrowser',
      'account.signOut',
      'account.deleteAccount',
      'account.deleteAccountConfirmTitle',
      'account.deleteAccountConfirmOk',
      'account.deleteAccountConfirmCancel',
      deleteConfirmMessageKey('homeowner'),
      deleteConfirmMessageKey('owner'),
      languageNameKey('en'),
      languageNameKey('hi'),
      'legal.privacy',
      'legal.terms',
    ]
    for (const k of keys) {
      expect(typeof lookup(en, k)).toBe('string')
      expect(typeof lookup(hi, k)).toBe('string')
    }
  })
})
