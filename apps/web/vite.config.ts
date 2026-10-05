import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { DigestState } from './src/types/digest'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), {
    name: 'local-briefing-preview',
    apply: 'serve',
    configureServer(server) {
      if (loadEnv(mode, server.config.envDir, 'VESTRY_').VESTRY_MOCK_BRIEFING !== '1') return
      const timestamp = new Date().toISOString()
      const sample: DigestState = {
        status: 'READY', day: timestamp.slice(0, 10),
        digest: {
          id: 'local-preview', capturedAt: timestamp, generatedAt: timestamp,
          content: {
            news: 'Local preview: this sample briefing lets you review the dashboard without generating AI content. In a real briefing, this section connects recent company news with your holdings.',
            reflection: 'Use your journal to revisit the reasons behind a position and consider whether those reasons still match your investment horizon.',
            questions: [
              { text: 'Review your portfolio performance', destination: 'DASHBOARD' },
              { text: 'Revisit your recent journal entries', destination: 'JOURNAL' },
            ],
            sources: [], newsStatus: 'READY', demoTemplate: false,
          },
        },
      }
      // Intercept both reads and generation before the API proxy; never call AI here.
      for (const [path, body] of [['/availability', { available: true }], ['', sample]] as const) {
        server.middlewares.use(`/api/portfolio/digest${path}`, (_req, res) => {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(body))
        })
      }
    },
  }],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
}))
