/**
 * Pure helpers for the Permits screen (Slice E).
 *
 * Exported here so they can be unit-tested without rendering React components.
 *
 * Rules (Neev design law):
 *   - Status is NEVER color alone — every pill carries shape + label.
 *   - "Expiring soon" = approved + expiry_on within 30 calendar days from today.
 *   - Sort order: worst-urgency first (rejected / expired → expiring-soon
 *     approved → under_review / applied → not_started → approved-safe).
 */
import type { Status } from '../theme/tokens'
import type { Permit, PermitStatus } from '../api/permits'

// ============================================================================
// StatusPill mapping
// ============================================================================

export interface PermitPillConfig {
  status: Status
  label: string
  labelHi: string
}

/**
 * Maps a PermitStatus (and the optional "expiring soon" flag) onto the Neev
 * StatusPill config (status token + human label, bilingual).
 *
 * The "expiring soon" rule overrides 'approved' when expiry_on ≤ 30 days out.
 * Call `isExpiringSoon()` first, then pass the result here.
 */
export function permitPillConfig(
  permitStatus: PermitStatus,
  expiringSoon = false,
): PermitPillConfig {
  // Expiring-soon override: approved but with an imminent expiry.
  if (permitStatus === 'approved' && expiringSoon) {
    return { status: 'warn', label: 'Expiring soon', labelHi: 'जल्द समाप्त' }
  }

  switch (permitStatus) {
    case 'approved':
      return { status: 'ok', label: 'Approved', labelHi: 'मंज़ूर' }
    case 'under_review':
      return { status: 'info', label: 'Under review', labelHi: 'समीक्षाधीन' }
    case 'applied':
      return { status: 'info', label: 'Applied', labelHi: 'आवेदित' }
    case 'not_started':
      return { status: 'quiet', label: 'Not started', labelHi: 'शुरू नहीं' }
    case 'rejected':
      return { status: 'risk', label: 'Rejected', labelHi: 'अस्वीकृत' }
    case 'expired':
      return { status: 'risk', label: 'Expired', labelHi: 'समाप्त' }
    default:
      return { status: 'quiet', label: 'Not started', labelHi: 'शुरू नहीं' }
  }
}

// ============================================================================
// Expiry helper
// ============================================================================

/** Returns true when a permit is approved and its expiry_on is within 30 days. */
export function isExpiringSoon(permit: Permit, today: Date = new Date()): boolean {
  if (permit.status !== 'approved') return false
  if (!permit.expiry_on) return false
  const expiry = new Date(permit.expiry_on)
  if (Number.isNaN(expiry.getTime())) return false
  const msIn30Days = 30 * 24 * 60 * 60 * 1000
  return expiry.getTime() - today.getTime() <= msIn30Days
}

// ============================================================================
// Sort order (worst/most-urgent first)
// ============================================================================

type UrgencyTier = 0 | 1 | 2 | 3 | 4

/**
 * Returns a numeric urgency tier for sorting (lower = more urgent = shown first).
 *
 *   0 = rejected | expired                (action needed immediately)
 *   1 = approved + expiring soon          (attention needed soon)
 *   2 = under_review | applied            (in-flight, watch)
 *   3 = not_started                       (todo)
 *   4 = approved (safe)                   (all good)
 */
export function permitUrgency(permit: Permit, today: Date = new Date()): UrgencyTier {
  if (permit.status === 'rejected' || permit.status === 'expired') return 0
  if (permit.status === 'approved' && isExpiringSoon(permit, today)) return 1
  if (permit.status === 'under_review' || permit.status === 'applied') return 2
  if (permit.status === 'not_started') return 3
  return 4 // approved + safe
}

/** Sort comparator: worst-urgency first, then by permit_type alphabetically. */
export function sortPermits(permits: Permit[], today: Date = new Date()): Permit[] {
  return [...permits].sort((a, b) => {
    const ua = permitUrgency(a, today)
    const ub = permitUrgency(b, today)
    if (ua !== ub) return ua - ub
    return a.permit_type.localeCompare(b.permit_type)
  })
}

// ============================================================================
// Key date helper (what date to surface prominently on a permit card)
// ============================================================================

/**
 * Returns the most-relevant date string for a permit card (ISO date string).
 * Priority: expiry_on (if approved or expiring-soon) → expected_on → decided_on → applied_on
 */
export function permitKeyDate(permit: Permit): string | null {
  if (permit.status === 'approved' || isExpiringSoon(permit)) return permit.expiry_on ?? null
  if (permit.expected_on) return permit.expected_on
  if (permit.decided_on) return permit.decided_on
  return permit.applied_on ?? null
}
