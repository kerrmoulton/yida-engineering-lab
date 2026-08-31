import { randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { DomainError } from './domain.ts';
import { PerformanceSystemStore } from './store.ts';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function createPerformanceSystemApp(store: PerformanceSystemStore) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '512kb' }));
  app.use((request, response, next) => {
    request.requestId = request.header('x-request-id') || randomUUID();
    response.setHeader('x-request-id', request.requestId);
    response.setHeader('access-control-allow-origin', request.header('origin') || '*');
    response.setHeader('access-control-allow-headers', 'content-type,x-request-id,x-role');
    response.setHeader('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
    if (request.method === 'OPTIONS') return response.sendStatus(204);
    next();
  });
  const ok = (request: Request, response: Response, data: unknown) =>
    response.json({ success: true, data, meta: { requestId: request.requestId } });

  app.get('/api/performance/v2/health', (request, response) =>
    ok(request, response, {
      status: 'ok',
      service: 'performance-system-api',
      database: 'sqlite',
      processEngine: 'local-state-machine',
    }),
  );
  app.get('/api/performance/v2/snapshot', (request, response) =>
    ok(request, response, store.snapshot(request.query)),
  );
  app.post('/api/performance/v2/organizations', (request, response) =>
    ok(request, response, store.saveOrganization(request.body)),
  );
  app.post('/api/performance/v2/employees', (request, response) =>
    ok(request, response, store.saveEmployee(request.body)),
  );
  app.post('/api/performance/v2/indicators', (request, response) =>
    ok(request, response, store.saveIndicator(request.body)),
  );
  app.post('/api/performance/v2/indicators/:id/publish', (request, response) =>
    ok(request, response, store.publishIndicator(request.params.id)),
  );
  app.post('/api/performance/v2/assignments/issue', (request, response) =>
    ok(request, response, store.issueAssignments(String(request.body.periodId || 'PER-2026-Q3'))),
  );
  app.post('/api/performance/v2/configs/generate', (request, response) =>
    ok(request, response, store.generateConfigs(String(request.body.periodId || 'PER-2026-Q3'))),
  );
  app.post('/api/performance/v2/configs/:id/issue', (request, response) =>
    ok(request, response, store.issueConfig(request.params.id)),
  );
  app.post('/api/performance/v2/actual-data/:id/submit', (request, response) =>
    ok(request, response, store.submitActual(request.params.id, request.body)),
  );
  app.post('/api/performance/v2/cases/generate', (request, response) =>
    ok(request, response, store.generateCases(String(request.body.periodId || 'PER-2026-Q3'))),
  );
  app.post('/api/performance/v2/cases/:id/actions/:action', (request, response) =>
    ok(request, response, store.advanceCase(request.params.id, request.params.action, request.body)),
  );
  app.post('/api/performance/v2/jobs/:id/retry', (request, response) =>
    ok(request, response, store.retryJob(request.params.id)),
  );

  app.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    const domain = error instanceof DomainError ? error : null;
    response.status(domain?.status || 500).json({
      success: false,
      error: {
        code: domain?.code || 'INTERNAL_ERROR',
        message: domain?.message || 'Unexpected server error',
        details: domain?.details,
      },
      meta: { requestId: request.requestId },
    });
  });
  return app;
}
