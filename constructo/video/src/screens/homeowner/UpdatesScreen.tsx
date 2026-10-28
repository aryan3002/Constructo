/**
 * Homeowner · Updates: the milestones (where the build stands) and the weekly
 * letter, which the family can read or listen to.
 */
import {useCurrentFrame} from 'remotion';

import {FONT} from '../../brand/fonts';
import {clamp01, EASE, prog, SETTLE} from '../../brand/motion';
import {useTheme} from '../../brand/theme';
import {Icon} from '../../components/ui/Icon';
import {Card, Eyebrow, StatusPill} from '../../components/ui/primitives';
import {HOMEOWNER_TABS, TabBar} from '../../components/ui/widgets';

export const MILESTONES = ['Foundation', 'Plinth', 'Structure', 'Brickwork', 'Finishes', 'Handover'];
/** Index of the stage under way. */
export const NOW_STAGE = 2;

export const WEEKLY_LETTER =
  'This week the team finished the first-floor walls and started shuttering for the second-floor slab. The pour is planned for Thursday. Nothing needs you.';

/** The milestone strip: done stages fill in, the current one rings. */
export function MilestoneStrip({fill, compact}: {fill: number; compact?: boolean}) {
  const t = useTheme();
  const n = MILESTONES.length;
  const size = compact ? 22 : 26;
  return (
    <div style={{position: 'relative', padding: '4px 0 0'}}>
      <div style={{position: 'absolute', left: size / 2, right: size / 2, top: 4 + size / 2 - 1.5, height: 3, background: t.line, borderRadius: 2}} />
      <div
        style={{
          position: 'absolute',
          left: size / 2,
          top: 4 + size / 2 - 1.5,
          height: 3,
          width: `calc((100% - ${size}px) * ${clamp01(fill) * (NOW_STAGE / (n - 1))})`,
          background: t.brandStrong,
          borderRadius: 2,
        }}
      />
      <div style={{display: 'flex', justifyContent: 'space-between', position: 'relative'}}>
        {MILESTONES.map((m, i) => {
          const reached = clamp01(fill * NOW_STAGE - i + 1);
          const done = i < NOW_STAGE && reached > 0.5;
          const now = i === NOW_STAGE && fill >= 0.99;
          return (
            <div key={m} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: size}}>
              <span
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  background: done ? t.brandStrong : t.surfaceRaised,
                  border: now ? `3px solid ${t.clay}` : done ? 'none' : `2px solid ${t.lineControl}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  boxShadow: now ? `0 0 0 5px ${t.claySoft}` : 'none',
                }}
              >
                {done ? <Icon name="check" size={size * 0.6} /> : now ? <span style={{width: 8, height: 8, borderRadius: 4, background: t.clay}} /> : null}
              </span>
              <span
                style={{
                  fontFamily: FONT.text,
                  fontSize: compact ? 11 : 12,
                  fontWeight: now ? 600 : 400,
                  color: now ? t.clayText : t.inkMuted,
                  whiteSpace: 'nowrap',
                }}
              >
                {now ? 'Now' : m.length > 8 ? `${m.slice(0, 7)}…` : m}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListenBar({playing, frame}: {playing: number; frame: number}) {
  const t = useTheme();
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 10, marginTop: 14}}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '8px 14px',
          borderRadius: 999,
          background: playing > 0.5 ? t.brand : t.brandSoft,
          color: playing > 0.5 ? t.onBrand : t.brandStrong,
          fontFamily: FONT.text,
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        <Icon name={playing > 0.5 ? 'pause' : 'volume-2'} size={16} />
        {playing > 0.5 ? 'Playing' : 'Listen'}
      </span>
      <div style={{display: 'flex', alignItems: 'center', gap: 2.5, height: 28, flex: 1, opacity: 0.35 + 0.65 * playing}}>
        {Array.from({length: 34}, (_, i) => {
          const v = Math.abs(Math.sin(i * 0.9 + frame * 0.22 * playing) * Math.sin(i * 0.37 + 1.3));
          return <span key={i} style={{width: 3, height: 5 + 20 * v * (0.3 + 0.7 * playing), borderRadius: 2, background: t.brandStrong}} />;
        })}
      </div>
      <span style={{fontFamily: FONT.data, fontSize: 13, color: t.inkMuted}}>1:12</span>
    </div>
  );
}

export function UpdatesScreen({stripAt, letterAt, listenAt}: {stripAt: number; letterAt: number; listenAt?: number}) {
  const frame = useCurrentFrame();
  const t = useTheme();
  const fill = prog(frame, stripAt, 36, EASE);
  const letter = prog(frame, letterAt, 18, SETTLE);
  const playing = listenAt === undefined ? 0 : prog(frame, listenAt, 6, EASE);
  return (
    <div style={{position: 'absolute', inset: 0, background: t.surface}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, padding: '62px 16px 0'}}>
        <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 34, lineHeight: '42px', color: t.ink, padding: '0 4px'}}>Updates</div>
        <div style={{fontFamily: FONT.text, fontSize: 15.5, color: t.inkMuted, padding: '0 4px', lineHeight: '22px'}}>
          Your build, explained: milestones, money, and what changed.
        </div>
        <Card style={{marginTop: 16, padding: '16px 16px 18px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <Eyebrow>Milestones</Eyebrow>
            <StatusPill tone="ok" label="On track" size="sm" />
          </div>
          <div style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 16.5, color: t.ink, margin: '6px 0 14px'}}>Target handover · Feb 2027</div>
          <MilestoneStrip fill={fill} />
          <div
            style={{
              marginTop: 16,
              borderRadius: 12,
              background: t.surfaceSunken,
              padding: '10px 12px',
              fontFamily: FONT.text,
              fontSize: 15,
              color: t.ink,
              opacity: prog(frame, stripAt + 30, 12, EASE),
            }}
          >
            <b>Now:</b> Structure & slabs · second-floor slab pour on Thursday
          </div>
        </Card>
        <div style={{opacity: Math.min(1, letter * 1.5), transform: `translateY(${(1 - letter) * 50}px)`}}>
          <Card accent={t.clay} style={{marginTop: 14, padding: '14px 16px 16px'}}>
            <Eyebrow>This week’s letter</Eyebrow>
            <div style={{fontFamily: FONT.text, fontSize: 16, lineHeight: '24px', color: t.ink, marginTop: 6}}>{WEEKLY_LETTER}</div>
            <ListenBar playing={playing} frame={frame} />
          </Card>
        </div>
      </div>
      <TabBar tabs={HOMEOWNER_TABS} active={2} />
    </div>
  );
}
