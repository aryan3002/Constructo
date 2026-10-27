/** Photo picker and save access — see photoAccess.util.ts for the rules. */
import { Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as MediaLibrary from 'expo-media-library'

import { photoSaveMode, pickerNeedsLibraryPermission } from './photoAccess.util'

/** True when the system photo picker may be opened. */
export async function canOpenPhotoPicker(): Promise<boolean> {
  if (!pickerNeedsLibraryPermission(Platform.OS)) return true
  return (await ImagePicker.requestMediaLibraryPermissionsAsync()).granted
}

/** 'library' when the photo can be saved to the gallery now (write-only
 *  access, photos only), 'share' when the share sheet should take it, or
 *  'denied'. */
export async function photoSaveAccess(): Promise<'library' | 'share' | 'denied'> {
  if (photoSaveMode(Platform.OS, Platform.Version) === 'share') return 'share'
  const { status } = await MediaLibrary.requestPermissionsAsync(true, ['photo'])
  return status === 'granted' ? 'library' : 'denied'
}
