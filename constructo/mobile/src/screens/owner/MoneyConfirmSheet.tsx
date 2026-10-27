/**
 * MoneyConfirmSheet — the one "are you sure?" before a money decision is
 * approved or held (T8). A bottom sheet rather than Alert.alert so it reads the
 * same on every platform (Alert is a no-op on web). The copy comes from
 * `decisionConfirm` / `batchConfirm` in ./approvals.util.
 */
import { Modal, Pressable, View } from 'react-native'

import { useTheme } from '../../theme/ThemeProvider'
import { SPACE } from '../../theme/tokens'
import { Body, BodyStrong, Button, Small } from '../../ui'
import type { ConfirmCopy } from './approvals.util'

export function MoneyConfirmSheet({
  copy,
  onConfirm,
  onCancel,
}: {
  /** null = hidden. */
  copy: ConfirmCopy | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const { theme } = useTheme()
  return (
    <Modal visible={copy !== null} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}
      >
        {copy ? (
          <Pressable
            onPress={() => undefined}
            accessibilityViewIsModal
            style={{
              backgroundColor: theme.colors.bg,
              borderTopLeftRadius: theme.radii.sheet,
              borderTopRightRadius: theme.radii.sheet,
              padding: SPACE.lg,
              paddingBottom: SPACE.xxl,
              gap: SPACE.md,
            }}
          >
            <BodyStrong style={{ fontSize: 18 }}>{copy.heading}</BodyStrong>
            <View
              style={{
                gap: SPACE.xs,
                padding: SPACE.md,
                borderRadius: theme.radii.card,
                borderWidth: 1,
                borderColor: theme.colors.line,
                backgroundColor: theme.colors.card,
              }}
            >
              {copy.lines.map((line, i) =>
                i === 0 ? (
                  <BodyStrong key={i}>{line}</BodyStrong>
                ) : (
                  <Small key={i} color={theme.colors.textMute}>
                    {line}
                  </Small>
                ),
              )}
            </View>
            <Body>{copy.consequence}</Body>
            <Small color={theme.colors.textMute}>{copy.undoNote}</Small>
            <Button title={copy.confirmLabel} variant="accent" size="lg" block onPress={onConfirm} />
            <Button title={copy.cancelLabel} variant="secondary" size="md" onPress={onCancel} />
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
  )
}
