/**
 * AuthError — the one way an auth screen reports a problem: an icon, a plain
 * sentence, and (when there is one) the next step as a real button. Never
 * colour-only; never raw backend text (see `mapAuthError`).
 */
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { useAuthLinkColor } from './useAuthLinkColor'
import { SPACE, TAP } from '../../theme/tokens'
import { Body, BodyStrong } from '../../ui'
import type { AuthErrorAction, AuthErrorView } from '../auth.util'

export function AuthError({
  view,
  onAction,
}: {
  view: AuthErrorView | null
  onAction?: (action: AuthErrorAction) => void
}) {
  const { t } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const link = useAuthLinkColor()
  if (!view) return null
  // `retry` is implicit (the form is still there) — only offer explicit steps.
  const action = view.action && view.action !== 'retry' ? view.action : null
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        gap: SPACE.md,
        alignItems: 'flex-start',
        padding: SPACE.md,
        borderRadius: theme.radii.card,
        borderWidth: 1,
        borderColor: c.risk,
        backgroundColor: c.card,
      }}
    >
      <Feather name="alert-circle" size={20} color={c.risk} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: SPACE.sm }}>
        <Body>{view.message}</Body>
        {action && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onAction(action)}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              minHeight: TAP - 8,
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <BodyStrong color={link}>{t(`auth.action.${action}`)} →</BodyStrong>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}
