/**
 * Android-only keyboard-visibility flag.
 *
 * On Android (adjustResize) a floating/rounded custom tab bar otherwise rises
 * to sit BETWEEN the composer and the keyboard. Custom bars use this to hide
 * themselves while the keyboard is up — the same behaviour react-navigation's
 * stock `tabBarHideOnKeyboard` provides for the default bar.
 *
 * Returns `false` on iOS, where the keyboard is handled by KeyboardAvoidingView
 * and the bar should stay put.
 */
import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

export function useAndroidKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return visible
}
