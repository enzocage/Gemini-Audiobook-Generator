import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { BookOpen, Play, Download, Loader2, Sparkles, StopCircle, Scissors, Coins, ArrowRight, Volume2, X, Settings, Key, CheckCircle, AlertTriangle, ShieldCheck, Tag, Menu, LayoutTemplate } from 'lucide-react';
import { VoiceName, ModelId, AudioChunk, GenerationState, AudioFormat } from './types';
import { createSmartChunks, base64ToUint8Array, concatenateAudioBuffers, createWavFile, createMp3File } from './utils/audioUtils';
import { generateSpeechChunk, setCustomApiKey, validateApiKey } from './services/geminiService';
import VoiceSelector from './components/VoiceSelector';
import ModelSelector from './components/ModelSelector';
import FormatSelector from './components/FormatSelector';
import TextInput from './components/TextInput';

const App: React.FC = () => {
  const [projectName, setProjectName] = useState<string>('My Audiobook');
  const [text, setText] = useState<string>('');
  const [voice, setVoice] = useState<VoiceName>(VoiceName.Fenrir);
  const [model, setModel] = useState<ModelId>(ModelId.Flash);
  const [format, setFormat] = useState<AudioFormat>('wav');
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [userApiKey, setUserApiKey] = useState('');
  const [keyStatus, setKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [keyStatusMessage, setKeyStatusMessage] = useState('');

  // New State for Preview & Selection
  const [previewChunks, setPreviewChunks] = useState<string[]>([]);
  const [startChunkIndex, setStartChunkIndex] = useState<number>(0);
  
  // State for playing audio during generation
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewChunkCount, setPreviewChunkCount] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoResumeRef = useRef<{ shouldResume: boolean; startTime: number }>({ shouldResume: false, startTime: 0 });

  const [audioChunks, setAudioChunks] = useState<AudioChunk[]>([]);
  const [generationState, setGenerationState] = useState<GenerationState>({
    isGenerating: false,
    progress: 0,
    totalChunks: 0,
    currentChunkIndex: 0
  });
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null);
  
  const abortRef = useRef<boolean>(false);

  // Initialize Custom Key from LocalStorage
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setUserApiKey(savedKey);
      setCustomApiKey(savedKey);
    }
  }, []);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setUserApiKey(key);
    const trimmed = key.trim();
    setCustomApiKey(trimmed);
    setKeyStatus('idle'); 
    setKeyStatusMessage('');
    
    if (trimmed) {
      localStorage.setItem('gemini_api_key', trimmed);
    } else {
      localStorage.removeItem('gemini_api_key');
    }
  };

  const testApiKey = async () => {
      if (!userApiKey.trim()) return;
      setKeyStatus('validating');
      try {
          await validateApiKey(userApiKey);
          setKeyStatus('valid');
          setKeyStatusMessage("Key is valid and active!");
      } catch (e: any) {
          setKeyStatus('invalid');
          setKeyStatusMessage(e.message || "Failed to validate key");
      }
  };

  // --- COST ESTIMATION LOGIC ---
  const costStats = useMemo(() => {
    const charCount = text.length;
    // Rough estimate: 4 chars ~= 1 token
    const estimatedTokens = Math.ceil(charCount / 4);
    
    // Pricing (Estimated based on public docs per 1M tokens)
    const pricingPerMillion = model === ModelId.Flash ? 0.10 : 1.25;
    const estimatedCost = (estimatedTokens / 1_000_000) * pricingPerMillion;
    
    // Rough estimate: 150 words per minute ~ 900 chars per minute
    const estimatedMinutes = charCount / 900;

    return {
      tokens: estimatedTokens,
      cost: estimatedCost.toFixed(6),
      minutes: estimatedMinutes.toFixed(1),
      currency: '$'
    };
  }, [text, model]);

  useEffect(() => {
    setStartChunkIndex(0);
    setPreviewChunks([]); 
  }, [text]);

  const handlePreviewChunks = () => {
    if (!text.trim()) return;
    const chunks = createSmartChunks(text, 2000);
    setPreviewChunks(chunks);
    setStartChunkIndex(0);
  };

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const generateBlobFromChunks = useCallback((chunks: AudioChunk[], targetFormat: AudioFormat) => {
      const completedChunks = chunks.filter(c => c.status === 'completed' && c.data);
      if (completedChunks.length === 0) return null;

      const buffers = completedChunks.map(c => c.data!);
      const combinedBuffer = concatenateAudioBuffers(buffers);

      if (targetFormat === 'wav') {
          return createWavFile(combinedBuffer);
      } else {
          return createMp3File(combinedBuffer);
      }
  }, []);

  useEffect(() => {
    if (!generationState.isGenerating && audioChunks.length > 0 && audioChunks.some(c => c.status === 'completed')) {
        const blob = generateBlobFromChunks(audioChunks, format);
        setFinalBlob(blob);
        setPreviewUrl(null); 
        setPreviewChunkCount(0);
    }
  }, [format, audioChunks, generationState.isGenerating, generateBlobFromChunks]);

  useEffect(() => {
      return () => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
      };
  }, [previewUrl]);

  useEffect(() => {
    if (previewUrl && autoResumeRef.current.shouldResume && audioRef.current) {
        const { startTime } = autoResumeRef.current;
        const player = audioRef.current;
        const timer = setTimeout(() => {
            if (Number.isFinite(startTime)) {
                player.currentTime = startTime;
            }
            player.play().catch(e => console.warn("Auto-resume playback interrupted", e));
        }, 50);
        autoResumeRef.current = { shouldResume: false, startTime: 0 };
        return () => clearTimeout(timer);
    }
  }, [previewUrl]);

  const updatePreviewSource = useCallback((resume: boolean = false, startTime: number = 0) => {
      const completedChunks = audioChunks.filter(c => c.status === 'completed' && c.data);
      if (completedChunks.length === 0) return;

      const buffer = concatenateAudioBuffers(completedChunks.map(c => c.data!));
      const blob = createWavFile(buffer);
      
      const newUrl = URL.createObjectURL(blob);
      setPreviewUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return newUrl;
      });
      setPreviewChunkCount(completedChunks.length);
      
      if (resume) {
          autoResumeRef.current = { shouldResume: true, startTime };
      }
  }, [audioChunks]);

  const handlePlayPreview = () => {
      updatePreviewSource(false);
  };

  const handleClosePreview = () => {
      setPreviewUrl(null);
      setPreviewChunkCount(0);
  };

  const handleAudioEnded = () => {
      const completedCount = audioChunks.filter(c => c.status === 'completed' && c.data).length;
      if (completedCount > previewChunkCount) {
          const currentDuration = audioRef.current?.duration || 0;
          updatePreviewSource(true, currentDuration);
      }
  };

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) return;

    setFinalBlob(null);
    setAudioChunks([]);
    setPreviewUrl(null);
    setPreviewChunkCount(0);
    setGenerationState({
      isGenerating: true,
      progress: 0,
      totalChunks: 0,
      currentChunkIndex: 0,
      error: undefined
    });
    abortRef.current = false;

    let textChunksToProcess = previewChunks.length > 0 
      ? previewChunks 
      : createSmartChunks(text, 2000);

    const initialAudioChunks: AudioChunk[] = textChunksToProcess.map((t, i) => ({
      id: i,
      text: t,
      status: i < startChunkIndex ? 'completed' : 'pending'
    }));

    setAudioChunks(initialAudioChunks);
    
    const totalToGenerate = textChunksToProcess.length - startChunkIndex;
    setGenerationState(prev => ({ ...prev, totalChunks: textChunksToProcess.length }));

    const collectedBuffers: Uint8Array[] = [];
    let interChunkDelay = 2000;
    const safeProjectName = projectName.trim() || 'audiobook';

    try {
      for (let i = startChunkIndex; i < textChunksToProcess.length; i++) {
        if (abortRef.current) break;

        setGenerationState(prev => ({ 
            ...prev, 
            currentChunkIndex: i + 1, 
            progress: ((i - startChunkIndex) / totalToGenerate) * 100 
        }));
        
        setAudioChunks(prev => prev.map(c => c.id === i ? { ...c, status: 'generating' } : c));

        let pcmData: Uint8Array | null = null;
        let attempts = 0;
        const maxRetries = 15; 
        
        while(attempts < maxRetries && !pcmData && !abortRef.current) {
             try {
                 const base64Data = await generateSpeechChunk(textChunksToProcess[i], voice, model);
                 pcmData = base64ToUint8Array(base64Data);
                 setGenerationState(prev => ({ ...prev, error: undefined }));
             } catch (err: any) {
                 const isRateLimit = err?.isRateLimit === true;
                 const errorMessage = err?.message || "Unknown error";
                 
                 console.warn(`Attempt ${attempts + 1} failed for chunk ${i + 1}.`, errorMessage);
                 
                 if (isRateLimit) {
                     interChunkDelay = 6000;
                 }

                 attempts++;
                 
                 if (!isRateLimit && attempts >= 3) {
                      throw new Error(`Failed to generate part ${i + 1}. ${errorMessage}`);
                 }
                 
                 if (attempts >= maxRetries) {
                     const friendlyError = isRateLimit 
                         ? "Quota exceeded. Aborting." 
                         : errorMessage;
                     throw new Error(`Failed to generate part ${i + 1}. ${friendlyError}`);
                 }

                 let delay = 2000 * Math.pow(1.5, attempts); 
                 if (isRateLimit) {
                     delay = 10000 + (attempts * 5000); 
                     setGenerationState(prev => ({ 
                         ...prev, 
                         error: `Rate limit hit. Cooling down for ${delay/1000}s...` 
                     }));
                 } else {
                     setGenerationState(prev => ({ 
                         ...prev, 
                         error: `Error encountered. Retrying in ${Math.round(delay/1000)}s...` 
                     }));
                 }
                 await new Promise(r => setTimeout(r, delay));
             }
        }

        if (abortRef.current) break;

        if (pcmData) {
            collectedBuffers.push(pcmData);
            setAudioChunks(prev => prev.map(c => c.id === i ? { ...c, status: 'completed', data: pcmData! } : c));
            try {
                const chunkBlob = format === 'wav' ? createWavFile(pcmData) : createMp3File(pcmData);
                const chunkFilename = `${safeProjectName}_chunk_${i + 1}.${format}`;
                downloadBlob(chunkBlob, chunkFilename);
            } catch (downloadErr) {
                console.error("Failed to auto-download chunk", downloadErr);
            }
        }

        if (i < textChunksToProcess.length - 1) {
            if (interChunkDelay > 3000) {
                setGenerationState(prev => ({ ...prev, error: `Pacing requests (${interChunkDelay/1000}s)...` }));
            }
            await new Promise(resolve => setTimeout(resolve, interChunkDelay));
            if (interChunkDelay > 3000) {
                 setGenerationState(prev => ({ ...prev, error: undefined }));
            }
        }
      }

      if (!abortRef.current && collectedBuffers.length > 0) {
          const combinedBuffer = concatenateAudioBuffers(collectedBuffers);
          let blob: Blob;
          if (format === 'wav') {
              blob = createWavFile(combinedBuffer);
          } else {
              blob = createMp3File(combinedBuffer);
          }
          setFinalBlob(blob);
          setGenerationState(prev => ({ ...prev, isGenerating: false, progress: 100 }));
      } else {
          setGenerationState(prev => ({ ...prev, isGenerating: false }));
      }

    } catch (error) {
      console.error(error);
      setGenerationState(prev => ({ 
          ...prev, 
          isGenerating: false, 
          error: error instanceof Error ? error.message : "An unexpected error occurred" 
      }));
    }
  }, [text, voice, model, format, downloadBlob, previewChunks, startChunkIndex, projectName]);

  const handleStop = () => {
      abortRef.current = true;
      setGenerationState(prev => ({ ...prev, isGenerating: false }));
  };

  const downloadFinalAudio = () => {
      if (!finalBlob) return;
      const safeProjectName = projectName.trim() || 'audiobook';
      downloadBlob(finalBlob, `${safeProjectName}_complete.${format}`);
  };

  const readyChunksCount = useMemo(() => {
      return audioChunks.filter(c => c.status === 'completed' && c.data).length;
  }, [audioChunks]);

  const handleSelectPaidKey = async () => {
      if (typeof window.aistudio?.openSelectKey === 'function') {
          try {
              // Reset manual key first to avoid confusion
              setUserApiKey('');
              setCustomApiKey(null);
              setKeyStatus('idle');
              
              await window.aistudio.openSelectKey();
              // If successful, user has a key in process.env context implicitly via the tool
              // We rely on the environment now.
              alert("Paid API Key selected successfully!");
          } catch (e) {
              console.error(e);
          }
      } else {
          alert("Key selection tool not available.");
      }
  };

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex overflow-hidden font-sans selection:bg-blue-500/30">
      
      {/* --- LEFT SIDEBAR: STUDIO CONTROLS --- */}
      <aside className="w-80 bg-slate-950 border-r border-slate-800 flex flex-col z-20 shadow-xl flex-shrink-0 overflow-y-auto">
        
        {/* Header */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800 bg-slate-950 sticky top-0 z-10">
           <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-900/50">
                <BookOpen size={18} />
           </div>
           <div>
               <h1 className="text-base font-bold text-white tracking-tight leading-none">Gemini Studio</h1>
               <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Audiobook Gen</span>
           </div>
        </div>

        <div className="p-6 space-y-8">
            {/* Model & Format Group */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Configuration</h2>
                    <button 
                        onClick={() => setShowSettings(true)}
                        className={`p-1.5 rounded-md transition-colors ${userApiKey ? 'text-green-400 bg-green-400/10' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
                    >
                        <Settings size={14} />
                    </button>
                </div>
                
                <div className="space-y-4">
                     <ModelSelector 
                        selectedModel={model}
                        onModelChange={setModel}
                        disabled={generationState.isGenerating}
                     />
                     <FormatSelector 
                        selectedFormat={format}
                        onFormatChange={setFormat}
                        disabled={generationState.isGenerating}
                     />
                </div>
            </div>

            <div className="w-full h-px bg-slate-800/50" />

            {/* Voice Group */}
            <div className="space-y-4">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cast</h2>
                <VoiceSelector 
                    selectedVoice={voice} 
                    onVoiceChange={setVoice} 
                    disabled={generationState.isGenerating}
                    model={model}
                />
            </div>
            
            <div className="w-full h-px bg-slate-800/50" />

            {/* Stats */}
            <div className="bg-slate-900 rounded-lg p-4 border border-slate-800 space-y-3">
                 <div className="flex justify-between items-center text-xs">
                     <span className="text-slate-400">Tokens</span>
                     <span className="font-mono text-slate-200">{costStats.tokens.toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                     <span className="text-slate-400">Est. Duration</span>
                     <span className="font-mono text-slate-200">~{costStats.minutes} min</span>
                 </div>
                 <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800/50">
                     <span className="text-slate-400">Est. Cost</span>
                     <span className="font-mono text-amber-400">${costStats.cost}</span>
                 </div>
            </div>

        </div>
      </aside>

      {/* --- RIGHT MAIN AREA: MANUSCRIPT CANVAS --- */}
      <main className="flex-1 flex flex-col bg-slate-100 relative overflow-hidden">
        
        {/* Top Bar (Project Name & Actions) */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0 z-10">
            <div className="flex items-center gap-3 w-1/2">
                <LayoutTemplate className="text-slate-300 w-5 h-5" />
                <input 
                    type="text" 
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="text-lg font-semibold text-slate-800 bg-transparent outline-none placeholder:text-slate-300 w-full hover:bg-slate-50 focus:bg-slate-50 rounded px-2 -ml-2 transition-colors truncate"
                    placeholder="Untitled Project"
                />
            </div>

            <div className="flex items-center gap-3">
                 {/* Generation Progress Indicator (Top Right) */}
                 {generationState.isGenerating && (
                     <div className="flex items-center gap-3 mr-4">
                         <div className="flex flex-col items-end">
                             <span className="text-xs font-bold text-blue-600 uppercase">Generating</span>
                             <span className="text-[10px] text-slate-400">Chunk {generationState.currentChunkIndex} / {generationState.totalChunks}</span>
                         </div>
                         <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                     </div>
                 )}

                 <button
                    onClick={handlePreviewChunks}
                    disabled={!text || generationState.isGenerating}
                    className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-sm font-medium transition-all"
                 >
                    <Scissors className="w-4 h-4" />
                    <span>Chunk Preview</span>
                 </button>

                 {generationState.isGenerating ? (
                    <button
                        onClick={handleStop}
                        className="flex items-center gap-2 px-6 py-2.5 bg-red-50 text-red-600 font-semibold rounded-lg hover:bg-red-100 border border-red-200 transition-colors shadow-sm"
                    >
                        <StopCircle size={18} />
                        Stop
                    </button>
                 ) : (
                    <button
                        onClick={handleGenerate}
                        disabled={!text}
                        className={`
                            flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-white shadow-md shadow-blue-200 transition-all
                            ${!text 
                                ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                                : 'bg-blue-600 hover:bg-blue-700 hover:translate-y-[-1px]'
                            }
                        `}
                    >
                        <Sparkles size={18} />
                        {startChunkIndex > 0 ? `Resume from #${startChunkIndex + 1}` : 'Generate Audio'}
                    </button>
                 )}
            </div>
        </header>

        {/* Scrollable Canvas Area */}
        <div className="flex-1 overflow-y-auto p-8 relative scroll-smooth">
            <div className="max-w-3xl mx-auto space-y-6 pb-32">
                
                {/* Script Input (Visualized as Paper) */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px] p-10 relative group transition-shadow hover:shadow-md">
                     <TextInput 
                        text={text} 
                        onTextChange={setText} 
                        disabled={generationState.isGenerating}
                     />
                </div>

                {/* Chunk Visualization (Timeline) */}
                {previewChunks.length > 0 && (
                    <div className="space-y-3 pt-6 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Processing Timeline</h3>
                            <span className="text-xs text-slate-400">{previewChunks.length} Segments</span>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-2">
                            {previewChunks.map((chunkText, idx) => {
                                const isCompleted = idx < startChunkIndex || (audioChunks[idx]?.status === 'completed');
                                const isGenerating = audioChunks[idx]?.status === 'generating';
                                const isPending = !isCompleted && !isGenerating;
                                const isSelected = idx === startChunkIndex;

                                return (
                                    <div 
                                        key={idx}
                                        onClick={() => !generationState.isGenerating && setStartChunkIndex(idx)}
                                        className={`
                                            flex items-start gap-4 p-3 rounded-lg border transition-all cursor-pointer select-none
                                            ${isSelected ? 'bg-blue-50/50 border-blue-400 ring-1 ring-blue-400/30' : 'bg-white border-slate-200 hover:border-slate-300'}
                                            ${isGenerating ? 'border-blue-500 bg-blue-50' : ''}
                                            ${isCompleted && !isSelected ? 'opacity-60 bg-slate-50' : ''}
                                        `}
                                    >
                                        <div className={`
                                            w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold shrink-0 transition-colors
                                            ${isCompleted ? 'bg-green-100 text-green-700' : ''}
                                            ${isGenerating ? 'bg-blue-600 text-white animate-pulse' : ''}
                                            ${isPending && !isSelected ? 'bg-slate-100 text-slate-500' : ''}
                                            ${isSelected && !isGenerating ? 'bg-blue-600 text-white' : ''}
                                        `}>
                                            {isCompleted ? <CheckCircle size={14}/> : (idx + 1)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-slate-600 font-serif leading-relaxed line-clamp-2">{chunkText}</p>
                                        </div>
                                        {isSelected && !generationState.isGenerating && (
                                            <span className="text-[10px] uppercase font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded">Start Here</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* --- BOTTOM PLAYER DECK (Sticky) --- */}
        {(finalBlob || previewUrl || generationState.isGenerating) && (
            <div className="h-20 bg-white border-t border-slate-200 flex items-center px-6 gap-6 shadow-2xl z-30 flex-shrink-0 animate-in slide-in-from-bottom-full duration-500">
                
                {/* Status / Error Message Area */}
                <div className="w-1/4 min-w-[200px]">
                    {generationState.error ? (
                        <div className="flex items-center gap-2 text-amber-600 text-xs font-medium">
                            <AlertTriangle size={14} />
                            <span className="line-clamp-1" title={generationState.error}>{generationState.error}</span>
                            {generationState.error.includes("Rate limit") && (
                                <button onClick={() => setShowSettings(true)} className="underline hover:text-amber-800">Upgrade</button>
                            )}
                        </div>
                    ) : (finalBlob ? (
                        <div className="flex items-center gap-2 text-green-600">
                             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                             <span className="text-sm font-bold">Generation Complete</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-blue-600">
                             <Loader2 size={14} className="animate-spin" />
                             <span className="text-xs font-medium uppercase tracking-wide">Processing Audio...</span>
                        </div>
                    ))}
                </div>

                {/* Player Center */}
                <div className="flex-1 max-w-2xl flex flex-col items-center justify-center gap-1">
                    <audio 
                        ref={audioRef}
                        src={previewUrl || (finalBlob ? URL.createObjectURL(finalBlob) : undefined)} 
                        controls 
                        autoPlay={!!previewUrl} // Only auto play previews, not final download
                        onEnded={handleAudioEnded}
                        className="w-full h-8" 
                    />
                    <div className="text-[10px] text-slate-400 font-medium">
                        {previewUrl ? `Previewing Chunk ${previewChunkCount} / ${readyChunksCount} ready` : 'Full Audiobook Playback'}
                    </div>
                </div>

                {/* Actions Right */}
                <div className="w-1/4 flex justify-end gap-3">
                     {finalBlob && (
                        <button
                            onClick={downloadFinalAudio}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            <Download size={16} />
                            <span>Download {format.toUpperCase()}</span>
                        </button>
                     )}
                </div>
            </div>
        )}

      </main>

      {/* Settings Modal (Overlay) */}
      {showSettings && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <Settings size={18} /> Settings
                      </h3>
                      <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                          <X size={18} />
                      </button>
                  </div>
                  
                  <div className="p-6 space-y-6">
                      {/* Paid Key Promo */}
                      <div className="bg-slate-900 rounded-xl p-5 text-center space-y-3 relative overflow-hidden">
                           <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-amber-400 to-transparent opacity-20 blur-xl" />
                           <div className="w-10 h-10 bg-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-2">
                                <ShieldCheck size={20} />
                           </div>
                           <h4 className="text-white font-bold">Rate Limits? Go Pro.</h4>
                           <p className="text-xs text-slate-400 leading-relaxed">
                               Gemini 2.5 Pro models require a paid cloud project for high-volume generation.
                           </p>
                           <button 
                               onClick={handleSelectPaidKey}
                               className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-sm transition-colors"
                           >
                               Select Paid API Key
                           </button>
                           <a href="https://ai.google.dev/pricing" target="_blank" rel="noreferrer" className="text-[10px] text-slate-500 hover:text-slate-300 underline block mt-2">
                               View Pricing Documentation
                           </a>
                      </div>

                      <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-700">Manual API Key (Optional)</label>
                          <div className="flex gap-2">
                              <input 
                                  type="password" 
                                  value={userApiKey}
                                  onChange={handleApiKeyChange}
                                  placeholder="Paste key here..."
                                  className={`flex-1 px-3 py-2 rounded-lg border text-sm outline-none ${keyStatus === 'valid' ? 'border-green-300 bg-green-50' : 'border-slate-300'}`}
                              />
                              <button onClick={testApiKey} disabled={!userApiKey} className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-200">
                                  {keyStatus === 'validating' ? <Loader2 size={14} className="animate-spin"/> : 'Test'}
                              </button>
                          </div>
                          {keyStatusMessage && (
                              <p className={`text-xs ${keyStatus === 'valid' ? 'text-green-600' : 'text-red-500'}`}>{keyStatusMessage}</p>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;