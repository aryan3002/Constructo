/**
 * A tiny affordance under a disabled Save button: instead of a silent grey
 * button, it names the FIRST still-missing required field (in form order) so
 * the user knows exactly what to fill. Renders nothing once every check passes,
 * or when `hidden` is set (e.g. while uploading, or when an error/unavailable
 * message is already showing in its place).
 */
export interface SaveCheck {
  /** True when this required field is satisfied. */
  ok: boolean
  /** The hint to show when this is the first unmet check. */
  msg: string
}

export function SaveHint({
  checks,
  hidden = false,
}: {
  checks: SaveCheck[]
  hidden?: boolean
}) {
  if (hidden) return null
  const missing = checks.find((c) => !c.ok)
  if (!missing) return null
  return (
    <p role="status" className="font-body text-small text-text-mute">
      {missing.msg}
    </p>
  )
}
