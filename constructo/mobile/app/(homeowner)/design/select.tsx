/**
 * Add a selection (Design rebuild) — a room-scoped, status-aware selection flow
 * with a PRE-COMMIT consistency check. Pushed full-screen from the Design tab
 * (href:null). Daylight theme; built on the Calm Cockpit kit.
 *
 * - Room picker is sourced from her property's spaces. A room-narrowed member
 *   (capabilities.design_space_id set) sees ONLY her room — mirroring the
 *   server's `design_room_only` gate; everyone else gets every room + "Whole
 *   house". A non-`can_design` member who deep-links here sees a calm read-only
 *   notice (write affordances simply absent — never a greyed lock).
 * - "Check fit" is advisory ONLY (ok / worth-a-look, never red, never blocks Save).
 * - Save writes via the named `homeowner.addSelection` (room + status); the server
 *   re-gates and its message is surfaced verbatim on the rare 403.
 */
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { homeowner } from '../../../src/api/client'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Display,
  Screen,
  Small,
  StatusPill,
  useInputStyle,
} from '../../../src/ui'
import type { ConsistencyCheck } from '../../../src/api/types'
import {
  SELECTION_STATUSES,
  SELECT_STR,
  visibleSpaces,
  type SelectionStatusChoice,
} from '../_design_select.util'

