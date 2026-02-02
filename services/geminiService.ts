import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const getGeminiResponse = async (
  userPrompt: string, 
  context: string, 
  modelName: string = 'gemini-3-flash-preview'
) => {
  if (!apiKey) throw new Error("API Key not found");

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
