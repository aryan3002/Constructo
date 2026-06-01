/**
 * Household — Primary/Co-owner seeds their family before starting design intake.
 *
 * Features:
 *   - Shows the current household roster (GET /members/roster)
 *   - Add-member form: name + phone + sub-role (co_owner/family/advisor)
 *   - co_owner add shows a money-approver confirm ("Rahul will also approve costs")
 *   - Enforces MAX_HOUSEHOLD = 6 (server is source of truth; surface 403 gracefully)
 *   - Shows invited/pending state per member
 *   - Share invite link via Share sheet (WhatsApp/SMS)
 *   - "Continue to Design" → /(homeowner)/intake  |  "Skip" → /(homeowner)/home
 *
 * Guards: only Primary/Co-owner may reach this screen. Family/Advisor are
 * never routed here (welcome.tsx branches them away before arriving).
 */
import { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, Share, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { homeowner, ApiError } from '../../src/api/client'
import type { HomeownerMember } from '../../src/api/types'
import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE, TAP } from '../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Card,
  Display,
  Micro,
  Screen,
  Small,
} from '../../src/ui'
import {
  emptyDraft,
  INVITABLE_ROLES,
  MAX_HOUSEHOLD,
  ROLE_DESC,
  ROLE_LABEL,
  statusLabel,
  subRoleLabel,
  validateDraft,
  type InvitableSubRole,
  type Lang,
  type MemberDraft,
} from './_household.util'

// ---- copy ----------------------------------------------------------------
const STR = {
  en: {
    title: 'Your household',
    subtitle: 'Add family members so they can follow the build. You can always do this later.',
    cap: `Up to ${MAX_HOUSEHOLD} members total`,
    addMember: 'Add a member',
    namePlaceholder: 'Name (e.g. Priya)',
    phonePlaceholder: '+91 98765 43210',
    rolePick: 'Role',
    sendInvite: 'Send invite',
    sending: 'Sending…',
    coOwnerConfirmTitle: 'Are you sure?',
    coOwnerConfirmBody:
      '{name} will also be able to approve costs — the same authority as you.',
    coOwnerConfirm: 'Yes, add as co-owner',
    cancel: 'Cancel',
    inviteLink: 'Share invite link',
    remove: 'Remove',
    roster: 'Members',
    rosterEmpty: 'No members yet.',
    continue: 'Continue to design',
    skip: 'Skip for now',
    capReached: `Household is full (max ${MAX_HOUSEHOLD}). Remove a member to add more.`,
    inviteSuccess: 'Invite sent!',
    error: 'Something went wrong',
  },
  hi: {
    title: 'आपका परिवार',
    subtitle: 'परिवार के सदस्य जोड़ें ताकि वे निर्माण का हाल देख सकें। बाद में भी जोड़ सकते हैं।',
    cap: `अधिकतम ${MAX_HOUSEHOLD} सदस्य`,
    addMember: 'सदस्य जोड़ें',
    namePlaceholder: 'नाम (जैसे प्रिया)',
    phonePlaceholder: '+91 98765 43210',
    rolePick: 'भूमिका',
    sendInvite: 'आमंत्रण भेजें',
    sending: 'भेज रहे हैं…',
    coOwnerConfirmTitle: 'क्या आप सुनिश्चित हैं?',
    coOwnerConfirmBody:
      '{name} भी खर्च मंज़ूर कर सकेंगे — आपके जैसी ही अधिकारिता।',
    coOwnerConfirm: 'हाँ, सह-मालिक बनाएँ',
    cancel: 'रद्द करें',
    inviteLink: 'आमंत्रण लिंक साझा करें',
    remove: 'हटाएँ',
    roster: 'सदस्य',
    rosterEmpty: 'अभी कोई सदस्य नहीं।',
    continue: 'डिज़ाइन शुरू करें',
    skip: 'अभी छोड़ें',
    capReached: `परिवार भर गया है (अधिकतम ${MAX_HOUSEHOLD})। और जोड़ने के लिए किसी को हटाएँ।`,
    inviteSuccess: 'आमंत्रण भेजा गया!',
    error: 'कुछ गड़बड़ हो गई',
  },
} as const