export default function AddSelection() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const qc = useQueryClient()
  const inputStyle = useInputStyle()
  const t = SELECT_STR[lang as 'en' | 'hi'] ?? SELECT_STR.en

  const capsQ = useQuery({
    queryKey: ['homeowner', 'capabilities'],
    queryFn: () => homeowner.capabilities(),
  })
  const canDesign = capsQ.data?.can_design ?? false
  const scopedSpaceId = capsQ.data?.design_space_id ?? null

  const propertyQ = useQuery({
    queryKey: ['design', 'property'],
    queryFn: () => homeowner.property(),
    enabled: canDesign,
  })
  const spaces = visibleSpaces(propertyQ.data?.spaces ?? [], scopedSpaceId)

  // A room-narrowed member is locked to her one room; everyone else starts on
  // "Whole house" (null) and may pick any room.
  const [spaceId, setSpaceId] = useState<string | null>(scopedSpaceId)
  const [item, setItem] = useState('')
  const [choice, setChoice] = useState('')
  const [status, setStatus] = useState<SelectionStatusChoice>('proposed')
  const [advice, setAdvice] = useState<ConsistencyCheck | null>(null)
  const [checking, setChecking] = useState(false)

  const canSave = item.trim().length > 0 && choice.trim().length > 0

  const checkFit = async () => {
    if (!canSave) return
    setChecking(true)
    try {
      const res = await homeowner.consistencyCheck({ item: item.trim(), choice: choice.trim() })
      setAdvice(res)
    } catch {
      setAdvice(null)
    } finally {
      setChecking(false)
    }
  }

  const saveMut = useMutation({
    mutationFn: () =>
      homeowner.addSelection({
        item: item.trim(),
        choice: choice.trim(),
        space_id: spaceId ?? undefined,
        status,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['design', 'selections'] })
      Alert.alert('', t.saved)
      router.back()
    },
    onError: (err: Error) => Alert.alert('', err.message || t.saveErr),
  })

  const back = (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel={t.back}
      hitSlop={10}
      style={{ width: 40, height: 40, justifyContent: 'center', marginBottom: SPACE.xs }}
    >
      <Feather name="chevron-left" size={26} color={c.text} />
    </Pressable>
  )

  // A non-design member who deep-links here: calm read-only notice, no form.
  if (capsQ.data && !canDesign) {
    return (
      <Screen floatingNav>
        {back}
        <Display>{t.title}</Display>
        <Body muted>{t.subtitle}</Body>
        <View
          style={{
            marginTop: SPACE.md,
            backgroundColor: c.paper,
            borderRadius: theme.radii.card,
            borderWidth: 1,
            borderColor: c.line,
            padding: SPACE.lg,
            flexDirection: 'row',
            gap: SPACE.sm,
            alignItems: 'center',
          }}
        >
          <Feather name="eye" size={16} color={c.textMute} />
          <Small muted style={{ flex: 1 }}>
            {t.adviceNote}
          </Small>
        </View>
      </Screen>
    )
  }

  const roomChip = (id: string | null, label: string) => {
    const selected = spaceId === id
    return (
      <Pressable
        key={id ?? 'whole'}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => setSpaceId(id)}
        style={{
          minHeight: TAP,
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.xs,
          paddingHorizontal: SPACE.md,
          paddingVertical: SPACE.sm,
          borderRadius: theme.radii.pill,
          borderWidth: 1,
          borderColor: selected ? c.accent : c.line,
          backgroundColor: selected ? c.accentWarm : c.paper,
        }}
      >
        {selected ? <Feather name="check" size={14} color={c.accentDeep} /> : null}
        <Body style={{ color: selected ? c.accentDeep : c.text, fontWeight: selected ? '600' : '400' }}>
          {label}
        </Body>
      </Pressable>
    )
  }

  return (
    <Screen floatingNav>
      {back}
      <View style={{ gap: 2 }}>
        <Display>{t.title}</Display>
        <Body muted>{t.subtitle}</Body>
      </View>

      {/* Room picker — locked to her one room for a room-narrowed member. */}
      <View style={{ gap: SPACE.sm, marginTop: SPACE.md }}>
        <BodyStrong>{t.roomLabel}</BodyStrong>
        {propertyQ.isLoading ? (
          <Small muted>{t.loadingRooms}</Small>
        ) : propertyQ.isError ? (
          <View style={{ gap: SPACE.sm }}>
            <Small muted>{t.errorTitle}</Small>
            <Button title={t.retry} variant="secondary" onPress={() => void propertyQ.refetch()} />
          </View>
        ) : spaces.length === 0 ? (
          <Small muted>{t.noRooms}</Small>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
            {/* "Whole house" only when she isn't narrowed to a single room. */}
            {!scopedSpaceId ? roomChip(null, t.wholeHouse) : null}
            {spaces.map((s) => roomChip(s.id, s.name))}
          </View>
        )}
      </View>

      {/* Item + choice. */}
      <View style={{ gap: SPACE.sm, marginTop: SPACE.md }}>
        <BodyStrong>{t.itemLabel}</BodyStrong>
        <TextInput
          value={item}
          onChangeText={(v) => {
            setItem(v)
            setAdvice(null)
          }}
          placeholder={t.itemPlaceholder}
          placeholderTextColor={c.textMute}
          style={inputStyle}
        />
        <BodyStrong style={{ marginTop: SPACE.xs }}>{t.choiceLabel}</BodyStrong>
        <TextInput
          value={choice}
          onChangeText={(v) => {
            setChoice(v)
            setAdvice(null)
          }}
          placeholder={t.choicePlaceholder}
          placeholderTextColor={c.textMute}
          style={inputStyle}
        />
      </View>

      {/* Pre-commit consistency check — advisory only, never red, never blocks. */}
      <View style={{ gap: SPACE.sm, marginTop: SPACE.sm }}>
        <Button
          title={t.checkFit}
          variant="ghost"
          size="md"
          loading={checking}
          disabled={!canSave}
          onPress={() => void checkFit()}
        />
        {advice ? (
          <View
            style={{
              flexDirection: 'row',
              gap: SPACE.sm,
              backgroundColor: c.paper,
              borderRadius: theme.radii.control,
              padding: SPACE.md,
            }}
          >
            <Feather
              name={advice.fits ? 'check-circle' : 'help-circle'}
              size={16}
              color={advice.fits ? c.ok : c.warn}
              style={{ marginTop: 2 }}
            />
            <View style={{ flex: 1, gap: SPACE.xs }}>
              <StatusPill
                status={advice.fits ? 'ok' : 'warn'}
                size="sm"
                label={advice.fits ? t.fits : t.worthLook}
              />
              <Small>{advice.feedback}</Small>
              <Small muted>{t.adviceNote}</Small>
            </View>
          </View>
        ) : null}
      </View>

      {/* Status — proposed / final (default proposed, matching the backend). */}
      <View style={{ gap: SPACE.sm, marginTop: SPACE.md }}>
        <BodyStrong>{t.statusLabel}</BodyStrong>
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          {SELECTION_STATUSES.map((s) => {
            const selected = status === s
            return (
              <Pressable
                key={s}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setStatus(s)}
                style={{
                  flex: 1,
                  minHeight: TAP,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radii.control,
                  borderWidth: 1,
                  borderColor: selected ? c.accent : c.line,
                  backgroundColor: selected ? c.accentWarm : c.paper,
                }}
              >
                <Body
                  style={{ color: selected ? c.accentDeep : c.text, fontWeight: selected ? '600' : '400' }}
                >
                  {s === 'proposed' ? t.statusProposed : t.statusFinal}
                </Body>
              </Pressable>
            )
          })}
        </View>
      </View>

      <Button
        title={t.save}
        loading={saveMut.isPending}
        disabled={!canSave}
        onPress={() => saveMut.mutate()}
        style={{ marginTop: SPACE.lg }}
        leading={
          saveMut.isPending ? undefined : <Feather name="check" size={16} color={c.onAccent} />
        }
      />
      {/* A breath of room above the floating bar handled by Screen floatingNav. */}
      {capsQ.isLoading ? (
        <View style={{ alignItems: 'center', marginTop: SPACE.md }}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : null}
    </Screen>
  )
}
