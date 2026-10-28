import {AbsoluteFill} from 'remotion';

import {day} from '../brand/tokens';
import {PhoneFrame} from '../components/ui/PhoneFrame';
import {AskScreen} from '../screens/homeowner/AskScreen';
import {HouseholdSheet} from '../screens/homeowner/HouseholdSheet';
import {PhotosScreen} from '../screens/homeowner/PhotosScreen';
import {SelectionScreen} from '../screens/homeowner/SelectionScreen';
import {UpdatesScreen} from '../screens/homeowner/UpdatesScreen';

/** The homeowner screens added for the intro film, side by side. */
export function HomeScreensTest() {
  const screens = [
    <PhotosScreen key="p" cardsAt={0} pinAt={30} />,
    <UpdatesScreen key="u" stripAt={0} letterAt={20} listenAt={60} />,
    <AskScreen key="a" marks={{q1At: 40, a1At: 70, q2At: 130, a2At: 165}} />,
    <SelectionScreen key="s" pickAt={30} approveAt={80} />,
    <HouseholdSheet key="h" sendAt={100} />,
  ];
  return (
    <AbsoluteFill style={{background: day.surfaceSunken, flexDirection: 'row', gap: 40, padding: 40}}>
      {screens.map((s, i) => (
        <div key={i} style={{width: 414, height: 870, position: 'relative'}}>
          <PhoneFrame time="7:30">{s}</PhoneFrame>
        </div>
      ))}
    </AbsoluteFill>
  );
}
