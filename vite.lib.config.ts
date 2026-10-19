import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Library build: `npm run build:lib` → dist-lib/spore-map.js + spore-map.css + assets/layout.worker-*.js
// (+ types/). React and d3 are peer dependencies and stay external; the layout worker is emitted next
// to the module and referenced with `new URL("./assets/layout.worker-….js", import.meta.url)`, which
// Vite, webpack 5 and plain ESM all resolve relative to spore-map.js (the worker carries its own copy
// of d3-force, so it has no bare imports).
export default defineConfig({
  // base "./" makes the worker reference module-relative (new URL("assets/…", import.meta.url)); the default
  // base "/" would bake an absolute "/assets/…" path that only resolves on a host that copies the file there.
  base: "./",
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    lib: { entry: "src/lib.ts", formats: ["es"], fileName: "spore-map", cssFileName: "spore-map" },
    rollupOptions: { external: ["react", "react-dom", "react/jsx-runtime", "d3"] },
  },
  worker: { format: "es" },
});
