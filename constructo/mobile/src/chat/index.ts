/**
 * The unified chat kit — composable, theme-aware pieces the supervisor, owner,
 * and homeowner chat screens all build on. See the Slice A design:
 * docs/superpowers/specs/2026-06-08-unified-rich-chat-design.md
 */
export * from './feed'
export * from './useChatThread'
export { MessageFeed, type FeedRow } from './MessageFeed'
export { ChatComposer } from './ChatComposer'
export { usePhotoComposer, type PhotoComposer } from './usePhotoComposer'
export { CaptureRail } from './CaptureRail'
export { CaptureCard, MessageBubble, SystemNotice } from './MessageView'
export { systemNotice } from './systemNotice'
