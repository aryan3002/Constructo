/**
 * AddSelectionForms — contextual "originate a selection" affordances.
 *
 * Two entry points per component-group in the Selections cockpit:
 *
 *   1. AddLineForm — manual: label + material picker + qty/unit/rate
 *      → specsApi.create → draft row in the cockpit
 *
 *   2. AddFromPhotoForm — AI-assisted: pick a photo → specsApi.extract
 *      → AI proposes a draft (notes: "Proposed from a photo — confirm.")
 *      → appears as a DRAFT row the designer must review + route
 *      Honest-AI: the AI proposes; the human commits. Never auto-finalized.
 *
 * Both forms are role-gated (canPropose = owner | pm | architect).
 * Both forms are contextual — they belong to a specific component (by id).
 *
 * Usage: place one <AddSelectionForms …/> per component group in the cockpit.
 */
import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { specsApi } from '../../api/specs'
import { api } from '../../api/client'
import { qk } from '../../api/queryKeys'
import { useT } from '../../i18n'
import { useToast } from '../../ui'
import { Button, Small } from '../../ui'
import type { Material } from '../../api/types'

// ---------------------------------------------------------------------------
// MaterialPicker (re-used from SelectionDrawer pattern — inline here to avoid
// coupling; the component is small and the import would create a circular dep
// risk between two designer-feature files)
// ---------------------------------------------------------------------------

function MaterialPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (id: string | null) => void
}) {
  const t = useT()
  const { data: materials } = useQuery({
    queryKey: qk.materials(false),
    queryFn: () => api.listMaterials(false),
  })

  const list: Material[] = materials ?? []

  return (
    <label className="flex flex-col gap-1">
      <Small className="font-semibold !text-text">{t('selections.edit.material')}</Small>
      <select
        data-testid="add-material-picker"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={t('selections.edit.material')}
        className={[
          'min-h-tap rounded-control border border-line bg-card px-3',
          'font-body text-body text-text',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        ].join(' ')}
      >
        <option value="">{t('selections.edit.material_none')}</option>
        {list.filter((m) => m.is_active).map((m) => (
          <option key={m.id} value={m.id}>
            {[m.name, m.category, m.unit].filter(Boolean).join(' · ')}
          </option>
        ))}
      </select>
    </label>
  )
}

// ---------------------------------------------------------------------------
// AddLineForm — manual creation
// ---------------------------------------------------------------------------

interface AddLineFormProps {
  siteId: string
  componentId: string
  onDone: () => void
  onCancel: () => void
}

