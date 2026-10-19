import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The demo page. `base: "./"` makes the built files relocatable (GitHub Pages serves them under
// /<repo>/). In development `/api` is proxied to the public Spore API so the page runs same-origin
// without CORS; the production build calls the API by absolute URL instead (VITE_API_BASE, see
// src/main.tsx).
const API = process.env.VITE_API_BASE || "https://sporepad.com";
// Both the dev server and `vite preview` forward /api to the Spore API, so a build made with
// VITE_API_BASE= (same-origin /api) can be checked locally without CORS.
const proxy = { "/api": { target: API, changeOrigin: true, secure: true } };
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5260, proxy },
  preview: { port: 5261, proxy },
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 1500 },
});
