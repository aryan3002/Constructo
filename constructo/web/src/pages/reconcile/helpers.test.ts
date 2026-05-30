import { describe, expect, it } from 'vitest'
import {
  RECONCILE_STATUS,
  compareStatus,
  formatInr,
  formatQty,
  isException,
  reasonKey,
  statusKey,
} from './helpers'

describe('reconcile helpers', () => {
  it('maps status onto the kit spine', () => {
    expect(RECONCILE_STATUS.matched).toBe('ok')
    expect(RECONCILE_STATUS.mismatch).toBe('warn')
    expect(RECONCILE_STATUS.missing_proof).toBe('info')
    expect(RECONCILE_STATUS.needs_approval).toBe('risk')
  })

  it('builds namespaced i18n keys', () => {
    expect(statusKey('needs_approval')).toBe('reconcile.status.needs_approval')
    expect(reasonKey('no_invoice')).toBe('reconcile.reason.no_invoice')
  })

  it('flags exceptions', () => {
    expect(isException('needs_approval')).toBe(true)
    expect(isException('mismatch')).toBe(true)
    expect(isException('matched')).toBe(false)
    expect(isException('missing_proof')).toBe(false)
  })

  it('orders worst-first', () => {
    expect(compareStatus('needs_approval', 'matched')).toBeLessThan(0)
    expect(compareStatus('matched', 'mismatch')).toBeGreaterThan(0)
  })

  it('formats INR with Indian grouping', () => {
    expect(formatInr(0)).toBe('₹0')
    expect(formatInr(999)).toBe('₹999')
    expect(formatInr(1000)).toBe('₹1,000')
    expect(formatInr(100000)).toBe('₹1,00,000')
    expect(formatInr(2500000)).toBe('₹25,00,000')
    expect(formatInr(20000.4)).toBe('₹20,000')
  })

  it('formats quantity + unit', () => {
    expect(formatQty(100, 'bag')).toBe('100 bag')
    expect(formatQty(5)).toBe('5')
    expect(formatQty(null)).toBe('—')
  })
})
