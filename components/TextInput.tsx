import React, { useRef } from 'react';
import { FileText, Upload } from 'lucide-react';

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
    <div className="flex flex-col gap-2 h-full">
      <div className="flex justify-between items-center mb-1">
        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Script
        </label>
        <div className="flex gap-2">
           <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 disabled:opacity-50 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
          >
            <Upload className="w-3 h-3" />
            Import .txt
          </button>
          <input
            type="file"
            accept=".txt"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        disabled={disabled}
        placeholder="Enter your text here or upload a .txt file..."
        className="w-full min-h-[200px] p-4 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-y text-slate-800 leading-relaxed shadow-sm font-light text-lg transition-all"
      />
      <div className="text-right text-xs text-slate-400">
        {text.length} characters
      </div>
    </div>
  );
};

export default TextInput;
