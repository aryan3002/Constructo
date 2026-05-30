/**
 * SyncStatus — the visible offline/sync indicator driven by {@link useOutbox}.
 * Shows "Offline", "Syncing…", "N waiting", or stays quiet when caught up.
 */
import { View } from 'react-native'

import { useT } from '../i18n/I18nProvider'
import { useOutbox } from '../offline/useOutbox'
import { useTheme } from '../theme/ThemeProvider'
import { SPACE, STATUS } from '../theme/tokens'
import { Micro } from './Typography'

export function SyncStatus() {
  const { t } = useT()
  const { online, state, pending } = useOutbox()

  let label = ''
  let color: string = STATUS.ok
  if (!online) {
    label = t('common.offline')
    color = STATUS.warn
  } else if (state === 'syncing') {
    label = t('common.syncing')
    color = STATUS.info
  } else if (pending > 0) {
    label = t('common.pendingChanges', { count: pending })
    color = STATUS.info
  }

  if (!label) return null

  const { theme } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        backgroundColor: theme.colors.paper,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.line,
        paddingVertical: SPACE.xs,
        paddingHorizontal: SPACE.lg,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Micro muted>{label}</Micro>
    </View>
  )
}
