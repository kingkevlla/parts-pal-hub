import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Use relative paths for Electron compatibility
  base: mode === 'production' ? './' : '/',
  server: {
    host: "::",
    port: 8080,
    headers: {
      // Helpful for OPFS in dev (harmless if not isolated). Note: not applied
      // on hosted lovable.app — AccessHandlePoolVFS does not require isolation.
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  optimizeDeps: {
    // wa-sqlite ships wasm + worker-style modules that break dep pre-bundling.
    exclude: ["wa-sqlite"],
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
