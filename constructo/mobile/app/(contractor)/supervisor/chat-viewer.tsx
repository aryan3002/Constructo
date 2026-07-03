import { ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SPACE } from '../../../src/theme/tokens'
import { Button, FullscreenPhoto } from '../../../src/ui'

export default function ChatViewerScreen() {
  const params = useLocalSearchParams<{ uri: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: SPACE.lg,
          paddingTop: insets.top + SPACE.lg,
          paddingBottom: insets.bottom + SPACE.xl,
        }}
      >
        <View style={{ gap: SPACE.lg }}>
          <FullscreenPhoto uri={params.uri} retryLabel="Tap to retry" />
          <Button title="Close" variant="ghost" block onPress={() => router.back()} />
        </View>
      </ScrollView>
    </View>
  )
}
