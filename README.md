# Matheta Showcase (Static Demo)

This folder is a showcase-friendly copy of the original Matheta project.

Goals:
- Host as a static website (Netlify-friendly).
- No backend or database required.
- Keep the real-time pages present as a "this is what would happen" feature (they will only work if you later deploy a socket backend).

## Demo Mode vs Real Backend

- If `VITE_API_BASE_URL` is NOT set: the app uses an in-browser demo API (`src/lib/demoApi.js`) backed by a small static dataset (`src/lib/mockDb.js`).
- If `VITE_API_BASE_URL` IS set: the app will call your real backend.

All HTTP calls go through `src/lib/http.js`.

## Run Locally

1. `npm install`
2. `npm run dev`

## Netlify Deploy

This repo includes `netlify.toml` with:
- Build command: `npm run build`
- Publish directory: `dist`
- SPA redirect to `index.html`

## Demo Credentials

- Teacher: `teacher@demo.com` / `password123`
- Student: `student1@demo.com` / `password123`
