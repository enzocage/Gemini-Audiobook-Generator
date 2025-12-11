import React, { useRef } from 'react';
import { Upload } from 'lucide-react';

interface TextInputProps {
  text: string;
  onTextChange: (text: string) => void;
  disabled?: boolean;
}

const TextInput: React.FC<TextInputProps> = ({ text, onTextChange, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        onTextChange(content);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="absolute top-0 right-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
           <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="text-xs flex items-center gap-1 text-slate-500 hover:text-blue-600 font-medium px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 hover:bg-blue-50 transition-colors"
          >
            <Upload className="w-3 h-3" />
            Import Text File
          </button>
          <input
            type="file"
            accept=".txt"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
          />
      </div>
      
      {/* Manuscript Area */}
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        disabled={disabled}
        placeholder="Once upon a time..."
        className="w-full h-full min-h-[500px] bg-transparent outline-none resize-none text-slate-800 leading-relaxed font-serif text-lg placeholder:text-slate-300 placeholder:font-sans"
        spellCheck={false}
      />
      
      <div className="absolute bottom-0 right-0 text-[10px] text-slate-300 font-mono pointer-events-none select-none">
        {text.length > 0 ? `${text.length} chars` : ''}
      </div>
    </div>
  );
};

export default TextInput;