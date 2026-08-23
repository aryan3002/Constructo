/**
 * Builder / site-team welcome — "Here's what's what", once per user per device.
 *
 * Shown by the builder login the FIRST time a number signs in on this device
 * (`welcomeKey(me.id)` unset). Templated truth only: company name from the
 * profile, the role as a pill, and the role's REAL tab bar as a short tour —
 * so the bar they're about to see is already explained. Owners who just
 * created a fresh workspace (any new number becomes an owner) get the honest
 * note that company/site setup lives on the web dashboard.
 *
 * One tap ("Go to Brief") sets the flag and routes to `homeFor(role)`.
 * Neev theme (provided by the contractor group layout).
 */
import { useState } from 'react'
import { View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

import { homeFor, welcomeKey } from '../../src/auth/auth.util'
import { useAuth } from '../../src/auth/AuthContext'
import { ROLE_LABEL, roleTour } from '../../src/auth/guide.content'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Card,
  Display,
  Eyebrow,
  FadeInUp,
  Logo,
  Screen,
  Small,
  StatusPill,
} from '../../src/ui'

export default function BuilderWelcome() {
  const { t, lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { me, role, status } = useAuth()
  const [leaving, setLeaving] = useState(false)

  // The group layout already bounces guests; hold a blank canvas while the
  // profile resolves rather than flashing a tour for nobody.
  if (status !== 'authed' || !me || !role) return <Screen>{null}</Screen>

  const L = lang === 'hi' ? 'hi' : 'en'
  const rows = roleTour(role, L)
  const roleLabel = ROLE_LABEL[role]?.[L] ?? role
  const isOwner = role === 'owner'

  async function go() {
    if (leaving || !me) return
    setLeaving(true)
    try {
      await AsyncStorage.setItem(welcomeKey(me.id), '1')
    } catch {
      /* best-effort — never block the user on a flag */
    }
    router.replace(homeFor(role) as never)
  }

  return (
    <Screen>
      <FadeInUp duration={240} style={{ marginTop: SPACE.md, gap: SPACE.md }}>
        <Logo size={44} />
        <View style={{ gap: SPACE.sm }}>
          <Eyebrow>{t('auth.welcome.builderTitle')}</Eyebrow>
          {/* Templated truth: the company they belong to, or their name. */}
          <Display style={{ fontFamily: 'Eczar-SemiBold', lineHeight: 44 }}>
            {me.company_name || me.name || t('auth.welcome.builderTitle')}
          </Display>
          <StatusPill status="info" icon="briefcase" label={roleLabel} />
        </View>
      </FadeInUp>

      {isOwner ? (
        <FadeInUp delay={60} duration={240}>
          <Card style={{ backgroundColor: c.infoTint, borderColor: c.line }}>
            <View style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' }}>
              <Feather name="info" size={18} color={c.info} style={{ marginTop: 2 }} />
              <Body style={{ flex: 1 }}>{t('auth.welcome.newOwnerNote')}</Body>
            </View>
          </Card>
        </FadeInUp>
      ) : null}

      <FadeInUp delay={120} duration={240} style={{ gap: SPACE.sm }}>
        <Eyebrow>{t('auth.welcome.whatsWhat')}</Eyebrow>
        <Card style={{ gap: 0, paddingVertical: SPACE.xs }}>
          {rows.map((row, i) => (
            <View
              key={row.title}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.md,
                paddingVertical: SPACE.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.line,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: c.accentWarm,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name={row.icon} size={18} color={c.text} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <BodyStrong>{row.title}</BodyStrong>
                <Small muted>{row.body}</Small>
              </View>
            </View>
          ))}
        </Card>
      </FadeInUp>

      <FadeInUp delay={180} duration={240} style={{ marginTop: SPACE.sm }}>
        <Button
          title={t('auth.welcome.goTo', { tab: rows[0]?.title ?? 'Neev' })}
          block
          size="lg"
          loading={leaving}
          onPress={() => void go()}
          leading={<Feather name="arrow-right" size={18} color="#f4f0e7" />}
        />
      </FadeInUp>
    </Screen>
  )
}
