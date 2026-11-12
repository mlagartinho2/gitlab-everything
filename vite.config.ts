import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// GITLAB_PROXY_TARGET (optional): forward /gitlab/* to your GitLab during development,
// for instances that block cross-origin requests. Then use "/gitlab" as the GitLab URL
// on the Connection page.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.GITLAB_PROXY_TARGET;
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: target
        ? { '/gitlab': { target, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/gitlab/, '') } }
        : undefined,
    },
    preview: { port: 4173 },
    build: { sourcemap: true, chunkSizeWarningLimit: 2000 },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  };
});
