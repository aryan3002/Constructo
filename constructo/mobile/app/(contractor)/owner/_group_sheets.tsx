/**
 * Group sheets (doc 18 Phase 2) — the owner-facing creation + management UI for
 * named, site-scoped multi-party threads.
 *
 *  - **NewGroupSheet**: name → pick one site → multi-select the site's addable
 *    users → Create. The caller becomes admin server-side (not listed/selected
 *    here). On success we invalidate the inbox and push straight into the new
 *    group thread.
 *  - **ManageGroupSheet** (admin-only): rename, per-member remove / admin
 *    delegate-demote, add more site users, and archive. Every last_admin guard
 *    (409) surfaces inline — never a silent failure.
 *
 * Blueprint theme: warm paper, amber FILL with dark ink for the one primary
 * action, ≥48px taps, Mono for nothing here (ids hidden), bilingual EN/HI, no
 * emoji. The "Client" cue pairs a ◆ shape with the --info tint, never color-
 * alone. Modal sheets squared to `radii.sheet`, safe-area bottom pad.
 */
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, STATUS, TAP } from '../../../src/theme/tokens'
import { BodyStrong, Small } from '../../../src/ui'
import { useInputStyle } from '../../../src/ui/useInputStyle'
import { ApiError } from '../../../src/api/client'
import { owner } from '../../../src/api/owner'
import { groupsApi, type AddableUser, type GroupMember } from '../../../src/api/groups'

type Lang = 'en' | 'hi'

const STR = {
  en: {
    close: 'Close',
    newTitle: 'New group',
    namePlaceholder: 'Group name e.g. "Site A — Finishing"',
    pickSite: 'Site',
    pickSiteHint: 'Pick the site this group belongs to.',
    noSites: 'No sites yet.',
    members: 'Members',
    membersHint: 'Add the people who should be in this thread. You are added as admin.',
    noAddable: 'No one else to add on this site yet.',
    client: 'Client',
    create: 'Create group',
    creating: 'Creating…',
    cancel: 'Cancel',
    createFailed: 'Could not create the group — try again.',
    // manage
    manageTitle: 'Manage group',
    rename: 'Name',
    save: 'Save',
    roster: 'Members',
    admin: 'Admin',
    member: 'Member',
    makeAdmin: 'Make admin',
    makeMember: 'Make member',
    remove: 'Remove',
    confirmRemove: 'Remove this member?',
    addMore: 'Add members',
    add: 'Add',
    archive: 'Archive group',
    archiving: 'Archiving…',
    confirmArchive: 'Archive this group? It will leave everyone’s inbox.',
    yes: 'Yes',
    no: 'No',
    lastAdmin: 'A group needs at least one admin — promote someone else first.',
    loadFailed: 'Could not load this group.',
    failed: 'Something went wrong — try again.',
    nothingToAdd: 'No one else to add on this site.',
  },
  hi: {
    close: 'बंद करें',
    newTitle: 'नया ग्रुप',
    namePlaceholder: 'ग्रुप का नाम जैसे "साइट A — फिनिशिंग"',
    pickSite: 'साइट',
    pickSiteHint: 'यह ग्रुप किस साइट का है, चुनें।',
    noSites: 'अभी कोई साइट नहीं।',
    members: 'सदस्य',
    membersHint: 'जिन्हें इस चैट में रखना है उन्हें जोड़ें। आप एडमिन के रूप में जुड़ते हैं।',
    noAddable: 'इस साइट पर जोड़ने के लिए अभी कोई और नहीं।',
    client: 'ग्राहक',
    create: 'ग्रुप बनाएँ',
    creating: 'बन रहा है…',
    cancel: 'रद्द करें',
    createFailed: 'ग्रुप नहीं बना — फिर कोशिश करें।',
    // manage
    manageTitle: 'ग्रुप प्रबंधन',
    rename: 'नाम',
    save: 'सेव',
    roster: 'सदस्य',
    admin: 'एडमिन',
    member: 'सदस्य',
    makeAdmin: 'एडमिन बनाएँ',
    makeMember: 'सदस्य बनाएँ',
    remove: 'हटाएँ',
    confirmRemove: 'इस सदस्य को हटाएँ?',
    addMore: 'सदस्य जोड़ें',
    add: 'जोड़ें',
    archive: 'ग्रुप संग्रहित करें',
    archiving: 'संग्रहित हो रहा है…',
    confirmArchive: 'यह ग्रुप संग्रहित करें? यह सबके इनबॉक्स से हट जाएगा।',
    yes: 'हाँ',
    no: 'नहीं',
    lastAdmin: 'ग्रुप में कम-से-कम एक एडमिन ज़रूरी है — पहले किसी और को एडमिन बनाएँ।',
    loadFailed: 'यह ग्रुप लोड नहीं हो सका।',
    failed: 'कुछ ग़लत हुआ — फिर कोशिश करें।',
    nothingToAdd: 'इस साइट पर जोड़ने के लिए कोई और नहीं।',
  },
} as const

