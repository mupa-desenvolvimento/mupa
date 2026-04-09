import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-192.png", "pwa-512.png", "favicon.ico"],
      strategies: "generateSW",
      manifest: {
        name: "Mupa Terminal",
        short_name: "Mupa",
        description: "Terminal de consulta e catálogo de preços",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        prefer_related_applications: false,
        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        shortcuts: [
          {
            name: "Abrir Terminal",
            short_name: "Terminal",
            description: "Acessar terminal de consulta",
            url: "/terminal",
            icons: [{ src: "pwa-192.png", sizes: "192x192" }]
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,jpg,jpeg,json}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*supabase.*\/rest\/v1\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: /^https:\/\/.*supabase.*\/functions\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'edge-functions-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 24 * 60 * 60,
              },
              networkTimeoutSeconds: 8,
            },
          },
          {
            urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
