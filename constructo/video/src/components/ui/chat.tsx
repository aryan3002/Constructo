/**
 * Chat-app pieces for "how building runs today": bubbles, voice notes, photos,
 * missed calls and typing dots, in the familiar messenger look (no logos).
 * Their text is content, so it stays in the language people actually type.
 */
import type {CSSProperties, ReactNode} from 'react';

import {FONT} from '../../brand/fonts';
import {seeded} from '../../brand/motion';
import {Icon} from './Icon';
import {SiteIllustration, type SiteScene} from './SiteIllustration';

export const CHAT = {
  wallpaper: '#efeae2',
  incoming: '#ffffff',
  outgoing: '#d9fdd3',
  text: '#111b21',
  meta: '#667781',
  tick: '#53bdeb',
  senders: ['#c0563a', '#2f6151', '#7d5a13', '#6a4c93', '#1f6f8b'],
};

export type Side = 'in' | 'out';

function Ticks() {
  return (
    <svg width={17} height={11} viewBox="0 0 17 11" style={{marginLeft: 3}}>
      <path d="M1 6 L4.2 9.2 L10.6 1.8" stroke={CHAT.tick} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.4 9.2 L7.2 9.2 L13.6 1.8" stroke={CHAT.tick} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Bubble({
  side,
  children,
  time,
  sender,
  senderColor = CHAT.senders[0],
  maxWidth = 300,
  fontSize = 16,
  style,
}: {
  side: Side;
  children: ReactNode;
  time?: string;
  sender?: string;
  senderColor?: string;
  maxWidth?: number;
  fontSize?: number;
  style?: CSSProperties;
}) {
  const out = side === 'out';
  return (
    <div
      style={{
        position: 'relative',
        alignSelf: out ? 'flex-end' : 'flex-start',
        maxWidth,
        background: out ? CHAT.outgoing : CHAT.incoming,
        color: CHAT.text,
        borderRadius: 12,
        borderTopRightRadius: out ? 3 : 12,
        borderTopLeftRadius: out ? 12 : 3,
        padding: '7px 10px 6px 11px',
        boxShadow: '0 1px 1.5px rgba(11,20,26,0.13)',
        fontFamily: FONT.text,
        fontSize,
        lineHeight: 1.38,
        ...style,
      }}
    >
      {sender ? (
        <div style={{fontWeight: 600, fontSize: fontSize * 0.86, color: senderColor, marginBottom: 1}}>{sender}</div>
      ) : null}
      <span>{children}</span>
      {time ? (
        <span
          style={{
            float: 'right',
            display: 'inline-flex',
            alignItems: 'center',
            marginLeft: 10,
            marginTop: fontSize * 0.45,
            fontSize: fontSize * 0.7,
            color: CHAT.meta,
            lineHeight: 1,
          }}
        >
          {time}
          {out ? <Ticks /> : null}
        </span>
      ) : null}
    </div>
  );
}

/** A voice note: play, waveform, duration. `played` (0–1) colours the heard part. */
export function VoiceNote({
  side = 'in',
  duration,
  time,
  played = 0,
  seed = 3,
  sender,
  senderColor,
  width = 270,
}: {
  side?: Side;
  duration: string;
  time?: string;
  played?: number;
  seed?: number;
  sender?: string;
  senderColor?: string;
  width?: number;
}) {
  const bars = 30;
  return (
    <Bubble side={side} time={time} sender={sender} senderColor={senderColor} maxWidth={width + 30}>
      <span style={{display: 'flex', alignItems: 'center', gap: 10, width, paddingTop: 2}}>
        <Icon name="play" size={22} color={CHAT.meta} />
        <svg width={width - 92} height={30} viewBox={`0 0 ${bars * 6} 30`} preserveAspectRatio="none">
          {Array.from({length: bars}, (_, i) => {
            const h = 5 + Math.round(22 * Math.abs(Math.sin(i * 0.55 + seed)) * (0.45 + 0.55 * seeded(i + seed * 31)));
            return (
              <rect
                key={i}
                x={i * 6}
                y={15 - h / 2}
                width={3.4}
                height={h}
                rx={1.7}
                fill={i / bars < played ? '#1f8a70' : '#a8b3ad'}
              />
            );
          })}
        </svg>
        <span style={{fontSize: 13, color: CHAT.meta, minWidth: 30}}>{duration}</span>
      </span>
    </Bubble>
  );
}

export function PhotoMessage({
  side = 'in',
  scene,
  time,
  sender,
  senderColor,
  caption,
  width = 240,
}: {
  side?: Side;
  scene: SiteScene;
  time?: string;
  sender?: string;
  senderColor?: string;
  caption?: string;
  width?: number;
}) {
  return (
    <Bubble side={side} sender={sender} senderColor={senderColor} maxWidth={width + 12} style={{padding: 4}}>
      <span style={{display: 'block', width, height: width * 0.75, borderRadius: 9, overflow: 'hidden', position: 'relative'}}>
        <SiteIllustration scene={scene} />
        {time && !caption ? (
          <span style={{position: 'absolute', right: 8, bottom: 6, fontSize: 11.5, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)'}}>
            {time}
          </span>
        ) : null}
      </span>
      {caption ? (
        <span style={{display: 'block', padding: '4px 6px 2px', fontSize: 15}}>
          {caption}
          <span style={{float: 'right', fontSize: 11.5, color: CHAT.meta, marginLeft: 8, marginTop: 6}}>{time}</span>
        </span>
      ) : null}
    </Bubble>
  );
}

export function MissedCall({label, time}: {label: string; time: string}) {
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: CHAT.incoming,
        borderRadius: 12,
        borderTopLeftRadius: 3,
        padding: '9px 14px',
        boxShadow: '0 1px 1.5px rgba(11,20,26,0.13)',
        fontFamily: FONT.text,
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          background: '#fde3e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="phone-missed" size={17} color="#d93f2b" />
      </span>
      <span style={{display: 'flex', flexDirection: 'column'}}>
        <span style={{fontSize: 15.5, fontWeight: 600, color: CHAT.text}}>{label}</span>
        <span style={{fontSize: 12.5, color: CHAT.meta}}>{time}</span>
      </span>
    </div>
  );
}

/** Three dots; `phase` is a free-running number (frame / 12 works well). */
export function TypingDots({phase, side = 'in'}: {phase: number; side?: Side}) {
  return (
    <Bubble side={side} style={{padding: '12px 14px'}}>
      <span style={{display: 'flex', gap: 5}}>
        {[0, 1, 2].map((i) => {
          const k = (Math.sin((phase - i * 0.35) * Math.PI) + 1) / 2;
          return (
            <span
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: CHAT.meta,
                opacity: 0.35 + 0.55 * k,
                transform: `translateY(${-2.5 * k}px)`,
              }}
            />
          );
        })}
      </span>
    </Bubble>
  );
}
