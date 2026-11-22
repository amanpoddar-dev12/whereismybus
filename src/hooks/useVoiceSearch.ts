import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VOICE_LANGUAGES } from '../config/transitConfig';
import { useTransit } from '../context/TransitContext';
import { searchRealTransitPlaces } from '../services/liveTransitApi';
import { VoiceLangCode } from '../types/transit';
import { buildHybridSearchSuggestions } from '../utils/stationSearchEngine';

interface BrowserSpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition;
}

/**
 * Encapsulates browser SpeechRecognition lifecycle, language selection,
 * and hybrid stop/route intent resolution for VoiceSearchModal.
 */
export function useVoiceSearch() {
  const {
    voiceModalOpen,
    setVoiceModalOpen,
    city,
    userGeo,
    activeStation,
    allAreaStops,
    routes,
    openLiveTracking,
    selectActiveStation,
    applyDestinationSuggestion,
    setDestinationQuery,
    setSearchFilterQuery,
    activeTab,
    setActiveTab,
    pushToast,
  } = useTransit();

  const [selectedLang, setSelectedLang] = useState<VoiceLangCode>('en');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [resolvingApi, setResolvingApi] = useState<boolean>(false);
  const recognitionRef = useRef<BrowserSpeechRecognitionInstance | null>(null);

  const langMeta = useMemo(
    () => VOICE_LANGUAGES.find((l) => l.code === selectedLang) ?? VOICE_LANGUAGES[0],
    [selectedLang]
  );

  const stopRecognition = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore stop errors if recognition has already ended.
    }
    setIsListening(false);
  }, []);

  const handleClose = useCallback(() => {
    stopRecognition();
    setVoiceModalOpen(false);
  }, [stopRecognition, setVoiceModalOpen]);

  const handleSpokenQuery = useCallback(
    async (spoken: string) => {
      const cleaned = spoken.trim();
      if (!cleaned) return;
      setTranscript(cleaned);
      setResolvingApi(true);
      try {
        const refLat = userGeo.lat ?? activeStation?.lat ?? city.center[0];
        const refLon = userGeo.lon ?? activeStation?.lon ?? city.center[1];

        const remoteMatches = await searchRealTransitPlaces(
          cleaned,
          refLat,
          refLon
        ).catch(() => []);

        const hybrid = buildHybridSearchSuggestions({
          query: cleaned,
          localStops: allAreaStops,
          routes,
          remoteResults: remoteMatches,
          refLat,
          refLon,
          includeRoutes: true,
          maxResults: 5,
        });

        if (hybrid.length > 0) {
          const best = hybrid[0];
          if (best.category === 'route' && best.routeId) {
            setVoiceModalOpen(false);
            openLiveTracking(best.routeId, 0);
            return;
          }
          applyDestinationSuggestion({
            id: best.stopId || best.id,
            name: best.name,
            subtitle: best.subtitle,
            lat: best.lat,
            lon: best.lon,
            isTransitStop: best.isTransitStop,
            stopId: best.stopId,
            stopCode: best.stopCode,
            category: best.category,
          });
          setSearchFilterQuery(best.name);
          pushToast({
            title: `Matched ${best.name}`,
            subtitle: best.subtitle,
            tone: 'emerald',
          });
        } else {
          setDestinationQuery(cleaned);
          setSearchFilterQuery(cleaned);
          pushToast({
            title: `Searching “${cleaned}”`,
            subtitle: 'Filtering active transit routes',
            tone: 'indigo',
          });
        }

        if (activeTab !== 'home' && activeTab !== 'search') {
          setActiveTab('home');
        }
        setVoiceModalOpen(false);
      } finally {
        setResolvingApi(false);
      }
    },
    [
      userGeo.lat,
      userGeo.lon,
      activeStation?.lat,
      activeStation?.lon,
      city.center,
      allAreaStops,
      routes,
      setVoiceModalOpen,
      openLiveTracking,
      applyDestinationSuggestion,
      setSearchFilterQuery,
      pushToast,
      setDestinationQuery,
      activeTab,
      setActiveTab,
    ]
  );

  const startLiveSpeechRecognition = useCallback(
    (locale: string) => {
      stopRecognition();
      const SpeechRecCtor = getSpeechRecognitionCtor();

      if (!SpeechRecCtor) {
        setStatusMsg(
          'Speech recognition is unavailable in this browser. Choose a nearby station below or type in search.'
        );
        setIsListening(false);
        return;
      }

      try {
        const rec = new SpeechRecCtor();
        rec.lang = locale;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onresult = (event) => {
          const text = event.results?.[0]?.[0]?.transcript ?? '';
          setTranscript(text);
        };

        rec.onerror = (ev) => {
          setIsListening(false);
          setStatusMsg(
            ev.error === 'not-allowed'
              ? 'Microphone permission blocked. Allow access or choose a station below.'
              : `Voice status: ${ev.error}`
          );
        };

        rec.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = rec;
        setTranscript('');
        setStatusMsg('');
        setIsListening(true);
        rec.start();
      } catch {
        setIsListening(false);
      }
    },
    [stopRecognition]
  );

  useEffect(() => {
    if (voiceModalOpen) {
      startLiveSpeechRecognition(langMeta.speechLocale);
    } else {
      stopRecognition();
    }
    return () => stopRecognition();
  }, [voiceModalOpen, langMeta.speechLocale, startLiveSpeechRecognition, stopRecognition]);

  const selectNearbyStation = useCallback(
    (station: (typeof allAreaStops)[number]) => {
      selectActiveStation(station);
      setSearchFilterQuery(station.name);
      setActiveTab('search');
      setVoiceModalOpen(false);
    },
    [selectActiveStation, setSearchFilterQuery, setActiveTab, setVoiceModalOpen]
  );

  return {
    voiceModalOpen,
    allAreaStops,
    selectedLang,
    setSelectedLang,
    langMeta,
    isListening,
    transcript,
    statusMsg,
    resolvingApi,
    handleClose,
    handleSpokenQuery,
    stopRecognition,
    startLiveSpeechRecognition,
    selectNearbyStation,
  };
}
