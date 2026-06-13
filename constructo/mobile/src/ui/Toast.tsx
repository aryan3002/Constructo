/**
 * Toast + useToast — bottom toast for optimistic confirmations.
 *
 * API:
 *   1. Wrap your navigator / screen tree in <ToastProvider>.
 *   2. Call `const toast = useToast()` in any child component.
 *   3. Call `toast('Saved')` — the toast appears at the bottom, auto-dismisses
 *      in ~2200 ms. Consecutive calls replace the current toast.
 *
 * Visual:
 *   - Dark ink pill at the bottom (centered, above the nav bar).
 *   - Optional leading Feather icon (defaults to `check-circle`).
 *   - Fade-in from 0 → 1. With Reduce Motion on: no fade, just appears/hides.
 *   - Does NOT use a Portal — it renders inside the ToastProvider's View.
 *     Place ToastProvider high enough in the tree that its absolute-positioned
 *     child is unconstrained (e.g. wrap the <Stack> or <Tabs> navigator).
 *
 * Tokens: uses theme.colors.text (ink) for the pill bg and paper-50 for the
 * text (matches the prototype's `var(--ink)` + `var(--sand-50)` palette).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  AccessibilityInfo,
  Animated,
  View,
  type ViewStyle,
} from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE } from '../theme/tokens'
import { Small } from './Typography'

// ─── Context ────────────────────────────────────────────────────────────────

type ToastFn = (message: string, icon?: React.ComponentProps<typeof Feather>['name']) => void

const ToastContext = createContext<ToastFn | null>(null)

// ─── Provider ────────────────────────────────────────────────────────────────

export interface ToastProviderProps {
  children: ReactNode
  /**
   * Bottom offset (px) of the toast above the screen bottom.
   * Defaults to 92 to clear the floating tab bar + safe area.
   */
  bottomOffset?: number
}

export function ToastProvider({ children, bottomOffset = 92 }: ToastProviderProps) {
  const { theme } = useTheme()
  const c = theme.colors

  const [msg, setMsg] = useState<string | null>(null)
  const [icon, setIcon] = useState<React.ComponentProps<typeof Feather>['name']>('check-circle')
  const opacity = useRef(new Animated.Value(0)).current
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reducedRef = useRef(false)

  // Query reduced motion once on mount and cache it.
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { reducedRef.current = v })
      .catch(() => undefined)
  }, [])

  const show = useCallback<ToastFn>((message, iconName = 'check-circle') => {
    // Cancel any in-flight dismiss.
    if (dismissTimer.current) clearTimeout(dismissTimer.current)

    setMsg(message)
    setIcon(iconName)

    if (reducedRef.current) {
      // Reduced motion: skip animation, just show/hide.
      opacity.setValue(1)
    } else {
      opacity.setValue(0)
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start()
    }

    dismissTimer.current = setTimeout(() => {
      if (reducedRef.current) {
        opacity.setValue(0)
        setMsg(null)
      } else {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setMsg(null))
      }
    }, 2200)
  }, [opacity])

  // Cleanup on unmount.
  useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
  }, [])

  // on-ink text color — paper-50 equivalent per design system.
  const ON_INK = '#f4f0e7'

  return (
    <ToastContext.Provider value={show}>
      <View style={{ flex: 1 }}>
        {children}
        {msg ? (
          <Animated.View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={[
              toastStyle,
              { bottom: bottomOffset, opacity },
            ]}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.sm + 1, // 9px
                paddingVertical: SPACE.md - 1, // 11px
                paddingHorizontal: SPACE.lg,
                backgroundColor: c.text, // ink pill
                borderRadius: 9999,
                maxWidth: '88%',
              }}
            >
              <Feather name={icon} size={17} color={c.ok} />
              <Small color={ON_INK} style={{ fontWeight: '500' }}>
                {msg}
              </Small>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  )
}

const toastStyle: ViewStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  alignItems: 'center',
  zIndex: 50,
  pointerEvents: 'none',
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Returns the `toast(message, icon?)` function from the nearest
 * `<ToastProvider>`. Throws if called outside of one.
 */
export function useToast(): ToastFn {
  const fn = useContext(ToastContext)
  if (!fn) throw new Error('useToast must be used within a <ToastProvider>')
  return fn
}
