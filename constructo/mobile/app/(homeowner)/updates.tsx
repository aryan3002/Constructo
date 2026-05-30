import { View } from 'react-native'

import { useT } from '../../src/i18n/I18nProvider'
import { SPACE } from '../../src/theme/tokens'
import { Card, Display, Screen, Small } from '../../src/ui'

export default function Updates() {
  const { t } = useT()
  return (
    <Screen>
      <Display>{t('nav.updates')}</Display>
      <Card>
        <View style={{ gap: SPACE.xs }}>
          <Small>Plain-language progress, the weekly summary, milestones and changes.</Small>
          <Small muted>Built in the next update (H2).</Small>
        </View>
      </Card>
    </Screen>
  )
}
