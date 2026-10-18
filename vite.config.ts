import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],

  // Feedback (src/Feedback.tsx) is for testers (REL-8). OCTET_FEEDBACK=1 puts it in a build and OCTET_FEEDBACK=0
  // leaves it out; with neither, `npm run dev` has it and builds do not. src-tauri/build.rs reads the same.
  define: { __FEEDBACK__: JSON.stringify(process.env.OCTET_FEEDBACK ? process.env.OCTET_FEEDBACK === "1" : command === "serve") },

  // Pre-bundling breaks the relative URL Indigo uses to find its .wasm file.
  optimizeDeps: { exclude: ["indigo-ketcher"] },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
