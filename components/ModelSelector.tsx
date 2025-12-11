import React from 'react';
import { ModelId } from '../types';
import { Cpu, Zap, Star } from 'lucide-react';

interface ModelSelectorProps {
  selectedModel: ModelId;
  onModelChange: (model: ModelId) => void;
  disabled?: boolean;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange, disabled }) => {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <Cpu className="w-4 h-4" />
        Select Model
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
            onClick={() => onModelChange(ModelId.Flash)}
            disabled={disabled}
            className={`
              flex items-center justify-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium transition-all
              ${selectedModel === ModelId.Flash
                ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-200' 
                : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:bg-slate-50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <Zap className="w-4 h-4" />
            <div className="flex flex-col items-start">
                <span>Gemini 2.5 Flash</span>
                <span className={`text-xs ${selectedModel === ModelId.Flash ? 'text-blue-200' : 'text-slate-400'}`}>Fast & Efficient</span>
            </div>
          </button>

          <button
            onClick={() => onModelChange(ModelId.Pro)}
            disabled={disabled}
            className={`
              flex items-center justify-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium transition-all
              ${selectedModel === ModelId.Pro
                ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-200' 
                : 'bg-white text-slate-700 border-slate-200 hover:border-purple-400 hover:bg-slate-50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <Star className="w-4 h-4" />
             <div className="flex flex-col items-start">
                <span>Gemini 2.5 Pro</span>
                <span className={`text-xs ${selectedModel === ModelId.Pro ? 'text-purple-200' : 'text-slate-400'}`}>Higher Quality</span>
            </div>
          </button>
      </div>
    </div>
  );
};

export default ModelSelector;