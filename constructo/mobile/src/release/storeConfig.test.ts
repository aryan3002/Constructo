/// <reference types="node" />
// Store-release settings in app.json / eas.json that App Store and Google Play
// review depend on. A regression here only shows up at submission time.
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..', '..')
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo

describe('app.json', () => {
  it('ships phone-only on iOS (no iPad review or screenshots)', () => {
    expect(appJson.ios.supportsTablet).toBe(false)
  })
})

const easJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'))

describe('eas.json', () => {
  it('numbers builds remotely and bumps them for every store build', () => {
    // With appVersionSource "remote", a second upload with the same build
    // number is rejected unless EAS increments it.
    expect(easJson.cli.appVersionSource).toBe('remote')
    for (const name of ['production', 'production-apk']) {
      expect(easJson.build[name].autoIncrement).toBe(true)
    }
  })

  it('points invite and vendor-confirm links at the web console', () => {
    // Unset, WEB_BASE falls back to the API host, where /join and
    // /vendor-confirm 404.
    for (const name of ['preview', 'production', 'production-apk']) {
      expect(easJson.build[name].env.EXPO_PUBLIC_WEB_BASE).toBe('https://constructo-topaz.vercel.app')
    }
  })
})
