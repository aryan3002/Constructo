/**
 * Homeowner · Household: "Who else should stay in the loop?" — invite a
 * family member (here, Maa as Family: can view, comment and flag concerns).
 */
import {useCurrentFrame} from 'remotion';

import {FONT} from '../../brand/fonts';
import {EASE, prog, SETTLE} from '../../brand/motion';
import {useTheme} from '../../brand/theme';
import {Icon, type IconName} from '../../components/ui/Icon';
import {Button} from '../../components/ui/primitives';
import {Toast} from '../../components/ui/widgets';

function Field({label, value}: {label?: string; value: string}) {
  const t = useTheme();
  return (
    <div style={{marginTop: 10}}>
      {label ? <div style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 13.5, color: t.inkMuted, marginBottom: 6}}>{label}</div> : null}
      <div style={{height: 50, borderRadius: 12, border: `1.5px solid ${t.line}`, background: t.surfaceRaised, padding: '0 14px', display: 'flex', alignItems: 'center', fontFamily: FONT.text, fontSize: 16.5, color: t.ink}}>
        {value}
      </div>
    </div>
  );
}

export function HouseholdSheet({sendAt}: {sendAt: number}) {
  const frame = useCurrentFrame();
  const t = useTheme();
  const press = prog(frame, sendAt, 4, EASE) * (1 - prog(frame, sendAt + 6, 6, EASE));
  const toast = prog(frame, sendAt + 8, 12, SETTLE);
  const roles: Array<[IconName, string]> = [
    ['home', 'Co-owner'],
    ['users', 'Family'],
    ['edit-3', 'Advisor'],
  ];
  return (
    <div style={{position: 'absolute', inset: 0, background: t.surface, padding: '60px 18px 0'}}>
      <div style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 13, letterSpacing: 1, color: t.clayText, textTransform: 'uppercase'}}>Your household</div>
      <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 30, lineHeight: '38px', color: t.ink, marginTop: 4}}>Who else should stay in the loop?</div>
      <div style={{fontFamily: FONT.text, fontSize: 15, lineHeight: '21px', color: t.inkMuted, marginTop: 6}}>
        Everyone you add can follow along. Only co-owners can approve costs.
      </div>
      <div style={{marginTop: 14, borderRadius: 16, border: `1px solid ${t.line}`, background: t.surfaceRaised, padding: '14px 14px 16px', boxShadow: t.shadowCard}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT.text, fontWeight: 600, fontSize: 16, color: t.ink}}>
          <Icon name="user-plus" size={18} color={t.brand} />
          Add a member
        </div>
        <Field value="Maa (Sunita Verma)" />
        <Field value="+91 ••••• ••410" />
        <div style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 13.5, color: t.inkMuted, margin: '12px 0 8px'}}>Role</div>
        <div style={{display: 'flex', gap: 8}}>
          {roles.map(([icon, r]) => {
            const on = r === 'Family';
            return (
              <span
                key={r}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  borderRadius: 999,
                  background: on ? t.brandSoft : t.surfaceRaised,
                  border: `1.5px solid ${on ? t.brand : t.line}`,
                  color: on ? t.brandStrong : t.ink,
                  fontFamily: FONT.text,
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                <Icon name={icon} size={14} />
                {r}
              </span>
            );
          })}
        </div>
        <div style={{fontFamily: FONT.text, fontStyle: 'italic', fontSize: 13.5, color: t.inkMuted, marginTop: 8}}>Can view, comment, and flag concerns</div>
        <div style={{marginTop: 14}}>
          <Button label="Send invite" icon="send" pressed={press} />
        </div>
      </div>
      <div style={{position: 'absolute', left: 16, right: 16, bottom: 40, opacity: toast, transform: `translateY(${(1 - toast) * 30}px)`}}>
        <Toast tone="ok" text="Invite sent to Maa." />
      </div>
    </div>
  );
}