function AddLineForm({ siteId, componentId, onDone, onCancel }: AddLineFormProps) {
  const t = useT()
  const { show } = useToast()
  const qc = useQueryClient()

  const [label, setLabel] = useState('')
  const [materialId, setMaterialId] = useState<string | null>(null)
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('')
  const [unitRate, setUnitRate] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!label.trim()) return
    setCreating(true)
    try {
      await specsApi.create({
        site_id: siteId,
        component_id: componentId,
        label: label.trim(),
        material_id: materialId || null,
        qty: qty || null,
        unit: unit || null,
        unit_rate: unitRate || null,
      })
      qc.invalidateQueries({ queryKey: qk.specDesk(siteId) })
      show({ status: 'ok', message: t('selections.add.created') })
      onDone()
    } catch {
      show({ status: 'risk', message: t('common.error') })
    } finally {
      setCreating(false)
    }
  }

  function inputCls() {
    return [
      'min-h-tap rounded-control border border-line bg-card px-3',
      'font-body text-body text-text',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    ].join(' ')
  }

  return (
    <div
      data-testid="add-line-form"
      className="space-y-3 rounded-card border border-primary/30 bg-primary/5 p-4"
    >
      <Small className="block font-semibold !text-text">{t('selections.add.title')}</Small>

      {/* Label (required) */}
      <label className="flex flex-col gap-1">
        <Small className="font-semibold !text-text">{t('selections.add.label')}</Small>
        <input
          data-testid="add-line-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('selections.add.label_placeholder')}
          className={inputCls()}
          aria-label={t('selections.add.label')}
          required
        />
      </label>

      {/* Material */}
      <MaterialPicker value={materialId} onChange={setMaterialId} />

      {/* Qty / Unit / Rate */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <Small className="font-semibold !text-text">{t('selections.edit.qty')}</Small>
          <input
            data-testid="add-line-qty"
            type="text"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={inputCls()}
            aria-label={t('selections.edit.qty')}
          />
        </label>
        <label className="flex flex-col gap-1">
          <Small className="font-semibold !text-text">{t('selections.edit.unit')}</Small>
          <input
            data-testid="add-line-unit"
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className={inputCls()}
            aria-label={t('selections.edit.unit')}
          />
        </label>
        <label className="flex flex-col gap-1 col-span-2 sm:col-span-1">
          <Small className="font-semibold !text-text">{t('selections.edit.rate')}</Small>
          <input
            data-testid="add-line-rate"
            type="text"
            value={unitRate}
            onChange={(e) => setUnitRate(e.target.value)}
            className={inputCls()}
            aria-label={t('selections.edit.rate')}
          />
        </label>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          variant="primary"
          size="md"
          onClick={handleCreate}
          disabled={creating || !label.trim()}
          className="flex-1"
          data-testid="add-line-submit"
        >
          {creating ? t('selections.add.creating') : t('selections.add.create')}
        </Button>
        <Button variant="ghost" size="md" onClick={onCancel}>
          {t('selections.add.cancel')}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AddFromPhotoForm — AI-assisted (extract)
// ---------------------------------------------------------------------------

interface AddFromPhotoFormProps {
  siteId: string
  componentId: string
  onDone: () => void
  onCancel: () => void
}

function AddFromPhotoForm({ siteId, componentId, onDone, onCancel }: AddFromPhotoFormProps) {
  const t = useT()
  const { show } = useToast()
  const qc = useQueryClient()

  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)

  async function handleExtract() {
    if (!file) return
    setExtracting(true)
    try {
      await specsApi.extract(siteId, componentId, file)
      qc.invalidateQueries({ queryKey: qk.specDesk(siteId) })
      show({ status: 'ok', message: t('selections.add_photo.proposed') })
      onDone()
    } catch {
      show({ status: 'risk', message: t('common.error') })
    } finally {
      setExtracting(false)
    }
  }

  return (
    <div
      data-testid="add-from-photo-form"
      className="space-y-3 rounded-card border border-primary/30 bg-primary/5 p-4"
    >
      <Small className="block font-semibold !text-text">{t('selections.add_photo.title')}</Small>
      <Small className="block !text-text-mute">{t('selections.add_photo.note')}</Small>

      {/* File picker */}
      <div className="flex flex-col gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          data-testid="add-photo-file-input"
          className="sr-only"
          aria-label={t('selections.add_photo.choose')}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button
          variant="ghost"
          size="md"
          onClick={() => fileRef.current?.click()}
          type="button"
        >
          {t('selections.add_photo.choose')}
        </Button>
        {file && (
          <Small className="!text-text-mute">{file.name}</Small>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          variant="primary"
          size="md"
          onClick={handleExtract}
          disabled={extracting || !file}
          className="flex-1"
          data-testid="add-photo-submit"
        >
          {extracting ? t('selections.add_photo.extracting') : t('selections.add_photo.extract')}
        </Button>
        <Button variant="ghost" size="md" onClick={onCancel}>
          {t('selections.add.cancel')}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AddSelectionForms — the exported component
// ---------------------------------------------------------------------------

export type AddMode = 'line' | 'photo' | null

export interface AddSelectionFormsProps {
  siteId: string
  /** The component this group of lines belongs to. */
  componentId: string
  /** Element name (component.name) — for button aria labels. */
  elementName: string
  /** Whether the current user can propose (owner | pm | architect). */
  canPropose: boolean
  /** Controlled open mode — parent controls which form is shown. */
  mode: AddMode
  onModeChange: (mode: AddMode) => void
}

export function AddSelectionForms({
  siteId,
  componentId,
  elementName,
  canPropose,
  mode,
  onModeChange,
}: AddSelectionFormsProps) {
  const t = useT()

  if (!canPropose) return null

  return (
    <div className="space-y-2">
      {/* Trigger buttons (shown when no form is open for this component) */}
      {mode === null && (
        <div className="flex gap-2 px-4 py-2">
          <Button
            variant="ghost"
            size="md"
            onClick={() => onModeChange('line')}
            data-testid={`add-line-btn-${componentId}`}
            aria-label={`${t('selections.add.add_line')} — ${elementName}`}
          >
            {t('selections.add.add_line')}
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={() => onModeChange('photo')}
            data-testid={`add-photo-btn-${componentId}`}
            aria-label={`${t('selections.add.add_from_photo')} — ${elementName}`}
          >
            {t('selections.add.add_from_photo')}
          </Button>
        </div>
      )}

      {/* Add line form */}
      {mode === 'line' && (
        <div className="px-4 py-2">
          <AddLineForm
            siteId={siteId}
            componentId={componentId}
            onDone={() => onModeChange(null)}
            onCancel={() => onModeChange(null)}
          />
        </div>
      )}

      {/* Add from photo form */}
      {mode === 'photo' && (
        <div className="px-4 py-2">
          <AddFromPhotoForm
            siteId={siteId}
            componentId={componentId}
            onDone={() => onModeChange(null)}
            onCancel={() => onModeChange(null)}
          />
        </div>
      )}
    </div>
  )
}
