/**
 * PhotoMarkupCanvas — a full-screen photo annotation surface (freehand / arrow /
 * circle in red / blue / green), flattened to a single JPG via react-native-view-
 * shot. Self-contained and theme-independent (dark), so it can be embedded inline
 * (the chat photo preview's markup mode) OR rendered as a route (the markup
 * screen). Callbacks abstract the destination so there's no navigation inside it.
 *
 * NOTE: flattening needs a dev/EAS build (view-shot is native, not in Expo Go);
 * on failure it returns the original image via onDone + onCaptureFail.
 */
import type * as React from 'react'
import { memo, useRef, useState } from 'react'
import {
  Image,
  PanResponder,
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, G, Line, Path } from 'react-native-svg'
import { captureRef } from 'react-native-view-shot'
import Constants, { ExecutionEnvironment } from 'expo-constants'

import { SPACE } from '../theme/tokens'

// Theme-independent (no useTheme): this canvas renders at the top level (the chat
// photo preview), OUTSIDE the per-group ThemeProvider — so it must not pull in any
// theme-aware UI component (e.g. Typography's BodyStrong). Plain Text + hardcoded
// colors only.
const LABEL = { color: '#fff', fontSize: 16, fontWeight: '600' as const }

type Tool = 'draw' | 'arrow' | 'circle'
type Pt = { x: number; y: number }
type Stroke =
  | { tool: 'draw'; color: string; pts: Pt[] }
  | { tool: 'arrow'; color: string; a: Pt; b: Pt }
  | { tool: 'circle'; color: string; a: Pt; b: Pt }

const COLORS = [
  { key: 'issue', value: '#E5484D' }, // red — an issue
  { key: 'question', value: '#3B7DD8' }, // blue — a question
  { key: 'approval', value: '#2F8F6F' }, // green — an approval
]

function pathFromPts(pts: Pt[]): string {
  if (pts.length === 0) return ''
  return pts.reduce((d, p, i) => d + `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)} `, '')
}

/** Two short segments forming an arrowhead at point b, pointing from a→b. */
function arrowHead(a: Pt, b: Pt): [Pt, Pt] {
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  const len = 16
  const spread = Math.PI / 7
  return [
    { x: b.x - len * Math.cos(angle - spread), y: b.y - len * Math.sin(angle - spread) },
    { x: b.x - len * Math.cos(angle + spread), y: b.y - len * Math.sin(angle + spread) },
  ]
}

