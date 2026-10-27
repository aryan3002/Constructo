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

// S8: Play's Photo and Video Permissions policy. The app picks photos with the
// system picker (no permission) and saves write-only, so none of these ship.
const BLOCKED_MEDIA_PERMISSIONS = [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  'android.permission.ACCESS_MEDIA_LOCATION',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]

describe('Android media permissions', () => {
  it('asks for none of them and blocks them all', () => {
    for (const p of BLOCKED_MEDIA_PERMISSIONS) {
      expect(appJson.android.permissions).not.toContain(p)
      expect(appJson.android.blockedPermissions).toContain(p)
    }
  })

  it('does not ask for media location', () => {
    const plugin = appJson.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-media-library',
    )
    expect(plugin[1].isAccessMediaLocationEnabled).toBe(false)
  })

  it('stays blocked after every config plugin has run', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getPrebuildConfigAsync } = require('@expo/prebuild-config')
    const { exp } = await getPrebuildConfigAsync(ROOT, { platforms: ['android'] })
    for (const p of BLOCKED_MEDIA_PERMISSIONS) {
      expect(exp.android.permissions ?? []).not.toContain(p)
      expect(exp.android.blockedPermissions).toContain(p)
    }
  }, 30000)
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
