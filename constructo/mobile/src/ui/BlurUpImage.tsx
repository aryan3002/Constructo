/**
 * BlurUpImage — a real photo that SETTLES in instead of popping.
 *
 * Per the motion spec, photos arrive with a blur-up (blur 15→0, scale 1.06→1).
 * Without a native image library we honour the achievable, dependency-free part
 * of that gesture: the image rests on a warm placeholder, then on load eases
 * from scale 1.06 → 1 with a gentle opacity fade — the same "settle, never pop"
 * feeling. Real photos only (never AI/3D renders).
 *
 * Reduced motion: the image simply appears at its resolved frame on load (no
 * scale, no fade-in loop) over the warm placeholder.
 */
import { useRef, useState, useEffect } from 'react'
import { Animated, type ViewStyle, Pressable, View } from 'react-native'
import { Image, type ImageProps } from 'expo-image'
import { Feather } from '@expo/vector-icons'

import { DUR, EASE } from '../theme/motionTokens'
import { AP } from '../theme/tokens'
import { useReducedMotion } from './motion'
import { useTheme } from '../theme/ThemeProvider'

const AnimatedImage = Animated.createAnimatedComponent(Image)

export interface BlurUpImageProps extends Omit<ImageProps, 'source' | 'style'> {
  uri: string
  /** Container style (size/radius). The image fills it via cover. */
  style?: ViewStyle
  /** Warm placeholder shown behind the photo until it settles. */
  placeholderColor?: string
}

export function BlurUpImage({
  uri,
  style,
  placeholderColor = AP.surfaceLow,
  onError,
  ...rest
}: BlurUpImageProps) {
  const reduced = useReducedMotion()
  const { theme } = useTheme()
  const progress = useRef(new Animated.Value(0)).current
  const [failed, setFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    progress.setValue(0)
    setFailed(false)
  }, [uri, progress])

  function onLoad(e: any) {
    Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? 0 : DUR.gentle,
      easing: EASE,
      useNativeDriver: true,
    }).start()
    rest.onLoad?.(e)
  }

  function handleImgError(e: any) {
    setFailed(true)
    onError?.(e)
  }

  const animatedStyle = reduced
    ? { opacity: progress }
    : {
        opacity: progress,
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }],
      }

  const Container = failed ? Pressable : View

  return (
    <Animated.View style={[{ overflow: 'hidden', backgroundColor: placeholderColor, justifyContent: 'center', alignItems: 'center' }, style]}>
      {failed ? (
        <Container style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }} onPress={() => { setRetryKey(k => k + 1); setFailed(false); }}>
          <Feather name="image" size={24} color={theme.colors.textMute} />
        </Container>
      ) : (
        <AnimatedImage
          {...rest}
          key={`${uri}-${retryKey}`}
          source={{ uri }}
          onLoad={onLoad}
          onError={handleImgError}
          resizeMode="cover"
          style={[{ width: '100%', height: '100%' }, animatedStyle]}
        />
      )}
    </Animated.View>
  )
}

