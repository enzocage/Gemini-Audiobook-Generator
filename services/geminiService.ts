import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName } from "../types";

// State to hold dynamic user API key
let customApiKey: string | null = null;

export const setCustomApiKey = (key: string | null) => {
  if (key) {
    customApiKey = key.trim();
  } else {
    customApiKey = null;
  }
};

// Helper to get the client instance with the most current key
const getClient = () => {
  const key = customApiKey || process.env.API_KEY;
  if (!key) {
    // This might happen if env is missing and user hasn't set one
    throw new Error("API Key is missing. Please provide one in the settings.");
  }
  
  // Debug log (masked) to ensure we are using the expected key
  const masked = key.length > 4 ? `...${key.slice(-4)}` : 'INVALID';
  console.log(`[GeminiService] Using API Key ending in: ${masked}`);

  return new GoogleGenAI({ apiKey: key });
};

// New helper to test the key
export const validateApiKey = async (key: string): Promise<void> => {
    const testAi = new GoogleGenAI({ apiKey: key.trim() });
    try {
        // Try a very cheap/fast generation to validate the key
        await testAi.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: 'Ping' }] },
        });
    } catch (error: any) {
        // Re-throw with our normalized error handler to get the nice message
        handleGeminiError(error);
    }
};

const handleGeminiError = (error: any) => {
  let message = "An unexpected error occurred.";
  let isRateLimit = false;

  // Helper to check for rate limit keywords
  const checkRateLimit = (msg: string) => {
      const lowerMsg = msg.toLowerCase();
      return lowerMsg.includes('429') || 
             lowerMsg.includes('quota') || 
             lowerMsg.includes('resource_exhausted') || 
             lowerMsg.includes('too many requests');
  };

  if (error instanceof Error) {
    message = error.message;
    // Attempt to parse JSON in message (SDK sometimes throws JSON string)
    try {
      if (message.trim().startsWith('{')) {
        const parsed = JSON.parse(message);
        if (parsed.error) {
          message = parsed.error.message || message;
          if (parsed.error.code === 429 || parsed.error.status === 'RESOURCE_EXHAUSTED') {
             isRateLimit = true;
          }
        }
      }
    } catch (e) {}
  } else if (typeof error === 'object' && error !== null) {
      // Handle raw object errors if thrown directly
      if ((error as any).error) {
         const errObj = (error as any).error;
         message = errObj.message || JSON.stringify(errObj);
         if (errObj.code === 429 || errObj.status === 'RESOURCE_EXHAUSTED') {
            isRateLimit = true;
         }
      } else {
         message = JSON.stringify(error);
      }
  } else {
      message = String(error);
  }

  // Fallback check on the final message string
  if (!isRateLimit && checkRateLimit(message)) {
      isRateLimit = true;
  }
  
  // Log appropriate level
  if (isRateLimit) {
      console.warn("Gemini API Rate Limit Hit:", message);
  } else {
      console.error("Gemini API Error:", error);
  }

  const enhancedError = new Error(message);
  (enhancedError as any).isRateLimit = isRateLimit;
  throw enhancedError;
};

export const generateSpeechChunk = async (
  text: string,
  voice: VoiceName,
  model: string
): Promise<string> => {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { text: text }
        ]
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice,
            },
          },
        },
      },
    });

    // Extract inline data
    const candidate = response.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    
    if (!part || !part.inlineData || !part.inlineData.data) {
      throw new Error("No audio data returned from Gemini API");
    }

    return part.inlineData.data;
  } catch (error) {
    handleGeminiError(error);
    throw error;
  }
};

export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  try {
    const ai = getClient();
    // Basic prompt for translation
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Translate the following text into ${targetLanguage}. Do not include any explanations, prologue, or epilogue, just return the translated text:\n\n"${text}"`,
    });

    return response.text?.trim() || text;
  } catch (error) {
    console.warn("Translation failed (non-fatal):", error);
    // Return original text on failure so user doesn't lose data
    return text;
  }
};