import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName } from "../types";

// Initialize the client
// NOTE: In a real environment, process.env.API_KEY is replaced by the bundler or runtime environment.
// The system prompt guarantees this is available.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const handleGeminiError = (error: any) => {
  console.error("Gemini API Error:", error);

  let message = "An unexpected error occurred.";
  let isRateLimit = false;

  // Helper to check for rate limit keywords
  const checkRateLimit = (msg: string) => {
      return msg.includes('429') || 
             msg.includes('quota') || 
             msg.includes('RESOURCE_EXHAUSTED') || 
             msg.includes('Too Many Requests');
  };

  if (error instanceof Error) {
    message = error.message;
    // Attempt to parse JSON in message (SDK sometimes throws JSON string)
    try {
      if (message.trim().startsWith('{')) {
        const parsed = JSON.parse(message);
        if (parsed.error) {
          message = parsed.error.message || message;
          if (parsed.error.code === 429) isRateLimit = true;
        }
      }
    } catch (e) {}
  } else if (typeof error === 'object' && error !== null) {
      // Handle raw object errors if thrown directly
      if ((error as any).error) {
         const errObj = (error as any).error;
         message = errObj.message || JSON.stringify(errObj);
         if (errObj.code === 429) isRateLimit = true;
      } else {
         message = JSON.stringify(error);
      }
  } else {
      message = String(error);
  }

  // Fallback check on the final message string
  if (checkRateLimit(message)) {
      isRateLimit = true;
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
    // Basic prompt for translation
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Translate the following text into ${targetLanguage}. Do not include any explanations, prologue, or epilogue, just return the translated text:\n\n"${text}"`,
    });

    return response.text?.trim() || text;
  } catch (error) {
    console.error("Translation Error:", error);
    // Return original text on failure so user doesn't lose data
    return text;
  }
};