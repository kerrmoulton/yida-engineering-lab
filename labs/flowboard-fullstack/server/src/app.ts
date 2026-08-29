import { randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createTaskSchema, taskStatusSchema, updateTaskSchema } from '../../shared/task-contract.ts';
import { createTaskStore, type TaskStore } from './store.ts';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

function isAllowedOrigin(origin: string, configuredOrigins: string[]) {
  if (configuredOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'https:' && (url.hostname === 'aliwork.com' || url.hostname.endsWith('.aliwork.com'))
    );
  } catch {
    return false;
  }
}

export function createApp(options: { store?: TaskStore; allowedOrigins?: string[] } = {}) {
  const app = express();
  const store = options.store || createTaskStore({ seed: [] });
  const allowedOrigins = options.allowedOrigins || ['http://127.0.0.1:4317', 'http://localhost:4317'];

  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const origin = request.get('origin');
    request.requestId = request.get('x-request-id') || randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Private-Network', 'true');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Request-Id');
    if (origin && isAllowedOrigin(origin, allowedOrigins)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
    }
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.use((request, response, next) => {
    const startedAt = performance.now();
    response.on('finish', () => {
      process.stdout.write(
        `${JSON.stringify({
          level: 'info',
          event: 'http_request',
          requestId: request.requestId,
          method: request.method,
          path: request.path,
          status: response.statusCode,
          durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
        })}\n`,
      );
    });
    next();
  });

  app.get('/api/health', (request, response) => {
    response.json({
      success: true,
      data: {
        service: 'flowboard-api',
        status: 'ok',
        taskCount: store.count(),
        now: new Date().toISOString(),
      },
      meta: { requestId: request.requestId },
    });
  });

  app.get('/api/tasks', (request, response) => {
    const status = request.query.status ? taskStatusSchema.parse(String(request.query.status)) : undefined;
    const data = store.list({ search: String(request.query.search || ''), status });
    response.json({ success: true, data, meta: { total: data.length, requestId: request.requestId } });
  });

  app.post('/api/tasks', (request, response) => {
    const task = store.create(createTaskSchema.parse(request.body));
    response.status(201).json({ success: true, data: task, meta: { requestId: request.requestId } });
  });

  function updateTask(request: Request, response: Response) {
    const task = store.update(String(request.params.id), updateTaskSchema.parse(request.body));
    if (!task) {
      response.status(404).json({
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
        meta: { requestId: request.requestId },
      });
      return;
    }
    response.json({ success: true, data: task, meta: { requestId: request.requestId } });
  }

  function deleteTask(request: Request, response: Response) {
    const task = store.remove(String(request.params.id));
    if (!task) {
      response.status(404).json({
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
        meta: { requestId: request.requestId },
      });
      return;
    }
    response.json({ success: true, data: task, meta: { requestId: request.requestId } });
  }

  app.patch('/api/tasks/:id', updateTask);
  app.post('/api/tasks/:id/update', updateTask);
  app.delete('/api/tasks/:id', deleteTask);
  app.post('/api/tasks/:id/delete', deleteTask);

  app.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
      response.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', issues: error.issues },
        meta: { requestId: request.requestId },
      });
      return;
    }
    response.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' },
      meta: { requestId: request.requestId },
    });
  });

  return app;
}
