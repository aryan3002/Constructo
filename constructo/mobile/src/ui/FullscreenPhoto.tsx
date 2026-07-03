/**
 * FullscreenPhoto — one photo in a dark full-screen viewer that ALWAYS shows
 * something. A calm breathing loader while the image resolves, and a tap-to-
 * retry glyph when a presigned URL has expired — instead of a permanently blank
 * box (the bug the chat viewers + Photos lightbox shipped with).
 *
 * Shared by the chat photo viewers (chat-viewer.tsx across all three roles) and
 * the homeowner Photos lightbox. Uses expo-image (disk cache + contain fit + a
 * gentle transition) so a photo already seen as a thumbnail opens instantly.
 */
import { useState } from 'react'
import { Pressable, View, useWindowDimensions, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE } from '../theme/tokens'
import { BreathingDots } from './BreathingDots'
import { Small } from './Typography'

export interface FullscreenPhotoProps {
  uri: string
  /** Container style override. Defaults to full-width, square (= window width). */
  style?: ViewStyle
  /** Tap-to-retry hint shown when the image fails to load (e.g. expired presign). */
  retryLabel?: string
}

export function FullscreenPhoto({ uri, style, retryLabel }: FullscreenPhotoProps) {
  const { width } = useWindowDimensions()
  const { theme } = useTheme()
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  // Bumping the key remounts the <Image> to re-request a (possibly refreshed) URL.
  const [attempt, setAttempt] = useState(0)

  return (
    <View
      style={[
        {
          width: '100%',
          height: width,
          borderRadius: theme.radii.card,
          overflow: 'hidden',
          backgroundColor: 'rgba(255,255,255,0.06)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {status === 'error' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          onPress={() => {
            setStatus('loading')
            setAttempt((a) => a + 1)
          }}
          style={{ alignItems: 'center', gap: SPACE.sm, padding: SPACE.lg }}
        >
          <Feather name="image" size={30} color="rgba(255,255,255,0.55)" />
          {retryLabel ? <Small style={{ color: 'rgba(255,255,255,0.55)' }}>{retryLabel}</Small> : null}
        </Pressable>
      ) : (
        <>
          <Image
            key={attempt}
            source={{ uri }}
            contentFit="contain"
            transition={200}
            accessibilityIgnoresInvertColors
            onLoad={() => setStatus('ok')}
            onError={() => setStatus('error')}
            style={{ width: '100%', height: '100%' }}
          />
          {status === 'loading' ? (
            <View style={{ position: 'absolute' }}>
              <BreathingDots color="rgba(255,255,255,0.7)" />
            </View>
          ) : null}
        </>
      )}
    </View>
  )
}
