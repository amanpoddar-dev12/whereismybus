import { CityPreset, CityPresetId, VoiceLangCode } from '../types/transit';

export const CITY_PRESETS: Record<CityPresetId, CityPreset> = {
  live_gps: {
    id: 'live_gps',
    name: 'My Live GPS',
    localName: 'Live Location',
    stateName: 'India',
    primaryOperator: 'Local RTC / GTFS',
    center: [12.9775, 77.5714],
    defaultZoom: 14,
    womenSchemeTitle: 'State Women Concession',
    womenFreeDefault: true,
    emergencyHelpline: '112',
    rtcHelpline: '1800-425-1663',
  },
  bengaluru: {
    id: 'bengaluru',
    name: 'Bengaluru',
    localName: 'ಬೆಂಗಳೂರು',
    stateName: 'Karnataka',
    primaryOperator: 'BMTC',
    center: [12.9775, 77.5714], // Kempegowda Bus Station (Majestic)
    defaultZoom: 14,
    womenSchemeTitle: 'Shakti Free Women Travel',
    womenFreeDefault: true,
    emergencyHelpline: '112',
    rtcHelpline: '1800-425-1663',
  },
  hyderabad: {
    id: 'hyderabad',
    name: 'Hyderabad',
    localName: 'హైదరాబాద్',
    stateName: 'Telangana',
    primaryOperator: 'TGSRTC',
    center: [17.4399, 78.4983], // Secunderabad Rathifile Bus Station
    defaultZoom: 14,
    womenSchemeTitle: 'Mahalakshmi Zero-Ticket',
    womenFreeDefault: true,
    emergencyHelpline: '112',
    rtcHelpline: '040-69440000',
  },
  chennai: {
    id: 'chennai',
    name: 'Chennai',
    localName: 'சென்னை',
    stateName: 'Tamil Nadu',
    primaryOperator: 'MTC / TNSTC',
    center: [13.0694, 80.2056], // CMBT Koyambedu / Chennai Central
    defaultZoom: 14,
    womenSchemeTitle: 'Vidiyal Payanam Women Free',
    womenFreeDefault: true,
    emergencyHelpline: '112',
    rtcHelpline: '94450-30516',
  },
  kochi: {
    id: 'kochi',
    name: 'Kochi',
    localName: 'കൊച്ചി',
    stateName: 'Kerala',
    primaryOperator: 'KSRTC / KMRL',
    center: [9.9698, 76.3182], // Vyttila Mobility Hub / Ernakulam
    defaultZoom: 14,
    womenSchemeTitle: 'KSRTC City Circular',
    womenFreeDefault: false,
    emergencyHelpline: '112',
    rtcHelpline: '0471-2463799',
  },
  mysuru: {
    id: 'mysuru',
    name: 'Mysuru',
    localName: 'ಮೈಸೂರು',
    stateName: 'Karnataka',
    primaryOperator: 'KSRTC',
    center: [12.3106, 76.6553], // Mysuru Suburban Bus Stand
    defaultZoom: 14,
    womenSchemeTitle: 'Shakti Free Women Travel',
    womenFreeDefault: true,
    emergencyHelpline: '112',
    rtcHelpline: '080-26252625',
  },
  vijayawada: {
    id: 'vijayawada',
    name: 'Vijayawada',
    localName: 'విజయవాడ',
    stateName: 'Andhra Pradesh',
    primaryOperator: 'APSRTC',
    center: [16.5093, 80.6175], // Pandit Nehru Bus Station (PNBS)
    defaultZoom: 14,
    womenSchemeTitle: 'Stree Shakti Concession',
    womenFreeDefault: true,
    emergencyHelpline: '112',
    rtcHelpline: '0866-2570005',
  },
  delhi: {
    id: 'delhi',
    name: 'New Delhi',
    localName: 'नई दिल्ली',
    stateName: 'Delhi NCR',
    primaryOperator: 'DTC / Transit',
    center: [28.6315, 77.2167], // Shivaji Stadium / Connaught Place
    defaultZoom: 14,
    womenSchemeTitle: 'Pink Ticket Free Travel',
    womenFreeDefault: true,
    emergencyHelpline: '112',
    rtcHelpline: '1800-11-8181',
  },
  mumbai: {
    id: 'mumbai',
    name: 'Mumbai',
    localName: 'मुंबई',
    stateName: 'Maharashtra',
    primaryOperator: 'BEST / Transit',
    center: [19.1197, 72.8464], // Andheri Station / Agarkar Chowk
    defaultZoom: 14,
    womenSchemeTitle: 'Mahila Samman 50% / Tejaswini',
    womenFreeDefault: false,
    emergencyHelpline: '112',
    rtcHelpline: '1800-22-7550',
  },
};

export interface VoiceLanguageConfig {
  code: VoiceLangCode;
  speechLocale: string;
  label: string;
  nativeLabel: string;
  promptHint: string;
  listeningLabel: string;
}

export const VOICE_LANGUAGES: VoiceLanguageConfig[] = [
  {
    code: 'en',
    speechLocale: 'en-IN',
    label: 'English',
    nativeLabel: 'English (IN)',
    promptHint: 'Speak any bus stop, station, or route name…',
    listeningLabel: 'Listening (en-IN)…',
  },
  {
    code: 'hi',
    speechLocale: 'hi-IN',
    label: 'Hindi',
    nativeLabel: 'हिन्दी',
    promptHint: 'बस स्टॉप या गंतव्य का नाम बोलें…',
    listeningLabel: 'सुन रहा हूँ (hi-IN)…',
  },
  {
    code: 'kn',
    speechLocale: 'kn-IN',
    label: 'Kannada',
    nativeLabel: 'ಕನ್ನಡ',
    promptHint: 'ಬಸ್ ನಿಲ್ದಾಣ ಅಥವಾ ಮಾರ್ಗದ ಹೆಸರನ್ನು ಹೇಳಿ…',
    listeningLabel: 'ಆಲಿಸಲಾಗುತ್ತಿದೆ (kn-IN)…',
  },
  {
    code: 'te',
    speechLocale: 'te-IN',
    label: 'Telugu',
    nativeLabel: 'తెలుగు',
    promptHint: 'బస్ స్టాప్ లేదా గమ్యస్థానం పేరు చెప్పండి…',
    listeningLabel: 'వింటున్నాను (te-IN)…',
  },
];
