// Indian mobile helpers shared by the signed-out screens. Pure; mirrors
// `mobile/src/auth/auth.util.ts` so both clients accept and send the same
// shapes: the user types 10 digits, the API receives E.164 (`+91XXXXXXXXXX`).

/** Keep digits only; drop a leading `91` / `0` when more than 10 digits were pasted. */
export function digitsOnly(s: string): string {
  let d = s.replace(/\D+/g, '')
  if (d.length > 10) {
    if (d.startsWith('91')) d = d.slice(2)
    else if (d.startsWith('0')) d = d.replace(/^0+/, '')
  }
  return d
}

/** `'9876543210'` → `'98765 43210'` (groups as you type). */
export function formatIndianMobile(digits: string): string {
  const d = digits.replace(/\D+/g, '').slice(0, 10)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)} ${d.slice(5)}`
}

/** Exactly 10 digits, first digit 6–9 (Indian mobile numbering plan). */
export function isValidIndianMobile(digits: string): boolean {
  return /^[6-9]\d{9}$/.test(digits)
}

/** `'9876543210'` → `'+919876543210'`. */
export function toE164(digits: string): string {
  return `+91${digits}`
}

/** `'+919876543210'` → `'+91 98765 43210'`; non-Indian input passes through. */
export function maskPhone(e164: string): string {
  const d = e164.replace(/\D+/g, '')
  const local = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 10 ? d : null
  if (!local) return e164
  return `+91 ${formatIndianMobile(local)}`
}
