import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry
        entry: resolve(__dirname, 'src/main/index.ts'),
        onstart({ startup }) {
          startup()
        },
        vite: {
          resolve: {
            alias: {
              '@shared': resolve(__dirname, './src/shared')
            }
          },
          build: {
            outDir: resolve(__dirname, 'dist-electron/main'),
            rollupOptions: {
              external: [
                '@google-cloud/storage',
                '@google-cloud/vision',
                'electron'
              ]
            }
          }
        }
      },
      {
        // Preload script
        entry: resolve(__dirname, 'src/main/preload.ts'),
        onstart({ reload }) {
          reload()
        },
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist-electron/preload')
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@main': resolve(__dirname, './src/main'),
      '@renderer': resolve(__dirname, './src/renderer/src'),
      '@shared': resolve(__dirname, './src/shared')
    }
  },
  root: 'src/renderer',
  build: {
    outDir: '../../dist'
  },
  server: {
    port: 5173
  }
})
