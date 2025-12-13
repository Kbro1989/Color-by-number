import { GoogleGenAI } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const remixImage = async (
  base64Image: string,
  prompt: string,
  styleModifier: string,
  mimeType: string = 'image/png'
): Promise<string | null> => {
  try {
    // Clean base64 string if it has prefix
    const data = base64Image.replace(/^data:image\/\w+;base64,/, "");

    const modelId = 'gemini-2.5-flash-image';

    const finalPrompt = `Redraw this image with the following changes: ${prompt}. ${styleModifier}. 
    Keep the composition clear and suitable for a color-by-numbers conversion. 
    Ensure distinct color regions and high contrast.`;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            inlineData: {
              data: data,
              mimeType: mimeType,
            },
          },
          { text: finalPrompt },
        ],
      },
    });

    if (response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0].content.parts;
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }
    return null;

  } catch (error) {
    console.error("Gemini Remix Error:", error);
    throw error;
  }
};

export const generateImageFromPrompt = async (prompt: string, styleModifier: string): Promise<string | null> => {
  try {
    const modelId = 'gemini-2.5-flash-image';

    const finalPrompt = `${prompt}. ${styleModifier}. Create a clear composition suitable for coloring.`;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [{ text: finalPrompt }]
      }
    });

    if (response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0].content.parts;
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};