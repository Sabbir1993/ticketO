import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vite serves the React SPA (resources/js) in dev; `npm run build` writes public/build + manifest
// that the LaraNode Edge shell (SpaController) loads in production.
export default defineConfig(({ mode }) => {
    const e = loadEnv(mode, process.cwd(), '');
    return {
        root: '.',
        plugins: [react()],
        resolve: { alias: { '@': path.resolve('resources/js'), '@shared': path.resolve('resources/js/shared') } },
        server: {
            host: 'localhost',
            port: 5173,
            strictPort: true,
            cors: { origin: e.APP_URL || 'http://localhost:3333' },
            origin: 'http://localhost:5173',
        },
        build: {
            outDir: 'public/build',
            emptyOutDir: true,
            manifest: true,
            chunkSizeWarningLimit: 2000,
            rollupOptions: { input: 'resources/js/main.jsx' },
        },
    };
});
