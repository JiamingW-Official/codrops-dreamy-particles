import glsl from 'vite-plugin-glsl';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [glsl()],
  base: '/codrops-dreamy-particles/',
  build: {
    rollupOptions: {
      input: {
        'index': resolve(__dirname, './index.html'),
        'example2': resolve(__dirname, './example2.html'),
        'example3': resolve(__dirname, './example3.html'),
        'example4': resolve(__dirname, './example4.html'),
      },
    },
  },
});