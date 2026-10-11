import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const raw = env.VITE_API_URL || 'http://localhost:4000';
  const api = new URL(raw);
  if (api.origin !== raw || api.username || api.password || (command === 'build' && api.protocol !== 'https:')) throw new Error('Production builds require VITE_API_URL as an explicit HTTPS origin');
  const socket = raw.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${raw} ${socket}; object-src 'none'; base-uri 'self'; form-action 'self'`;
  return { plugins: [react(), { name: 'frontend-csp', transformIndexHtml: () => command === 'build' ? [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }] : [] }], server: { host: '127.0.0.1', strictPort: true } };
});
