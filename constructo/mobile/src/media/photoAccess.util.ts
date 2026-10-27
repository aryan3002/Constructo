/**
 * Which photo permissions the app actually needs (S8). The app blocks every
 * broad Android media/storage permission (see app.json `blockedPermissions`):
 * picking goes through the system photo picker, which needs none, and saving
 * asks for write-only access.
 */

/** Android's system photo picker needs no permission. Asking anyway would
 *  request the blocked storage permissions on Android 12 and below and come
 *  back denied, so the picker would never open. iOS keeps its prompt. */
export function pickerNeedsLibraryPermission(os: string): boolean {
  return os !== 'android'
}

/** How "Save photo" reaches the gallery. Android 13+ (API 33) saves without
 *  any permission; older Android needs WRITE_EXTERNAL_STORAGE, which the app
 *  no longer holds, so it hands the photo to the share sheet instead. */
export function photoSaveMode(os: string, version: string | number): 'library' | 'share' {
  if (os !== 'android') return 'library'
  return Number(version) >= 33 ? 'library' : 'share'
}