export default function Household() {
  const { lang } = useT()
  const { theme } = useTheme()
  const { siteId } = useAuth()
  const router = useRouter()
  const qc = useQueryClient()
  const L: Lang = lang === 'hi' ? 'hi' : 'en'
  const tx = STR[L]

  const [draft, setDraft] = useState<MemberDraft>(emptyDraft())
  const [draftError, setDraftError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [flashMsg, setFlashMsg] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  // Fetch roster
  const rosterQ = useQuery({
    queryKey: ['household-roster', siteId],
    queryFn: () => homeowner.roster(siteId ?? undefined),
  })
  const members: HomeownerMember[] = rosterQ.data ?? []
  const atCap = members.length >= MAX_HOUSEHOLD

  // Invite mutation
  const inviteMut = useMutation({
    mutationFn: (d: MemberDraft) =>
      homeowner.inviteMember({
        display_name: d.name.trim(),
        phone: d.phone.trim(),
        sub_role: d.sub_role,
        site_id: siteId ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['household-roster'] })
      setDraft(emptyDraft())
      setServerError(null)
      flash(tx.inviteSuccess)
    },
    onError: (e) => {
      setServerError(e instanceof ApiError ? e.message : tx.error)
    },
  })

  // Remove mutation
  const removeMut = useMutation({
    mutationFn: (id: string) => homeowner.removeMember(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['household-roster'] }),
    onError: (e) => setServerError(e instanceof ApiError ? e.message : tx.error),
  })

  function flash(msg: string) {
    setFlashMsg(msg)
    setTimeout(() => setFlashMsg(null), 3000)
  }

  function tryAdd() {
    const err = validateDraft(draft, L)
    if (err) { setDraftError(err); return }
    setDraftError(null)
    if (draft.sub_role === 'co_owner') {
      setShowConfirm(true)
    } else {
      inviteMut.mutate(draft)
    }
  }

  function confirmCoOwner() {
    setShowConfirm(false)
    inviteMut.mutate(draft)
  }

  async function shareMember(member: HomeownerMember) {
    try {
      await Share.share({
        message: `Join my home on Constructo: ${member.invite_link}`,
        url: member.invite_link,
      })
    } catch {
      // share sheet dismissed — ignore
    }
  }

  const inputStyle = {
    minHeight: TAP,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radii.control,
    paddingHorizontal: SPACE.lg,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    fontSize: 16,
  } as const

  return (
    <Screen>
      <View style={{ gap: SPACE.sm }}>
        <Display>{tx.title}</Display>
        <Small muted>{tx.subtitle}</Small>
        <Small muted>{tx.cap}</Small>
      </View>

      {/* Flash message */}
      {flashMsg ? (
        <View
          style={{
            backgroundColor: AP.chip,
            borderRadius: theme.radii.control,
            padding: SPACE.md,
          }}
        >
          <Small style={{ color: AP.onChip }}>{flashMsg}</Small>
        </View>
      ) : null}

      {/* Add-member form */}
      {!atCap ? (
        <Card style={{ gap: SPACE.md }}>
          <BodyStrong>{tx.addMember}</BodyStrong>
          <TextInput
            value={draft.name}
            onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))}
            placeholder={tx.namePlaceholder}
            placeholderTextColor={theme.colors.textMute}
            style={inputStyle}
            autoCapitalize="words"
          />
          <TextInput
            value={draft.phone}
            onChangeText={(v) => setDraft((d) => ({ ...d, phone: v }))}
            placeholder={tx.phonePlaceholder}
            placeholderTextColor={theme.colors.textMute}
            keyboardType="phone-pad"
            style={inputStyle}
          />

          {/* Role picker */}
          <View style={{ gap: SPACE.xs }}>
            <Small muted>{tx.rolePick}</Small>
            <View style={{ flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap' }}>
              {INVITABLE_ROLES.map((r) => {
                const active = draft.sub_role === r
                return (
                  <Pressable
                    key={r}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setDraft((d) => ({ ...d, sub_role: r }))}
                    style={{
                      borderRadius: theme.radii.pill,
                      borderWidth: 1,
                      borderColor: active ? theme.colors.accent : theme.colors.line,
                      backgroundColor: active ? theme.colors.accentWarm : theme.colors.card,
                      paddingHorizontal: SPACE.md,
                      paddingVertical: SPACE.xs,
                      minHeight: TAP,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Small style={{ color: active ? theme.colors.accent : theme.colors.text }}>
                      {ROLE_LABEL[r][L]}
                    </Small>
                  </Pressable>
                )
              })}
            </View>
            <Small muted style={{ fontStyle: 'italic' }}>
              {ROLE_DESC[draft.sub_role as InvitableSubRole]?.[L] ?? ''}
            </Small>
          </View>

          {draftError ? <Small color={theme.colors.risk}>{draftError}</Small> : null}
          {serverError ? <Small color={theme.colors.risk}>{serverError}</Small> : null}

          <Button
            title={inviteMut.isPending ? tx.sending : tx.sendInvite}
            block
            loading={inviteMut.isPending}
            onPress={tryAdd}
          />
        </Card>
      ) : (
        <Card>
          <Small color={theme.colors.warn}>{tx.capReached}</Small>
        </Card>
      )}

      {/* Roster */}
      <View style={{ gap: SPACE.sm }}>
        <Micro style={{ letterSpacing: 2, color: theme.colors.textMute }}>
          {tx.roster.toUpperCase()}
        </Micro>

        {rosterQ.isLoading ? (
          <ActivityIndicator color={theme.colors.accent} />
        ) : members.length === 0 ? (
          <Small muted>{tx.rosterEmpty}</Small>
        ) : (
          members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              lang={L}
              onShare={() => void shareMember(m)}
              onRemove={() => removeMut.mutate(m.id)}
              theme={theme}
            />
          ))
        )}
      </View>

      {/* Navigation */}
      <View style={{ gap: SPACE.md, marginTop: SPACE.sm }}>
        <Button title={tx.continue} block size="lg" onPress={() => router.replace('/(homeowner)/intake')} />
        <Button title={tx.skip} block variant="ghost" onPress={() => router.replace('/(homeowner)/home')} />
      </View>

      {/* Co-owner confirm modal */}
      <Modal transparent visible={showConfirm} animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: SPACE.xl,
          }}
        >
          <View
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: theme.radii.sheet,
              padding: SPACE.xl,
              gap: SPACE.lg,
              width: '100%',
            }}
          >
            <BodyStrong>{tx.coOwnerConfirmTitle}</BodyStrong>
            <Body muted>
              {tx.coOwnerConfirmBody.replace('{name}', draft.name || 'This person')}
            </Body>
            <Button title={tx.coOwnerConfirm} block onPress={confirmCoOwner} />
            <Button title={tx.cancel} block variant="ghost" onPress={() => setShowConfirm(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  )
}

