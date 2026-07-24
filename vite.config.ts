import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icons/*.svg',
          'offline.html',
        ],
        manifest: {
          name: 'NexaStock SaaS - Gestion de Stock & Ventes',
          short_name: 'NexaStock',
          description: 'Plateforme SaaS de gestion de stock, ventes, facturation et ERP multi-tenant.',
          theme_color: '#030712',
          background_color: '#030712',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          lang: 'fr-FR',
          dir: 'ltr',
          categories: ['business', 'productivity', 'finance'],
          prefer_related_applications: false,
          iarc_rating_id: 'e8c5c2d2-8b0f-4e7f-9a3d-1b2c3d4e5f6a',
          icons: [
            {
              src: '/icons/icon-192x192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icons/icon-512x512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icons/icon-maskable.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
          screenshots: [],
          shortcuts: [
            {
              name: 'Tableau de bord',
              short_name: 'Dashboard',
              description: 'Accéder au tableau de bord',
              url: '/?tab=dashboard',
              icons: [{ src: '/icons/icon-192x192.svg', sizes: '192x192' }],
            },
            {
              name: 'Nouvelle vente',
              short_name: 'Vente',
              description: 'Ouvrir la caisse POS',
              url: '/?tab=pos',
              icons: [{ src: '/icons/icon-192x192.svg', sizes: '192x192' }],
            },
            {
              name: 'Produits',
              short_name: 'Stocks',
              description: 'Gérer les produits et stocks',
              url: '/?tab=products',
              icons: [{ src: '/icons/icon-192x192.svg', sizes: '192x192' }],
            },
          ],
          handle_links: 'auto',
          launch_handler: {
            client_mode: ['navigate-existing', 'auto'],
          },
          edge_side_panel: {},
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
          globIgnores: ['**/node_modules/**/*', 'sw.js', 'workbox-*.js'],
          runtimeCaching: [
            {
              urlPattern: /^https?:\/\/.*\/api\/.*$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'nexastock-api',
                networkTimeoutSeconds: 5,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24,
                },
                backgroundSync: {
                  name: 'nexastock-sync-queue',
                  options: {
                    maxRetentionTime: 24 * 60,
                  },
                },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'nexastock-images',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
            {
              urlPattern: /\.css$/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'nexastock-styles',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
              },
            },
            {
              urlPattern: /\.js$/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'nexastock-scripts',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
              },
            },
            {
              urlPattern: /\.(?:woff|woff2|ttf|eot)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'nexastock-fonts',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
            {
              urlPattern: /\/$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'nexastock-html',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24,
                },
              },
            },
          ],
          navigateFallback: '/offline.html',
          navigateFallbackDenylist: [/^\/api\//],
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/scheduler')) {
              return 'vendor';
            }
            if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) {
              return 'motion';
            }
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
              return 'charts';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'ui';
            }
            if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) {
              return 'pdf';
            }
          },
        },
      },
      chunkSizeWarningLimit: 600,
      cssCodeSplit: true,
      sourcemap: false,
      minify: 'esbuild',
      target: 'es2020',
    },
  };
});
