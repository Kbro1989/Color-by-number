import { init } from "@instantdb/react";

// The APP_ID should be provided by the user in .env.local as VITE_INSTANT_APP_ID
const APP_ID = import.meta.env.VITE_INSTANT_APP_ID;

if (!APP_ID || APP_ID === "your-instant-app-id") {
    console.warn("VITE_INSTANT_APP_ID is missing or invalid. InstantDB features may not work. Please add a valid UUID to your .env.local");
}

// Fallback to a valid-formatted UUID to avoid crashes during initialization
export const db = init({ appId: (APP_ID && APP_ID !== "your-instant-app-id") ? APP_ID : "00000000-0000-0000-0000-000000000000" });

// Expose to window for AI agent access as requested
if (typeof window !== "undefined") {
    (window as any).instant = db;
}