/**
 * Maps an error to a human line: a 409 last_admin guard surfaces its specific
 * message; otherwise the caller's `fallback` (or the generic `t.failed`).
 */
function errLine(e: unknown, t: (typeof STR)[Lang], fallback?: string): string {
  if (e instanceof ApiError && (e.code === 'last_admin' || e.status === 409)) return t.lastAdmin
  return fallback ?? t.failed
}

/** Reusable sheet shell — dimmed backdrop, squared top, safe-area bottom pad. */
function SheetShell({
  visible,
  onClose,
  children,
}: {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(21,23,28,0.45)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: theme.colors.card,
            borderTopLeftRadius: theme.radii.sheet,
            borderTopRightRadius: theme.radii.sheet,
            paddingTop: SPACE.lg,
            paddingHorizontal: SPACE.lg,
            paddingBottom: Math.max(insets.bottom, SPACE.lg),
            maxHeight: '88%',
          }}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

/** Sheet header: title + close affordance (≥44px hit). */
function SheetHead({
  title,
  closeLabel,
  onClose,
}: {
  title: string
  closeLabel: string
  onClose: () => void
}) {
  const { theme } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        marginBottom: SPACE.md,
      }}
    >
      <BodyStrong style={{ flex: 1 }}>{title}</BodyStrong>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        hitSlop={10}
        onPress={onClose}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Feather name="x" size={22} color={theme.colors.textMute} />
      </Pressable>
    </View>
  )
}

/** A small "Client" cue — ◆ shape + --info tint (never color-alone). */
function ClientTag({ label, color }: { label: string; color: string }) {
  const { theme } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: theme.colors.infoTint,
      }}
    >
      <Small style={{ color }}>◆</Small>
      <Small style={{ color }}>{label}</Small>
    </View>
  )
}

/**
 * A selectable user row (checkbox-style toggle into a Set). Shared by both the
 * create member multi-select and the manage "add more" sub-section.
 */
function SelectableUserRow({
  name,
  role,
  isClient,
  selected,
  disabled,
  clientLabel,
  onToggle,
}: {
  name: string
  role: string
  isClient: boolean
  selected: boolean
  disabled?: boolean
  clientLabel: string
  onToggle: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={name}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => ({
        minHeight: TAP,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        paddingVertical: SPACE.sm,
        paddingHorizontal: SPACE.md,
        borderWidth: 1,
        borderColor: selected ? c.accent : c.line,
        borderRadius: theme.radii.control,
        backgroundColor: selected ? 'rgba(242,161,0,0.08)' : c.card,
        opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
      })}
    >
      <Feather
        name={selected ? 'check-square' : 'square'}
        size={20}
        color={selected ? c.accentDeep : c.textMute}
      />
      <View style={{ flex: 1 }}>
        <BodyStrong numberOfLines={1}>{name}</BodyStrong>
        <Small color={c.textMute}>{role}</Small>
      </View>
      {isClient ? <ClientTag label={clientLabel} color={c.info} /> : null}
    </Pressable>
  )
}

// ============================================================================
// TASK 13 — NewGroupSheet
// ============================================================================

export interface NewGroupSheetProps {
  visible: boolean
  onClose: () => void
}

