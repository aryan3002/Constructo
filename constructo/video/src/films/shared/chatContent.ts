/**
 * What a build sounds like today, as people actually type it: Hinglish in
 * Latin script, voice notes, photos, missed calls. Content, not interface —
 * Neev's own screens stay in one language.
 */
import type {SiteScene} from '../../components/ui/SiteIllustration';

export type ChatItem =
  | {type: 'text'; side: 'in' | 'out'; text: string; time: string; sender?: number}
  | {type: 'voice'; side: 'in' | 'out'; duration: string; time: string; sender?: number}
  | {type: 'photo'; side: 'in' | 'out'; scene: SiteScene; time: string; sender?: number}
  | {type: 'missed'; label: string; time: string};

export const SENDERS = ['Ramesh · Site', 'Mukesh · Mukadam', 'Balaji Traders', 'Architect', 'Verma ji'];

export const CHAT_ITEMS: ChatItem[] = [
  {type: 'text', side: 'in', sender: 0, text: 'Sir material aa gaya', time: '9:12 am'},
  {type: 'text', side: 'out', text: 'Kitne bag?', time: '9:14 am'},
  {type: 'voice', side: 'in', sender: 1, duration: '0:43', time: '9:20 am'},
  {type: 'photo', side: 'in', sender: 0, scene: 'cement', time: '9:21 am'},
  {type: 'text', side: 'in', sender: 2, text: 'Bill bhej diya hai sir. 120 bag cement', time: '11:02 am'},
  {type: 'missed', label: 'Missed voice call', time: '11:15 am'},
  {type: 'text', side: 'out', text: 'Payment kab tak chahiye?', time: '11:31 am'},
  {type: 'text', side: 'in', sender: 1, text: 'Kal tak ho jayega sir', time: '12:05 pm'},
  {type: 'text', side: 'in', sender: 4, text: 'Photo bhejo please', time: '12:40 pm'},
  {type: 'text', side: 'in', sender: 1, text: 'Aaj labour kam aaya', time: '1:10 pm'},
  {type: 'voice', side: 'in', sender: 0, duration: '1:12', time: '1:24 pm'},
  {type: 'photo', side: 'in', sender: 0, scene: 'shuttering', time: '2:02 pm'},
  {type: 'text', side: 'in', sender: 3, text: 'Revised drawing bheja hai, check karo', time: '2:30 pm'},
  {type: 'text', side: 'out', text: 'ok', time: '2:31 pm'},
  {type: 'text', side: 'in', sender: 0, text: 'Sariya kab aayega?', time: '3:05 pm'},
  {type: 'missed', label: 'Missed voice call', time: '3:40 pm'},
  {type: 'text', side: 'in', sender: 1, text: 'Plumber nahi aaya aaj', time: '4:12 pm'},
  {type: 'photo', side: 'in', sender: 1, scene: 'brickwork', time: '4:50 pm'},
  {type: 'text', side: 'in', sender: 4, text: 'Kaam kab tak khatam hoga?', time: '6:15 pm'},
  {type: 'voice', side: 'out', duration: '0:27', time: '6:18 pm'},
  {type: 'text', side: 'in', sender: 0, text: 'Sab badhiya hai sir', time: '7:02 pm'},
  {type: 'text', side: 'in', sender: 2, text: 'Payment pending hai sir', time: '7:30 pm'},
  {type: 'photo', side: 'in', sender: 0, scene: 'rebar', time: '8:05 pm'},
  {type: 'text', side: 'out', text: 'Site pe kaun hai abhi?', time: '8:41 pm'},
  {type: 'missed', label: 'Missed voice call', time: '9:15 pm'},
  {type: 'text', side: 'in', sender: 1, text: 'Shuttering kal se shuru', time: '9:32 pm'},
  {type: 'text', side: 'in', sender: 3, text: 'Tile sample kab dikhaoge?', time: '9:50 pm'},
  {type: 'voice', side: 'in', sender: 4, duration: '0:58', time: '10:12 pm'},
];
