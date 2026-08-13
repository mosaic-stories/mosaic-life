import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'
import fs from 'fs'

// Get backend URL from environment, default to localhost for local development
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:8080'

// MSW's mock worker script is only needed for tests/Storybook; it must never ship in the production bundle.
const excludeMockServiceWorker = () => ({
  name: 'exclude-mock-service-worker',
  closeBundle() {
    const mswPath = path.resolve(__dirname, 'dist/mockServiceWorker.js')
    fs.rmSync(mswPath, { force: true })
  },
})

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: './bundle-stats.html',
      open: false,
      gzipSize: true,
    }),
    excludeMockServiceWorker(),
  ],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    allowedHosts: ['mosaic.m5.build-it.xyz', 'beelink.projecthewitt.info', 'localhost'],
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/healthz': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/readyz': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/metrics': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/media': {
        target: BACKEND_URL,
        changeOrigin: true,
      }
    },
    // Set permissive CSP headers for dev mode
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Vite HMR needs unsafe-eval in dev
        "style-src 'self' 'unsafe-inline'", // Allow inline styles for dev
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https:",
        "connect-src 'self' ws: wss: https://s3.m5.build-it.xyz https://mosaicapi.m5.build-it.xyz", // WebSocket for HMR + S3 presigned URLs + backend API
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'"
      ].join('; ')
    }
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      external: [/\.stories\./],
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'radix-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-avatar',
          ],
          'tiptap': [
            '@tiptap/react',
            '@tiptap/starter-kit',
            'tiptap-markdown',
          ],
        }
      }
    }
  }
})
