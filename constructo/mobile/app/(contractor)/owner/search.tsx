/**
 * Search (Tab 4) — natural-language Q&A over the ledger. Type a question →
 * POST /search → results, each rendered as an EvidenceCard (claim + proof on
 * tap). Honors the "not sure" state when the API can't confidently answer
 * (answerable === false), per Owner.md §6.5 (honest AI).
 */
import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { useMutation } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../src/theme/tokens'
import { owner, type SearchHit, type SearchResponse } from '../../../src/api/owner'
import { Body, Button, Card, EvidenceCard, H1, Screen, Small } from '../../../src/ui'

const STR = {
  en: {
    title: 'Search',
    placeholder: 'Ask about labor, material, progress, billing…',
    go: 'Search',
    prompt: 'Ask about labor, material, progress, or billing on any site — answers come with proof.',
    noResults: 'No record of that yet. It will be findable once the site posts it.',
    notSure: 'I am not sure enough to answer that confidently. Try rephrasing, or check the site directly.',
    proof: 'Proof',
    confidence: (c: number) => `${Math.round(c * 100)}% confidence`,
    errorLine: 'Search failed just now.',
    tryAgain: 'Try again',
  },
  hi: {
    title: 'खोज',
    placeholder: 'मज़दूर, सामग्री, प्रगति, बिलिंग के बारे में पूछें…',
    go: 'खोजें',
    prompt: 'किसी भी साइट के मज़दूर, सामग्री, प्रगति या बिलिंग के बारे में पूछें — उत्तर प्रमाण के साथ आते हैं।',
    noResults: 'इसका अभी कोई रिकॉर्ड नहीं। साइट के पोस्ट करते ही यह मिल जाएगा।',
    notSure: 'इसका भरोसे से उत्तर देने के लिए मेरे पास पर्याप्त नहीं है। दोबारा कहें, या साइट सीधे देखें।',
    proof: 'प्रमाण',
    confidence: (c: number) => `${Math.round(c * 100)}% भरोसा`,
    errorLine: 'अभी खोज विफल रही।',
    tryAgain: 'फिर कोशिश करें',
  },
} as const

function hitStatus(hit: SearchHit): Status {
  if (hit.event_type === 'issue') return 'risk'
  if (hit.event_type === 'payment_request' || hit.event_type === 'invoice_received') return 'warn'
  return 'info'
}

export default function Search() {
  const { lang } = useT()
  const { theme } = useTheme()
  const t = STR[lang]
  const [q, setQ] = useState('')

  const search = useMutation<SearchResponse, Error, string>({
    mutationFn: (query: string) => owner.search({ q: query }),
  })

  const submit = () => {
    const query = q.trim()
    if (query.length > 0) search.mutate(query)
  }

  const data = search.data
  const hits = data?.hits ?? []

  return (
    <Screen>
      <H1>{t.title}</H1>

      <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'center' }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t.placeholder}
          placeholderTextColor={theme.colors.textMute}
          returnKeyType="search"
          onSubmitEditing={submit}
          style={{
            flex: 1,
            minHeight: 48,
            paddingHorizontal: SPACE.md,
            borderRadius: theme.radii.control,
            borderWidth: 1,
            borderColor: theme.colors.line,
            backgroundColor: theme.colors.card,
            color: theme.colors.text,
            fontFamily: 'Hind-Regular',
            fontSize: 16,
          }}
        />
        <Button title={t.go} loading={search.isPending} disabled={search.isPending || q.trim().length === 0} onPress={submit} />
      </View>

      {/* idle prompt */}
      {!search.isPending && !data && !search.error ? (
        <Card><Body muted>{t.prompt}</Body></Card>
      ) : null}

      {/* error */}
      {search.error ? (
        <View style={{ gap: SPACE.md }}>
          <Small color={theme.colors.risk}>{t.errorLine}</Small>
          <Button title={t.tryAgain} variant="secondary" onPress={submit} />
        </View>
      ) : null}

      {/* not-sure */}
      {data && !data.answerable ? (
        <Card style={{ borderLeftWidth: 4, borderLeftColor: theme.colors.warn }}>
          <Body>{t.notSure}</Body>
        </Card>
      ) : null}

      {/* no results */}
      {data && data.answerable && hits.length === 0 ? (
        <Card><Body muted>{t.noResults}</Body></Card>
      ) : null}

      {/* results */}
      {data && data.answerable && hits.length > 0 ? (
        <View style={{ gap: SPACE.md }}>
          {hits.map((hit) => (
            <View key={hit.event_id} style={{ gap: SPACE.xs }}>
              <Small muted style={{ marginLeft: SPACE.xs }}>
                {hit.site_name} · {hit.occurred_on}
              </Small>
              <EvidenceCard
                claim={hit.summary}
                status={hitStatus(hit)}
                detail={t.confidence(hit.evidence.confidence)}
                evidence={hit.evidence.source_message_ids.map((mid, i) => ({
                  kind: 'message' as const,
                  label: `${t.proof} ${i + 1}`,
                  detail: `Message ${mid.slice(0, 8)}`,
                  meta: '#' + (i + 1),
                }))}
              />
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  )
}
