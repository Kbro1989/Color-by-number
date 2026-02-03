import { init } from "@instantdb/react";

// The APP_ID should be provided by the user in .env.local as VITE_INSTANT_APP_ID
const APP_ID = import.meta.env.VITE_INSTANT_APP_ID;

if (!APP_ID) {
    console.warn("VITE_INSTANT_APP_ID is missing. InstantDB features may not work.");
}

export const db = init({ appId: APP_ID || "placeholder-id" });

// Expose to window for AI agent access as requested
if (typeof window !== "undefined") {
    (window as any).instant = db;
}
