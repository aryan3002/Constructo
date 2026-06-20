/**
 * Permits screen (Slice E) — owner-only, fully wired.
 *
 * Design: Neev ink-on-paper, marigold on the single primary Add action,
 * ≥56px tap targets, status NEVER color alone (StatusPill = shape + label).
 *
 * Features:
 *   • Site filter (SiteSwitcher when >1 site; auto-select when 1).
 *   • List: each permit a Card row with StatusPill mapping + "Expiring soon" warn.
 *     Sorted worst/most-urgent first (rejected/expired → expiring-soon → review/applied
 *     → not_started → approved-safe).
 *   • Add permit (marigold FAB → bottom sheet): permit_type, authority, status
 *     picker, dates, reference_no, notes → createPermit().
 *   • Edit / change status (tap a permit → bottom sheet) → updatePermit().
 *   • EmptyState with Add action.
 *   • Bilingual en/hi; English defaults.
 */
import { useState } from 'react'
import { Modal, Pressable, ScrollView, TextInput, View, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Feather } from '@expo/vector-icons'
import { Stack } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE, TAP } from '../../../src/theme/tokens'
import { owner } from '../../../src/api/owner'
import { permitsApi, type Permit, type PermitCreate, type PermitPatch, type PermitStatus } from '../../../src/api/permits'
import { ApiError } from '../../../src/api/client'
import type { Site } from '../../../src/api/types'
import {
  Body,
  BodyStrong,
  Button,
  Card,
  EmptyState,
  H1,
  H2,
  Micro,
  Screen,
  Small,
  StatusPill,
} from '../../../src/ui'
import { useInputStyle } from '../../../src/ui/useInputStyle'
import { SiteSwitcher } from './_components'
import { formatDate } from './_components'
import {
  permitPillConfig,
  isExpiringSoon,
  sortPermits,
  permitKeyDate,
} from '../../../src/owner/permits.util'

// ---------------------------------------------------------------------------
// Status picker options
// ---------------------------------------------------------------------------

const PERMIT_STATUSES: { value: PermitStatus; labelKey: string }[] = [
  { value: 'not_started', labelKey: 'permits.statusNotStarted' },
  { value: 'applied', labelKey: 'permits.statusApplied' },
  { value: 'under_review', labelKey: 'permits.statusUnderReview' },
  { value: 'approved', labelKey: 'permits.statusApproved' },
  { value: 'rejected', labelKey: 'permits.statusRejected' },
  { value: 'expired', labelKey: 'permits.statusExpired' },
]

// ---------------------------------------------------------------------------
// PermitCard — one row in the permit list
// ---------------------------------------------------------------------------

