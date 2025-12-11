import React from 'react';
import { ModelId } from '../types';
import { Zap, Star } from 'lucide-react';

interface ModelSelectorProps {
  selectedModel: ModelId;
  onModelChange: (model: ModelId) => void;
  disabled?: boolean;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange, disabled }) => {
  return (
    <div className="flex bg-zinc-50 p-1 rounded-lg border border-zinc-200">
        <button
            onClick={() => onModelChange(ModelId.Flash)}
            disabled={disabled}
            className={`
              flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all
              ${selectedModel === ModelId.Flash
                ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-zinc-200' 
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-white/50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <Zap className="w-3 h-3" />
            <span>Flash</span>
          </button>

          <button
            onClick={() => onModelChange(ModelId.Pro)}
            disabled={disabled}
            className={`
              flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all
              ${selectedModel === ModelId.Pro
                ? 'bg-white text-purple-600 shadow-sm ring-1 ring-zinc-200' 
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-white/50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <Star className="w-3 h-3" />
            <span>Pro</span>
          </button>
    </div>
  );
};

export default ModelSelector;