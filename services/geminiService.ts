import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName } from "../types";

// Initialize the client
// NOTE: In a real environment, process.env.API_KEY is replaced by the bundler or runtime environment.
// The system prompt guarantees this is available.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
    console.error("Gemini API Error:", error);
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