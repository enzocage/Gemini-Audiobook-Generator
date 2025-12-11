import React, { useState, useRef } from 'react';
import { VoiceName, ModelId } from '../types';
import { Mic, Play, Square, Loader2, Globe } from 'lucide-react';
import { generateSpeechChunk, translateText } from '../services/geminiService';
import { base64ToUint8Array, createWavFile } from '../utils/audioUtils';

interface VoiceSelectorProps {
  selectedVoice: VoiceName;
  onVoiceChange: (voice: VoiceName) => void;
  disabled?: boolean;
  model: ModelId;
}

const DEFAULT_SAMPLE_TEXT = "Generate high-quality audiobooks from text using Google's latest AI models. Select a model and voice, paste your script, and let Gemini narrate for you.";

const LANGUAGES = [
    'English', 'Spanish', 'French', 'German', 'Italian', 
    'Portuguese', 'Chinese', 'Japanese', 'Korean', 'Hindi', 'Russian'
];

const VoiceSelector: React.FC<VoiceSelectorProps> = ({ selectedVoice, onVoiceChange, disabled, model }) => {
  const [sampleText, setSampleText] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const [isTranslating, setIsTranslating] = useState(false);
  
  const [playingVoice, setPlayingVoice] = useState<VoiceName | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<VoiceName | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleLanguageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newLang = e.target.value;
      setSelectedLanguage(newLang);
      
      const textToTranslate = sampleText.trim() || DEFAULT_SAMPLE_TEXT;
      
      setIsTranslating(true);
      try {
          const translated = await translateText(textToTranslate, newLang);
          setSampleText(translated);
      } catch (err) {
          console.error("Failed to translate", err);
      } finally {
          setIsTranslating(false);
      }
  };

  const handlePlayPreview = async (e: React.MouseEvent, voice: VoiceName) => {
    e.stopPropagation(); // Prevent selecting the voice when clicking play
    
    // Stop any existing audio
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
    }

    // If clicking the currently playing voice, just stop it
    if (playingVoice === voice) {
        setPlayingVoice(null);
        return;
    }

    setLoadingVoice(voice);

    try {
        const textToPlay = sampleText.trim() || DEFAULT_SAMPLE_TEXT;
        const base64Data = await generateSpeechChunk(textToPlay, voice, model);
        const pcmData = base64ToUint8Array(base64Data);
        const wavBlob = createWavFile(pcmData);
        const url = URL.createObjectURL(wavBlob);

        const audio = new Audio(url);
        audioRef.current = audio;
        
        audio.onended = () => {
            setPlayingVoice(null);
            URL.revokeObjectURL(url);
        };
        
        // Handle load errors
        audio.onerror = () => {
             console.error("Audio playback error");
             setPlayingVoice(null);
             setLoadingVoice(null);
        };

        await audio.play();
        setPlayingVoice(voice);
        setLoadingVoice(null);

    } catch (error) {
        console.error("Failed to generate voice preview:", error);
        setLoadingVoice(null);
        setPlayingVoice(null);
        alert("Failed to generate preview. Check console for details.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      
      {/* Sample Text Input & Language Selector */}
      <div className="space-y-2">
          <div className="flex justify-between items-end">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  Voice Preview Text
                  {isTranslating && <Loader2 className="w-3 h-3 animate-spin text-blue-500"/>}
              </label>
              
              <div className="relative">
                  <Globe className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <select 
                    value={selectedLanguage}
                    onChange={handleLanguageChange}
                    disabled={disabled || isTranslating}
                    className="pl-7 pr-8 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-700 hover:border-blue-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 cursor-pointer appearance-none"
                  >
                      {LANGUAGES.map(lang => (
                          <option key={lang} value={lang}>{lang}</option>
                      ))}
                  </select>
                   <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                      <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                   </div>
              </div>
          </div>

          <textarea
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            placeholder={isTranslating ? "Translating..." : DEFAULT_SAMPLE_TEXT}
            disabled={disabled || isTranslating}
            className={`
                w-full p-3 rounded-lg border bg-slate-50 text-xs text-slate-600 outline-none resize-none h-16 transition-all
                ${isTranslating ? 'opacity-50' : ''}
                ${isTranslating ? 'border-blue-300' : 'border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}
            `}
          />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Mic className="w-4 h-4" />
            Select Voice
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Object.values(VoiceName).map((voice) => {
                const isSelected = selectedVoice === voice;
                const isPlaying = playingVoice === voice;
                const isLoading = loadingVoice === voice;

                return (
                    <div
                        key={voice}
                        onClick={() => !disabled && onVoiceChange(voice)}
                        className={`
                            relative group flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all
                            ${isSelected 
                                ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 shadow-sm' 
                                : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                            }
                            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        <div className="flex flex-col">
                            <span className={`text-sm font-medium ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>
                                {voice}
                            </span>
                            <span className="text-[10px] text-slate-400 capitalize">
                                {voice === 'Kore' || voice === 'Aoede' || voice === 'Leda' ? 'Female' : 'Male'}
                            </span>
                        </div>

                        <button
                            onClick={(e) => handlePlayPreview(e, voice)}
                            disabled={disabled || (loadingVoice !== null && loadingVoice !== voice)}
                            className={`
                                w-8 h-8 rounded-full flex items-center justify-center transition-all
                                ${isPlaying 
                                    ? 'bg-blue-600 text-white' 
                                    : isSelected ? 'bg-blue-200 text-blue-700 hover:bg-blue-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                                }
                            `}
                            title="Preview Voice"
                        >
                            {isLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : isPlaying ? (
                                <Square className="w-3 h-3 fill-current" />
                            ) : (
                                <Play className="w-3 h-3 ml-0.5 fill-current" />
                            )}
                        </button>
                    </div>
                );
            })}
        </div>
      </div>
    </div>
  );
};

export default VoiceSelector;