/**
 * "Who are you?" — the front door. Before we know a guest's role we can't theme
 * by it, so this calm Daylight chooser splits the two journeys: a homeowner
 * (join code → Daylight) or the builder / site team (phone+OTP → Neev).
 * Each card routes to the right flow, which carries its own theme.
 */
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'

import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import { Body, Display, Screen, Small, Title, Logo } from '../../src/ui'

function RoleCard({
  icon,
  title,
  subtitle,
  accent,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  title: string
  subtitle: string
  accent: string
  onPress: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.lg,
          backgroundColor: c.card,
          borderRadius: theme.radii.card,
          borderWidth: 1,
          borderColor: c.line,
          padding: SPACE.lg,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        theme.shadowCard,
      ]}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={24} color="#ffffff" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Title>{title}</Title>
        <Small muted>{subtitle}</Small>
      </View>
      <Feather name="chevron-right" size={22} color={c.textMute} />
    </Pressable>
  )
}

export default function ChooseRole() {
  const { t } = useT()
  const { theme } = useTheme()
  const router = useRouter()

  return (
    <Screen>
      <View style={{ marginTop: SPACE.xxl, gap: SPACE.sm }}>
        <Logo size={48} />
        <Display>{t('auth.chooseTitle')}</Display>
        <Body muted>{t('auth.chooseSubtitle')}</Body>
      </View>

      <View style={{ gap: SPACE.md, marginTop: SPACE.xl }}>
        <RoleCard
          icon="home"
          title={t('auth.homeownerCard')}
          subtitle={t('auth.homeownerCardSub')}
          accent={theme.colors.accent}
          onPress={() => router.push('/(auth)/homeowner-login')}
        />
        <RoleCard
          icon="briefcase"
          title={t('auth.staffCard')}
          subtitle={t('auth.staffCardSub')}
          accent={theme.colors.accentDeep}
          onPress={() => router.push('/(auth)/login')}
        />
      </View>
    </Screen>
  )
}
