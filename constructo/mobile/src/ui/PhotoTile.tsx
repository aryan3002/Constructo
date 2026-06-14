/**
 * PhotoTile — the homeowner "Calm Cockpit" photo card (handoff §4 "PhotoTile +
 * Caption", §5 "Photos"). A REAL photo (never an AI/3D render) with:
 *   - the AI caption rendered as-is in the active language (no gloss),
 *   - a short date (mono),
 *   - an optional room chip (soft-green primaryContainer),
 *   - a `ⓘ` (Feather `info`) jargon-translate affordance — "what does this mean?",
 *   - Save / Share / Hide actions (Hide is per-member + reversible, surfaced in
 *     the viewer; here it is an optional inline affordance),
 *   - a Feather `play` badge for video tiles.
 *
 * Premium Feather icons only (no emoji), Calm Cockpit tokens, color+icon+word
 * status. Press feedback scales to 0.98 (instant → respects Reduce Motion).
 *
 * Two visual modes:
 *   - `variant="grid"` (default): a square thumbnail with a caption/date/room
 *     overlay strip — used in the grouped grid.
 *   - `variant="hero"`: a wide 16:9 "Latest" hero with a larger caption block.
 */
import type * as React from 'react'
import { Pressable, View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { AP, SPACE } from '../theme/tokens'
import { BlurUpImage } from './BlurUpImage'
import { MonoSm, Small } from './Typography'

export interface PhotoTileData {
  id: string
  imageUri: string
  /** AI caption in the active language (rendered as-is). */
  caption?: string | null
  /** Short, already-formatted date string (e.g. "6 Jun"). */
  date?: string | null
  /** Room chip label (active language) — e.g. "Kitchen" / "रसोई". */
  room?: string | null
  /** Video tiles show a Feather `play` badge. */
  isVideo?: boolean
  /** Starred / kept marker (shown as a Feather `bookmark`, not a ★ emoji). */
  starred?: boolean
}

export interface PhotoTileProps {
  photo: PhotoTileData
  variant?: 'grid' | 'hero'
  /** Tile width (grid). Hero spans its parent. */
  size?: number
  /** Open the full-screen viewer. */
  onPress?: (photo: PhotoTileData) => void
  /** `ⓘ` jargon-translate affordance — "what does this mean?". */
  onTranslate?: (photo: PhotoTileData) => void
  /** Save to gallery. */
  onSave?: (photo: PhotoTileData) => void
  /** Share. */
  onShare?: (photo: PhotoTileData) => void
  /** Hide (per-member, reversible). */
  onHide?: (photo: PhotoTileData) => void
  /** Show the inline Save/Share/Hide action row (default off for grid). */
  showActions?: boolean
  /** Localized a11y/action labels (active language). */
  labels: {
    caption: string
    translate: string
    save: string
    share: string
    hide: string
    video: string
    starred: string
  }
  style?: ViewStyle
}

/** A soft-green room chip (primaryContainer), icon + word. */
function RoomChip({ room, color }: { room: string; color: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        backgroundColor: AP.chip,
        borderRadius: 9999,
        paddingVertical: 2,
        paddingHorizontal: 8,
      }}
    >
      <Feather name="map-pin" size={11} color={color} />
      <Small color={color} style={{ fontWeight: '600' }} numberOfLines={1}>
        {room}
      </Small>
    </View>
  )
}

export function PhotoTile({
  photo,
  variant = 'grid',
  size,
  onPress,
  onTranslate,
  onSave,
  onShare,
  onHide,
  showActions = false,
  labels,
  style,
}: PhotoTileProps) {
  const { theme } = useTheme()
  const c = theme.colors
  const isHero = variant === 'hero'

  const dims: ViewStyle = isHero
    ? { width: '100%', aspectRatio: 16 / 9 }
    : { width: size, height: size }

  const caption = photo.caption?.trim() || labels.caption

  return (
    <View
      style={[
        {
          borderRadius: theme.radii.card,
          overflow: 'hidden',
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
        },
        isHero ? theme.shadowCard : null,
        style,
      ]}
    >
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={caption}
        onPress={onPress ? () => onPress(photo) : undefined}
        style={({ pressed }) => [dims, { transform: [{ scale: pressed && onPress ? 0.98 : 1 }] }]}
      >
        {/* Real photo settles in (blur-up: scale 1.06→1 + fade) over a warm
            placeholder — never a pop. */}
        <BlurUpImage
          uri={photo.imageUri}
          accessibilityIgnoresInvertColors
          // The Pressable above is the labelled imagebutton (caption = alt text);
          // don't let the raw image announce a second, unlabelled node.
          importantForAccessibility="no"
          style={{ width: '100%', height: '100%' }}
        />

        {/* Top-right markers: video / starred. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: SPACE.sm,
            right: SPACE.sm,
            flexDirection: 'row',
            gap: SPACE.xs,
          }}
        >
          {photo.starred ? (
            <View
              accessibilityLabel={labels.starred}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.45)',
              }}
            >
              <Feather name="bookmark" size={14} color="#ffffff" />
            </View>
          ) : null}
        </View>

        {/* Center play badge for video tiles. */}
        {photo.isVideo ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              accessibilityLabel={labels.video}
              style={{
                width: isHero ? 56 : 44,
                height: isHero ? 56 : 44,
                borderRadius: isHero ? 28 : 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.5)',
              }}
            >
              <Feather name="play" size={isHero ? 26 : 20} color="#ffffff" />
            </View>
          </View>
        ) : null}
      </Pressable>

      {/* Caption strip below the photo (warm-paper card foot). */}
      <View style={{ padding: isHero ? SPACE.lg : SPACE.md, gap: SPACE.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
          <Small
            style={{ flex: 1, fontWeight: isHero ? '600' : '400' }}
            numberOfLines={isHero ? 3 : 2}
          >
            {caption}
          </Small>
          {onTranslate ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={labels.translate}
              onPress={() => onTranslate(photo)}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingTop: 1 })}
            >
              <Feather name="info" size={16} color={c.accent} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
          {photo.date ? <MonoSm muted>{photo.date}</MonoSm> : null}
          {photo.room ? <RoomChip room={photo.room} color={AP.onChip} /> : null}
        </View>

        {showActions ? (
          <View
            style={{
              flexDirection: 'row',
              gap: SPACE.lg,
              marginTop: SPACE.xs,
              alignItems: 'center',
            }}
          >
            {onSave ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={labels.save}
                onPress={() => onSave(photo)}
                hitSlop={8}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Feather name="download" size={16} color={c.text} />
                <Small>{labels.save}</Small>
              </Pressable>
            ) : null}
            {onShare ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={labels.share}
                onPress={() => onShare(photo)}
                hitSlop={8}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Feather name="share-2" size={16} color={c.text} />
                <Small>{labels.share}</Small>
              </Pressable>
            ) : null}
            {onHide ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={labels.hide}
                onPress={() => onHide(photo)}
                hitSlop={8}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginLeft: 'auto',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Feather name="eye-off" size={16} color={c.textMute} />
                <Small muted>{labels.hide}</Small>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}
