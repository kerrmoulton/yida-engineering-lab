import path from 'node:path';
import { createPerformanceApp } from './app.ts';
import { PerformanceStore } from './store.ts';

const databasePath = path.resolve('.local/performance/performance.sqlite');
const store = new PerformanceStore(databasePath);
const port = Number(process.env.PERFORMANCE_API_PORT || 4328);
const server = createPerformanceApp(store).listen(port, '127.0.0.1', () => {
  console.log(`Performance API listening on http://127.0.0.1:${port}/api/performance`);
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
