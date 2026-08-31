import path from 'node:path';
import { createPerformanceSystemApp } from './app.ts';
import { PerformanceSystemStore } from './store.ts';

const databasePath =
  process.env.PERFORMANCE_V2_DATABASE || path.resolve('.local/performance-v2/performance.sqlite');
const port = Number(process.env.PERFORMANCE_V2_PORT || 4338);
const store = new PerformanceSystemStore(databasePath);
const server = createPerformanceSystemApp(store).listen(port, '127.0.0.1', () => {
  console.log(`Performance system API listening on http://127.0.0.1:${port}`);
});

function close() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
