/**
 * Mark up — annotate a photo, then send it to the team as a tracked issue.
 *
 * Opened from a photo's "Mark up" action with the image `uri`. The homeowner
 * draws over it (freehand / arrow / circle) in red (issue), blue (question) or
 * green (approval), then "Use this" flattens the photo + drawing into a single
 * image (react-native-view-shot) and hands it to the issue composer with the
 * annotated image pre-attached — which already sends it to the site team.
 *
 * NOTE: flattening needs a dev/EAS build (view-shot is a native module, not in
 * Expo Go). If capture fails we degrade to handing over the original photo.
 */
import type * as React from 'react'
import { useRef, useState } from 'react'
import {
  Image,
  PanResponder,
  Pressable,
  View,
  type GestureResponderEvent,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, G, Line, Path } from 'react-native-svg'
import { captureRef } from 'react-native-view-shot'

import { useT } from '../../src/i18n/I18nProvider'
import { SPACE } from '../../src/theme/tokens'
import { BodyStrong, useToast } from '../../src/ui'

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

const STR = {
  en: { title: 'Mark up', use: 'Use this', empty: 'Nothing to mark up.', failed: 'Could not save the markup.' },
  hi: { title: 'मार्क करें', use: 'इसे भेजें', empty: 'मार्क करने के लिए कुछ नहीं।', failed: 'मार्कअप सहेजा नहीं जा सका।' },
} as const

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

export default function MarkupScreen() {
  const { lang } = useT()
  const t = STR[lang === 'hi' ? 'hi' : 'en']
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const params = useLocalSearchParams<{ uri?: string }>()
  const uri = params.uri

  const shotRef = useRef<View>(null)
  const [tool, setTool] = useState<Tool>('draw')
  const [color, setColor] = useState(COLORS[0].value)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [current, setCurrent] = useState<Stroke | null>(null)
  const [saving, setSaving] = useState(false)

  // Latest tool/color for the PanResponder closures (created once).
  const toolRef = useRef(tool)
  toolRef.current = tool
  const colorRef = useRef(color)
  colorRef.current = color

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }
        const tl = toolRef.current
        const col = colorRef.current
        setCurrent(
          tl === 'draw'
            ? { tool: 'draw', color: col, pts: [p] }
            : { tool: tl, color: col, a: p, b: p },
        )
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }
        setCurrent((cur) => {
          if (!cur) return cur
          if (cur.tool === 'draw') return { ...cur, pts: [...cur.pts, p] }
          return { ...cur, b: p }
        })
      },
      onPanResponderRelease: () => {
        setCurrent((cur) => {
          if (cur) setStrokes((s) => [...s, cur])
          return null
        })
      },
    }),
  ).current

  function renderStroke(s: Stroke, key: string) {
    if (s.tool === 'draw') {
      return (
        <Path
          key={key}
          d={pathFromPts(s.pts)}
          stroke={s.color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )
    }
    if (s.tool === 'circle') {
      const cx = (s.a.x + s.b.x) / 2
      const cy = (s.a.y + s.b.y) / 2
      const rx = Math.abs(s.b.x - s.a.x) / 2
      const ry = Math.abs(s.b.y - s.a.y) / 2
      return (
        <Circle key={key} cx={cx} cy={cy} r={Math.max(rx, ry)} stroke={s.color} strokeWidth={4} fill="none" />
      )
    }
    // arrow
    const [h1, h2] = arrowHead(s.a, s.b)
    return (
      <G key={key}>
        <Line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={s.color} strokeWidth={4} strokeLinecap="round" />
        <Line x1={s.b.x} y1={s.b.y} x2={h1.x} y2={h1.y} stroke={s.color} strokeWidth={4} strokeLinecap="round" />
        <Line x1={s.b.x} y1={s.b.y} x2={h2.x} y2={h2.y} stroke={s.color} strokeWidth={4} strokeLinecap="round" />
      </G>
    )
  }

  async function onUse() {
    if (strokes.length === 0) {
      toast(t.empty, 'edit-2')
      return
    }
    setSaving(true)
    let outUri = uri
    try {
      outUri = await captureRef(shotRef, { format: 'jpg', quality: 0.9 })
    } catch {
      // Capture unavailable (e.g. Expo Go) — fall back to the original image
      // and let the homeowner know the drawing couldn't be burned in.
      outUri = uri
      toast(t.failed, 'alert-circle')
    } finally {
      setSaving(false)
    }
    router.replace({ pathname: '/(homeowner)/issue', params: { photo: outUri } })
  }

  const all = current ? [...strokes, current] : strokes

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
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={8}>
          <Feather name="x" size={26} color="#fff" />
        </Pressable>
        <BodyStrong color="#fff">{t.title}</BodyStrong>
        <Pressable
          onPress={() => void onUse()}
          accessibilityRole="button"
          accessibilityLabel={t.use}
          disabled={saving}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: saving ? 0.5 : 1 }}
        >
          <BodyStrong color="#fff">{t.use}</BodyStrong>
          <Feather name="arrow-right" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Canvas — photo + SVG drawing overlay (captured together) */}
      <View ref={shotRef} collapsable={false} style={{ flex: 1, overflow: 'hidden' }}>
        {uri ? (
          <Image source={{ uri }} resizeMode="contain" style={{ position: 'absolute', inset: 0 }} />
        ) : null}
        <View style={{ flex: 1 }} {...pan.panHandlers}>
          <Svg style={{ position: 'absolute', inset: 0 }}>{all.map((s, i) => renderStroke(s, `s${i}`))}</Svg>
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
        {/* Tools */}
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

        {/* Colors */}
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

        {/* Undo / clear */}
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
