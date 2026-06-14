/**
 * ReportsPage — STUB (E4).
 *
 * E5 replaces this with the full Reports & Exports screen. This stub just
 * ensures the lazy /reports route compiles and the nav tab lands somewhere.
 */
import { useT } from '../../i18n'

export function ReportsPage() {
  const t = useT()
  return <div style={{ padding: 24 }}><h1>{t('reports.title')}</h1></div>
}
