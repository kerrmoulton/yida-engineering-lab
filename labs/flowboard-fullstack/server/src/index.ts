import { createApp } from './app.ts';
import { createTaskStore } from './store.ts';

const host = process.env.FLOWBOARD_API_HOST || '127.0.0.1';
const port = Number(process.env.FLOWBOARD_API_PORT || 4318);
const allowedOrigins = (process.env.FLOWBOARD_ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const databasePath = process.env.FLOWBOARD_DATABASE_PATH || '.local/flowboard/flowboard.sqlite';
const store = createTaskStore({ databasePath });
const app = createApp({ store, allowedOrigins: allowedOrigins.length ? allowedOrigins : undefined });
const server = app.listen(port, host, () => {
  process.stdout.write(
    `${JSON.stringify({
      level: 'info',
      event: 'server_started',
      service: 'flowboard-api',
      url: `http://${host}:${port}`,
    })}\n`,
  );
});

function shutdown(signal: string) {
  process.stdout.write(`${JSON.stringify({ level: 'info', event: 'server_stopping', signal })}\n`);
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
