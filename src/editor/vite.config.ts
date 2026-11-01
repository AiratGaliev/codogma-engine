import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode, command }) => {
  loadEnv(mode, '..', '');
  return {
  // Dev server stays rooted at /; production is mounted by the Node server at /editor/.
  base: command === "build" ? "/editor/" : "/",
  plugins: [solid(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/editor": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        ws: false,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: {
      "/editor": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        ws: false,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  };
});
