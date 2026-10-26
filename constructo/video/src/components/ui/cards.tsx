/**
 * The three Neev moments as app cards:
 *  - EntryCard: a voice note turned into a site record, with its proof.
 *  - DecisionCard: an exception for the owner, with the evidence that raised it.
 *  - HomeHero: the family's "You're okay." card with the build's TimeBar.
 * Interaction states are plain 0–1 numbers so scenes can choreograph them.
 */
import type {ReactNode} from 'react';

import {FONT} from '../../brand/fonts';
import {useTheme} from '../../brand/theme';
import {radius} from '../../brand/tokens';
import {Icon, type IconName} from './Icon';
import {Button, Card, EvidenceChip, Eyebrow, formatINR, StatusPill} from './primitives';
import {TimeBar} from './widgets';

/** Cross-fade between two versions of the same content (English → Hindi) at `t`. */
export function Swap({t, a, b}: {t: number; a: ReactNode; b: ReactNode}) {
  const showB = t >= 0.5;
  const o = showB ? (t - 0.5) * 2 : 1 - t * 2;
  return <div style={{opacity: o}}>{showB ? b : a}</div>;
}

export type EntryRow = {label: string; value: string};

export function EntryCard({
  eyebrow,
  title,
  rows,
  evidence,
  rowsShown = rows.length,
  status = 'Recorded',
  statusIn = 1,
}: {
  eyebrow: string;
  title: string;
  rows: EntryRow[];
  evidence: Array<{icon: IconName; label: string}>;
  /** How many rows are visible (fractional values fade the next row in). */
  rowsShown?: number;
  status?: string;
  statusIn?: number;
}) {
  const t = useTheme();
  return (
    <Card style={{padding: '16px 18px 18px'}}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8}}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <span style={{opacity: statusIn, transform: `scale(${0.85 + 0.15 * statusIn})`}}>
          <StatusPill tone="ok" label={status} size="sm" />
        </span>
      </div>
      <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 21, lineHeight: '28px', color: t.ink, marginTop: 6}}>
        {title}
      </div>
      <div style={{marginTop: 10, borderTop: `1px solid ${t.line}`}}>
        {rows.map((row, i) => {
          const o = Math.min(1, Math.max(0, rowsShown - i));
          return (
            <div
              key={row.label}
              style={{
                display: 'flex',
                gap: 12,
                padding: '10px 0',
                borderBottom: `1px solid ${t.line}`,
                opacity: o,
                transform: `translateY(${(1 - o) * 8}px)`,
              }}
            >
              <span style={{width: 84, flexShrink: 0, fontFamily: FONT.text, fontWeight: 600, fontSize: 14, color: t.inkMuted, paddingTop: 1}}>
                {row.label}
              </span>
              <span style={{fontFamily: FONT.text, fontSize: 16, lineHeight: '22px', color: t.ink}}>{row.value}</span>
            </div>
          );
        })}
      </div>
      <div style={{display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', opacity: Math.min(1, Math.max(0, rowsShown - rows.length + 1))}}>
        {evidence.map((e) => (
          <EvidenceChip key={e.label} icon={e.icon} label={e.label} />
        ))}
      </div>
    </Card>
  );
}