export function NewGroupSheet({ visible, onClose }: NewGroupSheetProps) {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const t = STR[lang as Lang]
  const inputStyle = useInputStyle()
  const router = useRouter()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [siteId, setSiteId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // Reset all transient state whenever the sheet (re)opens.
  useEffect(() => {
    if (visible) {
      setName('')
      setSiteId(null)
      setSelected(new Set())
      setError(null)
    }
  }, [visible])

  const sitesQ = useQuery({
    queryKey: ['owner', 'sites'],
    queryFn: () => owner.sites(),
    enabled: visible,
  })
  const sites = sitesQ.data?.items ?? []

  const addableQ = useQuery({
    queryKey: ['groups', 'addable', siteId],
    queryFn: () => groupsApi.addableUsers(siteId!),
    enabled: visible && !!siteId,
  })
  const addable: AddableUser[] = addableQ.data ?? []

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const create = useMutation({
    mutationFn: () =>
      groupsApi.create({
        name: name.trim(),
        site_id: siteId!,
        member_user_ids: [...selected],
      }),
    onSuccess: (group) => {
      void qc.invalidateQueries({ queryKey: ['owner', 'conversations'] })
      const hasHomeowner = group.members.some((m) => m.is_homeowner)
      onClose()
      router.push({
        pathname: '/(contractor)/owner/chat/[id]',
        params: {
          id: group.id,
          kind: 'group',
          siteId: group.site_id ?? '',
          title: group.name ?? t.newTitle,
          hasHomeowner: hasHomeowner ? '1' : '0',
        },
      })
    },
    onError: (e) => setError(errLine(e, t, t.createFailed)),
  })

  const canCreate = !!name.trim() && !!siteId && !create.isPending

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <SheetHead title={t.newTitle} closeLabel={t.close} onClose={onClose} />
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
        <View style={{ gap: SPACE.md, paddingBottom: SPACE.md }}>
          {/* Name */}
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t.namePlaceholder}
            placeholderTextColor={c.textMute}
            style={inputStyle}
          />

          {/* Site picker (single-select) */}
          <View style={{ gap: SPACE.xs }}>
            <Small muted style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t.pickSite}
            </Small>
            <Small muted>{t.pickSiteHint}</Small>
            {sitesQ.isLoading ? (
              <ActivityIndicator color={c.accent} style={{ paddingVertical: SPACE.md }} />
            ) : sites.length === 0 ? (
              <Small muted>{t.noSites}</Small>
            ) : (
              <View style={{ gap: SPACE.sm }}>
                {sites.map((s) => {
                  const on = siteId === s.id
                  return (
                    <Pressable
                      key={s.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={s.name}
                      onPress={() => {
                        setSiteId(s.id)
                        setSelected(new Set())
                      }}
                      style={({ pressed }) => ({
                        minHeight: TAP,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: SPACE.md,
                        paddingVertical: SPACE.sm,
                        paddingHorizontal: SPACE.md,
                        borderWidth: on ? 2 : 1,
                        borderColor: on ? c.accent : c.line,
                        borderRadius: theme.radii.control,
                        backgroundColor: on ? 'rgba(242,161,0,0.08)' : c.card,
                        opacity: pressed ? 0.9 : 1,
                      })}
                    >
                      <Feather
                        name={on ? 'check-circle' : 'circle'}
                        size={20}
                        color={on ? c.accentDeep : c.textMute}
                      />
                      <View style={{ flex: 1 }}>
                        <BodyStrong numberOfLines={1}>{s.name}</BodyStrong>
                        {s.location ? <Small color={c.textMute}>{s.location}</Small> : null}
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>

          {/* Member multi-select (after a site is chosen) */}
          {siteId ? (
            <View style={{ gap: SPACE.xs }}>
              <Small muted style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t.members}
              </Small>
              <Small muted>{t.membersHint}</Small>
              {addableQ.isLoading ? (
                <ActivityIndicator color={c.accent} style={{ paddingVertical: SPACE.md }} />
              ) : addable.length === 0 ? (
                <Small muted>{t.noAddable}</Small>
              ) : (
                <View style={{ gap: SPACE.sm }}>
                  {addable.map((u) => (
                    <SelectableUserRow
                      key={u.user_id}
                      name={u.name ?? '—'}
                      role={u.role}
                      isClient={u.role === 'homeowner'}
                      clientLabel={t.client}
                      selected={selected.has(u.user_id)}
                      onToggle={() => toggle(u.user_id)}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {error ? <Small color={STATUS.risk}>{error}</Small> : null}
        </View>
      </ScrollView>

      {/* Create — amber fill, dark ink, ≥48px */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.create}
        accessibilityState={{ disabled: !canCreate }}
        disabled={!canCreate}
        onPress={() => {
          setError(null)
          create.mutate()
        }}
        style={({ pressed }) => ({
          minHeight: TAP,
          borderRadius: theme.radii.control,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: SPACE.sm,
          opacity: !canCreate ? 0.5 : pressed ? 0.9 : 1,
        })}
      >
        {create.isPending ? (
          <ActivityIndicator color={c.onAccent} />
        ) : (
          <BodyStrong style={{ color: c.onAccent }}>{t.create}</BodyStrong>
        )}
      </Pressable>
    </SheetShell>
  )
}

// ============================================================================
// TASK 14 — ManageGroupSheet
// ============================================================================

export interface ManageGroupSheetProps {
  visible: boolean
  onClose: () => void
  groupId: string
  siteId: string
}

export function ManageGroupSheet({ visible, onClose, groupId, siteId }: ManageGroupSheetProps) {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const t = STR[lang as Lang]
  const inputStyle = useInputStyle()
  const router = useRouter()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [nameDirty, setNameDirty] = useState(false)
  const [toAdd, setToAdd] = useState<Set<string>>(new Set())
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const membersQ = useQuery({
    queryKey: ['groups', 'members', groupId],
    queryFn: () => groupsApi.members(groupId),
    enabled: visible && !!groupId,
  })
  const members: GroupMember[] = membersQ.data?.members ?? []

  const addableQ = useQuery({
    queryKey: ['groups', 'addable', siteId, groupId],
    queryFn: () => groupsApi.addableUsers(siteId, groupId),
    enabled: visible && !!siteId && !!groupId,
  })
  const addable: AddableUser[] = (addableQ.data ?? []).filter((u) => !u.already_member)

  // Seed the rename field from the loaded roster's group name once (the members
  // payload doesn't carry the name — derive nothing; the field starts empty and
  // the user types a new name, OR we leave it untouched). To keep it simple the
  // field is independent; on open we reset dirty state.
  useEffect(() => {
    if (visible) {
      setNameDirty(false)
      setName('')
      setToAdd(new Set())
      setConfirmRemoveId(null)
      setConfirmArchive(false)
      setError(null)
    }
  }, [visible, groupId])

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['groups', 'members', groupId] })
    void qc.invalidateQueries({ queryKey: ['owner', 'conversations'] })
    void qc.invalidateQueries({ queryKey: ['groups', 'addable', siteId, groupId] })
  }

  const rename = useMutation({
    mutationFn: () => groupsApi.patch(groupId, { name: name.trim() }),
    onSuccess: () => {
      setNameDirty(false)
      invalidate()
    },
    onError: (e) => setError(errLine(e, t)),
  })

  const setRole = useMutation({
    mutationFn: ({ user_id, role }: { user_id: string; role: 'admin' | 'member' }) =>
      groupsApi.patch(groupId, { member_role: { user_id, role } }),
    onSuccess: () => invalidate(),
    onError: (e) => setError(errLine(e, t)),
  })

  const remove = useMutation({
    mutationFn: (userId: string) => groupsApi.removeMember(groupId, userId),
    onSuccess: () => {
      setConfirmRemoveId(null)
      invalidate()
    },
    onError: (e) => {
      setConfirmRemoveId(null)
      setError(errLine(e, t))
    },
  })

  const addMembers = useMutation({
    mutationFn: () => groupsApi.addMembers(groupId, [...toAdd]),
    onSuccess: () => {
      setToAdd(new Set())
      invalidate()
    },
    onError: (e) => setError(errLine(e, t)),
  })

  const archive = useMutation({
    mutationFn: () => groupsApi.patch(groupId, { archived: true }),
    onSuccess: () => {
      onClose()
      router.back()
      invalidate()
    },
    onError: (e) => {
      setConfirmArchive(false)
      setError(errLine(e, t))
    },
  })

  const toggleAdd = (id: string) =>
    setToAdd((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const busy =
    rename.isPending ||
    setRole.isPending ||
    remove.isPending ||
    addMembers.isPending ||
    archive.isPending

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <SheetHead title={t.manageTitle} closeLabel={t.close} onClose={onClose} />
      {membersQ.isLoading ? (
        <View style={{ paddingVertical: SPACE.xl, alignItems: 'center' }}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : membersQ.error ? (
        <Small color={STATUS.risk} style={{ paddingVertical: SPACE.lg }}>
          {t.loadFailed}
        </Small>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
          <View style={{ gap: SPACE.lg, paddingBottom: SPACE.md }}>
            {/* Rename */}
            <View style={{ gap: SPACE.xs }}>
              <Small muted style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t.rename}
              </Small>
              <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'center' }}>
                <TextInput
                  value={name}
                  onChangeText={(v) => {
                    setName(v)
                    setNameDirty(true)
                  }}
                  placeholder={t.namePlaceholder}
                  placeholderTextColor={c.textMute}
                  style={[inputStyle, { flex: 1 }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t.save}
                  disabled={!name.trim() || !nameDirty || busy}
                  onPress={() => {
                    setError(null)
                    rename.mutate()
                  }}
                  style={({ pressed }) => ({
                    minHeight: TAP,
                    paddingHorizontal: SPACE.lg,
                    borderRadius: theme.radii.control,
                    backgroundColor: c.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: !name.trim() || !nameDirty || busy ? 0.5 : pressed ? 0.9 : 1,
                  })}
                >
                  {rename.isPending ? (
                    <ActivityIndicator color={c.onAccent} />
                  ) : (
                    <BodyStrong style={{ color: c.onAccent }}>{t.save}</BodyStrong>
                  )}
                </Pressable>
              </View>
            </View>

            {/* Roster */}
            <View style={{ gap: SPACE.sm }}>
              <Small muted style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t.roster}
              </Small>
              {members.map((m) => {
                const isAdmin = m.role === 'admin'
                const confirming = confirmRemoveId === m.user_id
                return (
                  <View
                    key={m.user_id}
                    style={{
                      borderWidth: 1,
                      borderColor: c.line,
                      borderRadius: theme.radii.control,
                      backgroundColor: c.card,
                      padding: SPACE.md,
                      gap: SPACE.sm,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                      <Feather name="user" size={18} color={c.accentDeep} />
                      <View style={{ flex: 1 }}>
                        <BodyStrong numberOfLines={1}>{m.name ?? '—'}</BodyStrong>
                        <Small color={c.textMute}>{isAdmin ? t.admin : t.member}</Small>
                      </View>
                      {m.is_homeowner ? <ClientTag label={t.client} color={c.info} /> : null}
                    </View>

                    {confirming ? (
                      <View style={{ gap: SPACE.xs }}>
                        <Small>{t.confirmRemove}</Small>
                        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t.yes}
                            disabled={busy}
                            onPress={() => {
                              setError(null)
                              remove.mutate(m.user_id)
                            }}
                            style={({ pressed }) => ({
                              flex: 1,
                              minHeight: TAP,
                              borderRadius: theme.radii.control,
                              backgroundColor: STATUS.risk,
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: busy ? 0.5 : pressed ? 0.9 : 1,
                            })}
                          >
                            <BodyStrong color="#fff">{t.yes}</BodyStrong>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t.no}
                            onPress={() => setConfirmRemoveId(null)}
                            style={({ pressed }) => ({
                              flex: 1,
                              minHeight: TAP,
                              borderRadius: theme.radii.control,
                              borderWidth: 1,
                              borderColor: c.line,
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: pressed ? 0.9 : 1,
                            })}
                          >
                            <BodyStrong>{t.no}</BodyStrong>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={isAdmin ? t.makeMember : t.makeAdmin}
                          disabled={busy}
                          onPress={() => {
                            setError(null)
                            setRole.mutate({
                              user_id: m.user_id,
                              role: isAdmin ? 'member' : 'admin',
                            })
                          }}
                          style={({ pressed }) => ({
                            flex: 1,
                            minHeight: TAP,
                            borderRadius: theme.radii.control,
                            borderWidth: 1,
                            borderColor: c.line,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            opacity: busy ? 0.5 : pressed ? 0.9 : 1,
                          })}
                        >
                          <Feather
                            name={isAdmin ? 'arrow-down-circle' : 'shield'}
                            size={16}
                            color={c.text}
                          />
                          <Small style={{ color: c.text }}>
                            {isAdmin ? t.makeMember : t.makeAdmin}
                          </Small>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t.remove}
                          disabled={busy}
                          onPress={() => setConfirmRemoveId(m.user_id)}
                          style={({ pressed }) => ({
                            minHeight: TAP,
                            paddingHorizontal: SPACE.lg,
                            borderRadius: theme.radii.control,
                            borderWidth: 1,
                            borderColor: STATUS.risk,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            opacity: busy ? 0.5 : pressed ? 0.9 : 1,
                          })}
                        >
                          <Feather name="user-x" size={16} color={STATUS.risk} />
                          <Small style={{ color: STATUS.risk }}>{t.remove}</Small>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )
              })}
            </View>

            {/* Add members */}
            <View style={{ gap: SPACE.sm }}>
              <Small muted style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t.addMore}
              </Small>
              {addableQ.isLoading ? (
                <ActivityIndicator color={c.accent} style={{ paddingVertical: SPACE.md }} />
              ) : addable.length === 0 ? (
                <Small muted>{t.nothingToAdd}</Small>
              ) : (
                <>
                  {addable.map((u) => (
                    <SelectableUserRow
                      key={u.user_id}
                      name={u.name ?? '—'}
                      role={u.role}
                      isClient={u.role === 'homeowner'}
                      clientLabel={t.client}
                      selected={toAdd.has(u.user_id)}
                      disabled={busy}
                      onToggle={() => toggleAdd(u.user_id)}
                    />
                  ))}
                  {toAdd.size > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t.add}
                      disabled={busy}
                      onPress={() => {
                        setError(null)
                        addMembers.mutate()
                      }}
                      style={({ pressed }) => ({
                        minHeight: TAP,
                        borderRadius: theme.radii.control,
                        backgroundColor: c.accent,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: busy ? 0.5 : pressed ? 0.9 : 1,
                      })}
                    >
                      {addMembers.isPending ? (
                        <ActivityIndicator color={c.onAccent} />
                      ) : (
                        <BodyStrong style={{ color: c.onAccent }}>
                          {`${t.add} (${toAdd.size})`}
                        </BodyStrong>
                      )}
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>

            {error ? <Small color={STATUS.risk}>{error}</Small> : null}

            {/* Archive (destructive) */}
            <View style={{ gap: SPACE.sm, marginTop: SPACE.sm }}>
              {confirmArchive ? (
                <View style={{ gap: SPACE.xs }}>
                  <Small color={STATUS.risk}>{t.confirmArchive}</Small>
                  <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t.yes}
                      disabled={busy}
                      onPress={() => {
                        setError(null)
                        archive.mutate()
                      }}
                      style={({ pressed }) => ({
                        flex: 1,
                        minHeight: TAP,
                        borderRadius: theme.radii.control,
                        backgroundColor: STATUS.risk,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: busy ? 0.5 : pressed ? 0.9 : 1,
                      })}
                    >
                      {archive.isPending ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <BodyStrong color="#fff">{t.yes}</BodyStrong>
                      )}
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t.no}
                      onPress={() => setConfirmArchive(false)}
                      style={({ pressed }) => ({
                        flex: 1,
                        minHeight: TAP,
                        borderRadius: theme.radii.control,
                        borderWidth: 1,
                        borderColor: c.line,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.9 : 1,
                      })}
                    >
                      <BodyStrong>{t.no}</BodyStrong>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t.archive}
                  disabled={busy}
                  onPress={() => setConfirmArchive(true)}
                  style={({ pressed }) => ({
                    minHeight: TAP,
                    borderRadius: theme.radii.control,
                    borderWidth: 1,
                    borderColor: STATUS.risk,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    opacity: busy ? 0.5 : pressed ? 0.9 : 1,
                  })}
                >
                  <Feather name="archive" size={16} color={STATUS.risk} />
                  <BodyStrong style={{ color: STATUS.risk }}>{t.archive}</BodyStrong>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </SheetShell>
  )
}
