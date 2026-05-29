import { useCallback, useRef, useState } from 'react'
import { CameraIcon, MicIcon } from './icons'
import { Small } from './Typography'

export interface CaptureBarProps {
  /** Fired when the photo button is tapped. */
  onPhoto?: () => void
  /** Fired when hold-to-talk begins (press down). */
  onTalkStart?: () => void
  /** Fired when hold-to-talk ends (release). Receives held duration in ms. */
  onTalkEnd?: (durationMs: number) => void
  /** Fired when the small "type instead" link is tapped. */
  onType?: () => void
  className?: string
}

/**
 * CaptureBar — the field-worker's primary input. A big Photo button and a big
 * hold-to-talk mic (press and hold to record, release to send), plus a tiny
 * "type instead" escape hatch. Touch + mouse + keyboard supported.
 */
export function CaptureBar({
  onPhoto,
  onTalkStart,
  onTalkEnd,
  onType,
  className,
}: CaptureBarProps) {
  const [recording, setRecording] = useState(false)
  const startedAt = useRef<number>(0)

  const start = useCallback(() => {
    if (recording) return
    startedAt.current = Date.now()
    setRecording(true)
    onTalkStart?.()
  }, [recording, onTalkStart])

  const end = useCallback(() => {
    if (!recording) return
    setRecording(false)
    onTalkEnd?.(Date.now() - startedAt.current)
  }, [recording, onTalkEnd])

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-sheet border border-line bg-card p-4 shadow-card ${className ?? ''}`.trim()}
    >
      <div className="flex w-full items-stretch gap-3">
        <button
          type="button"
          onClick={onPhoto}
          className="flex min-h-tap flex-1 flex-col items-center justify-center gap-1 rounded-control bg-primary py-3 font-body font-semibold text-on-primary shadow-card cstk-animate transition active:scale-[0.98] hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <span className="text-2xl leading-none" aria-hidden>
            <CameraIcon />
          </span>
          <span>Photo</span>
        </button>

        <button
          type="button"
          aria-pressed={recording}
          aria-label="Hold to talk"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId)
            start()
          }}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={() => recording && end()}
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start()
          }}
          onKeyUp={(e) => {
            if (e.key === ' ' || e.key === 'Enter') end()
          }}
          className={`flex min-h-tap flex-1 flex-col items-center justify-center gap-1 rounded-control border py-3 font-body font-semibold cstk-animate transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
            recording
              ? 'animate-pulse border-risk bg-risk/10 text-risk focus-visible:ring-risk'
              : 'border-line bg-card text-text focus-visible:ring-primary'
          }`}
        >
          <span className="text-2xl leading-none" aria-hidden>
            <MicIcon />
          </span>
          <span>{recording ? 'Recording…' : 'Hold to talk'}</span>
        </button>
      </div>

      <button
        type="button"
        onClick={onType}
        className="rounded-control px-2 py-1 cstk-animate transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Small className="font-semibold text-primary-deep underline-offset-2 hover:underline">
          or type instead
        </Small>
      </button>
    </div>
  )
}