export function DecisionCard({
  kind,
  kindIcon = 'file-text',
  flag,
  title,
  amount,
  meta,
  evidence,
  compare = 0,
  compareRows,
  difference,
  holdPressed = 0,
  held = 0,
  evidenceHighlight = 0,
}: {
  kind: string;
  kindIcon?: IconName;
  flag: string;
  title: string;
  amount: number;
  meta: string;
  evidence: Array<{icon: IconName; label: string}>;
  /** 0–1: opens the evidence comparison. */
  compare?: number;
  compareRows: Array<{label: string; value: string}>;
  difference: {label: string; value: string};
  holdPressed?: number;
  /** 0–1: the decision is recorded as on hold. */
  held?: number;
  evidenceHighlight?: number;
}) {
  const t = useTheme();
  return (
    <Card style={{padding: '16px 18px 18px'}}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8}}>
        <span style={{display: 'flex', alignItems: 'center', gap: 10}}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              background: t.claySoft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: t.clay,
            }}
          >
            <Icon name={kindIcon} size={18} />
          </span>
          <Eyebrow>{kind}</Eyebrow>
        </span>
        <span style={{position: 'relative'}}>
          <span style={{opacity: 1 - held, display: 'inline-block'}}>
            <StatusPill tone="risk" label={flag} size="sm" />
          </span>
          <span style={{position: 'absolute', right: 0, top: 0, opacity: held}}>
            <StatusPill tone="warn" label="On hold" size="sm" />
          </span>
        </span>
      </div>
      <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 21, lineHeight: '28px', color: t.ink, marginTop: 10}}>
        {title}
      </div>
      <div style={{display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4}}>
        <span style={{fontFamily: FONT.data, fontWeight: 500, fontSize: 28, color: t.ink}}>{formatINR(amount)}</span>
      </div>
      <div style={{fontFamily: FONT.text, fontSize: 15.5, color: t.inkMuted, marginTop: 2}}>{meta}</div>
      <div style={{display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap'}}>
        {evidence.map((e, i) => (
          <EvidenceChip key={e.label} icon={e.icon} label={e.label} highlight={i < 2 ? evidenceHighlight : 0} />
        ))}
      </div>
      {/* Evidence comparison */}
      <div style={{height: 168 * compare, overflow: 'hidden'}}>
        <div
          style={{
            marginTop: 14,
            borderRadius: radius.control + 2,
            background: t.surfaceInset,
            border: `1px solid ${t.line}`,
            padding: '6px 14px',
            opacity: compare,
          }}
        >
          {compareRows.map((row) => (
            <div
              key={row.label}
              style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: `1px solid ${t.line}`}}
            >
              <span style={{fontFamily: FONT.text, fontSize: 15.5, color: t.inkMuted}}>{row.label}</span>
              <span style={{fontFamily: FONT.data, fontWeight: 500, fontSize: 19, color: t.ink}}>{row.value}</span>
            </div>
          ))}
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '9px 0 5px'}}>
            <span style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 15.5, color: t.risk}}>{difference.label}</span>
            <span style={{fontFamily: FONT.data, fontWeight: 500, fontSize: 19, color: t.risk}}>{difference.value}</span>
          </div>
        </div>
      </div>
      <div style={{display: 'flex', gap: 10, marginTop: 16}}>
        <Button label="Hold payment" kind="primary" icon="pause-circle" pressed={holdPressed} style={{flex: 1}} />
        <Button label="Review" kind="secondary" style={{flex: 0.72}} />
      </div>
    </Card>
  );
}

export type HomeHeroCopy = {
  eyebrow: string;
  answer: string;
  sub: string;
  started: string;
  handover: string;
  now: string;
};

export const HOME_HERO_EN: HomeHeroCopy = {
  eyebrow: 'Today · All calm',
  answer: "You're okay.",
  sub: "Nothing needs you today. We'll tell you the moment it does.",
  started: 'Started Mar 2026',
  handover: 'Handover Feb 2027',
  now: 'Now',
};

export const HOME_HERO_HI: HomeHeroCopy = {
  eyebrow: 'आज · सब शांत',
  answer: 'सब ठीक है।',
  sub: 'आज आपकी कोई ज़रूरत नहीं। जैसे ही होगी, हम बता देंगे।',
  started: 'शुरू मार्च 2026',
  handover: 'कब्ज़ा फ़रवरी 2027',
  now: 'अभी',
};

export function HomeHero({copy, progress, reveal = 1}: {copy: HomeHeroCopy; progress: number; reveal?: number}) {
  const t = useTheme();
  return (
    <Card tint={t.claySoft} accent={t.clay} style={{padding: '18px 20px 20px', borderColor: '#e3cdb9'}}>
      <Eyebrow>{copy.eyebrow}</Eyebrow>
      <div
        style={{
          fontFamily: FONT.display,
          fontWeight: 600,
          fontSize: 44,
          lineHeight: '58px',
          letterSpacing: -0.7,
          color: t.ink,
          marginTop: 4,
        }}
      >
        {copy.answer}
      </div>
      <div style={{fontFamily: FONT.text, fontSize: 16.5, lineHeight: '24px', color: t.inkMuted, marginTop: 4}}>{copy.sub}</div>
      <div style={{marginTop: 16}}>
        <TimeBar progress={progress} reveal={reveal} startLabel={copy.started} endLabel={copy.handover} nowLabel={copy.now} />
      </div>
    </Card>
  );
}
