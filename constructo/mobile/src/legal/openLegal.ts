import { Linking } from 'react-native'

import { PRIVACY_URL, TERMS_URL } from '../api/config'
import { getActiveLang } from '../i18n/activeLang'
import { en } from '../i18n/en'
import { hi } from '../i18n/hi'
import { showToast } from '../ui/toastBus'
import { legalLinks, type LegalKey } from './legal.util'

export const LEGAL_LINKS = legalLinks({ privacyUrl: PRIVACY_URL, termsUrl: TERMS_URL })

/** Open the privacy policy or terms in the browser. */
export async function openLegal(key: LegalKey): Promise<void> {
  const link = LEGAL_LINKS.find((l) => l.key === key)
  if (!link) return
  try {
    await Linking.openURL(link.url)
  } catch {
    const bundle = getActiveLang() === 'hi' ? hi : en
    showToast(bundle.legal.couldNotOpen, { tone: 'error' })
  }
}
