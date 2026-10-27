/**
 * Toast + useToast — bottom toast for confirmations, errors and undo.
 *
 * API:
 *   1. Wrap your navigator / screen tree in <ToastProvider>.
 *   2. Call `const toast = useToast()` in any child component.
 *   3. Call `toast('Saved')` or `toast('Saved', 'check')` — the toast appears at
 *      the bottom and auto-dismisses. Consecutive calls replace the current one.
 *      `toast(message, { tone: 'error' })` shows the red error style;
 *      `toast(message, { action: { label: 'Undo', onPress } })` adds a button
 *      and stays up longer.
 *   4. Code outside React shows toasts through `showToast` in ./toastBus; the
 *      provider subscribes to it.
 *
 * Visual:
 *   - Dark ink pill at the bottom (centered, above the nav bar); error tone is
 *     a red pill. Leading Feather icon per tone (success ✓ green, error red).
 *   - Fade-in from 0 → 1. With Reduce Motion on: no fade, just appears/hides.
 *   - Only the action button takes touches; the rest passes through.
 *   - Does NOT use a Portal — it renders inside the ToastProvider's View.
 *     Place ToastProvider high enough in the tree that its absolute-positioned
 *     child is unconstrained (e.g. wrap the <Stack> or <Tabs> navigator).
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
import { AccessibilityInfo, Animated, Pressable, View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE } from '../theme/tokens'
import { Small } from './Typography'
import {
  subscribeToasts,
  toastDurationMs,
  type ToastEvent,
  type ToastOptions,
  type ToastRequest,
} from './toastBus'

type IconName = React.ComponentProps<typeof Feather>['name']

// ─── Context ────────────────────────────────────────────────────────────────

/** `toast(message, icon)` keeps working; pass options for a tone or a button. */
type ToastFn = (message: string, iconOrOptions?: IconName | ToastOptions) => void

const ToastContext = createContext<ToastFn | null>(null)

const DEFAULT_ICON: Record<NonNullable<ToastOptions['tone']>, IconName> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'info',
}

// ─── Provider ────────────────────────────────────────────────────────────────

export interface ToastProviderProps {
  children: ReactNode
  /**
   * Bottom offset (px) of the toast above the screen bottom.
   * Defaults to 92 to clear the floating tab bar + safe area.
   */
  bottomOffset?: number
}

let localSeq = 0

export function ToastProvider({ children, bottomOffset = 92 }: ToastProviderProps) {
  const { theme } = useTheme()
  const c = theme.colors

  const [current, setCurrent] = useState<ToastRequest | null>(null)
  const currentId = useRef<number | null>(null)
  const opacity = useRef(new Animated.Value(0)).current
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reducedRef = useRef(false)

  // Query reduced motion once on mount and cache it.
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { reducedRef.current = v })
      .catch(() => undefined)
  }, [])

  const hide = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    dismissTimer.current = null
    currentId.current = null
    if (reducedRef.current) {
      opacity.setValue(0)
      setCurrent(null)
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setCurrent((t) => (currentId.current === null ? null : t)))
    }
  }, [opacity])

  const present = useCallback((req: ToastRequest) => {
    // Cancel any in-flight dismiss.
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    currentId.current = req.id
    setCurrent(req)

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

    dismissTimer.current = setTimeout(hide, toastDurationMs(req))
  }, [opacity, hide])

  const show = useCallback<ToastFn>((message, iconOrOptions) => {
    // A bare 'alert-circle' icon has always meant "this failed": give it the
    // error style it never had.
    const opts: ToastOptions =
      typeof iconOrOptions === 'string'
        ? { icon: iconOrOptions, tone: iconOrOptions === 'alert-circle' ? 'error' : undefined }
        : iconOrOptions ?? {}
    localSeq -= 1 // local toasts use negative ids so they never clash with the bus
    present({ ...opts, id: localSeq, message })
  }, [present])

  // Toasts from outside React (mutation errors, the undo window).
  useEffect(
    () =>
      subscribeToasts((e: ToastEvent) => {
        if (e.kind === 'show') present(e.toast)
        else if (e.id === null || e.id === currentId.current) hide()
      }),
    [present, hide],
  )

  // Cleanup on unmount.
  useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
  }, [])

  // on-ink text color — paper-50 equivalent per design system.
  const ON_INK = '#f4f0e7'
  const tone = current?.tone ?? 'success'
  const isError = tone === 'error'
  const icon = (current?.icon as IconName | undefined) ?? DEFAULT_ICON[tone]
  const iconColor = isError ? ON_INK : tone === 'info' ? ON_INK : c.ok

  return (
    <ToastContext.Provider value={show}>
      <View style={{ flex: 1 }}>
        {children}
        {current ? (
          <Animated.View
            accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
            accessibilityRole="alert"
            pointerEvents="box-none"
            style={[toastStyle, { bottom: bottomOffset, opacity }]}
          >
            <View
              pointerEvents="box-none"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.sm + 1, // 9px
                paddingVertical: SPACE.md - 1, // 11px
                paddingLeft: SPACE.lg,
                paddingRight: current.action ? SPACE.sm : SPACE.lg,
                backgroundColor: isError ? c.risk : c.text, // red for errors, ink otherwise
                borderRadius: 9999,
                maxWidth: '92%',
              }}
            >
              <View pointerEvents="none">
                <Feather name={icon} size={17} color={iconColor} />
              </View>
              <View pointerEvents="none" style={{ flexShrink: 1 }}>
                <Small color={ON_INK} style={{ fontWeight: '500' }}>
                  {current.message}
                </Small>
              </View>
              {current.action ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={current.action.label}
                  hitSlop={8}
                  onPress={() => {
                    const act = current.action
                    hide()
                    act?.onPress()
                  }}
                  style={{
                    paddingVertical: SPACE.xs,
                    paddingHorizontal: SPACE.md,
                    borderRadius: 9999,
                    backgroundColor: 'rgba(244,240,231,0.16)',
                  }}
                >
                  <Small color={ON_INK} style={{ fontWeight: '700' }}>
                    {current.action.label}
                  </Small>
                </Pressable>
              ) : null}
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
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Returns the `toast(message, icon | options)` function from the nearest
 * `<ToastProvider>`. Throws if called outside of one.
 */
export function useToast(): ToastFn {
  const fn = useContext(ToastContext)
  if (!fn) throw new Error('useToast must be used within a <ToastProvider>')
  return fn
}
