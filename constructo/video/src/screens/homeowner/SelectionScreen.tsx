/**
 * Homeowner · Design: a choice that is truly the family's, with what they need
 * to decide (both options checked against their style profile, the cost
 * difference, the lead time). They pick one and approve it.
 */
import {useCurrentFrame} from 'remotion';

import {FONT} from '../../brand/fonts';
import {EASE, prog, SETTLE} from '../../brand/motion';
import {useTheme} from '../../brand/theme';
import {Icon} from '../../components/ui/Icon';
import {Button, Card, EvidenceChip, Eyebrow, StatusPill} from '../../components/ui/primitives';
import {HOMEOWNER_TABS, TabBar, Toast} from '../../components/ui/widgets';

/** Glazed zellige squares in sage. */
export function ZelligeSwatch() {
  const cells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 7; c++) {
      const v = Math.sin(r * 3.1 + c * 1.7) * 0.5 + 0.5;
      const fill = ['#4f8a76', '#5c967f', '#46806c', '#6aa18a', '#3e7a66'][Math.floor(v * 4.99)];
      cells.push(<rect key={`${r}-${c}`} x={c * 22 + 1} y={r * 22 + 1} width={20} height={20} rx={2} fill={fill} />);
      cells.push(<rect key={`h${r}-${c}`} x={c * 22 + 3} y={r * 22 + 3} width={7} height={3} rx={1.5} fill="#ffffff" opacity={0.28} />);
    }
  }
  return (
    <svg viewBox="0 0 154 110" preserveAspectRatio="xMidYMid slice" style={{display: 'block', width: '100%', height: '100%'}}>
      <rect width={154} height={110} fill="#e9e3d6" />
      {cells}
    </svg>
  );
}

/** Terracotta hexagons. */
export function HexSwatch() {
  const hexes = [];
  const s = 13;
  const w = Math.sqrt(3) * s;
  for (let r = -1; r < 7; r++) {
    for (let c = -1; c < 8; c++) {
      const cx = c * w + (r % 2 ? w / 2 : 0);
      const cy = r * s * 1.5;
      const pts = Array.from({length: 6}, (_, i) => {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        return `${cx + (s - 1.2) * Math.cos(a)},${cy + (s - 1.2) * Math.sin(a)}`;
      }).join(' ');
      const v = Math.sin(r * 2.3 + c * 1.1) * 0.5 + 0.5;
      hexes.push(<polygon key={`${r}-${c}`} points={pts} fill={['#b4583a', '#c0663f', '#a24e33', '#c97650'][Math.floor(v * 3.99)]} />);
    }
  }
  return (
    <svg viewBox="0 0 154 110" preserveAspectRatio="xMidYMid slice" style={{display: 'block', width: '100%', height: '100%'}}>
      <rect width={154} height={110} fill="#e2d6c2" />
      {hexes}
    </svg>
  );
}

const OPTIONS = [
  {name: 'Sage zellige', price: '₹180 / sq ft', lead: 'Ready in 5 days', Swatch: ZelligeSwatch},
  {name: 'Terracotta hex', price: '₹240 / sq ft', lead: 'Ready in 12 days', Swatch: HexSwatch},
];

export function SelectionScreen({pickAt, approveAt}: {pickAt: number; approveAt: number}) {
  const frame = useCurrentFrame();
  const t = useTheme();
  const picked = prog(frame, pickAt, 8, EASE);
  const press = prog(frame, approveAt, 4, EASE) * (1 - prog(frame, approveAt + 6, 6, EASE));
  const approved = prog(frame, approveAt + 6, 10, EASE);
  const toast = prog(frame, approveAt + 10, 14, SETTLE);
  return (
    <div style={{position: 'absolute', inset: 0, background: t.surface}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, padding: '62px 16px 0'}}>
        <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 34, lineHeight: '42px', color: t.ink, padding: '0 4px'}}>Design</div>
        <div style={{display: 'flex', gap: 8, marginTop: 12}}>
          {['Profile', 'Plans', 'Selections'].map((s) => (
            <span
              key={s}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '9px 0',
                borderRadius: 999,
                background: s === 'Selections' ? t.brand : t.surfaceRaised,
                color: s === 'Selections' ? t.onBrand : t.ink,
                border: s === 'Selections' ? 'none' : `1.5px solid ${t.line}`,
                fontFamily: FONT.text,
                fontWeight: 600,
                fontSize: 15,
              }}
            >
              {s}
            </span>
          ))}
        </div>
        <Card style={{marginTop: 16, padding: '16px 16px 18px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8}}>
            <Eyebrow>Your choice · Kitchen</Eyebrow>
            <span style={{position: 'relative'}}>
              <span style={{opacity: 1 - approved, display: 'inline-block'}}>
                <StatusPill tone="warn" label="Needs you" size="sm" />
              </span>
              <span style={{position: 'absolute', right: 0, top: 0, opacity: approved}}>
                <StatusPill tone="ok" label="Approved" size="sm" />
              </span>
            </span>
          </div>
          <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 22, lineHeight: '29px', color: t.ink, marginTop: 6}}>Kitchen wall tiles</div>
          <div style={{fontFamily: FONT.text, fontSize: 15, lineHeight: '21px', color: t.inkMuted, marginTop: 2}}>
            Your designer shortlisted two. Both fit your style profile.
          </div>
          <div style={{display: 'flex', gap: 10, marginTop: 14}}>
            {OPTIONS.map((o, i) => {
              const on = i === 0 ? picked : 0;
              const off = i === 1 ? picked : 0;
              return (
                <div
                  key={o.name}
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    overflow: 'hidden',
                    border: `2px solid ${on > 0.5 ? t.brand : t.line}`,
                    boxShadow: on > 0.5 ? `0 0 0 3px ${t.brandSoft}` : 'none',
                    background: t.surfaceRaised,
                    opacity: 1 - 0.35 * off,
                    position: 'relative',
                  }}
                >
                  <div style={{height: 104}}>
                    <o.Swatch />
                  </div>
                  {on > 0.5 ? (
                    <span style={{position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, background: t.brand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.7 + 0.3 * on})`}}>
                      <Icon name="check" size={16} />
                    </span>
                  ) : null}
                  <div style={{padding: '9px 10px 10px'}}>
                    <div style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 15, color: t.ink}}>{o.name}</div>
                    <div style={{fontFamily: FONT.data, fontSize: 13.5, color: t.ink, marginTop: 2}}>{o.price}</div>
                    <div style={{fontFamily: FONT.text, fontSize: 13, color: t.inkMuted}}>{o.lead}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{fontFamily: FONT.text, fontSize: 14.5, color: t.inkMuted, marginTop: 12}}>
            Terracotta adds <span style={{fontFamily: FONT.data, color: t.ink}}>₹4,800</span> for the kitchen and a week of wait.
          </div>
          <div style={{display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap'}}>
            <EvidenceChip icon="heart" label="Matches your style profile" />
            <EvidenceChip icon="file-text" label="Spec sheet" />
          </div>
          <div style={{marginTop: 14}}>
            <Button label={approved > 0.5 ? 'Approved' : 'Approve Sage zellige'} icon={approved > 0.5 ? 'check' : undefined} pressed={press} />
          </div>
        </Card>
      </div>
      <div style={{position: 'absolute', left: 16, right: 16, bottom: 112, opacity: toast, transform: `translateY(${(1 - toast) * 30}px)`, zIndex: 20}}>
        <Toast tone="ok" text="Approved. Your builder has it, with the spec." />
      </div>
      <TabBar tabs={HOMEOWNER_TABS} active={4} />
    </div>
  );
}
