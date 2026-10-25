/**
 * Single source of truth for the storage policy shared between storage.tsx,
 * photos.tsx, and settings.tsx. Import from here — never hard-code the key
 * string or duplicate the type/default in individual screens.
 */

/** The AsyncStorage key for the persisted photo policy object. */
export const POLICY_KEY = 'constructo.photoPolicy'

/** Union of allowed retention window values. */
export type RetentionDays = 7 | 30 | 90 | 'all'

/**
 * The full shape written/read by the Storage screen and read (partially) by
 * Photos and Settings. `Partial<PhotoPolicy>` is fine when reading — screens
 * that only need one field can skip the rest.
 */
export interface PhotoPolicy {
  keepStarredAndMilestone: boolean
  retentionDays: RetentionDays
  /** Auto-manage (evict old cached photos automatically). */
  autoManage: boolean
  /** Always keep specific categories on device regardless of retention. */
  alwaysKeep: {
    pinned: boolean
    milestone: boolean
    shared: boolean
  }
}

export const DEFAULT_POLICY: PhotoPolicy = {
  keepStarredAndMilestone: true,
  retentionDays: 30,
  autoManage: true,
  alwaysKeep: { pinned: true, milestone: true, shared: false },
}
