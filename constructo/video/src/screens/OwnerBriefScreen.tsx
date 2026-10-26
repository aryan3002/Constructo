/**
 * Builder: the owner's brief leads with the one exception that matters — a
 * cement invoice that bills more than the site logged — opens the proof, and
 * holds the payment. Neev records the hold; it never moves money.
 */
import {useCurrentFrame} from 'remotion';

import {FONT} from '../brand/fonts';
import {EASE, prog, SETTLE} from '../brand/motion';
import {useTheme} from '../brand/theme';
import {DecisionCard} from '../components/ui/cards';
import {Icon} from '../components/ui/Icon';
import {Card, Eyebrow, StatusPill} from '../components/ui/primitives';
import {Toast} from '../components/ui/widgets';

export type OwnerBriefMarks = {
  /** The evidence chips are tapped. */
  evidenceAt: number;
  /** The comparison opens. */
  compareAt: number;
  /** "Hold payment" is pressed. */
  holdAt: number;
};

export const INVOICE = {
  vendor: 'Shree Balaji Traders',
  amount: 72000,
  billed: 120,
  logged: 100,
  perBag: 600,
};

export function OwnerBriefScreen({marks, scroll = 0}: {marks: OwnerBriefMarks; scroll?: number}) {
  const frame = useCurrentFrame();
  const t = useTheme();
  const {evidenceAt, compareAt, holdAt} = marks;
  const highlight = prog(frame, evidenceAt, 6, EASE) * (1 - prog(frame, compareAt + 6, 8, EASE));
  const compare = prog(frame, compareAt, 18, SETTLE);
  const press = prog(frame, holdAt, 4, EASE) * (1 - prog(frame, holdAt + 6, 6, EASE));
  const held = prog(frame, holdAt + 6, 10, EASE);
  const toast = prog(frame, holdAt + 10, 14, SETTLE);
  const diff = INVOICE.billed - INVOICE.logged;

  return (
    <div style={{position: 'absolute', inset: 0, background: t.surface}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, padding: '62px 18px 0', transform: `translateY(${-scroll}px)`}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: t.ink,
              color: t.surface,
              borderRadius: 999,
              padding: '8px 14px',
              fontFamily: FONT.text,
              fontWeight: 600,
              fontSize: 14.5,
            }}
          >
            <Icon name="layers" size={15} />
            All sites
          </span>
          <span style={{width: 40, height: 40, borderRadius: 20, background: t.brandSoft, color: t.brandStrong, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.text, fontWeight: 600, fontSize: 15}}>
            AV
          </span>
        </div>
        <Eyebrow style={{marginTop: 18}}>Today for owners · 11:40 am</Eyebrow>
        <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 31, lineHeight: '40px', color: t.ink, marginTop: 4}}>
          2 decisions need your call.
        </div>
        <div style={{marginTop: 16}}>
          <DecisionCard
            kind="Payment check"
            kindIcon="file-text"
            flag="Doesn't match"
            title={`Cement invoice · ${INVOICE.vendor}`}
            amount={INVOICE.amount}
            meta="Verma Duplex · 2nd-floor slab"
            evidence={[
              {icon: 'file-text', label: 'Invoice'},
              {icon: 'mic', label: 'Site log · 6:52 am'},
              {icon: 'image', label: '1 photo'},
            ]}
            evidenceHighlight={highlight}
            compare={compare}
            compareRows={[
              {label: 'Billed', value: `${INVOICE.billed} bags`},
              {label: 'Logged on site', value: `${INVOICE.logged} bags`},
            ]}
            difference={{label: 'Difference', value: `${diff} bags · ₹${(diff * INVOICE.perBag).toLocaleString('en-IN')}`}}
            holdPressed={press}
            held={held}
          />
        </div>
        <Card style={{marginTop: 14, padding: '16px 18px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <Eyebrow>Client question</Eyebrow>
            <StatusPill tone="info" label="Today" size="sm" />
          </div>
          <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 20, lineHeight: '27px', color: t.ink, marginTop: 8}}>
            Can we see the slab before the pour?
          </div>
          <div style={{fontFamily: FONT.text, fontSize: 15.5, color: t.inkMuted, marginTop: 2}}>Verma family · 2nd floor</div>
        </Card>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 40,
          opacity: toast,
          transform: `translateY(${(1 - toast) * 40}px)`,
          zIndex: 20,
        }}
      >
        <Toast tone="warn" text="Payment on hold. Logged with its proof." />
      </div>
    </div>
  );
}
