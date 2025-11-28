import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// Get backend URL from environment, default to localhost for local development
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
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
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https:",
        "connect-src 'self' ws: wss:", // WebSocket for HMR
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'"
      ].join('; ')
    }
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'radix-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-avatar',
          ],
        }
      }
    }
  }
})
