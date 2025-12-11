import React from 'react';
import { AudioFormat } from '../types';

interface FormatSelectorProps {
  selectedFormat: AudioFormat;
  onFormatChange: (format: AudioFormat) => void;
  disabled?: boolean;
}

const FormatSelector: React.FC<FormatSelectorProps> = ({ selectedFormat, onFormatChange, disabled }) => {
  return (
    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
        <button
            onClick={() => onFormatChange('wav')}
            disabled={disabled}
            className={`
              flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all
              ${selectedFormat === 'wav'
                ? 'bg-slate-700 text-white shadow-sm ring-1 ring-slate-600' 
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
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
                ? 'bg-slate-700 text-white shadow-sm ring-1 ring-slate-600' 
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
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