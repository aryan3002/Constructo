import { View } from 'react-native'

import { useT } from '../../src/i18n/I18nProvider'
import { SPACE } from '../../src/theme/tokens'
import { Card, Display, Screen, Small } from '../../src/ui'

export default function Design() {
  const { t } = useT()
  return (
    <Screen>
      <Display>{t('nav.design')}</Display>
      <Card>
        <View style={{ gap: SPACE.xs }}>
          <Small>Your design profile, plans, inspiration board and selections.</Small>
          <Small muted>Built in the next update (H2).</Small>
        </View>
      </Card>
    </Screen>
  )
}
