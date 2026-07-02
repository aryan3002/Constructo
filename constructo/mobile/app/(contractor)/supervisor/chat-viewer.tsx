import { ScrollView, View, useWindowDimensions } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { Button } from '../../../src/ui'

export default function ChatViewerScreen() {
  const params = useLocalSearchParams<{ uri: string }>()
  const router = useRouter()
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()

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
          <Image
            source={{ uri: params.uri }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            style={{ width: '100%', height: width, borderRadius: theme.radii.card }}
          />
          <Button title="Close" variant="ghost" block onPress={() => router.back()} />
        </View>
      </ScrollView>
    </View>
  )
}
