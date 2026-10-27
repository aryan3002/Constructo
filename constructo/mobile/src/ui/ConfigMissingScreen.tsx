/**
 * Shown INSTEAD of the app when a release build lacks required config (see
 * src/api/config.util.ts). Deliberately plain: no fonts, icons or providers,
 * so it renders even when nothing else is set up. Both languages at once,
 * since the person's language isn't known yet.
 */
import { ScrollView, Text, View } from 'react-native'

import { THEMES } from '../theme/tokens'

export function ConfigMissingScreen({ missing }: { missing: readonly string[] }) {
  const c = THEMES.neev.colors
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }}
    >
      <View accessibilityRole="alert" style={{ gap: 8 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: c.text }}>
          This build of Neev isn't set up
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 22, color: c.text }}>
          It can't start because these settings are missing. Please install the latest version
          from the app store, or tell the Neev team.
        </Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: c.text, marginTop: 8 }}>
          नींव का यह बिल्ड तैयार नहीं है
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 22, color: c.text }}>
          ये सेटिंग्स न होने से ऐप शुरू नहीं हो सकता। कृपया ऐप स्टोर से नया वर्ज़न इंस्टॉल करें, या
          नींव टीम को बताएँ।
        </Text>
      </View>
      <View
        style={{
          padding: 16,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.card,
          gap: 6,
        }}
      >
        {missing.map((name) => (
          <Text key={name} selectable style={{ fontFamily: 'monospace', fontSize: 14, color: c.risk }}>
            {name}
          </Text>
        ))}
      </View>
    </ScrollView>
  )
}
