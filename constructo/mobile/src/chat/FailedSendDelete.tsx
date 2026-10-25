/**
 * The "Delete" link under a failed (parked) pending bubble — sits beside the
 * bubble's own tap-to-retry so a message that will never send can be dropped
 * from the outbox instead of lingering forever.
 */
import { Pressable } from 'react-native'

import { useT } from '../i18n/I18nProvider'
import { SPACE } from '../theme/tokens'
import { Small } from '../ui'

export function FailedSendDelete({ onPress }: { onPress: () => void }) {
  const { t } = useT()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={12}
      style={{ alignSelf: 'flex-end', paddingHorizontal: SPACE.gutter, marginTop: -SPACE.sm, marginBottom: SPACE.md }}
    >
      <Small muted>{t('common.delete')}</Small>
    </Pressable>
  )
}
