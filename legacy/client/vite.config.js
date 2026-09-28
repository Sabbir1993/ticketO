import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

// Modes:
//   default  → talks to the Node API (/api proxied to :4000 in dev)
//   local    → runs the shared core in the browser (no server) — `npm run dev -- --mode local`
//   single   → local mode bundled into ONE index.html (shareable preview)
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), '@shared': path.resolve(__dirname, '../shared') } },
  define: { __API_MODE__: JSON.stringify(mode === 'single' || mode === 'local' ? 'local' : 'http'), __ROUTER__: JSON.stringify(mode === 'single' ? 'memory' : 'browser') },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' }, fs: { allow: ['..'] } },
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 2000 },
}));
