import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Get backend URL from environment, default to localhost for local development
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ['beelink.projecthewitt.info', 'localhost'],
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
      }
    },
    // Set permissive CSP headers for dev mode
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Vite HMR needs unsafe-eval in dev
        "style-src 'self' 'unsafe-inline'", // Allow inline styles for dev
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss:", // WebSocket for HMR
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'"
      ].join('; ')
    }
  },
  build: {
    // Production build optimizations
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'editor': ['@tiptap/react', '@tiptap/starter-kit'],
        }
      }
    }
  }
})
