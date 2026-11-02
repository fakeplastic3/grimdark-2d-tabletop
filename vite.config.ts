import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], base: process.env.GITHUB_PAGES === 'true' ? '/grimdark-2d-tabletop/' : '/', build: { outDir: 'dist' } });
