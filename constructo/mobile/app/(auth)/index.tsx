/**
 * The front door — "One app, two doors. Pick yours."
 *
 * Before we know a guest's role we can't theme by it, so this calm Daylight
 * chooser splits the two journeys and — new — tells the user HOW each door
 * opens (join code vs phone number), offers "Not sure which one?" → the
 * What's-what guide, and says up front that there is no password.
 */
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'

import { AuthFrame, useAuthGuide } from '../../src/auth/ui'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../src/theme/tokens'
import { BodyStrong, FadeInUp, Small, Title } from '../../src/ui'

function RoleCard({
  icon,
  title,
  subtitle,
  how,
  accent,
  onPress,
  delay,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  title: string
  subtitle: string
  how: string
  accent: string
  onPress: () => void
  delay: number
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <FadeInUp delay={delay} duration={360}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${subtitle} ${how}`}
        onPress={onPress}
        style={({ pressed }) => [
          {
            backgroundColor: c.card,
            borderRadius: theme.radii.card,
            borderWidth: 1,
            borderColor: c.line,
            padding: SPACE.lg,
            gap: SPACE.md,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          },
          theme.shadowCard,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
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
        </View>
        {/* How you get in — the one line that answers "what do I need?" */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.sm,
            paddingTop: SPACE.md,
            borderTopWidth: 1,
            borderTopColor: c.line,
          }}
        >
          <Feather name="log-in" size={14} color={c.accentDeep} />
          <Small color={c.accentDeep} style={{ flex: 1 }}>
            {how}
          </Small>
        </View>
      </Pressable>
    </FadeInUp>
  )
}

function NotSure() {
  const { t } = useT()
  const { theme } = useTheme()
  const guide = useAuthGuide()
  return (
    <FadeInUp delay={220} duration={360}>
      <Pressable
        accessibilityRole="button"
        onPress={() => guide.open('doors')}
        style={({ pressed }) => ({
          minHeight: TAP,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACE.sm,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Feather name="help-circle" size={16} color={theme.colors.accentDeep} />
        <BodyStrong color={theme.colors.accentDeep}>{t('auth.notSure')}</BodyStrong>
      </Pressable>
    </FadeInUp>
  )
}

export default function ChooseRole() {
  const { t } = useT()
  const { theme } = useTheme()
  const router = useRouter()

  return (
    <AuthFrame
      title={t('auth.frontTitle')}
      subtitle={t('auth.frontSub')}
      guideSection="doors"
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Feather name="lock" size={14} color={theme.colors.textMute} />
          <Small muted>{t('auth.noPassword')}</Small>
        </View>
      }
    >
      <RoleCard
        icon="home"
        title={t('auth.homeownerCard')}
        subtitle={t('auth.homeownerCardSub')}
        how={t('auth.homeownerCardHow')}
        accent={theme.colors.accent}
        delay={80}
        onPress={() => router.push('/(auth)/homeowner-login')}
      />
      <RoleCard
        icon="briefcase"
        title={t('auth.staffCard')}
        subtitle={t('auth.staffCardSub')}
        how={t('auth.staffCardHow')}
        accent={theme.colors.accentDeep}
        delay={140}
        onPress={() => router.push('/(auth)/login')}
      />
      <NotSure />
    </AuthFrame>
  )
}
