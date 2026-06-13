/**
 * Team & roles screen (Slice D) — owner-only, fully wired.
 *
 * Design: Neev ink-on-paper, marigold on the single primary invite action,
 * ≥56px tap targets, status never color-alone (StatusPill carries shape+label).
 * Honesty rule: never render an action a person can't take.
 *
 * Sections:
 *   • Roster — members from GET /api/v1/users. Each row: Avatar, name, phone,
 *     role StatusPill, optional "Deactivated" pill. Owner's own row shown but
 *     its manage action is disabled (backend forbids self-edit; 403).
 *   • Invite button → invite sheet (phone + name + role picker).
 *     - Contractor roles → POST /api/v1/invites → join link (copy/share).
 *     - Client role → site picker → POST /api/v1/homeowner/members → join code.
 *   • Manage member (tap non-self row) → manage sheet.
 *     - Role change → honest confirm dialog → PATCH /api/v1/users/{id}.
 *       Privileged role (owner/pm/accountant/procurement) → backend may return
 *       403 step_up_required → StepUpModal → retry with X-Step-Up-Token.
 *     - Deactivate → honest confirm dialog → PATCH; backend always requires
 *       step-up for deactivation → StepUpModal flow.
 *     - Reactivate / non-privileged role changes → no OTP required; succeed on
 *       first attempt.
 */
import { useState } from 'react'
import {
  Alert,
  Modal,
  Pressable,
  Share,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Stack } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE, TAP } from '../../../src/theme/tokens'
import { owner, type Member, type Invite, type HomeownerMemberInvite } from '../../../src/api/owner'
import { ApiError } from '../../../src/api/owner'
import { WEB_BASE } from '../../../src/api/config'
import type { Role, Site } from '../../../src/api/types'
import {
  Avatar,
  Body,
  BodyStrong,
  Button,
  EmptyState,
  H1,
  H2,
  Micro,
  Mono,
  Screen,
  Small,
  StatusPill,
  StepUpModal,
} from '../../../src/ui'
import { ROLE_LABEL } from './_account.util'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type InviteRole = Role | 'client'

const INVITABLE_ROLES: { value: InviteRole; labelKey: string }[] = [
  { value: 'pm', labelKey: 'team.rolePm' },
  { value: 'architect', labelKey: 'team.roleArchitect' },
  { value: 'supervisor', labelKey: 'team.roleSupervisor' },
  { value: 'labor_contractor', labelKey: 'team.roleMukadam' },
  { value: 'accountant', labelKey: 'team.roleAccountant' },
  { value: 'procurement', labelKey: 'team.roleProcurement' },
  { value: 'client', labelKey: 'team.roleClient' },
]

const CHANGEABLE_ROLES: { value: Role; labelKey: string }[] = [
  { value: 'pm', labelKey: 'team.rolePm' },
  { value: 'architect', labelKey: 'team.roleArchitect' },
  { value: 'supervisor', labelKey: 'team.roleSupervisor' },
  { value: 'labor_contractor', labelKey: 'team.roleMukadam' },
  { value: 'accountant', labelKey: 'team.roleAccountant' },
  { value: 'procurement', labelKey: 'team.roleProcurement' },
]

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Build a join link for a contractor invite token. */
export function buildJoinLink(token: string): string {
  return `${WEB_BASE}/join/${token}`
}

