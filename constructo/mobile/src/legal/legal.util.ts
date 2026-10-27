/** The privacy policy and terms links (S7), from the build config. */
export type LegalKey = 'privacy' | 'terms'

export interface LegalLink {
  key: LegalKey
  /** i18n path of the link label. */
  labelKey: `legal.${LegalKey}`
  url: string
}

/** Links to show, in order; an unconfigured URL is left out (a release build
 *  without them never starts — see config.util.ts). */
export function legalLinks(urls: { privacyUrl: string; termsUrl: string }): LegalLink[] {
  const all: LegalLink[] = [
    { key: 'privacy', labelKey: 'legal.privacy', url: urls.privacyUrl },
    { key: 'terms', labelKey: 'legal.terms', url: urls.termsUrl },
  ]
  return all.filter((l) => /^https?:\/\//.test(l.url))
}
