import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import {
  createLabRuntimeModule,
  createPageRouteMap,
  createServiceUrlMap,
  loadManifest,
} from '../../scripts/lib.mjs';

const LAB_ROOT = import.meta.dirname;
const WEB_ROOT = path.join(LAB_ROOT, 'web');
const RUNTIME_ID = '@yida-lab/runtime';
const RESOLVED_RUNTIME_ID = `\0${RUNTIME_ID}`;

export default defineConfig(async () => {
  const manifest = await loadManifest();
  const routes = createPageRouteMap(manifest);
  Object.assign(routes, {
    'performance.overview': '/?page=overview',
    'performance.indicators': '/?page=indicators',
    'performance.configuration': '/?page=configuration',
    'performance.dataEntry': '/?page=dataEntry',
    'performance.assessment': '/?page=assessment',
  });
  const runtime = createLabRuntimeModule({
    routes,
    services: createServiceUrlMap(manifest),
    profile: { stage: 'development', defaultTransport: 'direct', allowDirectOverride: false },
  });
  return {
    root: WEB_ROOT,
    plugins: [
      {
        name: 'performance-runtime',
        resolveId(id) {
          return id === RUNTIME_ID ? RESOLVED_RUNTIME_ID : null;
        },
        load(id) {
          return id === RESOLVED_RUNTIME_ID ? runtime : null;
        },
      },
      react(),
    ],
    server: { host: '127.0.0.1', port: 4327, strictPort: true },
    preview: { host: '127.0.0.1', port: 4327, strictPort: true },
    build: { outDir: path.join(LAB_ROOT, 'dist-preview'), emptyOutDir: true },
    test: {
      environment: 'jsdom',
      setupFiles: [path.join(WEB_ROOT, 'test/setup.ts')],
      include: [path.join(WEB_ROOT, 'test/**/*.test.{ts,tsx}')],
      restoreMocks: true,
      clearMocks: true,
    },
  };
});