/** Returns true when the given member is the signed-in owner (self-edit guard). */
export function isSelf(member: Member, meId: string | undefined): boolean {
  return member.id === meId
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single separator line between rows. */
function Divider() {
  const { theme } = useTheme()
  return (
    <View
      style={{ height: 1, backgroundColor: theme.colors.line, marginLeft: SPACE.lg + 48 + SPACE.md }}
    />
  )
}

/** Member row in the roster. */
function MemberRow({
  member,
  self,
  onPress,
  last,
}: {
  member: Member
  self: boolean
  onPress: () => void
  last?: boolean
}) {
  const { theme } = useTheme()
  const { t } = useT()
  const roleLabelEn = ROLE_LABEL[member.role]?.en ?? member.role

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${member.name}, ${roleLabelEn}${self ? ', you' : ''}${!member.is_active ? ', deactivated' : ''}`}
        disabled={self}
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          minHeight: TAP + 8,
          paddingHorizontal: SPACE.lg,
          paddingVertical: SPACE.md,
          backgroundColor: pressed && !self ? AP.surfaceLow : 'transparent',
          opacity: !member.is_active ? 0.55 : 1,
        })}
      >
        {/* Avatar */}
        <Avatar name={member.name} size={48} />

        {/* Name + phone + pills */}
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
            <BodyStrong>{member.name || '—'}</BodyStrong>
            {self ? (
              <Micro color={theme.colors.accent} style={{ fontWeight: '600' }}>
                {t('team.selfNote')}
              </Micro>
            ) : null}
          </View>
          {member.phone ? (
            <Mono muted style={{ marginTop: 1 }}>{member.phone}</Mono>
          ) : null}
          <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: 4, flexWrap: 'wrap' }}>
            <StatusPill
              status="info"
              label={roleLabelEn}
              size="sm"
              icon="briefcase"
            />
            {!member.is_active ? (
              <StatusPill
                status="risk"
                label={t('team.deactivated')}
                size="sm"
                icon="slash"
              />
            ) : null}
          </View>
        </View>

        {/* Chevron (only for non-self) */}
        {!self ? (
          <Feather name="chevron-right" size={20} color={theme.colors.textMute} />
        ) : null}
      </Pressable>
      {!last ? <Divider /> : null}
    </>
  )
}

/** Modal bottom sheet wrapper. */
function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const { theme } = useTheme()
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Pressable
          style={{
            backgroundColor: theme.colors.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: SPACE.lg,
            paddingBottom: SPACE.xxl,
            gap: SPACE.md,
          }}
          onPress={() => undefined}
        >
          {/* Handle */}
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.line,
              alignSelf: 'center',
              marginBottom: SPACE.sm,
            }}
          />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

/** Role picker row inside the sheets. */
function RoleOption({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const { theme } = useTheme()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: TAP,
        paddingHorizontal: SPACE.md,
        paddingVertical: SPACE.sm,
        borderRadius: theme.radii.chip,
        backgroundColor: selected
          ? `${theme.colors.accent}18`
          : pressed
            ? AP.surfaceLow
            : 'transparent',
      })}
    >
      <Body color={selected ? theme.colors.accent : theme.colors.text}>{label}</Body>
      {selected ? (
        <Feather name="check" size={18} color={theme.colors.accent} />
      ) : null}
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// Invite sheet — two states: form / result
// ---------------------------------------------------------------------------

function InviteSheet({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const { theme } = useTheme()
  const { t } = useT()
  const inputStyle = useInputStyle(theme)

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<InviteRole>('supervisor')
  const [error, setError] = useState<string | null>(null)
  const [createdInvite, setCreatedInvite] = useState<Invite | null>(null)
  const [createdClient, setCreatedClient] = useState<HomeownerMemberInvite | null>(null)
  const [copied, setCopied] = useState(false)

  // Site picker for client invites
  const { data: sitesPage } = useQuery({
    queryKey: ['owner', 'sites'],
    queryFn: () => owner.sites(),
    enabled: role === 'client' && visible,
  })
  const sites: Site[] = sitesPage?.items ?? []
  const [siteId, setSiteId] = useState('')
  // Auto-select the only site
  if (sites.length > 0 && !siteId) setSiteId(sites[0].id)

  const inviteMut = useMutation<Invite | HomeownerMemberInvite, Error, void>({
    mutationFn: () => {
      if (role === 'client') {
        return owner.inviteClient({
          site_id: siteId,
          phone: phone.trim() || undefined,
          name: name.trim() || undefined,
        }) as Promise<Invite | HomeownerMemberInvite>
      }
      return owner.invite({
        phone: phone.trim(),
        role: role as Role,
        name: name.trim() || undefined,
      }) as Promise<Invite | HomeownerMemberInvite>
    },
    onSuccess: (result) => {
      if (role === 'client') {
        setCreatedClient(result as HomeownerMemberInvite)
      } else {
        setCreatedInvite(result as Invite)
      }
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : t('common.somethingWrong'))
    },
  })

  function reset() {
    setPhone('')
    setName('')
    setRole('supervisor')
    setError(null)
    setCreatedInvite(null)
    setCreatedClient(null)
    setCopied(false)
    setSiteId('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  // --- Result view: client join code ---
  if (createdClient) {
    const code = createdClient.join_code
    return (
      <Sheet visible={visible} onClose={handleClose}>
        <H2>{t('team.inviteClientTitle')}</H2>
        <View
          style={{
            backgroundColor: theme.colors.bg,
            borderRadius: theme.radii.card,
            borderWidth: 1,
            borderColor: theme.colors.line,
            padding: SPACE.md,
            gap: SPACE.xs,
          }}
        >
          <Small muted style={{ letterSpacing: 1 }}>
            {t('team.inviteClientCode').toUpperCase()}
          </Small>
          <Mono
            style={{
              fontSize: 28,
              lineHeight: 36,
              letterSpacing: 4,
              fontWeight: '700',
              color: theme.colors.text,
            }}
          >
            {code}
          </Mono>
        </View>
        <Body muted style={{ lineHeight: 20 }}>
          {t('team.inviteClientInstructions')}
        </Body>
        <Button
          title={copied ? t('team.inviteLinkCopied') : t('team.inviteClientCopy')}
          variant="accent"
          block
          onPress={() => {
            void Share.share({ message: code })
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        />
        <Button
          title={t('team.inviteAnother')}
          variant="ghost"
          block
          onPress={reset}
        />
      </Sheet>
    )
  }

  // --- Result view: contractor join link ---
  if (createdInvite) {
    const link = buildJoinLink(createdInvite.token)
    const roleName = t(`team.role${roleKey(createdInvite.role)}`)
    return (
      <Sheet visible={visible} onClose={handleClose}>
        <H2>{t('team.inviteLinkTitle')}</H2>
        <Body muted>
          {roleName}
          {createdInvite.phone ? ` · ${createdInvite.phone}` : ''}
        </Body>
        <Body muted style={{ lineHeight: 20 }}>
          {t('team.inviteLinkBody')}
        </Body>
        <View
          style={{
            backgroundColor: theme.colors.bg,
            borderRadius: theme.radii.chip,
            borderWidth: 1,
            borderColor: theme.colors.line,
            padding: SPACE.md,
          }}
        >
          <Mono muted style={{ fontSize: 13, lineHeight: 18 }} numberOfLines={3}>
            {link}
          </Mono>
        </View>
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          <Button
            title={t('team.inviteLinkShare')}
            variant="accent"
            style={{ flex: 1 }}
            onPress={() => void Share.share({ message: link, url: link })}
          />
          <Button
            title={copied ? t('team.inviteLinkCopied') : t('team.inviteLinkCopy')}
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => {
              void Share.share({ message: link })
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
          />
        </View>
        <Button
          title={t('team.inviteAnother')}
          variant="ghost"
          block
          onPress={reset}
        />
      </Sheet>
    )
  }

  // --- Form view ---
  const isClient = role === 'client'
  const canSubmit = isClient
    ? Boolean(siteId)
    : Boolean(phone.trim())

  return (
    <Sheet visible={visible} onClose={handleClose}>
      <H2>{t('team.inviteTitle')}</H2>

      {/* Phone */}
      <View style={{ gap: SPACE.xs }}>
        <Small muted>{t('team.invitePhone')}</Small>
        <TextInput
          style={inputStyle}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="+91"
          placeholderTextColor={theme.colors.textMute}
          returnKeyType="next"
        />
      </View>

      {/* Name */}
      <View style={{ gap: SPACE.xs }}>
        <Small muted>{t('team.inviteName')}</Small>
        <TextInput
          style={inputStyle}
          value={name}
          onChangeText={setName}
          autoComplete="name"
          placeholder={t('auth.namePlaceholder')}
          placeholderTextColor={theme.colors.textMute}
          returnKeyType="done"
        />
      </View>

      {/* Role picker */}
      <View style={{ gap: SPACE.xs }}>
        <Small muted>{t('team.inviteRole')}</Small>
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.line,
            borderRadius: theme.radii.card,
            overflow: 'hidden',
          }}
        >
          {INVITABLE_ROLES.map((opt) => (
            <RoleOption
              key={opt.value}
              label={t(opt.labelKey)}
              selected={role === opt.value}
              onPress={() => {
                setRole(opt.value)
                setError(null)
              }}
            />
          ))}
        </View>
      </View>

      {/* Site picker (client only) */}
      {isClient && sites.length > 1 ? (
        <View style={{ gap: SPACE.xs }}>
          <Small muted>{t('team.inviteClientSite')}</Small>
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.line,
              borderRadius: theme.radii.card,
              overflow: 'hidden',
            }}
          >
            {sites.map((s) => (
              <RoleOption
                key={s.id}
                label={s.name}
                selected={siteId === s.id}
                onPress={() => setSiteId(s.id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {error ? (
        <Body color={theme.colors.risk}>{error}</Body>
      ) : null}

      <Button
        title={inviteMut.isPending
          ? t('team.inviteCreating')
          : isClient
            ? t('team.inviteClientAction')
            : t('team.inviteAction')}
        variant="accent"
        block
        disabled={!canSubmit || inviteMut.isPending}
        loading={inviteMut.isPending}
        onPress={() => inviteMut.mutate()}
      />
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Manage member sheet
// ---------------------------------------------------------------------------

function ManageSheet({
  member,
  onClose,
  onDone,
}: {
  member: Member | null
  onClose: () => void
  onDone: () => void
}) {
  const { theme } = useTheme()
  const { t } = useT()
  const queryClient = useQueryClient()
  const [newRole, setNewRole] = useState<Role | null>(null)

  // ---------------------------------------------------------------------------
  // Step-up state — holds the pending patch until the OTP is verified.
  // ---------------------------------------------------------------------------
  const [stepUpVisible, setStepUpVisible] = useState(false)
  const [pendingPatch, setPendingPatch] = useState<{ role?: Role; is_active?: boolean } | null>(null)

  // ---------------------------------------------------------------------------
  // Core mutation — accepts optional step-up token.
  // ---------------------------------------------------------------------------
  const updateMut = useMutation({
    mutationFn: ({
      patch,
      stepUpToken,
    }: {
      patch: { role?: Role; is_active?: boolean }
      stepUpToken?: string
    }) => owner.updateMember(member!.id, patch, stepUpToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['owner', 'members'] })
      setPendingPatch(null)
      onDone()
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.code === 'step_up_required') {
        // Backend demands a step-up token — open the OTP modal.
        setStepUpVisible(true)
      } else {
        // Non-step-up error; surface it in the sheet and clear pending.
        setPendingPatch(null)
      }
    },
  })

  if (!member) return null

  // ---------------------------------------------------------------------------
  // Entry point for all mutations: try without a token first; the onError
  // handler opens the step-up modal if the backend says step_up_required.
  // ---------------------------------------------------------------------------
  function applyPatch(patch: { role?: Role; is_active?: boolean }) {
    setPendingPatch(patch)
    updateMut.mutate({ patch })
  }

  // ---------------------------------------------------------------------------
  // Confirm dialogs (intent gate — always shown before any mutation).
  // ---------------------------------------------------------------------------

  function confirmChangeRole(targetRole: Role) {
    const roleName = ROLE_LABEL[targetRole]?.en ?? targetRole
    Alert.alert(
      t('team.confirmChangeRoleTitle'),
      t('team.confirmChangeRoleMsg', { name: member!.name || '', role: roleName }),
      [
        { text: t('team.confirmCancel'), style: 'cancel' },
        {
          text: t('team.confirmOk'),
          onPress: () => applyPatch({ role: targetRole }),
        },
      ],
    )
  }

  function confirmDeactivate() {
    Alert.alert(
      t('team.confirmDeactivateTitle'),
      t('team.confirmDeactivateMsg', { name: member!.name || '' }),
      [
        { text: t('team.confirmCancel'), style: 'cancel' },
        {
          text: t('team.confirmOk'),
          style: 'destructive',
          onPress: () => applyPatch({ is_active: false }),
        },
      ],
    )
  }

  function confirmReactivate() {
    Alert.alert(
      t('team.confirmReactivateTitle'),
      t('team.confirmReactivateMsg', { name: member!.name || '' }),
      [
        { text: t('team.confirmCancel'), style: 'cancel' },
        {
          text: t('team.confirmOk'),
          onPress: () => applyPatch({ is_active: true }),
        },
      ],
    )
  }

  // ---------------------------------------------------------------------------
  // Step-up callback: OTP verified → retry original patch with the token.
  // ---------------------------------------------------------------------------
  function handleStepUpVerified(token: string) {
    setStepUpVisible(false)
    if (pendingPatch) {
      updateMut.mutate({ patch: pendingPatch, stepUpToken: token })
    }
  }

  function handleStepUpCancel() {
    setStepUpVisible(false)
    setPendingPatch(null)
    updateMut.reset()
  }

  // Show a non-step-up error in the sheet only when the modal is not open.
  const showError =
    updateMut.isError &&
    !(updateMut.error instanceof ApiError && updateMut.error.code === 'step_up_required')

  return (
    <>
      <Sheet visible={!!member} onClose={onClose}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.sm }}>
          <Avatar name={member.name} size={48} />
          <View style={{ flex: 1 }}>
            <BodyStrong>{member.name || '—'}</BodyStrong>
            {member.phone ? <Mono muted style={{ marginTop: 2 }}>{member.phone}</Mono> : null}
          </View>
        </View>

        {/* Role change */}
        <View style={{ gap: SPACE.xs }}>
          <Small muted style={{ letterSpacing: 1 }}>
            {t('team.manageRole').toUpperCase()}
          </Small>
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.line,
              borderRadius: theme.radii.card,
              overflow: 'hidden',
            }}
          >
            {CHANGEABLE_ROLES.map((opt) => (
              <RoleOption
                key={opt.value}
                label={t(opt.labelKey)}
                selected={(newRole ?? member.role) === opt.value}
                onPress={() => {
                  if (opt.value !== member.role) {
                    setNewRole(opt.value)
                    confirmChangeRole(opt.value)
                  }
                }}
              />
            ))}
          </View>
        </View>

        {showError ? (
          <Body color={theme.colors.risk}>
            {updateMut.error instanceof ApiError
              ? updateMut.error.message
              : t('common.somethingWrong')}
          </Body>
        ) : null}

        {/* Deactivate / Reactivate */}
        {member.is_active ? (
          <Button
            title={updateMut.isPending ? t('team.manageSaving') : t('team.manageDeactivate')}
            variant="danger"
            block
            disabled={updateMut.isPending}
            onPress={confirmDeactivate}
          />
        ) : (
          <Button
            title={updateMut.isPending ? t('team.manageSaving') : t('team.manageReactivate')}
            variant="secondary"
            block
            disabled={updateMut.isPending}
            onPress={confirmReactivate}
          />
        )}
      </Sheet>

      {/* Step-up OTP modal — rendered outside Sheet so it layers on top */}
      <StepUpModal
        visible={stepUpVisible}
        onVerified={handleStepUpVerified}
        onCancel={handleStepUpCancel}
      />
    </>
  )
}


// ---------------------------------------------------------------------------
// Helper: map a Role to the labelKey suffix used in i18n
// ---------------------------------------------------------------------------
function roleKey(role: Role): string {
  const map: Partial<Record<Role, string>> = {
    pm: 'Pm',
    architect: 'Architect',
    supervisor: 'Supervisor',
    labor_contractor: 'Mukadam',
    accountant: 'Accountant',
    procurement: 'Procurement',
    homeowner: 'Client',
  }
  return map[role] ?? 'Pm'
}

// ---------------------------------------------------------------------------
// Inline input style hook (avoids importing unused hook)
// ---------------------------------------------------------------------------
function useInputStyle(theme: ReturnType<typeof useTheme>['theme']) {
  return {
    minHeight: TAP,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radii.control,
    paddingHorizontal: SPACE.lg,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    fontSize: 16,
    letterSpacing: 0,
  }
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function Team() {
  const { t } = useT()
  const { theme } = useTheme()
  const { me } = useAuth()

  const [inviteOpen, setInviteOpen] = useState(false)
  const [managedMember, setManagedMember] = useState<Member | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['owner', 'members'],
    queryFn: () => owner.members(),
  })

  const members: Member[] = data?.items ?? []

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <H1>{t('team.title')}</H1>
          <Body muted style={{ marginTop: 2 }}>{t('team.subtitle')}</Body>
        </View>
        <Button
          title={t('team.inviteButton')}
          variant="accent"
          size="md"
          onPress={() => setInviteOpen(true)}
          leading={<Feather name="user-plus" size={16} color={theme.colors.onAccent} />}
        />
      </View>

      {/* Roster */}
      {isLoading ? (
        <Body muted style={{ marginTop: SPACE.md }}>{t('team.loading')}</Body>
      ) : isError ? (
        <EmptyState
          variant="offline"
          title={t('team.error')}
          action={
            <Button title={t('common.retry')} variant="secondary" onPress={() => void refetch()} />
          }
        />
      ) : members.length === 0 ? (
        <EmptyState
          variant="empty"
          title={t('team.empty')}
          body={t('team.emptyBody')}
          icon="users"
          action={
            <Button
              title={t('team.inviteButton')}
              variant="accent"
              onPress={() => setInviteOpen(true)}
            />
          }
        />
      ) : (
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: theme.radii.card,
            borderWidth: 1,
            borderColor: theme.colors.line,
            overflow: 'hidden',
            ...theme.shadowCard,
          }}
        >
          {members.map((m, idx) => {
            const self = isSelf(m, me?.id)
            return (
              <MemberRow
                key={m.id}
                member={m}
                self={self}
                last={idx === members.length - 1}
                onPress={() => {
                  if (!self) setManagedMember(m)
                }}
              />
            )
          })}
        </View>
      )}

      {/* Invite sheet */}
      <InviteSheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />

      {/* Manage member sheet */}
      <ManageSheet
        member={managedMember}
        onClose={() => setManagedMember(null)}
        onDone={() => setManagedMember(null)}
      />
    </Screen>
  )
}
