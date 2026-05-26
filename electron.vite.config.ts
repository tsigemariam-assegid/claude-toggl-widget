import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'main.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'preload.ts'),
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
  },
});
