export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Aoede = 'Aoede',
  Leda = 'Leda',
  Zephyr = 'Zephyr',
}

export enum ModelId {
  Flash = 'gemini-2.5-flash-preview-tts',
  Pro = 'gemini-2.5-pro-preview-tts',
}

export type AudioFormat = 'wav' | 'mp3';

export interface GeneratedImage {
  id: string;
  data: string; // base64 url
}

export interface AudioChunk {
  id: number;
  text: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  data?: Uint8Array; // Raw PCM data (Int16)
  images?: GeneratedImage[];
  isGeneratingImages?: boolean;
}

export interface GenerationState {
  isGenerating: boolean;
  progress: number;
  totalChunks: number;
  currentChunkIndex: number;
  error?: string;
}

export const SAMPLE_RATE = 24000;
export const NUM_CHANNELS = 1;