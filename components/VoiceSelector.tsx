import React, { useState, useRef } from 'react';
import { VoiceName, ModelId } from '../types';
import { Play, Square, Loader2 } from 'lucide-react';
import { generateSpeechChunk } from '../services/geminiService';
import { base64ToUint8Array, createWavFile } from '../utils/audioUtils';

interface VoiceSelectorProps {
  selectedVoice: VoiceName;
  onVoiceChange: (voice: VoiceName) => void;
  disabled?: boolean;
  model: ModelId;
}

const PREVIEW_TEXT = "The quick brown fox jumps over the lazy dog.";

const VoiceSelector: React.FC<VoiceSelectorProps> = ({ selectedVoice, onVoiceChange, disabled, model }) => {
  
  const [playingVoice, setPlayingVoice] = useState<VoiceName | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<VoiceName | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayPreview = async (e: React.MouseEvent, voice: VoiceName) => {
    e.stopPropagation(); 
    
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
    }

    if (playingVoice === voice) {
        setPlayingVoice(null);
        return;
    }

    setLoadingVoice(voice);

    try {
        let base64Data: string | null = null;
        let retries = 2;
        while(retries > 0) {
            try {
                // Use a short hardcoded text for sidebar previews to save tokens/latency
                base64Data = await generateSpeechChunk(PREVIEW_TEXT, voice, model);
                break;
            } catch(err: any) {
                if (err?.isRateLimit && retries > 1) {
                    await new Promise(r => setTimeout(r, 1500));
                    retries--;
                    continue;
                }
                throw err;
            }
        }

        if (!base64Data) throw new Error("Failed to generate preview");

        const pcmData = base64ToUint8Array(base64Data);
        const wavBlob = createWavFile(pcmData);
        const url = URL.createObjectURL(wavBlob);

        const audio = new Audio(url);
        audioRef.current = audio;
        
        audio.onended = () => {
            setPlayingVoice(null);
            URL.revokeObjectURL(url);
        };
        
        await audio.play();
        setPlayingVoice(voice);
        setLoadingVoice(null);

    } catch (error: any) {
        console.error("Preview failed:", error);
        setLoadingVoice(null);
        setPlayingVoice(null);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2">
            {Object.values(VoiceName).map((voice) => {
                const isSelected = selectedVoice === voice;
                const isPlaying = playingVoice === voice;
                const isLoading = loadingVoice === voice;
                
                const isFemale = ['Kore', 'Aoede', 'Leda'].includes(voice);

                return (
                    <div
                        key={voice}
                        onClick={() => !disabled && onVoiceChange(voice)}
                        className={`
                            relative group flex flex-col items-center justify-center p-2 rounded-lg border cursor-pointer transition-all h-20
                            ${isSelected 
                                ? 'bg-indigo-600 border-indigo-500 shadow-md shadow-indigo-100' 
                                : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                            }
                            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        <div className="flex items-center justify-between w-full mb-1">
                             <span className={`text-[10px] font-bold uppercase tracking-wider opacity-60 ${isSelected ? 'text-indigo-100' : 'text-zinc-400'}`}>
                                {isFemale ? 'Fem' : 'Masc'}
                             </span>
                             
                             <button
                                onClick={(e) => handlePlayPreview(e, voice)}
                                disabled={disabled || (loadingVoice !== null && loadingVoice !== voice)}
                                className={`
                                    w-5 h-5 rounded-full flex items-center justify-center transition-all
                                    ${isPlaying 
                                        ? 'bg-white text-indigo-600' 
                                        : isSelected ? 'bg-indigo-500 text-white hover:bg-white hover:text-indigo-600' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600'
                                    }
                                `}
                            >
                                {isLoading ? (
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                ) : isPlaying ? (
                                    <Square className="w-2 h-2 fill-current" />
                                ) : (
                                    <Play className="w-2 h-2 ml-0.5 fill-current" />
                                )}
                            </button>
                        </div>
                        
                        <div className="text-center">
                            <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-zinc-600 group-hover:text-zinc-900'}`}>
                                {voice}
                            </span>
                        </div>
                    </div>
                );
            })}
    </div>
  );
};

export default VoiceSelector;