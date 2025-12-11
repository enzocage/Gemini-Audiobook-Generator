import { SAMPLE_RATE, NUM_CHANNELS } from '../types';

/**
 * Splits text into sentences using regex similar to the Python script.
 * Looks for . ! ? followed by whitespace.
 */
export const splitIntoSentences = (text: string): string[] => {
  const cleanedText = text.replace(/\s+/g, ' ').trim();
  // Split using lookbehind for sentence terminators
  // JS regex lookbehind support is good in modern browsers
  // Fallback split logic if complex regex causes issues, but this is standard now.
  const sentences = cleanedText.split(/(?<=[.!?])\s+/);
  return sentences.filter(s => s.trim().length > 0);
};

/**
 * Groups sentences into chunks that do not exceed maxChars.
 */
export const createSmartChunks = (text: string, maxChars: number = 2000): string[] => {
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length + 1 <= maxChars) {
      currentChunk += (currentChunk ? " " : "") + sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // If a single sentence is huge (unlikely but possible), it becomes its own chunk
      currentChunk = sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
};

/**
 * Decodes a base64 string into a Uint8Array.
 */
export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Concatenates multiple Uint8Arrays (Raw PCM Int16 data) into one.
 */
export const concatenateAudioBuffers = (buffers: Uint8Array[]): Uint8Array => {
  const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buffer of buffers) {
    result.set(buffer, offset);
    offset += buffer.length;
  }
  return result;
};

/**
 * Writes a WAV header for the given PCM data.
 * Assumes 16-bit PCM, Monophonic, 24kHz (default Gemini output).
 */
export const createWavFile = (pcmData: Uint8Array): Blob => {
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length, true); // ChunkSize
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, NUM_CHANNELS, true); // NumChannels
  view.setUint32(24, SAMPLE_RATE, true); // SampleRate
  view.setUint32(28, SAMPLE_RATE * NUM_CHANNELS * 2, true); // ByteRate
  view.setUint16(32, NUM_CHANNELS * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, pcmData.length, true); // Subchunk2Size

  const blob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });
  return blob;
};

// Define global type for lamejs since we load it via script tag
declare global {
  interface Window {
    lamejs: any;
  }
}

/**
 * Encodes PCM data to MP3 using lamejs
 */
export const createMp3File = (pcmData: Uint8Array): Blob => {
  if (!window.lamejs) {
    throw new Error("MP3 encoder library (lamejs) failed to load.");
  }

  // Ensure we are working with 16-bit samples
  const samples = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
  
  // Initialize encoder: 1 channel, 24000 Hz, 128kbps
  const mp3encoder = new window.lamejs.Mp3Encoder(NUM_CHANNELS, SAMPLE_RATE, 128);
  const mp3Data: Uint8Array[] = [];
  
  // Use a block size that is a multiple of 576 or 1152 for efficiency, 
  // but lamejs handles chunking. We chunk to avoid blocking UI too much if we were async,
  // but here we just process.
  const blockSize = 1152; 
  
  for (let i = 0; i < samples.length; i += blockSize) {
    const sampleChunk = samples.subarray(i, i + blockSize);
    const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }
  
  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  return new Blob(mp3Data, { type: 'audio/mp3' });
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * Helper to play raw PCM buffer in browser for preview
 */
export const playAudioBuffer = async (pcmData: Uint8Array, context: AudioContext): Promise<void> => {
  // Convert Int16 bytes to Float32 for Web Audio API
  const int16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }

  const audioBuffer = context.createBuffer(NUM_CHANNELS, float32.length, SAMPLE_RATE);
  audioBuffer.copyToChannel(float32, 0);

  const source = context.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(context.destination);
  source.start();
};