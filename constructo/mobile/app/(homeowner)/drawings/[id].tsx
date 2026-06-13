/**
 * Drawing detail — pushed from the Plans tab.
 * Route: (homeowner)/drawings/[id] — registered `href: null` in _layout.tsx.
 *
 * Renders the REAL drawing from `homeowner.drawings()` by id:
 *   - file_url image/PDF preview via Image (PhotoTile grid variant for images;
 *     an "Open in browser" fallback for PDFs since RN has no native PDF viewer).
 *   - plain_summary_* (AI "what changed" in the active language).
 *   - version number + kind label.
 *   - Contractor note (change_note).
 *   - "What changed from vN-1" section when supersedes_id is present (looks up
 *     the older drawing in the same list; if not found, shows the summary only).
 *
 * Actions:
 *   Approve  → HONEST stub: "confirm with your builder" alert. Backend not built.
 *   Comment  → toast stub (no comment endpoint exists for drawings).
 *   Request changes → toast stub.
 *
 * Philosophy: real data, honest stubs clearly labeled, advisory tone, no blocking.
 */
import { useState } from 'react'
import { Alert, Image, Linking, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { homeowner } from '../../../src/api/client'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Micro,
  MonoSm,
  Screen,
  Small,
  StatusPill,
  SubHeader,
  Title,
  useToast,
} from '../../../src/ui'
import {
  drawingDate,
  drawingKindLabel,
  drawingSummary,
  DESIGN_STR,
} from '../_design.util'
import type { Drawing } from '../../../src/api/types'

// ---- strings -----------------------------------------------------------------
const STR = {
  en: {
    loading: 'Loading drawing…',
    notFound: 'Drawing not found.',
    openInBrowser: 'Open in browser',
    openError: 'Could not open the file. Please try again.',
    whatChanged: 'WHAT CHANGED',
    contractorNote: 'BUILDER NOTE',
    fromPrev: 'CHANGES FROM PREVIOUS VERSION',
    prevNotFound: 'Previous version not available.',
    actionsTitle: 'YOUR RESPONSE',
    approveTitle: 'Approve',
    approveBody:
      'Approving plans in the app is coming soon. For now, please confirm with your builder directly.',
    approveCta: 'Confirm with builder',
    commentCta: 'Leave a comment',
    commentToast: 'Comments on drawings are coming soon. Please message your builder directly.',
    requestChangeCta: 'Request changes',
    requestChangeToast:
      'Change requests on drawings are coming soon. Please message your builder directly.',
    versionLabel: 'Version',
    kindLabel: 'Type',
    publishedLabel: 'Shared',
    pendingApproval: 'Pending your approval',
    noFile: 'No file attached.',
    errorTitle: 'Could not load drawings',
    retry: 'Try again',
  },
  hi: {
    loading: 'नक्शा लोड हो रहा है…',
    notFound: 'नक्शा नहीं मिला।',
    openInBrowser: 'ब्राउज़र में खोलें',
    openError: 'फ़ाइल नहीं खुली। कृपया दोबारा कोशिश करें।',
    whatChanged: 'क्या बदला',
    contractorNote: 'बिल्डर नोट',
    fromPrev: 'पिछले संस्करण से बदलाव',
    prevNotFound: 'पिछला संस्करण उपलब्ध नहीं।',
    actionsTitle: 'आपका जवाब',
    approveTitle: 'स्वीकृत करें',
    approveBody:
      'ऐप में नक्शे स्वीकृत करना जल्द आ रहा है। फ़िलहाल, अपने बिल्डर से सीधे पुष्टि करें।',
    approveCta: 'बिल्डर से पुष्टि करें',
    commentCta: 'टिप्पणी करें',
    commentToast: 'नक्शों पर टिप्पणी जल्द आ रही है। कृपया अपने बिल्डर को सीधे संदेश करें।',
    requestChangeCta: 'बदलाव का अनुरोध करें',
    requestChangeToast:
      'नक्शों पर बदलाव का अनुरोध जल्द आ रहा है। कृपया अपने बिल्डर को सीधे संदेश करें।',
    versionLabel: 'संस्करण',
    kindLabel: 'प्रकार',
    publishedLabel: 'साझा किया',
    pendingApproval: 'आपकी स्वीकृति बाकी',
    noFile: 'कोई फ़ाइल संलग्न नहीं।',
    errorTitle: 'नक्शे लोड नहीं हो सके',
    retry: 'पुनः प्रयास करें',
  },
}

