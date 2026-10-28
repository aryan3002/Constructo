/**
 * Homeowner · Photos: every site photo, dated, placed and tagged, shared by the
 * builder. Cards rise in one after another; one gets pinned.
 */
import {useCurrentFrame} from 'remotion';

import {FONT} from '../../brand/fonts';
import {EASE, prog, SETTLE} from '../../brand/motion';
import {useTheme} from '../../brand/theme';
import {Icon, type IconName} from '../../components/ui/Icon';
import {Card} from '../../components/ui/primitives';
import {SiteIllustration, type SiteScene} from '../../components/ui/SiteIllustration';
import {HOMEOWNER_TABS, TabBar} from '../../components/ui/widgets';

type Photo = {scene: SiteScene; place: string; when: string; tag: string; caption: string};

export const TODAY_PHOTOS: Photo[] = [
  {scene: 'shuttering', place: '2nd floor', when: 'Today · 6:52 am', tag: 'Structure & slabs', caption: 'Shuttering started for the second-floor slab.'},
  {scene: 'cement', place: 'Store', when: 'Today · 9:21 am', tag: 'Materials', caption: '100 bags of cement received and counted.'},
  {scene: 'brickwork', place: '1st floor', when: 'Yesterday', tag: 'Walls', caption: 'First-floor walls complete.'},
];

function Chip({label, active, icon}: {label: string; active?: boolean; icon?: IconName}) {
  const t = useTheme();
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 13px',
        borderRadius: 999,
        background: active ? t.ink : t.surfaceRaised,
        color: active ? t.surface : t.ink,
        border: active ? 'none' : `1.5px solid ${t.line}`,
        fontFamily: FONT.text,
        fontWeight: 600,
        fontSize: 14,
        whiteSpace: 'nowrap',
      }}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {label}
    </span>
  );
}

function Overlay({children, side}: {children: React.ReactNode; side: 'left' | 'right'}) {
  return (
    <span
      style={{
        position: 'absolute',
        bottom: 10,
        [side]: 10,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        borderRadius: 999,
        background: 'rgba(42,37,25,0.62)',
        color: '#fcfaf3',
        fontFamily: FONT.text,
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      {children}
    </span>
  );
}

export function PhotoCard({photo, pinned = 0}: {photo: Photo; pinned?: number}) {
  const t = useTheme();
  return (
    <Card style={{padding: 0}}>
      <div style={{position: 'relative', height: 196}}>
        <SiteIllustration scene={photo.scene} />
        <Overlay side="left">
          <Icon name="map-pin" size={13} />
          {photo.place}
        </Overlay>
        <Overlay side="right">{photo.when}</Overlay>
        <span
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 34,
            height: 34,
            borderRadius: 17,
            background: pinned > 0.5 ? t.marigold : 'rgba(42,37,25,0.55)',
            color: pinned > 0.5 ? t.onMarigold : '#fcfaf3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${1 + 0.25 * Math.sin(Math.PI * pinned)})`,
          }}
        >
          <Icon name="bookmark" size={16} />
        </span>
      </div>
      <div style={{padding: '12px 16px 6px', borderLeft: `4px solid ${t.clay}`, margin: '12px 0 0 14px'}}>
        <span style={{display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: t.claySoft, color: t.clayText, fontFamily: FONT.text, fontWeight: 600, fontSize: 13}}>
          {photo.tag}
        </span>
        <div style={{fontFamily: FONT.text, fontSize: 16.5, color: t.ink, marginTop: 6, lineHeight: '23px'}}>{photo.caption}</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontFamily: FONT.text, fontSize: 13.5, color: t.inkMuted}}>
          <Icon name="check-circle" size={14} color={t.brand} />
          Shared by your builder
        </div>
      </div>
      <div style={{display: 'flex', justifyContent: 'space-around', padding: '10px 6px 12px', marginTop: 8, borderTop: `1px solid ${t.line}`, color: t.brandStrong}}>
        {([
          ['bookmark', 'Pin'],
          ['edit-2', 'Mark up'],
          ['message-circle', 'Comment'],
          ['share-2', 'Share'],
        ] as const).map(([icon, label]) => (
          <span key={label} style={{display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT.text, fontWeight: 600, fontSize: 14}}>
            <Icon name={icon} size={15} />
            {label}
          </span>
        ))}
      </div>
    </Card>
  );
}

export function PhotosScreen({cardsAt, pinAt, scroll = 0}: {cardsAt: number; pinAt?: number; scroll?: number}) {
  const frame = useCurrentFrame();
  const t = useTheme();
  return (
    <div style={{position: 'absolute', inset: 0, background: t.surface}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, padding: '62px 16px 0', transform: `translateY(${-scroll}px)`}}>
        <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 34, lineHeight: '42px', color: t.ink, padding: '0 4px'}}>Photos</div>
        <div style={{fontFamily: FONT.text, fontSize: 15.5, color: t.inkMuted, padding: '0 4px'}}>Every photo from site, dated and placed</div>
        <div style={{display: 'flex', gap: 8, marginTop: 14, overflow: 'hidden'}}>
          <Chip label="All" active />
          <Chip label="Structure & slabs" />
          <Chip label="This week" icon="calendar" />
        </div>
        <div style={{display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16}}>
          {TODAY_PHOTOS.map((p, i) => {
            const k = prog(frame, cardsAt + i * 9, 18, SETTLE);
            return (
              <div key={p.caption} style={{opacity: Math.min(1, k * 1.5), transform: `translateY(${(1 - k) * 60}px)`}}>
                <PhotoCard photo={p} pinned={i === 0 && pinAt !== undefined ? prog(frame, pinAt, 10, EASE) : 0} />
              </div>
            );
          })}
        </div>
      </div>
      <TabBar tabs={HOMEOWNER_TABS} active={1} />
    </div>
  );
}
