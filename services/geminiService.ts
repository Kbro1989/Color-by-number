import { GoogleGenAI } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const API_BASE = "https://chromanumber-api.kristain33rs.workers.dev";

export const remixImage = async (
  base64Image: string,
  prompt: string,
  styleModifier: string,
  mimeType: string = 'image/png'
): Promise<string | null> => {
  try {
    const finalPrompt = `Redraw this image with the following changes: ${prompt}. ${styleModifier}. 
    Keep the composition clear and suitable for a color-by-numbers conversion. 
    Ensure distinct color regions and high contrast.`;

    const response = await fetch(`${API_BASE}/ai/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: finalPrompt })
    });

    if (!response.ok) throw new Error('Backend remix failed');
    const data = await response.json() as { image: string };
    return data.image;

  } catch (error) {
    console.error("Remix Error:", error);
    throw error;
  }
};

export const generateImageFromPrompt = async (prompt: string, styleModifier: string): Promise<string | null> => {
  try {
    const finalPrompt = `${prompt}. ${styleModifier}. Create a clear composition suitable for coloring.`;

    const response = await fetch(`${API_BASE}/ai/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: finalPrompt })
    });

    if (!response.ok) throw new Error('Backend generation failed');
    const data = await response.json() as { image: string };
    return data.image;

  } catch (error) {
    console.error("Generation Error:", error);
    throw error;
  }
};