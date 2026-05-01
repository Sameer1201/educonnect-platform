import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

const basePath = process.env.BASE_PATH ?? "/";
const apiProxyTarget =
  process.env.API_PROXY_TARGET ??
  process.env.VITE_API_PROXY_TARGET ??
  (process.env.RAILWAY_ENVIRONMENT ? "http://rankpulse.railway.internal:8080" : "http://localhost:8080");

const apiProxy = {
  "/api": {
    target: apiProxyTarget,
    changeOrigin: true,
    secure: false,
    ws: true,
  },
};

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["pdfjs-dist"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "react-vendor";
          }
          if (id.includes("/@tanstack/") || id.includes("/wouter/")) {
            return "app-vendor";
          }
          if (id.includes("/@radix-ui/") || id.includes("/class-variance-authority/") || id.includes("/tailwind-merge/")) {
            return "ui-vendor";
          }
          if (id.includes("/recharts/") || id.includes("/victory-vendor/")) {
            return "charts-vendor";
          }
          if (id.includes("/framer-motion/")) {
            return "motion-vendor";
          }
          if (id.includes("/pdfjs-dist/")) {
            return "pdf-vendor";
          }
          if (id.includes("/date-fns/") || id.includes("/lucide-react/")) {
            return "common-vendor";
          }
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      ...apiProxy,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      ...apiProxy,
    },
  },
});
