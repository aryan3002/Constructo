/**
 * Family: the homeowner's Home after a day on site. "You're okay." is derived
 * from the record (nothing needs them; the owner's invoice check stays
 * internal), shown with the day's update and its proof, then switched to Hindi.
 */
import {useCurrentFrame} from 'remotion';

import {FONT} from '../brand/fonts';
import {EASE, prog, SETTLE} from '../brand/motion';
import {useTheme} from '../brand/theme';
import {HOME_HERO_EN, HOME_HERO_HI, HomeHero, Swap} from '../components/ui/cards';
import {Card, EvidenceChip, Eyebrow} from '../components/ui/primitives';
import {SiteIllustration} from '../components/ui/SiteIllustration';
import {HOMEOWNER_TABS, HOMEOWNER_TABS_HI, LanguageToggle, TabBar} from '../components/ui/widgets';

export type HomeownerMarks = {
  /** The hero card fills in (TimeBar grows to "Now"). */
  heroAt: number;
  /** The toggle is tapped: English → Hindi. Omit to stay in English. */
  toggleAt?: number;
};

const COPY = {
  en: {
    greeting: 'Good evening',
    place: 'Verma Duplex · 2nd floor',
    today: 'Today on site',
    update: 'Shuttering has started for the second-floor slab. The pour is planned for Thursday.',
    proof: 'From the site log · 6:52 am',
  },
  hi: {
    greeting: 'शुभ संध्या',
    place: 'वर्मा डुप्लेक्स · दूसरी मंज़िल',
    today: 'आज साइट पर',
    update: 'दूसरी मंज़िल के स्लैब की शटरिंग शुरू हो गई है। ढलाई गुरुवार को होगी।',
    proof: 'साइट लॉग से · सुबह 6:52',
  },
};

export function HomeownerHomeScreen({marks}: {marks: HomeownerMarks}) {
  const frame = useCurrentFrame();
  const t = useTheme();
  const hero = prog(frame, marks.heroAt, 30, SETTLE);
  const lang = marks.toggleAt === undefined ? 0 : prog(frame, marks.toggleAt, 12, EASE);
  const swap = marks.toggleAt === undefined ? 0 : prog(frame, marks.toggleAt + 2, 14, EASE);
  const tabs = swap >= 0.5 ? HOMEOWNER_TABS_HI : HOMEOWNER_TABS;

  return (
    <div style={{position: 'absolute', inset: 0, background: t.surface}}>
      <div style={{position: 'absolute', inset: 0, padding: '60px 18px 0'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <span style={{width: 46, height: 46, borderRadius: 12, background: t.surfaceSunken, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <svg width={30} height={30} viewBox="0 0 100 100">
              <path d="M26 78 L74 78" stroke={t.brand} strokeWidth={8} strokeLinecap="round" />
              <path d="M29 67 L50 45 L71 67" stroke={t.brand} strokeWidth={8.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <circle cx={50} cy={28} r={5.7} fill={t.clay} />
            </svg>
          </span>
          <LanguageToggle position={lang} />
        </div>
        <Swap
          t={swap}
          a={
            <div style={{marginTop: 14}}>
              <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 30, lineHeight: '38px', color: t.ink}}>{COPY.en.greeting}</div>
              <div style={{fontFamily: FONT.text, fontSize: 16, color: t.inkMuted}}>{COPY.en.place}</div>
            </div>
          }
          b={
            <div style={{marginTop: 14}}>
              <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 30, lineHeight: '38px', color: t.ink}}>{COPY.hi.greeting}</div>
              <div style={{fontFamily: FONT.text, fontSize: 16, color: t.inkMuted}}>{COPY.hi.place}</div>
            </div>
          }
        />
        <div style={{marginTop: 16, opacity: Math.min(1, hero * 2), transform: `translateY(${(1 - hero) * 24}px)`}}>
          <Swap
            t={swap}
            a={<HomeHero copy={HOME_HERO_EN} progress={0.62} reveal={hero} />}
            b={<HomeHero copy={HOME_HERO_HI} progress={0.62} reveal={hero} />}
          />
        </div>
        <Card style={{marginTop: 14, padding: '16px 18px 16px'}}>
          <Swap t={swap} a={<Eyebrow>{COPY.en.today}</Eyebrow>} b={<Eyebrow>{COPY.hi.today}</Eyebrow>} />
          <div style={{fontFamily: FONT.text, fontSize: 16.5, lineHeight: '25px', color: t.ink, marginTop: 6, minHeight: 50}}>
            <Swap t={swap} a={COPY.en.update} b={COPY.hi.update} />
          </div>
          <div style={{display: 'flex', gap: 10, marginTop: 12}}>
            {(['shuttering', 'cement'] as const).map((scene) => (
              <div key={scene} style={{flex: 1, height: 96, borderRadius: 12, overflow: 'hidden'}}>
                <SiteIllustration scene={scene} />
              </div>
            ))}
          </div>
          <div style={{marginTop: 12}}>
            <Swap
              t={swap}
              a={<EvidenceChip icon="mic" label={COPY.en.proof} />}
              b={<EvidenceChip icon="mic" label={COPY.hi.proof} />}
            />
          </div>
        </Card>
      </div>
      <TabBar tabs={tabs} active={0} />
    </div>
  );
}