function PermitCard({
  permit,
  onPress,
}: {
  permit: Permit
  onPress: () => void
}) {
  const { theme } = useTheme()
  const expiringSoon = isExpiringSoon(permit)
  const pill = permitPillConfig(permit.status, expiringSoon)
  const keyDate = permitKeyDate(permit)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${permit.permit_type}, ${permit.authority}, ${pill.label}`}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Card
        padded
        style={{ gap: SPACE.sm }}
      >
        {/* Title row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
          <View style={{ flex: 1, gap: 3 }}>
            <BodyStrong numberOfLines={2}>{permit.permit_type}</BodyStrong>
            <Small muted numberOfLines={1}>{permit.authority}</Small>
          </View>
          <Feather name="chevron-right" size={18} color={theme.colors.textMute} style={{ marginTop: 3 }} />
        </View>

        {/* Pills row */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, alignItems: 'center' }}>
          <StatusPill
            status={pill.status}
            label={pill.label}
            size="sm"
          />
          {permit.reference_no ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 9999,
                backgroundColor: AP.surfaceLow,
              }}
            >
              <Feather name="hash" size={12} color={theme.colors.textMute} />
              <Micro muted>{permit.reference_no}</Micro>
            </View>
          ) : null}
          {keyDate ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 9999,
                backgroundColor: AP.surfaceLow,
              }}
            >
              <Feather name="calendar" size={12} color={theme.colors.textMute} />
              <Micro muted>{formatDate(keyDate)}</Micro>
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// Sheet — bottom sheet wrapper (shared with Team screen pattern)
// ---------------------------------------------------------------------------

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
            maxHeight: '92%',
          }}
          onPress={() => undefined}
        >
          {/* Handle + explicit close (the form has a focused input that can hide
              the scrim, so a tap-target close is essential). */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.xs }}>
            <View style={{ flex: 1 }}>
              <View
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: theme.colors.line,
                  alignSelf: 'center',
                  marginLeft: 32,
                }}
              />
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
            >
              <Ionicons name="close" size={24} color={theme.colors.textMute} />
            </Pressable>
          </View>
          {/* Scrollable body — the permit form is taller than the sheet. */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: SPACE.md, paddingBottom: SPACE.md }}
          >
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// StatusOption — status picker row inside the sheet
// ---------------------------------------------------------------------------

function StatusOption({
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
// PermitForm — shared form fields used by Add and Edit sheets
// ---------------------------------------------------------------------------

interface FormState {
  permit_type: string
  authority: string
  status: PermitStatus
  applied_on: string
  expected_on: string
  expiry_on: string
  decided_on: string
  reference_no: string
  notes: string
}

function PermitForm({
  value,
  onChange,
  showSitePicker,
  sites,
  siteId,
  onSiteChange,
}: {
  value: FormState
  onChange: (f: Partial<FormState>) => void
  showSitePicker?: boolean
  sites?: Site[]
  siteId?: string
  onSiteChange?: (id: string) => void
}) {
  const { theme } = useTheme()
  const { t } = useT()
  const inputStyle = useInputStyle()

  return (
    <>
      {/* Permit type */}
      <View style={{ gap: SPACE.xs }}>
        <Small muted>{t('permits.permitType')}</Small>
        <TextInput
          style={inputStyle}
          value={value.permit_type}
          onChangeText={(v) => onChange({ permit_type: v })}
          placeholder={t('permits.permitTypePlaceholder')}
          placeholderTextColor={theme.colors.textMute}
          returnKeyType="next"
        />
      </View>

      {/* Authority */}
      <View style={{ gap: SPACE.xs }}>
        <Small muted>{t('permits.authority')}</Small>
        <TextInput
          style={inputStyle}
          value={value.authority}
          onChangeText={(v) => onChange({ authority: v })}
          placeholder={t('permits.authorityPlaceholder')}
          placeholderTextColor={theme.colors.textMute}
          returnKeyType="next"
        />
      </View>

      {/* Site picker (only when adding a new permit with >1 site) */}
      {showSitePicker && sites && sites.length > 1 ? (
        <View style={{ gap: SPACE.xs }}>
          <Small muted>{t('permits.site')}</Small>
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.line,
              borderRadius: theme.radii.card,
              overflow: 'hidden',
            }}
          >
            {sites.map((s) => (
              <StatusOption
                key={s.id}
                label={s.name}
                selected={siteId === s.id}
                onPress={() => onSiteChange?.(s.id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* Status picker */}
      <View style={{ gap: SPACE.xs }}>
        <Small muted>{t('permits.statusLabel')}</Small>
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.line,
            borderRadius: theme.radii.card,
            overflow: 'hidden',
          }}
        >
          {PERMIT_STATUSES.map((opt) => (
            <StatusOption
              key={opt.value}
              label={t(opt.labelKey)}
              selected={value.status === opt.value}
              onPress={() => onChange({ status: opt.value })}
            />
          ))}
        </View>
      </View>

      {/* Reference no. */}
      <View style={{ gap: SPACE.xs }}>
        <Small muted>{t('permits.referenceNo')}</Small>
        <TextInput
          style={inputStyle}
          value={value.reference_no}
          onChangeText={(v) => onChange({ reference_no: v })}
          placeholder={t('permits.referenceNoPlaceholder')}
          placeholderTextColor={theme.colors.textMute}
          returnKeyType="next"
        />
      </View>

      {/* Applied on */}
      <View style={{ gap: SPACE.xs }}>
        <Small muted>{t('permits.appliedOn')}</Small>
        <TextInput
          style={inputStyle}
          value={value.applied_on}
          onChangeText={(v) => onChange({ applied_on: v })}
          placeholder={t('permits.datePlaceholder')}
          placeholderTextColor={theme.colors.textMute}
          returnKeyType="next"
        />
      </View>

      {/* Expected approval */}
      <View style={{ gap: SPACE.xs }}>
        <Small muted>{t('permits.expectedOn')}</Small>
        <TextInput
          style={inputStyle}
          value={value.expected_on}
          onChangeText={(v) => onChange({ expected_on: v })}
          placeholder={t('permits.datePlaceholder')}
          placeholderTextColor={theme.colors.textMute}
          returnKeyType="next"
        />
      </View>

      {/* Expiry date */}
      <View style={{ gap: SPACE.xs }}>
        <Small muted>{t('permits.expiryOn')}</Small>
        <TextInput
          style={inputStyle}
          value={value.expiry_on}
          onChangeText={(v) => onChange({ expiry_on: v })}
          placeholder={t('permits.datePlaceholder')}
          placeholderTextColor={theme.colors.textMute}
          returnKeyType="next"
        />
      </View>

      {/* Notes */}
      <View style={{ gap: SPACE.xs }}>
        <Small muted>{t('permits.notes')}</Small>
        <TextInput
          style={[inputStyle, { minHeight: 80, textAlignVertical: 'top', paddingVertical: SPACE.md }]}
          value={value.notes}
          onChangeText={(v) => onChange({ notes: v })}
          placeholder={t('permits.notesPlaceholder')}
          placeholderTextColor={theme.colors.textMute}
          multiline
          numberOfLines={3}
        />
      </View>
    </>
  )
}

const EMPTY_FORM: FormState = {
  permit_type: '',
  authority: '',
  status: 'not_started',
  applied_on: '',
  expected_on: '',
  expiry_on: '',
  decided_on: '',
  reference_no: '',
  notes: '',
}

function permitToForm(p: Permit): FormState {
  return {
    permit_type: p.permit_type,
    authority: p.authority,
    status: p.status,
    applied_on: p.applied_on ?? '',
    expected_on: p.expected_on ?? '',
    expiry_on: p.expiry_on ?? '',
    decided_on: p.decided_on ?? '',
    reference_no: p.reference_no ?? '',
    notes: p.notes ?? '',
  }
}

function nullIfEmpty(v: string): string | null {
  return v.trim() ? v.trim() : null
}

// ---------------------------------------------------------------------------
// Add sheet
// ---------------------------------------------------------------------------

function AddSheet({
  visible,
  onClose,
  sites,
}: {
  visible: boolean
  onClose: () => void
  sites: Site[]
}) {
  const { theme } = useTheme()
  const { t } = useT()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [siteId, setSiteId] = useState<string>(sites.length > 0 ? sites[0].id : '')
  const [error, setError] = useState<string | null>(null)

  // Auto-select the only site (or first when multiple) without calling hooks
  // conditionally — a direct assignment is safe here as form is controlled state.
  if (sites.length > 0 && !siteId) setSiteId(sites[0].id)

  const createMut = useMutation({
    mutationFn: () => {
      const body: PermitCreate = {
        site_id: siteId,
        permit_type: form.permit_type.trim(),
        authority: form.authority.trim(),
        status: form.status,
        applied_on: nullIfEmpty(form.applied_on),
        expected_on: nullIfEmpty(form.expected_on),
        expiry_on: nullIfEmpty(form.expiry_on),
        decided_on: nullIfEmpty(form.decided_on),
        reference_no: nullIfEmpty(form.reference_no),
        notes: nullIfEmpty(form.notes),
      }
      return permitsApi.createPermit(body)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['owner', 'permits'] })
      reset()
      onClose()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : t('common.somethingWrong'))
    },
  })

  function reset() {
    setForm(EMPTY_FORM)
    setSiteId(sites.length > 0 ? sites[0].id : '')
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  const canSubmit = Boolean(form.permit_type.trim() && form.authority.trim() && siteId)

  return (
    <Sheet visible={visible} onClose={handleClose}>
      <H2>{t('permits.addTitle')}</H2>
      <PermitForm
        value={form}
        onChange={(f) => { setForm((prev) => ({ ...prev, ...f })); setError(null) }}
        showSitePicker={sites.length > 1}
        sites={sites}
        siteId={siteId}
        onSiteChange={setSiteId}
      />
      {error ? <Body color={theme.colors.risk}>{error}</Body> : null}
      <Button
        title={createMut.isPending ? t('permits.saving') : t('permits.createAction')}
        variant="accent"
        block
        disabled={!canSubmit || createMut.isPending}
        loading={createMut.isPending}
        onPress={() => createMut.mutate()}
      />
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Edit sheet
// ---------------------------------------------------------------------------

function EditSheet({
  permit,
  onClose,
}: {
  permit: Permit | null
  onClose: () => void
}) {
  const { theme } = useTheme()
  const { t } = useT()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>(permit ? permitToForm(permit) : EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  // Sync form when permit changes
  if (permit && form.permit_type === EMPTY_FORM.permit_type && permit.permit_type) {
    setForm(permitToForm(permit))
  }

  const updateMut = useMutation({
    mutationFn: () => {
      const patch: PermitPatch = {
        permit_type: form.permit_type.trim() || undefined,
        authority: form.authority.trim() || undefined,
        status: form.status,
        applied_on: nullIfEmpty(form.applied_on),
        expected_on: nullIfEmpty(form.expected_on),
        expiry_on: nullIfEmpty(form.expiry_on),
        decided_on: nullIfEmpty(form.decided_on),
        reference_no: nullIfEmpty(form.reference_no),
        notes: nullIfEmpty(form.notes),
      }
      return permitsApi.updatePermit(permit!.id, patch)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['owner', 'permits'] })
      onClose()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : t('common.somethingWrong'))
    },
  })

  if (!permit) return null

  return (
    <Sheet visible={!!permit} onClose={onClose}>
      <H2>{t('permits.editTitle')}</H2>
      <PermitForm
        value={form}
        onChange={(f) => { setForm((prev) => ({ ...prev, ...f })); setError(null) }}
      />
      {error ? <Body color={theme.colors.risk}>{error}</Body> : null}
      <Button
        title={updateMut.isPending ? t('permits.saving') : t('permits.saveAction')}
        variant="accent"
        block
        disabled={updateMut.isPending}
        loading={updateMut.isPending}
        onPress={() => updateMut.mutate()}
      />
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function Permits() {
  const { t } = useT()
  const { theme } = useTheme()

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editingPermit, setEditingPermit] = useState<Permit | null>(null)

  // Fetch sites for the site switcher + add sheet
  const { data: sitesPage } = useQuery({
    queryKey: ['owner', 'sites'],
    queryFn: () => owner.sites(),
  })
  const sites: Site[] = sitesPage?.items ?? []

  // Auto-select the only site as a filter (don't render switcher for single sites)
  const effectiveSiteId: string | undefined =
    sites.length === 1 ? sites[0].id : (selectedSiteId ?? undefined)

  // Fetch permits for the effective scope
  const {
    data: permitsPage,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['owner', 'permits', effectiveSiteId],
    queryFn: () => permitsApi.listPermits(effectiveSiteId),
  })

  const rawPermits: Permit[] = permitsPage?.items ?? []
  const permits = sortPermits(rawPermits)

  // Site switcher items: derive status from worst permit urgency in that site
  const switcherItems = sites.map((s) => {
    const sitePermits = rawPermits.filter((p) => p.site_id === s.id)
    const worst = sitePermits.some((p) => p.status === 'rejected' || p.status === 'expired')
      ? ('risk' as const)
      : sitePermits.some((p) => isExpiringSoon(p))
        ? ('warn' as const)
        : ('ok' as const)
    return { id: s.id, name: s.name, status: worst }
  })

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <H1>{t('permits.title')}</H1>
          <Body muted style={{ marginTop: 2 }}>{t('permits.subtitle')}</Body>
        </View>
        <Button
          title={t('permits.addButton')}
          variant="accent"
          size="md"
          onPress={() => setAddOpen(true)}
          leading={<Feather name="plus" size={16} color={theme.colors.onAccent} />}
        />
      </View>

      {/* Site filter (only when >1 site) */}
      {sites.length > 1 ? (
        <SiteSwitcher
          sites={switcherItems}
          selectedId={selectedSiteId}
          onSelect={setSelectedSiteId}
          allLabel={t('account.groupSite')}
          totalCount={rawPermits.length}
        />
      ) : null}

      {/* List */}
      {isLoading ? (
        <Body muted style={{ marginTop: SPACE.md }}>{t('permits.loading')}</Body>
      ) : isError ? (
        <EmptyState
          variant="offline"
          title={t('permits.error')}
          action={
            <Button title={t('common.retry')} variant="secondary" onPress={() => void refetch()} />
          }
        />
      ) : permits.length === 0 ? (
        <EmptyState
          variant="empty"
          icon="file-text"
          title={t('permits.empty')}
          body={t('permits.emptyBody')}
          action={
            <Button
              title={t('permits.addButton')}
              variant="accent"
              onPress={() => setAddOpen(true)}
            />
          }
        />
      ) : (
        <View style={{ gap: SPACE.sm }}>
          {permits.map((permit) => (
            <PermitCard
              key={permit.id}
              permit={permit}
              onPress={() => setEditingPermit(permit)}
            />
          ))}
        </View>
      )}

      {/* Add sheet */}
      <AddSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        sites={sites}
      />

      {/* Edit sheet */}
      <EditSheet
        permit={editingPermit}
        onClose={() => setEditingPermit(null)}
      />
    </Screen>
  )
}
