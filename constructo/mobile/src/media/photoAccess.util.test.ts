import { photoSaveMode, pickerNeedsLibraryPermission } from './photoAccess.util'

describe('pickerNeedsLibraryPermission', () => {
  it('opens the Android system picker without asking', () => {
    expect(pickerNeedsLibraryPermission('android')).toBe(false)
  })
  it('keeps the iOS prompt', () => {
    expect(pickerNeedsLibraryPermission('ios')).toBe(true)
  })
})

describe('photoSaveMode', () => {
  it('saves straight to the gallery on Android 13 and up', () => {
    expect(photoSaveMode('android', 33)).toBe('library')
    expect(photoSaveMode('android', 36)).toBe('library')
  })
  it('hands older Android to the share sheet (no storage permission)', () => {
    expect(photoSaveMode('android', 32)).toBe('share')
    expect(photoSaveMode('android', 29)).toBe('share')
  })
  it('saves on iOS', () => {
    expect(photoSaveMode('ios', '18.0')).toBe('library')
  })
})
