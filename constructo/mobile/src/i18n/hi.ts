import type { Dict } from './en'

/** Hindi (Devanagari) strings. Mirrors `en` exactly. */
export const hi: Dict = {
  common: {
    loading: 'लोड हो रहा है…',
    retry: 'फिर से कोशिश करें',
    somethingWrong: 'कुछ गड़बड़ हो गई',
    offline: 'ऑफ़लाइन',
    online: 'ऑनलाइन',
    syncing: 'सिंक हो रहा है…',
    synced: 'सभी बदलाव सेव हो गए',
    pendingChanges: '{count} बदलाव सिंक के लिए बाकी',
  },
  auth: {
    welcome: 'Constructo में आपका स्वागत है',
    phoneLabel: 'फ़ोन नंबर',
    phonePlaceholder: '+91 ',
    sendCode: 'कोड भेजें',
    otpLabel: '6 अंकों का कोड डालें',
    devOtpHint: 'डेव कोड: 000000',
    verify: 'सत्यापित करें और आगे बढ़ें',
    joinTitle: 'अपने घर से जुड़ें',
    joinSubtitle: 'आपके बिल्डर ने जो कोड साझा किया है उसे डालें।',
    joinCodeLabel: 'जॉइन कोड',
    joinCta: 'जुड़ें',
    haveJoinCode: 'मेरे पास जॉइन कोड है',
    staffLogin: 'बिल्डर / स्टाफ़ लॉगिन',
    signOut: 'साइन आउट',
  },
  nav: {
    home: 'होम',
    photos: 'तस्वीरें',
    updates: 'अपडेट',
    design: 'डिज़ाइन',
    settings: 'सेटिंग्स',
  },
  contractor: {
    comingSoonTitle: 'बिल्डर ऐप जल्द आ रहा है',
    comingSoonBody:
      'फ़िलहाल, अपनी साइट्स Constructo वेब डैशबोर्ड पर मैनेज करें। पूरा बिल्डर अनुभव जल्द ही मोबाइल पर आएगा।',
  },
  settings: {
    title: 'सेटिंग्स',
    language: 'भाषा',
    english: 'English',
    hindi: 'हिन्दी',
  },
  gallery: {
    title: 'कॉम्पोनेंट गैलरी',
    subtitle: 'दोनों थीम में Constructo किट।',
  },
}
