/**
 * Token storage. The JWT lives in the device keychain via expo-secure-store on
 * native; on web (used for the `expo start --web` smoke) SecureStore is
 * unavailable, so we fall back to localStorage. All callers are async.
 */
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'constructo.token'
const isWeb = Platform.OS === 'web'

export async function getToken(): Promise<string | null> {
  try {
    if (isWeb) return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null
    return await SecureStore.getItemAsync(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function setToken(token: string): Promise<void> {
  try {
    if (isWeb) globalThis.localStorage?.setItem(TOKEN_KEY, token)
    else await SecureStore.setItemAsync(TOKEN_KEY, token)
  } catch {
    /* ignore (private mode / no keychain) */
  }
}

export async function clearToken(): Promise<void> {
  try {
    if (isWeb) globalThis.localStorage?.removeItem(TOKEN_KEY)
    else await SecureStore.deleteItemAsync(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}
