import { init } from "@instantdb/react";

// The APP_ID should be provided in .env.local as VITE_INSTANT_APP_ID
const APP_ID = import.meta.env.VITE_INSTANT_APP_ID || "af4e550c-12a0-400c-913e-610161182ee7";

export const db = init({ appId: APP_ID });

// Expose to window for AI agent access as requested
if (typeof window !== "undefined") {
    (window as any).instant = db;
}
