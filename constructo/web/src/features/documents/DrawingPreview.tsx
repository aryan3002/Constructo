/**
 * DrawingPreview — robust file preview for a drawing.
 *
 * Image (png/jpg/jpeg/gif/webp) → <img> with object-contain + max-height.
 * PDF → <iframe> for first-page preview + fallback "Open PDF" link.
 * CAD / other → a file-type badge + "Open file" link (no broken img).
 */

import { useT } from '../../i18n'
import { Small } from '../../ui'

interface DrawingPreviewProps {
  fileUrl: string
  title: string
}

const IMAGE_EXTS = /\.(png|jpe?g|gif|webp)$/i
const PDF_EXT = /\.pdf$/i

function detectKind(url: string): 'image' | 'pdf' | 'cad' | 'other' {
  // Use just the pathname part (before any query string) for ext detection.
  const path = url.split('?')[0].toLowerCase()
  if (IMAGE_EXTS.test(path)) return 'image'
  if (PDF_EXT.test(path)) return 'pdf'
  if (/\.(dwg|dxf)$/i.test(path)) return 'cad'
  return 'other'
}

export function DrawingPreview({ fileUrl, title }: DrawingPreviewProps) {
  const t = useT()
  const kind = detectKind(fileUrl)

  if (kind === 'image') {
    return (
      <div className="mb-4 overflow-hidden rounded-card border border-line bg-paper">
        <img
          src={fileUrl}
          alt={title}
          className="block h-auto max-h-72 w-full object-contain"
        />
      </div>
    )
  }

  if (kind === 'pdf') {
    return (
      <div className="mb-4 flex flex-col gap-2">
        <div className="overflow-hidden rounded-card border border-line bg-paper" style={{ height: '280px' }}>
          <iframe
            src={fileUrl}
            title={title}
            className="h-full w-full"
            aria-label={`PDF preview: ${title}`}
          />
        </div>
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="self-start font-body text-small font-semibold text-primary-deep underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('drawings.detail_drawer.open_pdf')}
        </a>
      </div>
    )
  }

  // CAD / other — badge + link
  const ext = fileUrl.split('?')[0].split('.').pop()?.toUpperCase() ?? 'FILE'

  return (
    <div className="mb-4 flex items-center gap-3 rounded-card border border-line bg-paper px-4 py-3">
      <span className="inline-flex items-center rounded-pill border border-line bg-surface px-3 py-1 font-body text-micro font-semibold uppercase tracking-wide text-text-mute">
        {ext}
      </span>
      <Small className="min-w-0 flex-1 truncate text-text-mute">{title}</Small>
      <a
        href={fileUrl}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 font-body text-small font-semibold text-primary-deep underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t('drawings.detail_drawer.open_file')}
      </a>
    </div>
  )
}
