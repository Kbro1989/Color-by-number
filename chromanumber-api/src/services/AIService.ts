
export class AIService {
    private env: Env;

    constructor(env: Env) {
        this.env = env;
    }

    async generateText(prompt: string): Promise<string> {
        try {
            // 1. Try Cloudflare Workers AI (Llama 3.3 is the latest balanced path)
            if (this.env.AI) {
                const response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct', {
                    messages: [
                        { role: 'system', content: 'You are an AI assistant specialized in color-by-numbers generation and image processing guidance.' },
                        { role: 'user', content: prompt }
                    ]
                });

                if (response && response.response) {
                    return response.response;
                }
            }
        } catch (error) {
            console.warn('Cloudflare AI failed, trying Gemini fallback...', error);
        }

        // 2. Fallback to Gemini API (Gemini 1.5 Flash)
        if (this.env.GEMINI_API_KEY) {
            return this.callGemini(prompt);
        }

        throw new Error('All AI services failed. Please check your credentials.');
    }

    async generateImage(prompt: string): Promise<string> {
        console.log("AIService: Starting Image Generation for prompt:", prompt.substring(0, 50) + "...");
        try {
            if (this.env.AI) {
                // Use Flux-1-Schnell (Premium quality, fast generation)
                const response: any = await this.env.AI.run(
                    "@cf/black-forest-labs/flux-1-schnell",
                    {
                        prompt,
                        num_steps: 4
                    }
                );

                // Handle binary or JSON response
                let base64 = '';
                if (response instanceof ReadableStream || response instanceof ArrayBuffer) {
                    const binaryData = await (response instanceof ReadableStream ? new Response(response).arrayBuffer() : response);
                    base64 = btoa(new Uint8Array(binaryData).reduce((data, byte) => data + String.fromCharCode(byte), ''));
                } else if (response.image) {
                    base64 = response.image;
                } else {
                    throw new Error("Unexpected AI response format: " + JSON.stringify(Object.keys(response)));
                }

                console.log("AIService: Image Generation Success (Flux)");
                return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
            }
        } catch (error: any) {
            console.error('AIService: Flux Generation failed:', error.message);
            // Fallback to SDXL if Flux fails
            try {
                if (this.env.AI) {
                    const response: any = await this.env.AI.run("@cf/stabilityai/stable-diffusion-xl-base-1.0", { prompt });
                    const binaryData = await (response instanceof ReadableStream ? new Response(response).arrayBuffer() : response);
                    const base64 = btoa(new Uint8Array(binaryData).reduce((data, byte) => data + String.fromCharCode(byte), ''));
                    console.log("AIService: Image Generation Success (SDXL Fallback)");
                    return `data:image/png;base64,${base64}`;
                }
            } catch (inner: any) {
                console.error('AIService: SDXL Fallback also failed:', inner.message);
            }
        }

        throw new Error('Image generation failed.');
    }

    private async callGemini(prompt: string): Promise<string> {
        // Upgraded to Gemini 1.5 Flash
        const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.env.GEMINI_API_KEY}`;

        try {
            const response = await fetch(GEMINI_API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        topP: 0.95,
                        topK: 40,
                        maxOutputTokens: 2048,
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
            }

            const data: any = await response.json();
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                return data.candidates[0].content.parts[0].text;
            }
            throw new Error('Unexpected Gemini response format');
        } catch (error) {
            console.error('Gemini API call failed:', error);
            throw error;
        }
    }
}