function renderStroke(s: Stroke, key: string) {
  if (s.tool === 'draw') {
    return (
      <Path key={key} d={pathFromPts(s.pts)} stroke={s.color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    )
  }
  if (s.tool === 'circle') {
    const cx = (s.a.x + s.b.x) / 2
    const cy = (s.a.y + s.b.y) / 2
    const rx = Math.abs(s.b.x - s.a.x) / 2
    const ry = Math.abs(s.b.y - s.a.y) / 2
    return <Circle key={key} cx={cx} cy={cy} r={Math.max(rx, ry)} stroke={s.color} strokeWidth={4} fill="none" />
  }
  const [h1, h2] = arrowHead(s.a, s.b)
  return (
    <G key={key}>
      <Line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={s.color} strokeWidth={4} strokeLinecap="round" />
      <Line x1={s.b.x} y1={s.b.y} x2={h1.x} y2={h1.y} stroke={s.color} strokeWidth={4} strokeLinecap="round" />
      <Line x1={s.b.x} y1={s.b.y} x2={h2.x} y2={h2.y} stroke={s.color} strokeWidth={4} strokeLinecap="round" />
    </G>
  )
}

const CompletedStrokes = memo(function CompletedStrokes({ strokes }: { strokes: Stroke[] }) {
  return <>{strokes.map((s, i) => renderStroke(s, `s${i}`))}</>
})

export function PhotoMarkupCanvas({
  uri,
  title,
  useLabel,
  onDone,
  onCancel,
  onEmpty,
  onCaptureFail,
}: {
  uri: string
  title: string
  useLabel: string
  /** Receives the flattened (annotated) image URI, or the original if nothing was drawn. */
  onDone: (outUri: string) => void
  onCancel: () => void
  /** Called when "Use this" is tapped with no strokes (caller may toast); if set, onDone is NOT called. */
  onEmpty?: () => void
  /** Called when flattening fails (e.g. Expo Go); onDone is still called with the original. */
  onCaptureFail?: () => void
}) {
  const insets = useSafeAreaInsets()
  const shotRef = useRef<View>(null)
  const [tool, setTool] = useState<Tool>('draw')
  const [color, setColor] = useState(COLORS[0].value)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [current, setCurrent] = useState<Stroke | null>(null)
  const [saving, setSaving] = useState(false)

  const toolRef = useRef(tool)
  toolRef.current = tool
  const colorRef = useRef(color)
  colorRef.current = color
  const pointsRef = useRef<Pt[]>([])
  const frameRef = useRef<number | null>(null)
  // The in-progress stroke as a ref = the source of truth. The release handler
  // commits it from here at the top level, so it never nests setStrokes inside a
  // setCurrent updater (StrictMode double-invokes updaters → duplicate stroke).
  const liveStrokeRef = useRef<Stroke | null>(null)

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }
        const tl = toolRef.current
        const col = colorRef.current
        pointsRef.current = []
        const stroke: Stroke =
          tl === 'draw' ? { tool: 'draw', color: col, pts: [p] } : { tool: tl, color: col, a: p, b: p }
        liveStrokeRef.current = stroke
        setCurrent(stroke)
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }
        pointsRef.current.push(p)

        if (frameRef.current === null) {
          frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null
            const cur = liveStrokeRef.current
            if (!cur || pointsRef.current.length === 0) return
            const next: Stroke =
              cur.tool === 'draw'
                ? { ...cur, pts: [...cur.pts, ...pointsRef.current] }
                : { ...cur, b: pointsRef.current[pointsRef.current.length - 1] }
            pointsRef.current = []
            liveStrokeRef.current = next
            setCurrent(next)
          })
        }
      },
      onPanResponderRelease: () => {
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current)
          frameRef.current = null
        }
        // Commit the in-progress stroke from the ref (flushing any trailing
        // points) at the top level — NOT inside a setCurrent updater — so
        // StrictMode's double-invoked updaters can't add the stroke twice.
        let finalCur = liveStrokeRef.current
        if (finalCur && pointsRef.current.length > 0) {
          finalCur =
            finalCur.tool === 'draw'
              ? { ...finalCur, pts: [...finalCur.pts, ...pointsRef.current] }
              : { ...finalCur, b: pointsRef.current[pointsRef.current.length - 1] }
        }
        pointsRef.current = []
        liveStrokeRef.current = null
        if (finalCur) setStrokes((s) => [...s, finalCur])
        setCurrent(null)
      },
    }),
  ).current

  async function onUse() {
    if (strokes.length === 0) {
      if (onEmpty) {
        onEmpty()
        return
      }
      onDone(uri)
      return
    }
    // Markup flatten (react-native-view-shot) is a NATIVE module: it works in a
    // real build (dev client / standalone) but NOT in Expo Go, where captureRef
    // returns a tiny broken JPEG. Detect the runtime DIRECTLY — the previous
    // `fetch().blob().size` check was unreliable (blob.size is often wrong for
    // local files in RN) and wrongly degraded VALID dev-build captures. In Expo
    // Go: skip the capture, send the original, let the caller alert. In a real
    // build: trust the capture (view-shot works there).
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      onCaptureFail?.()
      onDone(uri)
      return
    }
    setSaving(true)
    let outUri = uri
    try {
      outUri = await captureRef(shotRef, { format: 'jpg', quality: 0.9 })
    } catch {
      outUri = uri
      onCaptureFail?.()
    } finally {
      setSaving(false)
    }
    onDone(outUri ?? uri)
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#111', paddingTop: insets.top }}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: SPACE.lg,
          paddingVertical: SPACE.md,
        }}
      >
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={8}>
          <Feather name="x" size={26} color="#fff" />
        </Pressable>
        <Text style={LABEL}>{title}</Text>
        <Pressable
          onPress={() => void onUse()}
          accessibilityRole="button"
          accessibilityLabel={useLabel}
          disabled={saving}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: saving ? 0.5 : 1 }}
        >
          <Text style={LABEL}>{useLabel}</Text>
          <Feather name="arrow-right" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Canvas — photo + SVG drawing overlay (captured together) */}
      <View ref={shotRef} collapsable={false} style={{ flex: 1, overflow: 'hidden' }}>
        <Image source={{ uri }} resizeMode="contain" style={{ position: 'absolute', inset: 0 }} />
        <View style={{ flex: 1 }} {...pan.panHandlers}>
          <Svg style={{ position: 'absolute', inset: 0 }}>
            <CompletedStrokes strokes={strokes} />
            {current && renderStroke(current, 'current')}
          </Svg>
        </View>
      </View>

      {/* Toolbar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: SPACE.md,
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.md,
          paddingBottom: insets.bottom + SPACE.md,
          backgroundColor: '#1b1b1b',
        }}
      >
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          {(
            [
              { key: 'draw', icon: 'edit-2' },
              { key: 'arrow', icon: 'arrow-up-right' },
              { key: 'circle', icon: 'circle' },
            ] as { key: Tool; icon: React.ComponentProps<typeof Feather>['name'] }[]
          ).map((it) => (
            <Pressable
              key={it.key}
              onPress={() => setTool(it.key)}
              accessibilityRole="button"
              accessibilityLabel={it.key}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: tool === it.key ? '#ffffff22' : 'transparent',
              }}
            >
              <Feather name={it.icon} size={20} color="#fff" />
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          {COLORS.map((co) => (
            <Pressable
              key={co.key}
              onPress={() => setColor(co.value)}
              accessibilityRole="button"
              accessibilityLabel={co.key}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: co.value,
                borderWidth: color === co.value ? 3 : 0,
                borderColor: '#fff',
              }}
            />
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          <Pressable
            onPress={() => setStrokes((s) => s.slice(0, -1))}
            accessibilityRole="button"
            accessibilityLabel="Undo"
            hitSlop={6}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="rotate-ccw" size={20} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => setStrokes([])}
            accessibilityRole="button"
            accessibilityLabel="Clear"
            hitSlop={6}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="trash-2" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  )
}
