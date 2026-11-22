import React from 'react';
import { Mic, MicOff, Check, MapPin, Loader2 } from 'lucide-react';
import { VOICE_LANGUAGES } from '../../config/transitConfig';
import { useVoiceSearch } from '../../hooks/useVoiceSearch';
import { cn, DialogOverlay } from '../ui/primitives';

export const VoiceSearchModal: React.FC = () => {
  const {
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
  } = useVoiceSearch();

  return (
    <DialogOverlay
      open={voiceModalOpen}
      onClose={handleClose}
      title="Voice search"
      subtitle="Speak a station name, hub alias, or bus route number"
      icon={<Mic className="h-4 w-4" />}
    >
      {/* Language Selector */}
      <div className="border-b border-zinc-200 bg-zinc-100/70 px-5 py-3">
        <div
          className="grid grid-cols-4 gap-1.5"
          role="tablist"
          aria-label="Voice recognition language"
        >
          {VOICE_LANGUAGES.map((lang) => {
            const active = lang.code === selectedLang;
            return (
              <button
                key={lang.code}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedLang(lang.code)}
                className={cn(
                  'rounded-lg border py-2 px-1 text-center transition-colors',
                  active
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50'
                )}
              >
                <div className="text-xs font-semibold">{lang.nativeLabel}</div>
                <div
                  className={cn(
                    'text-[10px]',
                    active ? 'text-zinc-300' : 'text-zinc-600'
                  )}
                >
                  {lang.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-6 text-center space-y-4">
        <button
          type="button"
          aria-label={isListening ? 'Stop listening' : 'Start listening'}
          onClick={() => {
            if (isListening) {
              stopRecognition();
              if (transcript) handleSpokenQuery(transcript);
            } else {
              startLiveSpeechRecognition(langMeta.speechLocale);
            }
          }}
          className={cn(
            'relative mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white shadow-card transition-colors',
            isListening ? 'bg-emerald-600' : 'bg-zinc-900 hover:bg-zinc-800'
          )}
        >
          {isListening && (
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-30" />
          )}
          {resolvingApi ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : isListening ? (
            <Mic className="h-7 w-7" />
          ) : (
            <MicOff className="h-6 w-6" />
          )}
        </button>

        <div>
          <p className="text-sm font-semibold text-zinc-950">
            {transcript
              ? `“${transcript}”`
              : isListening
              ? langMeta.listeningLabel
              : 'Tap microphone to speak'}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            {statusMsg || langMeta.promptHint}
          </p>
        </div>

        {transcript && (
          <button
            type="button"
            onClick={() => handleSpokenQuery(transcript)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Search “{transcript}”</span>
          </button>
        )}

        {/* Quick Nearby Stations */}
        {allAreaStops.length > 0 && (
          <div className="pt-4 text-left border-t border-zinc-200">
            <p className="mb-2 text-xs font-medium text-zinc-600">
              Nearby stations
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {allAreaStops.slice(0, 6).map((st) => (
                <button
                  key={st.stopId}
                  type="button"
                  onClick={() => selectNearbyStation(st)}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-100/80 px-2.5 py-2 text-left text-xs font-medium text-zinc-900 transition-colors hover:border-zinc-400 hover:bg-zinc-200/80 truncate"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                  <span className="truncate">{st.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </DialogOverlay>
  );
};