// Is this URL likely an image (not a PDF)?
function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|heic)(\?.*)?$/i.test(url)
}

export default function DrawingDetail() {
  const { lang } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const showToast = useToast()
  const t = STR[lang as 'en' | 'hi'] ?? STR.en
  const DSTR = DESIGN_STR[lang as 'en' | 'hi'] ?? DESIGN_STR.en
  const c = theme.colors

  const drawingsQ = useQuery({
    queryKey: ['design', 'drawings'],
    queryFn: () => homeowner.drawings(),
  })

  const drawing: Drawing | undefined = (drawingsQ.data ?? []).find((d) => d.id === id)

  // Previous version — the drawing this one supersedes (if present in the list).
  const prevDrawing: Drawing | undefined = drawing?.supersedes_id
    ? (drawingsQ.data ?? []).find((d) => d.id === drawing.supersedes_id)
    : undefined

  const summary = drawing ? drawingSummary(drawing, lang as 'en' | 'hi') : ''
  const prevSummary = prevDrawing ? drawingSummary(prevDrawing, lang as 'en' | 'hi') : ''
  const when = drawing ? drawingDate(drawing.published_at, lang as 'en' | 'hi') : null

  async function openFile() {
    if (!drawing?.file_url) return
    try {
      await Linking.openURL(drawing.file_url)
    } catch {
      Alert.alert(t.errorTitle, t.openError)
    }
  }

  const surface = (children: React.ReactNode, extraStyle?: object) => (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: theme.radii.card,
          padding: SPACE.lg,
        },
        theme.shadowCard,
        extraStyle,
      ]}
    >
      {children}
    </View>
  )

  const eyebrow = (text: string) => (
    <Micro color={c.secondary} style={{ letterSpacing: 1.2 }}>
      {text}
    </Micro>
  )

  // Loading / error / not-found states
  if (drawingsQ.isLoading) {
    return (
      <Screen floatingNav>
        <SubHeader title={t.loading} onBack={() => router.back()} />
        {surface(<Small muted>{t.loading}</Small>)}
      </Screen>
    )
  }

  if (drawingsQ.isError) {
    return (
      <Screen floatingNav>
        <SubHeader title={t.errorTitle} onBack={() => router.back()} />
        {surface(
          <View style={{ gap: SPACE.sm }}>
            <Small muted>{t.errorTitle}</Small>
            <Button title={t.retry} variant="secondary" onPress={() => void drawingsQ.refetch()} />
          </View>,
        )}
      </Screen>
    )
  }

  if (!drawing) {
    return (
      <Screen floatingNav>
        <SubHeader title={t.notFound} onBack={() => router.back()} />
        {surface(<Small muted>{t.notFound}</Small>)}
      </Screen>
    )
  }

  return (
    <Screen floatingNav>
      <SubHeader
        title={drawing.title}
        subtitle={`${DSTR.versionLabel} ${drawing.version} · ${drawingKindLabel(drawing.kind, DSTR)}`}
        onBack={() => router.back()}
      />

      <View style={{ gap: SPACE.xl, marginTop: SPACE.md }}>
        {/* Meta row: version pill + pending status + published date */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: SPACE.sm,
          }}
        >
          <StatusPill status="warn" size="sm" label={t.pendingApproval} />
          <View
            style={{
              backgroundColor: c.paper,
              borderRadius: theme.radii.pill,
              paddingHorizontal: SPACE.sm,
              paddingVertical: 3,
              borderWidth: 1,
              borderColor: c.line,
            }}
          >
            <MonoSm muted style={{ fontWeight: '600' }}>
              v{drawing.version}
            </MonoSm>
          </View>
          <View
            style={{
              backgroundColor: c.paper,
              borderRadius: theme.radii.pill,
              paddingHorizontal: SPACE.sm,
              paddingVertical: 3,
              borderWidth: 1,
              borderColor: c.line,
            }}
          >
            <Micro muted>{drawingKindLabel(drawing.kind, DSTR)}</Micro>
          </View>
          {when ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name="clock" size={12} color={c.textMute} />
              <Micro muted>
                {t.publishedLabel} {when}
              </Micro>
            </View>
          ) : null}
        </View>

        {/* File preview */}
        {drawing.file_url ? (
          isImageUrl(drawing.file_url) ? (
            <View style={{ borderRadius: theme.radii.card, overflow: 'hidden' }}>
              <Image
                source={{ uri: drawing.file_url }}
                style={{ width: '100%', height: 220, resizeMode: 'cover' }}
                accessibilityLabel={drawing.title}
              />
            </View>
          ) : (
            /* PDF — no native viewer; open in browser */
            <View
              style={[
                {
                  backgroundColor: c.paper,
                  borderRadius: theme.radii.card,
                  borderWidth: 1,
                  borderColor: c.line,
                  padding: SPACE.xl,
                  alignItems: 'center',
                  gap: SPACE.sm,
                },
              ]}
            >
              <Feather name="file-text" size={36} color={c.accent} />
              <BodyStrong style={{ textAlign: 'center' }}>{drawing.title}</BodyStrong>
              <Button
                title={t.openInBrowser}
                variant="secondary"
                leading={<Feather name="external-link" size={15} color={c.accentDeep} />}
                onPress={() => void openFile()}
              />
            </View>
          )
        ) : (
          <View
            style={{
              backgroundColor: c.paper,
              borderRadius: theme.radii.card,
              borderWidth: 1,
              borderColor: c.line,
              padding: SPACE.xl,
              alignItems: 'center',
            }}
          >
            <Small muted>{t.noFile}</Small>
          </View>
        )}

        {/* "Open in browser" quick-link (also shown for images, as a fallback) */}
        {drawing.file_url ? (
          <Button
            title={t.openInBrowser}
            variant="ghost"
            size="md"
            leading={<Feather name="external-link" size={15} color={c.accentDeep} />}
            onPress={() => void openFile()}
          />
        ) : null}

        {/* AI "what changed" summary */}
        {summary ? (
          surface(
            <View style={{ gap: SPACE.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                <Feather name="edit-3" size={15} color={c.accent} />
                {eyebrow(t.whatChanged)}
              </View>
              <Body>{summary}</Body>
            </View>,
          )
        ) : null}

        {/* Contractor note */}
        {drawing.change_note ? (
          surface(
            <View style={{ gap: SPACE.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                <Feather name="message-square" size={15} color={c.accent} />
                {eyebrow(t.contractorNote)}
              </View>
              <Body>{drawing.change_note}</Body>
            </View>,
          )
        ) : null}

        {/* "What changed from vN-1" — only when supersedes_id is present */}
        {drawing.supersedes_id ? (
          surface(
            <View style={{ gap: SPACE.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                <Feather name="git-commit" size={15} color={c.accent} />
                {eyebrow(t.fromPrev)}
              </View>
              {prevDrawing ? (
                <View style={{ gap: SPACE.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                    <Micro muted>
                      v{prevDrawing.version} → v{drawing.version}
                    </Micro>
                  </View>
                  {prevSummary ? (
                    <Body muted>{prevSummary}</Body>
                  ) : (
                    <Small muted>{t.prevNotFound}</Small>
                  )}
                </View>
              ) : (
                <Small muted>{t.prevNotFound}</Small>
              )}
            </View>,
          )
        ) : null}

        {/* Actions */}
        <View style={{ gap: SPACE.md }}>
          {eyebrow(t.actionsTitle)}

          {/* Approve — HONEST stub: backend approve not built */}
          <View
            style={[
              {
                backgroundColor: c.card,
                borderRadius: theme.radii.card,
                borderWidth: 1,
                borderColor: c.line,
                padding: SPACE.lg,
                gap: SPACE.md,
              },
              theme.shadowCard,
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
              <Feather name="info" size={15} color={c.accentDeep} style={{ marginTop: 2 }} />
              <Body style={{ flex: 1 }}>{t.approveBody}</Body>
            </View>
            <Button
              title={t.approveCta}
              leading={<Feather name="check" size={16} color={c.onAccent} />}
              onPress={() => Alert.alert(t.approveTitle, t.approveBody)}
            />
          </View>

          {/* Comment — stub (no drawings comment endpoint) */}
          <Button
            title={t.commentCta}
            variant="secondary"
            leading={<Feather name="message-circle" size={16} color={c.accentDeep} />}
            onPress={() => showToast(t.commentToast)}
          />

          {/* Request changes — stub */}
          <Button
            title={t.requestChangeCta}
            variant="ghost"
            leading={<Feather name="edit" size={16} color={c.accentDeep} />}
            onPress={() => showToast(t.requestChangeToast)}
          />
        </View>
      </View>
    </Screen>
  )
}
