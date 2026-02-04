
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";

export const getGeminiResponse = async (
  userPrompt: string, 
  context: string
) => {
  // 1. Try Local Storage Settings first, then env, then fallback
  const storedKey = localStorage.getItem('dys_gemini_key');
  const storedModel = localStorage.getItem('dys_gemini_model');
  
  const apiKey = storedKey || process.env.API_KEY || '';
  const modelName = storedModel || 'gemini-2.5-flash-preview-09-2025';

  if (!apiKey) throw new Error("API Key not configured. Please add it in Settings.");

  const ai = new GoogleGenAI({ apiKey });

  const fullPrompt = `
  ${SYSTEM_PROMPT}
  
  CURRENT CONTEXT:
  ${context}

  USER QUERY:
  ${userPrompt}
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: fullPrompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
};
