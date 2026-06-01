/**
 * Design Documents — the homeowner's single-scroll design hub: style profile,
 * plans, an inspiration board, and material selections with a NON-blocking
 * "check fit" advisor. Philosophy: seek feedback, never gatekeep.
 */
import { useState } from 'react'
import { Alert, Image, TextInput, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { Link } from 'expo-router'

import { homeowner, request } from '../../src/api/client'
import type {
  ConsistencyCheck,
  DesignReference,
  DesignSelection,
} from '../../src/api/types'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Display,
  H2,
  Micro,
  Screen,
  Small,
  StatusPill,
} from '../../src/ui'
import {
  DESIGN_STR,
  isProfileEmpty,
  profileText,
  profileTone,
  selectionStatus,
} from './_design.util'

export default function Design() {
  const { lang } = useT()
  const { theme } = useTheme()
  const qc = useQueryClient()
  const STR = DESIGN_STR[lang]
  const c = theme.colors

  const profileQ = useQuery({
    queryKey: ['design', 'profile'],
    queryFn: () => homeowner.designProfile(),
  })
  const selectionsQ = useQuery({
    queryKey: ['design', 'selections'],
    queryFn: () => homeowner.selections(),
  })

  // Inspiration board — local-only since there is no GET for references yet.
  const [refs, setRefs] = useState<DesignReference[]>([])

  // Per-selection consistency advice, keyed by selection id.
  const [advice, setAdvice] = useState<Record<string, ConsistencyCheck>>({})
  const [checkingId, setCheckingId] = useState<string | null>(null)

  // Add-selection form state.
  const [item, setItem] = useState('')
  const [choice, setChoice] = useState('')

  const addRefMut = useMutation({
    mutationFn: (image_url: string) => homeowner.references({ image_url, source: 'upload' }),
    onSuccess: (ref) => {
      setRefs((prev) => [ref, ...prev])
      Alert.alert(STR.inspirationTitle, STR.added)
    },
    onError: (err: Error) => Alert.alert(STR.errorTitle, err.message),
  })

  const addSelectionMut = useMutation({
    mutationFn: () =>
      request<DesignSelection>('/api/v1/homeowner/design/selections', {
        method: 'POST',
        body: JSON.stringify({ item: item.trim(), choice: choice.trim() }),
      }),
    onSuccess: () => {
      setItem('')
      setChoice('')
      void qc.invalidateQueries({ queryKey: ['design', 'selections'] })
    },
    onError: (err: Error) => Alert.alert(STR.errorTitle, err.message),
  })

  async function pickInspiration() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(STR.inspirationTitle, STR.permissionDenied)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
    })
    if (result.canceled || !result.assets?.length) return
    addRefMut.mutate(result.assets[0].uri)
  }

  async function checkFit(sel: DesignSelection) {
    setCheckingId(sel.id)
    try {
      const res = await request<ConsistencyCheck>(
        '/api/v1/homeowner/design/consistency-check',
        { method: 'POST', body: JSON.stringify({ item: sel.item, choice: sel.choice }) },
      )
      setAdvice((prev) => ({ ...prev, [sel.id]: res }))
    } catch (err) {
      Alert.alert(STR.errorTitle, (err as Error).message)
    } finally {
      setCheckingId(null)
    }
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: theme.radii.control,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    color: c.text,
    fontSize: 16,
  }

  const profile = profileQ.data

  return (
    <Screen>
      <Display>{STR.title}</Display>

      {/* 1. Design profile -------------------------------------------------- */}
      {profileQ.isLoading ? (
        <Card>
          <Small muted>{STR.loading}</Small>
        </Card>
      ) : profileQ.isError ? (
        <Card>
          <View style={{ gap: SPACE.sm }}>
            <BodyStrong>{STR.errorTitle}</BodyStrong>
            <Button
              title={STR.retry}
              variant="secondary"
              onPress={() => void profileQ.refetch()}
            />
          </View>
        </Card>
      ) : isProfileEmpty(profile) ? (
        <CalmCard
          status="info"
          eyebrow={STR.styleEyebrow}
          title={STR.profileEmptyTitle}
          body={STR.profileEmptyBody}
        >
          <Link href="/intake" asChild>
            <Button title={STR.setupProfile} block />
          </Link>
        </CalmCard>
      ) : (
        <CalmCard status="info" eyebrow={STR.styleEyebrow} title={STR.profileEmptyTitle}>
          <View style={{ gap: SPACE.md }}>
            {profileText(profile) ? <Body>{profileText(profile)}</Body> : null}
            {profileTone(profile).length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                {profileTone(profile).map((tone) => (
                  <View
                    key={tone}
                    style={{
                      borderRadius: theme.radii.pill,
                      borderWidth: 1,
                      borderColor: c.line,
                      backgroundColor: c.paper,
                      paddingHorizontal: SPACE.md,
                      paddingVertical: SPACE.xs,
                    }}
                  >
                    <Small>{tone}</Small>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </CalmCard>
      )}

      {/* 2. Plans & drawings ------------------------------------------------ */}
      <Card>
        <View style={{ gap: SPACE.md }}>
          <H2>{STR.plansTitle}</H2>
          <View
            style={{
              borderRadius: theme.radii.card,
              borderWidth: 1,
              borderColor: c.line,
              borderStyle: 'dashed',
              backgroundColor: c.paper,
              padding: SPACE.xl,
              alignItems: 'center',
            }}
          >
            <Small muted>{STR.plansEmpty}</Small>
          </View>
          {/* Drawing approval coming soon — not yet wired to a backend endpoint. */}
          <Button title={STR.approveDrawing} variant="secondary" disabled />
          <Small muted style={{ marginTop: SPACE.xs }}>{STR.approveDrawingComingSoon}</Small>
        </View>
      </Card>

      {/* 3. Inspiration board ---------------------------------------------- */}
      <Card>
        <View style={{ gap: SPACE.md }}>
          <H2>{STR.inspirationTitle}</H2>
          {refs.length === 0 ? (
            <View
              style={{
                borderRadius: theme.radii.card,
                borderWidth: 1,
                borderColor: c.line,
                borderStyle: 'dashed',
                backgroundColor: c.paper,
                padding: SPACE.xl,
                alignItems: 'center',
              }}
            >
              <Small muted>{STR.inspirationEmpty}</Small>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
              {refs.map((ref) => (
                <Image
                  key={ref.id}
                  source={{ uri: ref.image_url }}
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: theme.radii.control,
                    backgroundColor: c.paper,
                  }}
                />
              ))}
            </View>
          )}
          <Button
            title={STR.addInspiration}
            variant="secondary"
            loading={addRefMut.isPending}
            onPress={() => void pickInspiration()}
          />
        </View>
      </Card>

      {/* 4. Selections ------------------------------------------------------ */}
      <Card>
        <View style={{ gap: SPACE.md }}>
          <H2>{STR.selectionsTitle}</H2>

          {selectionsQ.isLoading ? (
            <Small muted>{STR.loading}</Small>
          ) : selectionsQ.isError ? (
            <View style={{ gap: SPACE.sm }}>
              <Small muted>{STR.errorTitle}</Small>
              <Button
                title={STR.retry}
                variant="secondary"
                onPress={() => void selectionsQ.refetch()}
              />
            </View>
          ) : (selectionsQ.data?.length ?? 0) === 0 ? (
            <Small muted>{STR.selectionsEmpty}</Small>
          ) : (
            <View style={{ gap: SPACE.md }}>
              {selectionsQ.data!.map((sel) => {
                const note = advice[sel.id]
                return (
                  <View
                    key={sel.id}
                    style={{
                      gap: SPACE.sm,
                      paddingBottom: SPACE.md,
                      borderBottomWidth: 1,
                      borderBottomColor: c.line,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: SPACE.sm,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <BodyStrong>{sel.item}</BodyStrong>
                        <Small muted>{sel.choice}</Small>
                      </View>
                      <StatusPill status={selectionStatus(sel)} size="sm" label={sel.status} />
                    </View>

                    {note ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          gap: SPACE.sm,
                          backgroundColor: c.paper,
                          borderRadius: theme.radii.control,
                          padding: SPACE.md,
                        }}
                      >
                        <Small color={note.fits ? c.ok : c.warn}>
                          {note.fits ? '✓' : '~'}
                        </Small>
                        <View style={{ flex: 1, gap: SPACE.xs }}>
                          <Small>{note.feedback}</Small>
                          <Micro muted>{STR.adviceNote}</Micro>
                        </View>
                      </View>
                    ) : null}

                    <Button
                      title={STR.checkFit}
                      variant="ghost"
                      size="md"
                      loading={checkingId === sel.id}
                      onPress={() => void checkFit(sel)}
                    />
                  </View>
                )
              })}
            </View>
          )}

          {/* Add-a-selection form */}
          <View style={{ gap: SPACE.sm, marginTop: SPACE.sm }}>
            <BodyStrong>{STR.addSelectionTitle}</BodyStrong>
            <TextInput
              value={item}
              onChangeText={setItem}
              placeholder={STR.itemLabel}
              placeholderTextColor={c.textMute}
              style={inputStyle}
            />
            <TextInput
              value={choice}
              onChangeText={setChoice}
              placeholder={STR.choiceLabel}
              placeholderTextColor={c.textMute}
              style={inputStyle}
            />
            <Button
              title={STR.addSelection}
              loading={addSelectionMut.isPending}
              disabled={item.trim().length === 0 || choice.trim().length === 0}
              onPress={() => addSelectionMut.mutate()}
            />
          </View>
        </View>
      </Card>
    </Screen>
  )
}
