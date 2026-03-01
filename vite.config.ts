import { defineConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function swVersionPlugin(): Plugin {
  return {
    name: 'sw-version',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist', 'sw.js');
      const content = readFileSync(swPath, 'utf-8');
      const hash = Date.now().toString(36);
      writeFileSync(swPath, content.replace('__BUILD_HASH__', hash));
    },
  };
}

export default defineConfig({
  base: '/find-the-book/',
  plugins: [swVersionPlugin()],
});
