/**
 * App widgets from the design system: TimeBar, Toast, CaptureButton, TabBar,
 * LanguageToggle. All frame-free: pass progress values from your scene.
 */
import type {CSSProperties} from 'react';

import {FONT} from '../../brand/fonts';
import {useTheme} from '../../brand/theme';
import {radius} from '../../brand/tokens';
import {Icon, type IconName} from './Icon';

/** Where the build stands: start → handover with a "Now" marker. Never a percentage. */
export function TimeBar({
  progress,
  startLabel,
  endLabel,
  nowLabel,
  reveal = 1,
}: {
  progress: number;
  startLabel: string;
  endLabel: string;
  nowLabel: string;
  /** 0–1: grows the fill from the start (the bar "fills in" on arrival). */
  reveal?: number;
}) {
  const t = useTheme();
  const p = progress * reveal;
  return (
    <div style={{position: 'relative', paddingTop: 22}}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: `${p * 100}%`,
          transform: 'translateX(-50%)',
          fontFamily: FONT.text,
          fontWeight: 600,
          fontSize: 14,
          color: t.clayText,
          opacity: reveal,
          whiteSpace: 'nowrap',
        }}
      >
        {nowLabel}
      </div>
      <div style={{height: 9, borderRadius: 5, background: t.brandSoft, position: 'relative'}}>
        <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${p * 100}%`, borderRadius: 5, background: t.brandStrong}} />
        <div
          style={{
            position: 'absolute',
            left: `${p * 100}%`,
            top: '50%',
            width: 18,
            height: 18,
            borderRadius: 9,
            background: t.clay,
            border: `3px solid ${t.surfaceRaised}`,
            boxShadow: '0 1px 4px rgba(42,37,25,0.3)',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 10,
          fontFamily: FONT.text,
          fontSize: 14,
          color: t.inkMuted,
        }}
      >
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

export function Toast({
  text,
  tone = 'ok',
  style,
}: {
  text: string;
  tone?: 'ok' | 'warn' | 'info';
  style?: CSSProperties;
}) {
  const t = useTheme();
  const icon: IconName = tone === 'ok' ? 'check-circle' : tone === 'warn' ? 'pause-circle' : 'info';
  const accent = tone === 'ok' ? '#93cdb5' : tone === 'warn' ? '#e5b75c' : '#d7cfbc';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '13px 16px',
        borderRadius: radius.bubble,
        background: t.name === 'day' ? '#2a2519' : '#f1ece1',
        color: t.name === 'day' ? '#f3efe6' : '#2a2519',
        fontFamily: FONT.text,
        fontWeight: 600,
        fontSize: 15.5,
        lineHeight: 1.3,
        boxShadow: t.shadowFloat,
        ...style,
      }}
    >
      <Icon name={icon} size={19} color={accent} />
      <span>{text}</span>
    </div>
  );
}

/** The capture spark: marigold, with a mic or camera glyph. `pulse` (0–1 loop phase) rings it while recording. */
export function CaptureButton({
  size = 64,
  glyph = 'camera',
  recording = 0,
  pulse = 0,
}: {
  size?: number;
  glyph?: IconName;
  /** 0–1: grows into the recording state. */
  recording?: number;
  /** 0–1 phase of the recording ring (drive it from the frame). */
  pulse?: number;
}) {
  const t = useTheme();
  const s = size * (1 + 0.18 * recording);
  return (
    <div style={{position: 'relative', width: size, height: size}}>
      {recording > 0
        ? [0, 0.5].map((offset) => {
            const ph = (pulse + offset) % 1;
            return (
              <div
                key={offset}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: s * (1 + ph * 0.9),
                  height: s * (1 + ph * 0.9),
                  borderRadius: '50%',
                  border: `2px solid ${t.marigold}`,
                  opacity: recording * (1 - ph) * 0.8,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            );
          })
        : null}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: s,
          height: s,
          borderRadius: '50%',
          background: t.marigold,
          border: `2px solid ${t.marigoldEdge}`,
          boxShadow: '0 6px 16px rgba(168,105,10,0.35)',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={glyph} size={size * 0.42} color={t.onMarigold} />
      </div>
    </div>
  );
}

export type Tab = {icon: IconName; label: string};

export const HOMEOWNER_TABS: Tab[] = [
  {icon: 'home', label: 'Home'},
  {icon: 'image', label: 'Photos'},
  {icon: 'file-text', label: 'Updates'},
  {icon: 'message-circle', label: 'Messages'},
  {icon: 'layout', label: 'Design'},
];

export const HOMEOWNER_TABS_HI: Tab[] = [
  {icon: 'home', label: 'होम'},
  {icon: 'image', label: 'तस्वीरें'},
  {icon: 'file-text', label: 'अपडेट'},
  {icon: 'message-circle', label: 'संदेश'},
  {icon: 'layout', label: 'डिज़ाइन'},
];

export const SITE_TABS: Tab[] = [
  {icon: 'home', label: 'Home'},
  {icon: 'list', label: 'Tasks'},
  {icon: 'camera', label: 'Capture'},
  {icon: 'message-circle', label: 'Chat'},
  {icon: 'grid', label: 'More'},
];

/** One floating tab bar; the site team's version holds the capture spark in the centre. */
export function TabBar({
  tabs,
  active = 0,
  capture,
  captureNode,
}: {
  tabs: Tab[];
  active?: number;
  /** Index of the tab replaced by the capture spark. */
  capture?: number;
  captureNode?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <div
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 26,
        height: 70,
        borderRadius: radius.sheet + 8,
        background: t.surfaceRaised,
        border: `1px solid ${t.line}`,
        boxShadow: t.shadowFloat,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '0 6px',
        zIndex: 10,
      }}
    >
      {tabs.map((tab, i) =>
        i === capture ? (
          <div key={tab.label} style={{width: 64, display: 'flex', justifyContent: 'center', marginTop: -30}}>
            {captureNode}
          </div>
        ) : (
          <div
            key={tab.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              width: 64,
              color: i === active ? t.brand : t.inkMuted,
            }}
          >
            <Icon name={tab.icon} size={23} />
            <span style={{fontFamily: FONT.text, fontSize: 12.5, fontWeight: i === active ? 600 : 400, lineHeight: '16px'}}>
              {tab.label}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

/** EN | हिं segmented switch; `position` 0 = English, 1 = Hindi (animate between). */
export function LanguageToggle({position, scale = 1}: {position: number; scale?: number}) {
  const t = useTheme();
  const w = 54;
  return (
    <div
      style={{
        position: 'relative',
        width: w * 2 + 8,
        height: 40,
        borderRadius: radius.pill,
        background: t.surfaceRaised,
        border: `1.5px solid ${t.line}`,
        transform: `scale(${scale})`,
        transformOrigin: 'right center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 3,
          left: 3 + position * w,
          width: w,
          height: 31,
          borderRadius: radius.pill,
          background: t.ink,
        }}
      />
      {['EN', 'हिं'].map((label, i) => {
        const on = i === 0 ? 1 - position : position;
        return (
          <div
            key={label}
            style={{
              position: 'absolute',
              top: 3,
              left: 3 + i * w,
              width: w,
              height: 31,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT.text,
              fontWeight: 600,
              fontSize: 15,
              color: on > 0.5 ? t.surface : t.inkMuted,
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}
