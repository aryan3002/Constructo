/**
 * A two-button "are you sure?" for a destructive action. Native uses Alert;
 * the web build (where React Native's Alert does nothing) uses the browser's
 * confirm, so the action is still reachable there.
 */
import { Alert, Platform } from 'react-native'

export function confirmDestructive(opts: {
  title: string
  message: string
  confirm: string
  cancel: string
  onConfirm: () => void
}): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${opts.title}\n\n${opts.message}`)) {
      opts.onConfirm()
    }
    return
  }
  Alert.alert(opts.title, opts.message, [
    { text: opts.cancel, style: 'cancel' },
    { text: opts.confirm, style: 'destructive', onPress: opts.onConfirm },
  ])
}
