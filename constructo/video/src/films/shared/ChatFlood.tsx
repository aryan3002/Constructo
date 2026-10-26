/**
 * The noise: everyday site chat, either rising in columns (the calm film) or
 * flying in and piling up (the bold film). Both render real chat bubbles.
 */
import type {CSSProperties} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';

import {clamp01, EXIT, prog, seeded, SETTLE} from '../../brand/motion';
import {Bubble, CHAT, MissedCall, PhotoMessage, VoiceNote} from '../../components/ui/chat';
import {CHAT_ITEMS, SENDERS, type ChatItem} from './chatContent';

export function ChatItemView({item, scale = 1, photoWidth = 220}: {item: ChatItem; scale?: number; photoWidth?: number}) {
  const fs = 16 * scale;
  const sender = 'sender' in item && item.sender !== undefined ? SENDERS[item.sender] : undefined;
  const senderColor = 'sender' in item && item.sender !== undefined ? CHAT.senders[item.sender % CHAT.senders.length] : undefined;
  switch (item.type) {
    case 'text':
      return (
        <Bubble side={item.side} time={item.time} sender={sender} senderColor={senderColor} fontSize={fs} maxWidth={360 * scale}>
          {item.text}
        </Bubble>
      );
    case 'voice':
      return (
        <div style={{zoom: scale, alignSelf: item.side === 'out' ? 'flex-end' : 'flex-start', display: 'flex'}}>
          <VoiceNote side={item.side} duration={item.duration} time={item.time} sender={sender} senderColor={senderColor} width={250} seed={item.duration.length + item.time.length} />
        </div>
      );
    case 'photo':
      return (
        <div style={{zoom: scale, alignSelf: item.side === 'out' ? 'flex-end' : 'flex-start', display: 'flex'}}>
          <PhotoMessage side={item.side} scene={item.scene} time={item.time} sender={sender} senderColor={senderColor} width={photoWidth} />
        </div>
      );
    case 'missed':
      return (
        <div style={{zoom: scale, display: 'flex'}}>
          <MissedCall label={item.label} time={item.time} />
        </div>
      );
  }
}

/** Columns of chat that rise faster and faster. */
export function ChatColumns({
  start = 0,
  columns,
  colWidth,
  scale = 1.25,
  v0 = 2.2,
  accel = 0.028,
  exitAt,
  style,
}: {
  start?: number;
  /** Left edge of each column. */
  columns: number[];
  colWidth: number;
  scale?: number;
  v0?: number;
  accel?: number;
  exitAt?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const {height} = useVideoConfig();
  const f = Math.max(0, frame - start);
  const out = exitAt === undefined ? 0 : prog(frame, exitAt, 18, EXIT);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: clamp01(f / 10) * (1 - out), ...style}}>
      {columns.map((x, ci) => {
        const items = [...CHAT_ITEMS.slice((ci * 7) % CHAT_ITEMS.length), ...CHAT_ITEMS.slice(0, (ci * 7) % CHAT_ITEMS.length)];
        const speed = 0.8 + 0.45 * seeded(ci + 2);
        const y = height * (0.15 + 0.35 * seeded(ci + 9)) - (v0 * f + 0.5 * accel * f * f) * speed;
        return (
          <div
            key={ci}
            style={{
              position: 'absolute',
              left: x,
              top: 0,
              width: colWidth,
              transform: `translateY(${y}px)`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12 * scale,
            }}
          >
            {items.map((item, i) => (
              <ChatItemView key={i} item={item} scale={scale} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Bubbles fly in from the edges and pile up; `fallAt` drops them like a pile of rubble. */
export function ChatBurst({
  start = 0,
  count = 26,
  stagger = 4,
  scale = 1.35,
  fallAt,
  seed = 1,
}: {
  start?: number;
  count?: number;
  stagger?: number;
  scale?: number;
  fallAt?: number;
  seed?: number;
}) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  return (
    <div style={{position: 'absolute', inset: 0}}>
      {Array.from({length: count}, (_, i) => {
        const item = CHAT_ITEMS[(i * 5 + seed) % CHAT_ITEMS.length];
        const r1 = seeded(i * 3 + seed);
        const r2 = seeded(i * 7 + seed * 11);
        const r3 = seeded(i * 13 + seed * 5);
        const tx = width * (0.04 + 0.78 * r1);
        const ty = height * (0.06 + 0.8 * r2);
        const side = Math.floor(r3 * 4);
        const fromX = side === 0 ? -600 : side === 1 ? width + 200 : tx;
        const fromY = side === 2 ? -400 : side === 3 ? height + 200 : ty;
        const p = prog(frame, start + i * stagger, 16, SETTLE);
        const rot = (r3 - 0.5) * 12;
        // The fall: gravity with a per-bubble delay.
        const fall = fallAt === undefined ? 0 : Math.max(0, frame - fallAt - r2 * 8);
        const drop = 0.9 * fall * fall;
        const fade = fallAt === undefined ? 1 : 1 - clamp01(fall / 26);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transform: `translate(${fromX + (tx - fromX) * p}px, ${fromY + (ty - fromY) * p + drop}px) rotate(${rot * (1 - 0.6 * p) + fall * (r3 - 0.5) * 0.6}deg)`,
              opacity: (p > 0 ? 1 : 0) * fade,
              width: 420 * scale,
              display: 'flex',
              flexDirection: 'column',
              filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.35))',
            }}
          >
            <ChatItemView item={item} scale={scale} />
          </div>
        );
      })}
    </div>
  );
}
