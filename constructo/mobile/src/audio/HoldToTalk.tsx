/**
 * HoldToTalk — a REAL on-device voice recorder (Neev theme), "voice before
 * forms" made honest. Press-and-hold the big mic to record actual audio via
 * `expo-audio` to a file URI; release to stop. While held, a live duration
 * counts up and the button pulses amber. A start/stop haptic gives gloved,
 * eyes-down field confirmation.
 *
 * On release it hands the caller a {@link RecordedAudio} ({uri, name, mime,
 * durationMs}) — a real `.m4a` file the offline outbox attaches as capture MEDIA
 * so the backend STT path (run_transcribe -> numeral_repair -> extract) runs on
 * REAL audio. There is no fake `voice://` URI and no "transcription pending"
 * text: if recording fails (permission denied, too short), we tell the user and
 * emit nothing — never lose or fabricate data.
 *
 * Tap target ≥72px (field-capture). Premium mic icon from `@expo/vector-icons`
 * (Feather), never an emoji. Lives in src/audio (NOT src/ui — a concurrent agent
 * owns that), composed by the contractor capture/attendance screens.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, STATUS } from '../theme/tokens'
import { BodyStrong, Mono, Small } from '../ui'

/** A real recording the caller attaches to a capture as voice media. */
export interface RecordedAudio {
  /** Local file URI of the recorded audio (an .m4a written by expo-audio). */
  uri: string
  /** Suggested filename (audio extension preserved so the backend infers voice). */
  name: string
  /** MIME type so the backend routes this to STT. */
  mime: string
  /** Recording length in milliseconds (for the UI + an honest "0:07" label). */
  durationMs: number
}

// Below this, a "recording" is almost certainly an accidental tap — discard it
// rather than ship a useless 0-byte clip into the pipeline.
const MIN_RECORDING_MS = 600

function fmt(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export interface HoldToTalkProps {
  /** Big primary label, e.g. "Hold to talk" / "दबाकर बोलो". */
  label: string
  /** One-line hint under the label, e.g. an example phrase. */
  hint?: string
  /** Recording-in-progress label, e.g. "Recording… release to send". */
  recordingLabel: string
  /** Shown briefly if a recording was too short / failed (no media emitted). */
  tooShortLabel: string
  /** Permission-denied alert text (caller localises). */
  permLabel: string
  /** Fired ONCE on release with the finished recording (real file). */
  onRecorded: (audio: RecordedAudio) => void
  /** Fired when mic permission is denied so the caller can prompt. */
  onPermissionDenied?: () => void
  disabled?: boolean
  /** Minimum tap height; defaults to 96 (field-capture, ≥72 required). */
  minHeight?: number
}

export function HoldToTalk({
  label,
  hint,
  recordingLabel,
  tooShortLabel,
  permLabel,
  onRecorded,
  onPermissionDenied,
  disabled,
  minHeight = 96,
}: HoldToTalkProps) {
  const { theme } = useTheme()
  const c = theme.colors

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const state = useAudioRecorderState(recorder)

  const heldRef = useRef(false)
  const startingRef = useRef(false)
  const preparedRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [tooShort, setTooShort] = useState(false)

  // Configure the audio session once (record + playback) so iOS records aloud.
  useEffect(() => {
    void setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(
      () => undefined,
    )
  }, [])

  // Pre-warm the recorder
  useEffect(() => {
    void (async () => {
      try {
        const p = await requestRecordingPermissionsAsync()
        if (p.granted) {
          await recorder.prepareToRecordAsync()
          preparedRef.current = true
        }
      } catch {}
    })()
  }, [recorder])

  const startHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined)
  }, [])
  const stopHaptic = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    )
  }, [])

  const beginRecording = useCallback(async () => {
    if (startingRef.current || state.isRecording) return
    startingRef.current = true
    setTooShort(false)
    try {
      if (preparedRef.current && !state.isRecording && recorder) {
        recorder.record()
        return
      }

      const perm = await requestRecordingPermissionsAsync()
      if (!perm.granted) {
        onPermissionDenied?.()
        startingRef.current = false
        return
      }
      await recorder.prepareToRecordAsync()
      preparedRef.current = true
      // If the user already let go while we were preparing, abort silently.
      if (!heldRef.current) {
        startingRef.current = false
        return
      }
      recorder.record()
    } catch {
      startingRef.current = false
    } finally {
      startingRef.current = false
    }
  }, [recorder, state.isRecording, onPermissionDenied])

  const endRecording = useCallback(async () => {
    // Nothing was recording (e.g. permission denied, or released mid-prepare).
    if (!state.isRecording && !recorder.isRecording) return
    setBusy(true)
    const durationMs = Math.round((recorder.currentTime || state.durationMillis / 1000 || 0) * 1000)
    try {
      await recorder.stop()
      stopHaptic()
      preparedRef.current = false
      void recorder.prepareToRecordAsync().then(() => { preparedRef.current = true }).catch(() => undefined)

      const uri = recorder.uri
      if (!uri || durationMs < MIN_RECORDING_MS) {
        setTooShort(true)
        return
      }
      onRecorded({
        uri,
        name: `voice_${Date.now()}.m4a`,
        mime: 'audio/m4a',
        durationMs,
      })
    } catch {
      setTooShort(true)
    } finally {
      setBusy(false)
    }
  }, [recorder, state.isRecording, state.durationMillis, onRecorded, stopHaptic])

  const onPressIn = useCallback(() => {
    if (disabled || busy) return
    startHaptic()
    heldRef.current = true
    void beginRecording()
  }, [disabled, busy, beginRecording, startHaptic])

  const onPressOut = useCallback(() => {
    if (!heldRef.current) return
    heldRef.current = false
    void endRecording()
  }, [endRecording])

  const recording = state.isRecording
  const liveMs = state.durationMillis || 0

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy: recording }}
      disabled={disabled || busy}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => ({
        minHeight,
        borderRadius: theme.radii.sheet,
        borderWidth: 2,
        borderColor: recording ? STATUS.risk : pressed ? c.accent : c.line,
        backgroundColor: recording ? 'rgba(229,72,77,0.08)' : c.card,
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACE.xs,
        paddingVertical: SPACE.md,
        paddingHorizontal: SPACE.lg,
        opacity: disabled ? 0.55 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Feather
          name="mic"
          size={28}
          color={recording ? STATUS.risk : c.accentDeep}
        />
        {recording ? (
          <Mono style={{ fontSize: 20 }} color={STATUS.risk}>
            {fmt(liveMs)}
          </Mono>
        ) : (
          <BodyStrong style={{ fontSize: 18 }}>{label}</BodyStrong>
        )}
      </View>
      {recording ? (
        <Small color={STATUS.risk} style={{ fontWeight: '600' }}>
          {recordingLabel}
        </Small>
      ) : tooShort ? (
        <Small color={STATUS.warn}>{tooShortLabel}</Small>
      ) : hint ? (
        <Small muted style={{ textAlign: 'center', fontSize: 12 }}>
          {hint}
        </Small>
      ) : null}
    </Pressable>
  )
}
