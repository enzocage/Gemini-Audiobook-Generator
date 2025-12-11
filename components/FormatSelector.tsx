import React from 'react';
import { AudioFormat } from '../types';
import { FileAudio, Music } from 'lucide-react';

interface FormatSelectorProps {
  selectedFormat: AudioFormat;
  onFormatChange: (format: AudioFormat) => void;
  disabled?: boolean;
}

const FormatSelector: React.FC<FormatSelectorProps> = ({ selectedFormat, onFormatChange, disabled }) => {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <FileAudio className="w-4 h-4" />
        Output Format
      </label>
      <div className="grid grid-cols-2 gap-3">
        <button
            onClick={() => onFormatChange('wav')}
            disabled={disabled}
            className={`
              flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all
              ${selectedFormat === 'wav'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-200' 
                : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:bg-slate-50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <div className="flex flex-col items-center">
                <span>WAV</span>
                <span className={`text-[10px] font-normal ${selectedFormat === 'wav' ? 'text-emerald-100' : 'text-slate-400'}`}>Lossless (High Quality)</span>
            </div>
          </button>

          <button
            onClick={() => onFormatChange('mp3')}
            disabled={disabled}
            className={`
              flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all
              ${selectedFormat === 'mp3'
                ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-200' 
                : 'bg-white text-slate-700 border-slate-200 hover:border-rose-400 hover:bg-slate-50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
             <div className="flex flex-col items-center">
                <span>MP3</span>
                <span className={`text-[10px] font-normal ${selectedFormat === 'mp3' ? 'text-rose-100' : 'text-slate-400'}`}>Compressed (Smaller)</span>
            </div>
          </button>
      </div>
    </div>
  );
};

export default FormatSelector;