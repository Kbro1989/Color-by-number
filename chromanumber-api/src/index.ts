import { renderHtml } from "./renderHtml";
import { AIService } from "./services/AIService";

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		// Dynamic CORS Headers
		const origin = request.headers.get("Origin") || "*";
		const corsHeaders = {
			"Access-Control-Allow-Origin": origin,
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
			"Access-Control-Max-Age": "86400",
			"Vary": "Origin",
		};

		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: corsHeaders
			});
		}

		// AI Generation Endpoint
		if (url.pathname === "/ai/generate" && request.method === "POST") {
			try {
				const body = await request.json() as { prompt: string };
				if (!body.prompt) {
					return new Response("Missing prompt", { status: 400, headers: corsHeaders });
				}

				const aiService = new AIService(env);
				const result = await aiService.generateText(body.prompt);

				return new Response(JSON.stringify({ response: result }), {
					headers: { ...corsHeaders, "Content-Type": "application/json" },
				});
			} catch (error: any) {
				return new Response(JSON.stringify({ error: error.message }), {
					status: 500,
					headers: { ...corsHeaders, "Content-Type": "application/json" },
				});
			}
		}

		// AI Image Generation Endpoint
		if (url.pathname === "/ai/generate-image" && request.method === "POST") {
			try {
				const body = await request.json() as { prompt: string };
				if (!body.prompt) {
					return new Response("Missing prompt", { status: 400, headers: corsHeaders });
				}

				const aiService = new AIService(env);
				const result = await aiService.generateImage(body.prompt);

				return new Response(JSON.stringify({ image: result }), {
					headers: { ...corsHeaders, "Content-Type": "application/json" },
				});
			} catch (error: any) {
				return new Response(JSON.stringify({ error: error.message }), {
					status: 500,
					headers: { ...corsHeaders, "Content-Type": "application/json" },
				});
			}
		}

		// Existing logic (comments DB)
		if (url.pathname === "/") {
			const stmt = env.DB.prepare("SELECT * FROM comments LIMIT 3");
			const { results } = await stmt.all();

			return new Response(renderHtml(JSON.stringify(results, null, 2)), {
				headers: {
					"content-type": "text/html",
					...corsHeaders
				},
			});
		}

		return new Response("Not Found", { status: 404, headers: corsHeaders });
	},
} satisfies ExportedHandler<Env>;
