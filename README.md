# Color-by-number — Generative Art Platform

> TypeScript · React · Vite · Cloudflare · InstantDB

Generative color-by-number art app with real-time multiplayer and authentication.
Multi-package repository containing the full platform stack.

## Packages

| Directory | Purpose |
|---|---|
| `chromanumber-api/` | Core API worker |
| `chromanumber-auth/` | OpenAuth authentication service |
| `chromanumber-realtime/` | Real-time collaboration via Durable Objects |
| `d1-template/` | D1 database schema + migrations |
| `multiplayer-globe-template/` | Globe visualization |
| `openauth-template/` | Auth template |

## Root Files

`App.tsx` · `index.tsx` · `types.ts` · `vite.config.ts` · `wrangler.toml` ·
`instant.perms.ts` · `instant.schema.ts` (InstantDB real-time schema)

## Stack

React + TypeScript · Vite · Cloudflare Workers · InstantDB · Tailwind CSS

```bash
npm run dev
wrangler deploy
```
