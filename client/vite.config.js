import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // `vite preview` validates the incoming Host header. Behind the Cloudflare
  // tunnel the forwarded Host is the public domain, so it must be allowlisted
  // or preview returns "Blocked request". localhost stays allowed implicitly.
  preview: {
    port: 4173,
    host: true,
    allowedHosts: ['mallardmanagement.tech', 'www.mallardmanagement.tech'],
  },
})
