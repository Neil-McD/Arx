import { defineConfig } from 'vite';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
export default defineConfig({ root, esbuild: { jsx: 'automatic' }, plugins: [{
  name: 'roster-fixture-readers', enforce: 'pre',
  resolveId(source, importer) {
    if (importer?.endsWith('/ChannelRosterPanel.tsx') && /\/cloudCommunity(Chat|Polynet)Gateway$/.test(source)) return resolve(root, 'scripts/fixtures/channel-roster/readers.ts');
  },
}], server: { host: '127.0.0.1', port: 5186, strictPort: true, fs: { allow: [root, realpathSync(resolve(root, 'node_modules')), realpathSync(resolve(root, 'apps/web/node_modules'))] } } });
