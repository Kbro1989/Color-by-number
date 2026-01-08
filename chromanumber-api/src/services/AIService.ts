
export class AIService {
    private env: Env;

    constructor(env: Env) {
        this.env = env;
    }

    async generateText(prompt: string): Promise<string> {
        try {
            // 1. Try Cloudflare Workers AI
            if (this.env.AI) {
                const response = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant.' },
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

        // 2. Fallback to Gemini API
        if (this.env.GEMINI_API_KEY) {
            return this.callGemini(prompt);
        }

        throw new Error('All AI services failed. Please check your credentials.');
    }

    async generateImage(prompt: string): Promise<string> {
        try {
            if (this.env.AI) {
                // Use Stable Diffusion XL
                const response = await this.env.AI.run(
                    "@cf/stabilityai/stable-diffusion-xl-base-1.0",
                    { prompt }
                );

                // response is a ReadableStream or ArrayBuffer of the image
                const binaryData = await (response as any).arrayBuffer();
                const base64 = btoa(
                    new Uint8Array(binaryData)
                        .reduce((data, byte) => data + String.fromCharCode(byte), '')
                );

                return `data:image/png;base64,${base64}`;
            }
        } catch (error) {
            console.error('Cloudflare Image Generation failed:', error);
        }

        throw new Error('Image generation failed.');
    }

    private async callGemini(prompt: string): Promise<string> {
        const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.env.GEMINI_API_KEY}`;

        try {
            const response = await fetch(GEMINI_API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data: any = await response.json();

            // Parse Gemini response
            // Structure: candidates[0].content.parts[0].text
            if (data.candidates && data.candidates.length > 0 &&
                data.candidates[0].content &&
                data.candidates[0].content.parts &&
                data.candidates[0].content.parts.length > 0) {
                return data.candidates[0].content.parts[0].text;
            } else {
                throw new Error('Unexpected Gemini response format');
            }

        } catch (error) {
            console.error('Gemini API call failed:', error);
            throw error;
        }
    }
}
