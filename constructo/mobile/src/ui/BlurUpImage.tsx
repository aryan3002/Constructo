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
import { useRef } from 'react'
import { Animated, Image, type ImageProps, type ViewStyle } from 'react-native'

import { DUR, EASE } from '../theme/motionTokens'
import { AP } from '../theme/tokens'
import { useReducedMotion } from './motion'

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
  ...rest
}: BlurUpImageProps) {
  const reduced = useReducedMotion()
  const progress = useRef(new Animated.Value(0)).current

  function onLoad() {
    Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? 0 : DUR.gentle,
      easing: EASE,
      useNativeDriver: true,
    }).start()
  }

  const animatedStyle = reduced
    ? { opacity: progress }
    : {
        opacity: progress,
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }],
      }

  return (
    <Animated.View style={[{ overflow: 'hidden', backgroundColor: placeholderColor }, style]}>
      <AnimatedImage
        {...rest}
        source={{ uri }}
        onLoad={onLoad}
        resizeMode="cover"
        style={[{ width: '100%', height: '100%' }, animatedStyle]}
      />
    </Animated.View>
  )
}
