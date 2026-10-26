/**
 * A modern phone in ink with a 390×844pt screen (the size the app is designed
 * at). Children are the screen; the status bar sits on top. Scale the whole
 * device with `scale`, so app text keeps its real proportions.
 */
import type {CSSProperties, ReactNode} from 'react';

import {FONT} from '../../brand/fonts';
import {ThemeProvider} from '../../brand/theme';
import {day, type Theme} from '../../brand/tokens';

export const SCREEN = {width: 390, height: 844};
const BEZEL = 13;
export const DEVICE = {width: SCREEN.width + BEZEL * 2, height: SCREEN.height + BEZEL * 2};

export function StatusBar({time, color}: {time: string; color: string}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 30px 0 44px',
        color,
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <span style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 16.5, letterSpacing: 0.2}}>{time}</span>
      <span style={{display: 'flex', alignItems: 'center', gap: 6}}>
        <svg width={18} height={12} viewBox="0 0 18 12">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={i * 4.6} y={9 - i * 3} width={3.2} height={3 + i * 3} rx={0.8} fill={color} />
          ))}
        </svg>
        <svg width={16} height={12} viewBox="0 0 16 12">
          <path d="M8 11.2 L5.6 8.6 A3.4 3.4 0 0 1 10.4 8.6 Z" fill={color} />
          <path d="M3.4 6.4 A6.6 6.6 0 0 1 12.6 6.4" stroke={color} strokeWidth={1.7} fill="none" strokeLinecap="round" />
          <path d="M1 3.8 A10 10 0 0 1 15 3.8" stroke={color} strokeWidth={1.7} fill="none" strokeLinecap="round" />
        </svg>
        <svg width={27} height={13} viewBox="0 0 27 13">
          <rect x={0.75} y={0.75} width={22.5} height={11.5} rx={3.4} stroke={color} strokeOpacity={0.45} strokeWidth={1.3} fill="none" />
          <rect x={2.6} y={2.6} width={16.5} height={7.8} rx={2} fill={color} />
          <rect x={24.4} y={4.2} width={1.8} height={4.6} rx={0.9} fill={color} fillOpacity={0.45} />
        </svg>
      </span>
    </div>
  );
}

export type PhoneFrameProps = {
  children: ReactNode;
  /** Device scale: 1 = a 390pt-wide screen at 1px per point. */
  scale?: number;
  time?: string;
  theme?: Theme;
  /** Status bar ink; defaults to the theme's ink. */
  statusColor?: string;
  /** Stronger drop shadow for dark canvases. */
  glow?: boolean;
  style?: CSSProperties;
};

export function PhoneFrame({children, scale = 1, time = '9:41', theme = day, statusColor, glow, style}: PhoneFrameProps) {
  return (
    <div
      style={{
        width: DEVICE.width,
        height: DEVICE.height,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        position: 'relative',
        borderRadius: 66,
        background: 'linear-gradient(145deg, #4a443a 0%, #1b1916 18%, #1b1916 82%, #3b362e 100%)',
        boxShadow: glow
          ? '0 50px 120px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(255,255,255,0.10), inset 0 0 0 2px rgba(255,255,255,0.06)'
          : '0 46px 90px rgba(42,37,25,0.26), 0 14px 30px rgba(42,37,25,0.18), inset 0 0 0 2px rgba(255,255,255,0.08)',
        ...style,
      }}
    >
      {/* Side buttons */}
      <div style={{position: 'absolute', left: -3, top: 190, width: 4, height: 64, borderRadius: 2, background: '#2c2821'}} />
      <div style={{position: 'absolute', left: -3, top: 268, width: 4, height: 64, borderRadius: 2, background: '#2c2821'}} />
      <div style={{position: 'absolute', right: -3, top: 230, width: 4, height: 98, borderRadius: 2, background: '#2c2821'}} />
      <div
        style={{
          position: 'absolute',
          left: BEZEL,
          top: BEZEL,
          width: SCREEN.width,
          height: SCREEN.height,
          borderRadius: 54,
          overflow: 'hidden',
          background: theme.surface,
          isolation: 'isolate',
        }}
      >
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
        <StatusBar time={time} color={statusColor ?? theme.ink} />
        {/* Dynamic island */}
        <div
          style={{
            position: 'absolute',
            top: 11,
            left: (SCREEN.width - 122) / 2,
            width: 122,
            height: 35,
            borderRadius: 18,
            background: '#0d0c0a',
            zIndex: 30,
          }}
        />
        {/* Glass sheen */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 28%)',
            pointerEvents: 'none',
            zIndex: 40,
          }}
        />
      </div>
    </div>
  );
}
