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
    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
        <button
            onClick={() => onModelChange(ModelId.Flash)}
            disabled={disabled}
            className={`
              flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all
              ${selectedModel === ModelId.Flash
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <Zap className="w-3 h-3" />
            <span>Flash 2.5</span>
          </button>

          <button
            onClick={() => onModelChange(ModelId.Pro)}
            disabled={disabled}
            className={`
              flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all
              ${selectedModel === ModelId.Pro
                ? 'bg-purple-600 text-white shadow-sm' 
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <Star className="w-3 h-3" />
            <span>Pro 2.5</span>
          </button>
    </div>
  );
};

export default ModelSelector;