// ---- Member row component ------------------------------------------------
function MemberRow({
  member,
  lang,
  onShare,
  onRemove,
  theme,
}: {
  member: HomeownerMember
  lang: Lang
  onShare: () => void
  onRemove: () => void
  theme: ReturnType<typeof useTheme>['theme']
}) {
  const isPrimary = member.sub_role === 'primary_owner'
  const isInvited = member.status === 'invited'

  return (
    <Card
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: SPACE.md,
        borderLeftWidth: isInvited ? 3 : 0,
        borderLeftColor: isInvited ? theme.colors.warn : 'transparent',
      }}
    >
      <View style={{ flex: 1, gap: SPACE.xs }}>
        <BodyStrong>{member.display_name ?? member.phone ?? '—'}</BodyStrong>
        <Small muted>{subRoleLabel(member.sub_role, lang)}</Small>
        <Small
          style={{ color: isInvited ? theme.colors.warn : theme.colors.ok }}
        >
          {statusLabel(member.status, lang)}
        </Small>
      </View>

      <View style={{ gap: SPACE.sm, alignItems: 'flex-end' }}>
        {isInvited ? (
          <Pressable
            accessibilityRole="button"
            onPress={onShare}
            style={{
              borderRadius: theme.radii.pill,
              backgroundColor: AP.chip,
              paddingHorizontal: SPACE.md,
              paddingVertical: 6,
              minHeight: TAP,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Small style={{ color: AP.onChip }}>
              {lang === 'hi' ? 'लिंक भेजें' : 'Share link'}
            </Small>
          </Pressable>
        ) : null}

        {!isPrimary ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRemove}
            hitSlop={8}
            style={{ minHeight: TAP, alignItems: 'center', justifyContent: 'center' }}
          >
            <Small color={theme.colors.risk}>
              {lang === 'hi' ? 'हटाएँ' : 'Remove'}
            </Small>
          </Pressable>
        ) : null}
      </View>
    </Card>
  )
}
