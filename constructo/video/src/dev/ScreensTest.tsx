import {AbsoluteFill, Sequence} from 'remotion';

import {day} from '../brand/tokens';
import {PhoneFrame} from '../components/ui/PhoneFrame';
import {HomeownerHomeScreen} from '../screens/HomeownerHomeScreen';
import {OwnerBriefScreen} from '../screens/OwnerBriefScreen';
import {SiteCaptureScreen} from '../screens/SiteCaptureScreen';

/** Three phones side by side; scrub to check each screen's choreography. */
export function ScreensTest() {
  return (
    <AbsoluteFill style={{background: day.surfaceSunken, flexDirection: 'row', gap: 60, padding: 60, alignItems: 'flex-start'}}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{width: 414 * 1.1, height: 870 * 1.1, position: 'relative'}}>
          <PhoneFrame scale={1.1} time={['6:52', '11:40', '7:30'][i]}>
            <Sequence layout="none">
              {i === 0 ? <SiteCaptureScreen marks={{pressAt: 20, releaseAt: 90, entryAt: 150}} /> : null}
              {i === 1 ? <OwnerBriefScreen marks={{evidenceAt: 40, compareAt: 60, holdAt: 130}} /> : null}
              {i === 2 ? <HomeownerHomeScreen marks={{heroAt: 10, toggleAt: 150}} /> : null}
            </Sequence>
          </PhoneFrame>
        </div>
      ))}
    </AbsoluteFill>
  );
}
