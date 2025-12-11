import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { BookOpen, Play, Download, Loader2, Sparkles, StopCircle, Scissors, Coins, ArrowRight, Volume2, X, Settings, Key, CheckCircle, AlertTriangle, ShieldCheck, Tag } from 'lucide-react';
import { VoiceName, ModelId, AudioChunk, GenerationState, AudioFormat } from './types';
import { createSmartChunks, base64ToUint8Array, concatenateAudioBuffers, createWavFile, createMp3File } from './utils/audioUtils';
import { generateSpeechChunk, setCustomApiKey, validateApiKey } from './services/geminiService';
import VoiceSelector from './components/VoiceSelector';
import ModelSelector from './components/ModelSelector';
import FormatSelector from './components/FormatSelector';
import TextInput from './components/TextInput';

const App: React.FC = () => {
  const [projectName, setProjectName] = useState<string>('my project');
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
    // Note: We don't set it in service/storage immediately to avoid half-typed keys breaking things,
    // but the previous behavior was instant. Let's keep it instant but trimmed.
    const trimmed = key.trim();
    setCustomApiKey(trimmed);
    setKeyStatus('idle'); // Reset validation status on change
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
    // Flash: ~$0.10 / 1M input (Text) | Output is complex, assuming roughly equal audio generation cost factor for estimation
    // Pro: ~$1.25 / 1M input
    const pricingPerMillion = model === ModelId.Flash ? 0.10 : 1.25;
    const estimatedCost = (estimatedTokens / 1_000_000) * pricingPerMillion;

    return {
      tokens: estimatedTokens,
      cost: estimatedCost.toFixed(6), // Show high precision for small texts
      currency: '$'
    };
  }, [text, model]);

  // Clear preview if text changes significantly? 
  // For now, we keep it but reset start index if text changes to avoid out of bounds
  useEffect(() => {
    setStartChunkIndex(0);
    setPreviewChunks([]); // Clear chunks when text changes to force re-preview
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
        setPreviewUrl(null); // Clear preview when final is ready
        setPreviewChunkCount(0);
    }
  }, [format, audioChunks, generationState.isGenerating, generateBlobFromChunks]);

  // Clean up preview URL
  useEffect(() => {
      return () => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
      };
  }, [previewUrl]);

  // Auto-resume logic
  useEffect(() => {
    if (previewUrl && autoResumeRef.current.shouldResume && audioRef.current) {
        const { startTime } = autoResumeRef.current;
        const player = audioRef.current;
        
        // Small timeout to ensure DOM is ready with new source
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

      // Use WAV for preview as it's faster to generate (no encoding overhead)
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
      // Check if there are more chunks available than currently playing
      const completedCount = audioChunks.filter(c => c.status === 'completed' && c.data).length;
      
      if (completedCount > previewChunkCount) {
          // Calculate current duration (which is the end of the previous file)
          // We use the player's duration because we are at the end
          const currentDuration = audioRef.current?.duration || 0;
          
          // Regenerate and resume
          console.log(`Auto-switching to new chunks. Resuming at ${currentDuration}s`);
          updatePreviewSource(true, currentDuration);
      }
  };

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) return;

    // Reset State
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

    // Use existing preview chunks if available, otherwise generate them
    let textChunksToProcess = previewChunks.length > 0 
      ? previewChunks 
      : createSmartChunks(text, 2000);

    // Initialize chunks
    const initialAudioChunks: AudioChunk[] = textChunksToProcess.map((t, i) => ({
      id: i,
      text: t,
      status: i < startChunkIndex ? 'completed' : 'pending'
    }));

    setAudioChunks(initialAudioChunks);
    
    const totalToGenerate = textChunksToProcess.length - startChunkIndex;
    setGenerationState(prev => ({ ...prev, totalChunks: textChunksToProcess.length }));

    const collectedBuffers: Uint8Array[] = [];
    
    // Adaptive Throttling: Start with 2s delay. If we hit limits, we bump this up.
    // 2000ms is generally safe for paid tiers. For free tier (15 RPM), we might need 4000ms.
    // We'll auto-adjust if we hit a 429.
    let interChunkDelay = 2000;

    const safeProjectName = projectName.trim() || 'my project';

    try {
      // Loop starting from the selected index
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
                 // If successful, clear any previous error displayed
                 setGenerationState(prev => ({ ...prev, error: undefined }));
             } catch (err: any) {
                 const isRateLimit = err?.isRateLimit === true;
                 const errorMessage = err?.message || "Unknown error";
                 
                 console.warn(`Attempt ${attempts + 1} failed for chunk ${i + 1}. Rate Limit Detected: ${isRateLimit}`, errorMessage);
                 
                 // ADAPTIVE THROTTLING:
                 // If we hit a rate limit, permanently slow down the rest of the generation process
                 if (isRateLimit) {
                     // 6000ms is 6 seconds. This limits us to ~10 RPM, which is safe for the 15 RPM Free Tier limit.
                     interChunkDelay = 6000;
                 }

                 attempts++;
                 
                 if (!isRateLimit && attempts >= 3) {
                      throw new Error(`Failed to generate part ${i + 1}. ${errorMessage}`);
                 }
                 
                 if (attempts >= maxRetries) {
                     const friendlyError = isRateLimit 
                         ? "Quota exceeded (Rate Limit). Aborting after multiple attempts." 
                         : errorMessage;
                     throw new Error(`Failed to generate part ${i + 1}. ${friendlyError}`);
                 }

                 // Backoff Strategy
                 let delay = 2000 * Math.pow(1.5, attempts); 
                 
                 if (isRateLimit) {
                     delay = 10000 + (attempts * 5000); 
                     setGenerationState(prev => ({ 
                         ...prev, 
                         error: `Rate limit hit. Cooling down for ${delay/1000}s... (Safe Mode Activated)` 
                     }));
                 } else {
                     setGenerationState(prev => ({ 
                         ...prev, 
                         error: `Error encountered. Retrying chunk ${i + 1} in ${Math.round(delay/1000)}s...` 
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

        // Inter-chunk delay to respect quotas
        if (i < textChunksToProcess.length - 1) {
            // Show pacing message if delay is significant (Safe Mode)
            if (interChunkDelay > 3000) {
                setGenerationState(prev => ({ ...prev, error: `Pacing requests to avoid limits (${interChunkDelay/1000}s wait)...` }));
            }
            await new Promise(resolve => setTimeout(resolve, interChunkDelay));
            // Clear message if it was just pacing
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

          try {
             const finalFilename = `${safeProjectName}_complete.${format}`;
             downloadBlob(blob, finalFilename);
          } catch (downloadErr) {
             console.error("Failed to auto-download final file", downloadErr);
          }
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
      const safeProjectName = projectName.trim() || 'my project';
      downloadBlob(finalBlob, `${safeProjectName}-complete-${new Date().getTime()}.${format}`);
  };

  // Compute number of ready chunks
  const readyChunksCount = useMemo(() => {
      return audioChunks.filter(c => c.status === 'completed' && c.data).length;
  }, [audioChunks]);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="bg-blue-600 p-2 rounded-lg text-white">
                     <BookOpen size={20} />
                </div>
                <h1 className="text-xl font-bold text-slate-800 tracking-tight hidden sm:block">Gemini Audiobook</h1>
                <h1 className="text-xl font-bold text-slate-800 tracking-tight sm:hidden">Audiobook</h1>
            </div>
            <div className="flex items-center gap-3">
                 <div className="hidden md:flex items-center gap-2 text-xs font-mono bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full border border-slate-200">
                    <Coins size={12} className="text-amber-500"/>
                    <span>Est. Cost: ${costStats.cost}</span>
                    <span className="text-slate-300">|</span>
                    <span>{costStats.tokens.toLocaleString()} toks</span>
                 </div>
                 
                 <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${userApiKey ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200'}`}
                 >
                     <Settings size={14} />
                     <span>{userApiKey ? 'Custom Key Active' : 'API Settings'}</span>
                 </button>
            </div>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
          <div className="bg-slate-100 border-b border-slate-200 animate-in slide-in-from-top-2">
              <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                  <div className="flex flex-col gap-2">
                      <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                          <Key size={16} />
                          Custom Gemini API Key
                      </label>
                      <div className="flex gap-2 items-start">
                          <div className="flex-1 flex flex-col gap-1">
                              <input 
                                  type="password" 
                                  value={userApiKey}
                                  onChange={handleApiKeyChange}
                                  placeholder="Enter your AIza... key here"
                                  className={`
                                    w-full px-4 py-2 rounded-lg border focus:ring-2 outline-none text-sm font-mono transition-colors
                                    ${keyStatus === 'valid' ? 'border-green-300 focus:border-green-500 focus:ring-green-100' : ''}
                                    ${keyStatus === 'invalid' ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : ''}
                                    ${keyStatus === 'idle' || keyStatus === 'validating' ? 'border-slate-300 focus:border-blue-500 focus:ring-blue-100' : ''}
                                  `}
                              />
                              {keyStatusMessage && (
                                  <span className={`text-xs flex items-center gap-1 ${keyStatus === 'valid' ? 'text-green-600' : 'text-red-600'}`}>
                                      {keyStatus === 'valid' ? <CheckCircle size={12}/> : <AlertTriangle size={12}/>}
                                      {keyStatusMessage}
                                  </span>
                              )}
                          </div>
                          <button 
                              onClick={testApiKey}
                              disabled={!userApiKey || keyStatus === 'validating'}
                              className="px-4 py-2 bg-blue-600 border border-blue-700 rounded-lg text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                              {keyStatus === 'validating' ? <Loader2 size={16} className="animate-spin" /> : "Test Key"}
                          </button>
                          <button 
                              onClick={() => setShowSettings(false)}
                              className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                              Close
                          </button>
                      </div>
                      <p className="text-xs text-amber-600 font-medium mt-1">
                          Warning: Using your own key means you will be billed for usage on your Google Cloud account. 
                          Check your billing limits. Extra costs may apply.
                      </p>
                  </div>
              </div>
          </div>
      )}

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Intro Section */}
        <section className="text-center space-y-2 max-w-2xl mx-auto mb-8">
            <h2 className="text-3xl font-bold text-slate-900">Turn Text into Lifelike Speech</h2>
            <p className="text-slate-500">
                Generate high-quality audiobooks from text using Google's latest AI models. 
                Select a model and voice, paste your script, and let Gemini narrate for you.
            </p>
        </section>

        {/* Controls */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

            <VoiceSelector 
                selectedVoice={voice} 
                onVoiceChange={setVoice} 
                disabled={generationState.isGenerating}
                model={model}
            />

            <div className="space-y-4">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        Project Name
                    </label>
                    <input 
                        type="text" 
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        disabled={generationState.isGenerating}
                        placeholder="my project"
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition-all text-slate-700 placeholder:text-slate-400"
                    />
                </div>

                <TextInput 
                    text={text} 
                    onTextChange={setText} 
                    disabled={generationState.isGenerating}
                />
                
                {/* Chunk Preview Controls */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                     <div className="flex items-center gap-4 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                             <Coins className="w-4 h-4 text-amber-500" />
                             <span className="font-semibold">Est. {costStats.tokens.toLocaleString()} Tokens</span>
                        </div>
                        <span className="text-slate-300">|</span>
                        <div>
                             ~${costStats.cost} USD
                        </div>
                        {userApiKey && (
                            <div className="flex items-center gap-1 text-blue-600 font-medium">
                                <ShieldCheck className="w-3 h-3" />
                                Custom Key Active
                            </div>
                        )}
                     </div>
                     <button
                        onClick={handlePreviewChunks}
                        disabled={!text || generationState.isGenerating}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 shadow-sm rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                     >
                        <Scissors className="w-4 h-4" />
                        Chunk Now (Preview)
                     </button>
                </div>
            </div>

            {/* Chunk List Selection */}
            {previewChunks.length > 0 && (
                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-100 flex justify-between items-center">
                        <h3 className="text-sm font-semibold text-slate-700">Chunk Preview & Start Selection</h3>
                        <span className="text-xs text-slate-500">{previewChunks.length} chunks total</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2 space-y-2">
                        {previewChunks.map((chunkText, idx) => {
                            const isSkipped = idx < startChunkIndex;
                            const isSelected = idx === startChunkIndex;
                            return (
                                <div 
                                    key={idx}
                                    onClick={() => !generationState.isGenerating && setStartChunkIndex(idx)}
                                    className={`
                                        group flex items-start gap-3 p-3 rounded-lg border text-sm transition-all cursor-pointer relative
                                        ${isSelected 
                                            ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 z-10' 
                                            : 'bg-white hover:border-blue-300 border-slate-200'
                                        }
                                        ${isSkipped ? 'opacity-40 bg-slate-100' : ''}
                                    `}
                                >
                                    <div className={`
                                        flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                                        ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}
                                    `}>
                                        {idx + 1}
                                    </div>
                                    <p className="line-clamp-2 text-slate-600 flex-1">{chunkText}</p>
                                    
                                    {!isSkipped && !isSelected && (
                                        <div className="opacity-0 group-hover:opacity-100 absolute right-2 top-1/2 -translate-y-1/2 bg-white shadow-lg border border-slate-200 px-2 py-1 rounded text-xs text-blue-600 font-medium">
                                            Start Here
                                        </div>
                                    )}
                                    
                                    {isSelected && (
                                         <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-blue-600 text-xs font-bold bg-blue-50 px-2 py-1 rounded">
                                            Starting Chunk <ArrowRight size={12}/>
                                         </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}


            {/* Error Message */}
            {generationState.error && (
                <div className={`
                    p-4 rounded-lg border text-sm animate-pulse flex items-center gap-2
                    ${generationState.error.includes("Pacing") || generationState.error.includes("Cooling")
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }
                `}>
                    {generationState.error.includes("Pacing") ? <Loader2 className="w-4 h-4 animate-spin"/> : <AlertTriangle className="w-4 h-4"/>}
                    <strong>Status:</strong> {generationState.error}
                </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                <div className="flex-1 w-full space-y-3">
                    {generationState.isGenerating && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                <span>Generating Chunk {generationState.currentChunkIndex} of {generationState.totalChunks}</span>
                                <span>{Math.round(generationState.progress)}%</span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-blue-600 transition-all duration-300 ease-out"
                                    style={{ width: `${generationState.progress}%` }}
                                />
                            </div>
                            <div className="text-[10px] text-slate-400 text-center pt-1">
                                Auto-downloading chunks for safety...
                            </div>
                        </div>
                    )}
                    
                    {/* Real-time Preview Player (Shown when generating or stopped but not finished) */}
                    {(generationState.isGenerating || (!finalBlob && readyChunksCount > 0)) && (
                         <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex flex-col gap-2">
                             {!previewUrl ? (
                                <button 
                                    onClick={handlePlayPreview}
                                    disabled={readyChunksCount === 0}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wide rounded hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Volume2 size={14} />
                                    {readyChunksCount > 0 ? `Play ${readyChunksCount} Rendered Chunks` : 'Waiting for chunks...'}
                                </button>
                             ) : (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <audio 
                                        ref={audioRef}
                                        src={previewUrl} 
                                        controls 
                                        autoPlay 
                                        onEnded={handleAudioEnded}
                                        className="flex-1 h-8 block w-full" 
                                    />
                                    <button 
                                        onClick={handleClosePreview}
                                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
                                        title="Close Preview"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                             )}
                             {previewUrl && (
                                 <div className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
                                     <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                     Listening to {previewChunkCount} chunks (Auto-updates when you finish listening)
                                 </div>
                             )}
                         </div>
                    )}

                    {!generationState.isGenerating && finalBlob && (
                         <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-2 rounded-lg text-sm font-medium border border-green-100">
                             <Sparkles className="w-4 h-4" />
                             Audiobook Ready! ({((finalBlob.size / 1024) / 1024).toFixed(2)} MB - {format.toUpperCase()})
                         </div>
                    )}
                </div>

                <div className="flex gap-3 w-full sm:w-auto">
                     {generationState.isGenerating ? (
                         <button
                            onClick={handleStop}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-red-100 text-red-700 font-semibold rounded-xl hover:bg-red-200 transition-colors"
                        >
                            <StopCircle size={20} />
                            Stop
                        </button>
                     ) : (
                        <button
                            onClick={handleGenerate}
                            disabled={!text || generationState.isGenerating}
                            className={`
                                flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-semibold text-white shadow-lg shadow-blue-200 transition-all
                                ${!text 
                                    ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                                    : 'bg-blue-600 hover:bg-blue-700 hover:scale-[1.02]'
                                }
                            `}
                        >
                            {generationState.isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />}
                            {startChunkIndex > 0 ? `Generate from Chunk ${startChunkIndex + 1}` : 'Generate Audiobook'}
                        </button>
                     )}
                </div>
            </div>
        </section>

        {/* Results Section */}
        {finalBlob && (
            <section className="bg-white rounded-2xl shadow-lg border border-slate-200 p-1">
                 <div className="p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 justify-between bg-slate-50/50 rounded-xl">
                    <div className="flex items-center gap-4 w-full">
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0">
                            <Play className="fill-current w-5 h-5 ml-1" />
                        </div>
                        <div className="w-full">
                            <audio 
                                controls 
                                className="w-full h-10 block" 
                                src={URL.createObjectURL(finalBlob)} 
                            />
                        </div>
                    </div>
                    <button
                        onClick={downloadFinalAudio}
                        className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-colors"
                    >
                        <Download size={18} />
                        Download .{format.toUpperCase()}
                    </button>
                 </div>
            </section>
        )}

        {/* Debug/Chunk View (Processing) */}
        {audioChunks.length > 0 && (
             <section className="space-y-4">
                 <h3 className="text-lg font-semibold text-slate-800 px-1">Processing Details</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                     {audioChunks.map((chunk) => (
                         <div 
                            key={chunk.id} 
                            className={`
                                p-4 rounded-xl border text-sm transition-colors
                                ${chunk.status === 'completed' && chunk.data ? 'bg-white border-green-200 shadow-sm' : ''}
                                ${chunk.status === 'completed' && !chunk.data ? 'bg-slate-100 border-slate-200 text-slate-400' : ''} 
                                ${chunk.status === 'generating' ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100' : ''}
                                ${chunk.status === 'pending' ? 'bg-slate-50 border-slate-100 text-slate-400' : ''}
                                ${chunk.status === 'error' ? 'bg-red-50 border-red-200' : ''}
                            `}
                        >
                             <div className="flex justify-between items-center mb-2">
                                 <span className="font-medium text-slate-500">Chunk {chunk.id + 1}</span>
                                 <span className={`
                                     text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider
                                     ${chunk.status === 'completed' && chunk.data ? 'text-green-700 bg-green-100' : ''}
                                     ${chunk.status === 'completed' && !chunk.data ? 'text-slate-500 bg-slate-200' : ''}
                                     ${chunk.status === 'generating' ? 'text-blue-700 bg-blue-100' : ''}
                                     ${chunk.status === 'pending' ? 'text-slate-500 bg-slate-200' : ''}
                                     ${chunk.status === 'error' ? 'text-red-700 bg-red-100' : ''}
                                 `}>
                                     {chunk.status === 'completed' && !chunk.data ? 'SKIPPED' : chunk.status}
                                 </span>
                             </div>
                             <p className="line-clamp-3 text-slate-600">{chunk.text}</p>
                         </div>
                     ))}
                 </div>
             </section>
        )}
      </main>
    </div>
  );
};

export default App;