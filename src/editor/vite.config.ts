import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode, command }) => {
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
  const env = loadEnv(mode, projectRoot, "");
  const backendPort = Number(process.env.PORT || env.PORT || 3000);
  const vitePort = Number(process.env.VITE_PORT || env.VITE_PORT || 5173);
  const backendTarget = `http://127.0.0.1:${backendPort}`;

  return {
    // Dev server stays rooted at /; production is mounted by the Node server at /editor/.
    base: command === "build" ? "/editor/" : "/",
    plugins: [solid(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      port: vitePort,
      strictPort: true,
      proxy: {
        "/editor": {
          target: backendTarget,
          changeOrigin: true,
          ws: false,
        },
      },
    },
    preview: {
      host: "127.0.0.1",
      port: Number(process.env.VITE_PREVIEW_PORT || env.VITE_PREVIEW_PORT || 4173),
      strictPort: true,
      proxy: {
        "/editor": {
          target: backendTarget,
          changeOrigin: true,
          ws: false,
        },
      },
    },
    test: {
      include: ["tests/**/*.test.ts"],
      environment: "node",
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
