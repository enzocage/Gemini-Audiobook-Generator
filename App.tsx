import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { BookOpen, Play, Download, Loader2, Sparkles, StopCircle, Scissors, Coins, ArrowRight, Volume2, X, Settings, Key, CheckCircle, AlertTriangle, ShieldCheck, Tag, Menu, LayoutTemplate, ChevronRight, Zap, Image as ImageIcon, ImagePlus, RefreshCw } from 'lucide-react';
import { VoiceName, ModelId, AudioChunk, GenerationState, AudioFormat, GeneratedImage } from './types';
import { createSmartChunks, base64ToUint8Array, concatenateAudioBuffers, createWavFile, createMp3File } from './utils/audioUtils';
import { generateSpeechChunk, setCustomApiKey, validateApiKey, generateStyleDescription, generateNanobanaImage } from './services/geminiService';
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
  
  // Image Generation State
  const [globalStylePrompt, setGlobalStylePrompt] = useState<string | null>(null);
  const [imageCounts, setImageCounts] = useState<Record<number, number>>({});

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
    setGlobalStylePrompt(null);
  }, [text]);

  const handlePreviewChunks = () => {
    if (!text.trim()) return;
    const chunks = createSmartChunks(text, 2000);
    setPreviewChunks(chunks);
    setStartChunkIndex(0);
    
    // Reset audio chunks to match new preview
    const initialAudioChunks: AudioChunk[] = chunks.map((t, i) => ({
      id: i,
      text: t,
      status: 'pending',
      images: []
    }));
    setAudioChunks(initialAudioChunks);
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

  // --- IMAGE GENERATION LOGIC ---
  const handleGenerateImages = async (chunkIndex: number) => {
      const count = imageCounts[chunkIndex] || 1;
      const chunkText = previewChunks[chunkIndex];
      if (!chunkText) return;

      // Update state to show loading
      setAudioChunks(prev => prev.map(c => c.id === chunkIndex ? { ...c, isGeneratingImages: true } : c));

      try {
          // 1. Get or Generate Style Prompt
          let stylePrompt = globalStylePrompt;
          if (!stylePrompt) {
              stylePrompt = await generateStyleDescription(text);
              setGlobalStylePrompt(stylePrompt);
          }

          // 2. Construct Full Prompt
          const fullPrompt = `${stylePrompt}. Scene description: ${chunkText}`;

          // 3. Generate X images in parallel
          const promises = Array.from({ length: count }).map(() => generateNanobanaImage(fullPrompt));
          const results = await Promise.all(promises);

          // 4. Update Chunk with images
          const newImages: GeneratedImage[] = results.map((url, idx) => ({
              id: `${Date.now()}-${idx}`,
              data: url
          }));

          setAudioChunks(prev => prev.map(c => {
              if (c.id === chunkIndex) {
                  return {
                      ...c,
                      isGeneratingImages: false,
                      images: [...(c.images || []), ...newImages]
                  };
              }
              return c;
          }));

      } catch (error) {
          console.error("Image generation failed", error);
          setAudioChunks(prev => prev.map(c => c.id === chunkIndex ? { ...c, isGeneratingImages: false } : c));
          alert("Failed to generate images. Check API limits or key.");
      }
  };

  const handleImageCountChange = (chunkIndex: number, val: number) => {
      setImageCounts(prev => ({ ...prev, [chunkIndex]: val }));
  };

  // --- AUDIO GENERATION LOGIC ---
  const handleGenerate = useCallback(async () => {
    if (!text.trim()) return;

    setFinalBlob(null);
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

    // If audioChunks already initialized (e.g. from preview), use them, otherwise init
    if (audioChunks.length === 0 || audioChunks.length !== textChunksToProcess.length) {
        const initialAudioChunks: AudioChunk[] = textChunksToProcess.map((t, i) => ({
          id: i,
          text: t,
          status: i < startChunkIndex ? 'completed' : 'pending'
        }));
        setAudioChunks(initialAudioChunks);
    }
    
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
  }, [text, voice, model, format, downloadBlob, previewChunks, startChunkIndex, projectName, audioChunks]);

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
    <div className="h-screen bg-white text-zinc-900 flex overflow-hidden font-sans selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* --- LEFT SIDEBAR: STUDIO CONTROLS (LIGHT MODE) --- */}
      <aside className="w-80 bg-white border-r border-zinc-200 flex flex-col z-20 shadow-xl flex-shrink-0 overflow-y-auto relative">
        
        {/* Header */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-zinc-100 bg-white sticky top-0 z-10">
           <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                <BookOpen size={18} />
           </div>
           <div>
               <h1 className="text-base font-bold text-zinc-900 tracking-tight leading-none">Audiobook</h1>
               <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Studio Gen 2.5</span>
           </div>
        </div>

        <div className="flex-1 p-5 space-y-6 overflow-y-auto">
            
            {/* API Key Status - Prominent & Light */}
            <div 
                onClick={() => setShowSettings(true)}
                className={`
                    p-3 rounded-xl border cursor-pointer transition-all group relative overflow-hidden
                    ${userApiKey || keyStatus === 'valid' 
                        ? 'bg-white border-indigo-200 hover:border-indigo-400 shadow-sm' 
                        : 'bg-amber-50 border-amber-200 hover:border-amber-300'}
                `}
            >
                <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">API Access</span>
                    <Settings size={14} className="text-zinc-400 group-hover:text-indigo-600 transition-colors" />
                </div>
                <div className="flex items-center gap-2">
                    {userApiKey ? (
                        <>
                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]" />
                            <span className="text-sm font-semibold text-zinc-700">Key Configured</span>
                        </>
                    ) : (
                        <>
                             <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                             <span className="text-sm font-semibold text-amber-700">Set API Key</span>
                        </>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <Zap size={12} /> Model & Format
                </h2>
                <div className="space-y-3">
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

            <div className="w-full h-px bg-zinc-100" />

            {/* Voice Group */}
            <div className="space-y-4">
                <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <Volume2 size={12} /> Voice Cast
                </h2>
                <VoiceSelector 
                    selectedVoice={voice} 
                    onVoiceChange={setVoice} 
                    disabled={generationState.isGenerating}
                    model={model}
                />
            </div>
            
            <div className="w-full h-px bg-zinc-100" />

            {/* Stats */}
            <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-100 space-y-3">
                 <div className="flex justify-between items-center text-xs">
                     <span className="text-zinc-500">Input Tokens</span>
                     <span className="font-mono text-zinc-700">{costStats.tokens.toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                     <span className="text-zinc-500">Est. Time</span>
                     <span className="font-mono text-zinc-700">~{costStats.minutes} min</span>
                 </div>
                 <div className="flex justify-between items-center text-xs pt-2 border-t border-zinc-200">
                     <span className="text-zinc-500">Est. Cost</span>
                     <span className="font-mono text-emerald-600 font-bold">${costStats.cost}</span>
                 </div>
            </div>
            
            {/* Bottom Padding */}
            <div className="h-8"></div>
        </div>
      </aside>

      {/* --- RIGHT MAIN AREA: MANUSCRIPT CANVAS --- */}
      <main className="flex-1 flex flex-col bg-stone-50 relative overflow-hidden">
        
        {/* Top Bar (Project Name & Actions) */}
        <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-8 flex-shrink-0 z-10">
            <div className="flex items-center gap-3 w-1/2">
                <LayoutTemplate className="text-zinc-300 w-5 h-5" />
                <input 
                    type="text" 
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="text-lg font-semibold text-zinc-800 bg-transparent outline-none placeholder:text-zinc-300 w-full hover:bg-stone-50 focus:bg-stone-50 rounded px-2 -ml-2 transition-colors truncate"
                    placeholder="Untitled Project"
                />
            </div>

            <div className="flex items-center gap-3">
                 {/* Generation Progress Indicator (Top Right) */}
                 {generationState.isGenerating && (
                     <div className="flex items-center gap-3 mr-4">
                         <div className="flex flex-col items-end">
                             <span className="text-xs font-bold text-indigo-600 uppercase">Generating</span>
                             <span className="text-[10px] text-zinc-400">Chunk {generationState.currentChunkIndex} / {generationState.totalChunks}</span>
                         </div>
                         <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                     </div>
                 )}

                 <button
                    onClick={handlePreviewChunks}
                    disabled={!text || generationState.isGenerating}
                    className="flex items-center gap-2 px-4 py-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg text-sm font-medium transition-all"
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
                            flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-white shadow-md shadow-indigo-200 transition-all
                            ${!text 
                                ? 'bg-zinc-300 cursor-not-allowed shadow-none' 
                                : 'bg-indigo-600 hover:bg-indigo-700 hover:translate-y-[-1px]'
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
                <div className="bg-white rounded-xl shadow-sm border border-stone-200 min-h-[600px] p-12 relative group transition-shadow hover:shadow-md">
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
                            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Processing Timeline</h3>
                            <span className="text-xs text-zinc-400">{previewChunks.length} Segments</span>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-2">
                            {previewChunks.map((chunkText, idx) => {
                                const chunkData = audioChunks[idx];
                                const isCompleted = idx < startChunkIndex || (chunkData?.status === 'completed');
                                const isGenerating = chunkData?.status === 'generating';
                                const isPending = !isCompleted && !isGenerating;
                                const isSelected = idx === startChunkIndex;
                                const hasImages = chunkData?.images && chunkData.images.length > 0;
                                const isGeneratingImages = chunkData?.isGeneratingImages;

                                return (
                                    <div 
                                        key={idx}
                                        className={`
                                            flex flex-col rounded-lg border transition-all overflow-hidden
                                            ${isSelected ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200' : 'bg-white border-stone-200 hover:border-stone-300'}
                                            ${isGenerating ? 'border-indigo-500 bg-indigo-50' : ''}
                                            ${isCompleted && !isSelected ? 'opacity-90 bg-stone-50' : ''}
                                        `}
                                    >
                                        <div 
                                            onClick={() => !generationState.isGenerating && setStartChunkIndex(idx)}
                                            className="flex items-start gap-4 p-3 cursor-pointer select-none"
                                        >
                                            <div className={`
                                                w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold shrink-0 transition-colors
                                                ${isCompleted ? 'bg-emerald-100 text-emerald-700' : ''}
                                                ${isGenerating ? 'bg-indigo-600 text-white animate-pulse' : ''}
                                                ${isPending && !isSelected ? 'bg-zinc-100 text-zinc-500' : ''}
                                                ${isSelected && !isGenerating ? 'bg-indigo-600 text-white' : ''}
                                            `}>
                                                {isCompleted ? <CheckCircle size={14}/> : (idx + 1)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-zinc-600 font-serif leading-relaxed line-clamp-2">{chunkText}</p>
                                            </div>
                                            {isSelected && !generationState.isGenerating && (
                                                <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded">Start Here</span>
                                            )}
                                        </div>

                                        {/* Image Generation Toolbar */}
                                        <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
                                            {/* Toolbar */}
                                            <div className="flex items-center gap-2 border-t border-zinc-100 pt-2">
                                                <select 
                                                    value={imageCounts[idx] || 1}
                                                    onChange={(e) => handleImageCountChange(idx, parseInt(e.target.value))}
                                                    className="text-xs border border-zinc-200 rounded px-2 py-1.5 bg-zinc-50 text-zinc-700 outline-none focus:border-indigo-400"
                                                >
                                                    {Array.from({length: 20}, (_, i) => i + 1).map(n => (
                                                        <option key={n} value={n}>{n} Image{n > 1 ? 's' : ''}</option>
                                                    ))}
                                                </select>

                                                <button
                                                    onClick={() => handleGenerateImages(idx)}
                                                    disabled={isGeneratingImages}
                                                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded border border-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isGeneratingImages ? <Loader2 className="w-3 h-3 animate-spin"/> : <ImageIcon className="w-3 h-3" />}
                                                    <span>Generate image of the chunk with Nanobana</span>
                                                </button>
                                            </div>

                                            {/* Generated Images Grid */}
                                            {hasImages && (
                                                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                                                    {chunkData.images!.map((img) => (
                                                        <div key={img.id} className="relative aspect-square group rounded-md overflow-hidden bg-zinc-100 border border-zinc-200">
                                                            <img 
                                                                src={img.data} 
                                                                alt="Generated illustration" 
                                                                className="w-full h-full object-cover transition-transform group-hover:scale-110"
                                                            />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <a 
                                                                    href={img.data} 
                                                                    download={`illustration_${idx}_${img.id}.png`}
                                                                    className="p-1.5 bg-white/90 text-zinc-900 rounded-full hover:bg-white"
                                                                    title="Download"
                                                                >
                                                                    <Download size={14} />
                                                                </a>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {isGeneratingImages && (
                                                        <div className="aspect-square rounded-md bg-zinc-50 border border-zinc-200 flex items-center justify-center">
                                                            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
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
            <div className="h-20 bg-white border-t border-zinc-200 flex items-center px-6 gap-6 shadow-2xl z-30 flex-shrink-0 animate-in slide-in-from-bottom-full duration-500">
                
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
                        <div className="flex items-center gap-2 text-emerald-600">
                             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                             <span className="text-sm font-bold">Generation Complete</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-indigo-600">
                             <Loader2 size={14} className="animate-spin" />
                             <span className="text-xs font-medium uppercase tracking-wide">Processing Audio...</span>
                        </div>
                    ))}
                </div>

                {/* Player Center - Light Theme for Player */}
                <div className="flex-1 max-w-2xl flex flex-col items-center justify-center gap-1">
                    <audio 
                        ref={audioRef}
                        src={previewUrl || (finalBlob ? URL.createObjectURL(finalBlob) : undefined)} 
                        controls 
                        autoPlay={!!previewUrl} // Only auto play previews, not final download
                        onEnded={handleAudioEnded}
                        className="w-full h-8" 
                    />
                    <div className="text-[10px] text-zinc-500 font-medium">
                        {previewUrl ? `Previewing Chunk ${previewChunkCount} / ${readyChunksCount} ready` : 'Full Audiobook Playback'}
                    </div>
                </div>

                {/* Actions Right */}
                <div className="w-1/4 flex justify-end gap-3">
                     {finalBlob && (
                        <button
                            onClick={downloadFinalAudio}
                            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            <Download size={16} />
                            <span>Download {format.toUpperCase()}</span>
                        </button>
                     )}
                </div>
            </div>
        )}

      </main>

      {/* Settings Modal (Refined Light Mode) */}
      {showSettings && (
          <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-zinc-100 scale-100">
                  <div className="px-6 py-5 border-b border-zinc-100 flex justify-between items-center bg-white">
                      <h3 className="font-bold text-lg text-zinc-900 flex items-center gap-2">
                          <Settings className="text-zinc-400" size={20} /> Settings
                      </h3>
                      <button onClick={() => setShowSettings(false)} className="p-2 -mr-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-full transition-colors">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="p-6 space-y-8">
                      {/* Paid Key Promo (Highlighted) */}
                      <div className="relative group">
                          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl opacity-75 blur transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                          <div className="relative bg-white rounded-xl p-6 ring-1 ring-zinc-900/5 leading-none space-y-4">
                              <div className="flex items-center gap-4">
                                  <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600">
                                      <ShieldCheck size={24} />
                                  </div>
                                  <div>
                                      <h4 className="font-bold text-zinc-900">High Volume Access</h4>
                                      <p className="text-xs text-zinc-500 mt-1">Avoid rate limits with a paid project key.</p>
                                  </div>
                              </div>
                              <button 
                                  onClick={handleSelectPaidKey}
                                  className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-lg text-sm transition-all shadow-lg shadow-zinc-200 flex items-center justify-center gap-2"
                              >
                                  <span>Select Paid API Key</span>
                                  <ChevronRight size={14} className="opacity-50" />
                              </button>
                              <div className="text-center">
                                  <a href="https://ai.google.dev/pricing" target="_blank" rel="noreferrer" className="text-[10px] text-zinc-400 hover:text-indigo-600 transition-colors">
                                      View Pricing & Limits
                                  </a>
                              </div>
                          </div>
                      </div>

                      {/* Manual Key Section */}
                      <div className="space-y-3">
                          <div className="flex items-center justify-between">
                               <label className="text-sm font-bold text-zinc-700">Manual API Key</label>
                               {/* Status Badge */}
                               <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${
                                  keyStatus === 'valid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                  keyStatus === 'invalid' ? 'bg-red-50 text-red-600 border-red-200' :
                                  keyStatus === 'validating' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                  'bg-zinc-100 text-zinc-400 border-zinc-200'
                               }`}>
                                  {keyStatus === 'idle' ? 'Not Set' : keyStatus}
                               </span>
                          </div>
                          
                          <div className="relative">
                              <input 
                                  type="password" 
                                  value={userApiKey}
                                  onChange={handleApiKeyChange}
                                  placeholder="Paste your Gemini API key..."
                                  className={`w-full pl-10 pr-24 py-3 rounded-xl border text-sm outline-none transition-all shadow-sm ${
                                      keyStatus === 'valid' ? 'border-emerald-500 focus:ring-emerald-200' : 
                                      keyStatus === 'invalid' ? 'border-red-300 focus:ring-red-100' :
                                      'border-zinc-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50'
                                  }`}
                              />
                              <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
                              
                              <button 
                                  onClick={testApiKey} 
                                  disabled={!userApiKey || keyStatus === 'validating'}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                  {keyStatus === 'validating' ? <Loader2 size={12} className="animate-spin"/> : 'Validate'}
                              </button>
                          </div>
                          {keyStatusMessage && (
                              <div className={`flex items-start gap-2 text-xs p-2 rounded-lg ${keyStatus === 'valid' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                  {keyStatus === 'valid' ? <CheckCircle size={14} className="shrink-0 mt-0.5"/> : <AlertTriangle size={14} className="shrink-0 mt-0.5"/>}
                                  {keyStatusMessage}
                              </div>
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