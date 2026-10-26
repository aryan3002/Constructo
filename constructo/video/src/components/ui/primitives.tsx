/**
 * Small app-UI primitives recreated from the Neev design system: Card,
 * StatusPill, Button, EvidenceChip, Eyebrow and Money. Sizes are the app's own
 * (in points); put them inside a PhoneFrame or scale them up yourself.
 */
import type {CSSProperties, ReactNode} from 'react';

import {FONT} from '../../brand/fonts';
import {useTheme} from '../../brand/theme';
import {radius} from '../../brand/tokens';
import {Icon, type IconName} from './Icon';

export function Card({
  children,
  style,
  accent,
  tint,
}: {
  children: ReactNode;
  style?: CSSProperties;
  /** A 4px top rule in this colour (the homeowner hero card). */
  accent?: string;
  /** Background override (e.g. clay-soft for the hero). */
  tint?: string;
}) {
  const t = useTheme();
  return (
    <div
      style={{
        background: tint ?? t.surfaceRaised,
        border: `1px solid ${t.line}`,
        borderRadius: radius.card,
        boxShadow: t.shadowCard,
        borderTop: accent ? `4px solid ${accent}` : `1px solid ${t.line}`,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export type Tone = 'ok' | 'warn' | 'risk' | 'info' | 'quiet';

const TONE_ICON: Record<Tone, IconName> = {
  ok: 'check-circle',
  warn: 'alert-circle',
  risk: 'alert-triangle',
  info: 'repeat',
  quiet: 'clock',
};

/** Status always shows colour, icon and word together. */
export function StatusPill({tone, label, size = 'md'}: {tone: Tone; label: string; size?: 'sm' | 'md'}) {
  const t = useTheme();
  const fg = {ok: t.ok, warn: t.warn, risk: t.risk, info: t.info, quiet: t.inkMuted}[tone];
  const bg = {ok: t.okSoft, warn: t.warnSoft, risk: t.riskSoft, info: t.infoSoft, quiet: t.surfaceSunken}[tone];
  const fs = size === 'sm' ? 13 : 14.5;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: size === 'sm' ? '4px 10px' : '6px 12px',
        borderRadius: radius.pill,
        background: bg,
        color: fg,
        fontFamily: FONT.text,
        fontWeight: 600,
        fontSize: fs,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={TONE_ICON[tone]} size={fs + 1} />
      {label}
    </span>
  );
}

export function Button({
  label,
  kind = 'primary',
  icon,
  pressed = 0,
  style,
}: {
  label: string;
  kind?: 'primary' | 'secondary';
  icon?: IconName;
  /** 0–1 press feedback (darkens and sinks slightly). */
  pressed?: number;
  style?: CSSProperties;
}) {
  const t = useTheme();
  const primary = kind === 'primary';
  return (
    <div
      style={{
        height: 50,
        borderRadius: radius.control,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontFamily: FONT.text,
        fontWeight: 600,
        fontSize: 17,
        color: primary ? t.onBrand : t.ink,
        background: primary ? t.brand : t.surfaceRaised,
        border: primary ? 'none' : `1.5px solid ${t.line}`,
        boxShadow: primary ? t.shadowCard : 'none',
        transform: `scale(${1 - 0.04 * pressed})`,
        filter: `brightness(${1 - 0.12 * pressed})`,
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      {label}
    </div>
  );
}

/** Evidence on tap: a small chip that names the proof behind a claim. */
export function EvidenceChip({
  icon,
  label,
  highlight = 0,
}: {
  icon: IconName;
  label: string;
  /** 0–1: ring the chip (it's being tapped or looked at). */
  highlight?: number;
}) {
  const t = useTheme();
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 11px',
        borderRadius: radius.pill,
        background: t.surfaceSunken,
        color: t.inkMuted,
        fontFamily: FONT.text,
        fontWeight: 600,
        fontSize: 14,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        boxShadow: highlight > 0 ? `0 0 0 ${2 * highlight}px ${t.brand}` : 'none',
      }}
    >
      <Icon name={icon} size={15} />
      {label}
    </span>
  );
}

export function Eyebrow({children, color, style}: {children: ReactNode; color?: string; style?: CSSProperties}) {
  const t = useTheme();
  return (
    <div
      style={{
        fontFamily: FONT.text,
        fontWeight: 600,
        fontSize: 13,
        letterSpacing: 0.9,
        textTransform: 'uppercase',
        color: color ?? t.clayText,
        lineHeight: 1.3,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** ₹ first, no space, Indian grouping: ₹1,24,000. */
export function formatINR(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function Money({amount, size = 17, color, weight = 500}: {amount: number; size?: number; color?: string; weight?: number}) {
  const t = useTheme();
  return (
    <span style={{fontFamily: FONT.data, fontWeight: weight, fontSize: size, color: color ?? t.ink, whiteSpace: 'nowrap'}}>
      {formatINR(amount)}
    </span>
  );
}
