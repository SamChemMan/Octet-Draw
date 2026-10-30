// Builds web/namedemo.ts, Name to Structure for the Octet website, into dist-namedemo (copy it to octet-site/n2s).
// A plain build, not library mode, so the engine's data (Indigo's .wasm, OPSIN's data, the dictionary) stay files.
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  define: { __FEEDBACK__: "false" },
  optimizeDeps: { exclude: ["indigo-ketcher"] },
  build: {
    outDir: "dist-namedemo",
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 0,
    modulePreload: false,
    rollupOptions: { input: "web/namedemo.ts", preserveEntrySignatures: "exports-only", output: { entryFileNames: "namedemo.js", chunkFileNames: "[name]-[hash].js", assetFileNames: "[name]-[hash][extname]" } },
  },
});
