import { randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { DomainError } from './domain.ts';
import { PerformanceStore } from './store.ts';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function createPerformanceApp(store: PerformanceStore) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb' }));
  app.use((request, response, next) => {
    request.requestId = request.header('x-request-id') || randomUUID();
    response.setHeader('x-request-id', request.requestId);
    response.setHeader('access-control-allow-origin', request.header('origin') || '*');
    response.setHeader('access-control-allow-headers', 'content-type,x-request-id');
    response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    if (request.method === 'OPTIONS') return response.sendStatus(204);
    next();
  });

  const success = (request: Request, response: Response, data: unknown) =>
    response.json({ success: true, data, meta: { requestId: request.requestId } });

  app.get('/api/performance/health', (request, response) =>
    success(request, response, { status: 'ok', service: 'performance-api', database: 'sqlite' }),
  );
  app.get('/api/performance/workspace', (request, response) => success(request, response, store.workspace()));
  app.post('/api/performance/organizations', (request, response) =>
    success(request, response, store.saveOrganization(request.body)),
  );
  app.post('/api/performance/employees', (request, response) =>
    success(request, response, store.saveEmployee(request.body)),
  );
  app.post('/api/performance/indicators', (request, response) =>
    success(request, response, store.saveIndicatorDefinition(request.body)),
  );
  app.post('/api/performance/scenario/reset', (request, response) =>
    success(request, response, store.reset()),
  );
  app.post('/api/performance/actions/:action', (request, response) =>
    success(request, response, store.performAction(request.params.action, request.body)),
  );

  app.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    const domainError = error instanceof DomainError ? error : null;
    response.status(domainError ? 409 : 500).json({
      success: false,
      error: {
        code: domainError?.code || 'INTERNAL_ERROR',
        message: domainError?.message || 'Unexpected server error',
      },
      meta: { requestId: request.requestId },
    });
  });
  return app;
}
