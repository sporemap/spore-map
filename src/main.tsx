import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DEFAULT_API_BASE } from "./map/api";

// Where the API lives. VITE_API_BASE (set at build time, "" allowed) wins; otherwise the dev server
// uses its /api proxy (same origin, no CORS) and a production build talks to sporepad.com directly.
const env = import.meta.env.VITE_API_BASE as string | undefined;
const apiBase = env !== undefined ? env : import.meta.env.DEV ? "" : DEFAULT_API_BASE;

createRoot(document.getElementById("root")!).render(<StrictMode><App apiBase={apiBase} /></StrictMode>);
