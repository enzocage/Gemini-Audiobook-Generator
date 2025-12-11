import React from 'react';
import { AudioFormat } from '../types';

interface FormatSelectorProps {
  selectedFormat: AudioFormat;
  onFormatChange: (format: AudioFormat) => void;
  disabled?: boolean;
}

const FormatSelector: React.FC<FormatSelectorProps> = ({ selectedFormat, onFormatChange, disabled }) => {
  return (
    <div className="flex bg-zinc-50 p-1 rounded-lg border border-zinc-200">
        <button
            onClick={() => onFormatChange('wav')}
            disabled={disabled}
            className={`
              flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all
              ${selectedFormat === 'wav'
                ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' 
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-white/50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            WAV
          </button>

          <button
            onClick={() => onFormatChange('mp3')}
            disabled={disabled}
            className={`
              flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all
              ${selectedFormat === 'mp3'
                ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' 
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-white/50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
             MP3
          </button>
    </div>
  );
};

export default FormatSelector;