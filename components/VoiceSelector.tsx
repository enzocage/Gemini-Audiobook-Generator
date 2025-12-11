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
    <div className="grid grid-cols-1 gap-2">
            {Object.values(VoiceName).map((voice) => {
                const isSelected = selectedVoice === voice;
                const isPlaying = playingVoice === voice;
                const isLoading = loadingVoice === voice;

                return (
                    <div
                        key={voice}
                        onClick={() => !disabled && onVoiceChange(voice)}
                        className={`
                            relative group flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer transition-all
                            ${isSelected 
                                ? 'bg-blue-600/10 border-blue-500/50' 
                                : 'bg-slate-900 border-slate-800 hover:border-slate-600 hover:bg-slate-800'
                            }
                            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-slate-700'}`} />
                            <div className="flex flex-col">
                                <span className={`text-sm font-medium ${isSelected ? 'text-blue-100' : 'text-slate-300'}`}>
                                    {voice}
                                </span>
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                                    {voice === 'Kore' || voice === 'Aoede' || voice === 'Leda' ? 'Female' : 'Male'}
                                </span>
                            </div>
                        </div>

                        <button
                            onClick={(e) => handlePlayPreview(e, voice)}
                            disabled={disabled || (loadingVoice !== null && loadingVoice !== voice)}
                            className={`
                                w-7 h-7 rounded-full flex items-center justify-center transition-all border
                                ${isPlaying 
                                    ? 'bg-blue-500 border-blue-400 text-white' 
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                                }
                            `}
                        >
                            {isLoading ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : isPlaying ? (
                                <Square className="w-2.5 h-2.5 fill-current" />
                            ) : (
                                <Play className="w-2.5 h-2.5 ml-0.5 fill-current" />
                            )}
                        </button>
                    </div>
                );
            })}
    </div>
  );
};

export default VoiceSelector;