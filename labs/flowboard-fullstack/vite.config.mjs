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
const RUNTIME_MODULE_ID = '@yida-lab/runtime';
const RESOLVED_RUNTIME_MODULE_ID = `\0${RUNTIME_MODULE_ID}`;

function labRuntimePlugin(source) {
  return {
    name: 'yida-lab-runtime',
    resolveId(id) {
      return id === RUNTIME_MODULE_ID ? RESOLVED_RUNTIME_MODULE_ID : null;
    },
    load(id) {
      return id === RESOLVED_RUNTIME_MODULE_ID ? source : null;
    },
  };
}

export default defineConfig(async () => {
  const manifest = await loadManifest();
  const runtimeSource = createLabRuntimeModule({
    routes: createPageRouteMap(manifest),
    services: createServiceUrlMap(manifest),
  });

  return {
    root: WEB_ROOT,
    plugins: [labRuntimePlugin(runtimeSource), react()],
    server: {
      host: '127.0.0.1',
      port: 4317,
      strictPort: true,
    },
    preview: {
      host: '127.0.0.1',
      port: 4317,
      strictPort: true,
    },
    build: {
      outDir: path.join(LAB_ROOT, 'dist-preview'),
      emptyOutDir: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: [path.join(WEB_ROOT, 'test/setup.ts')],
      include: [path.join(WEB_ROOT, 'test/**/*.test.{ts,tsx}')],
      restoreMocks: true,
      clearMocks: true,
    },
  };
});
