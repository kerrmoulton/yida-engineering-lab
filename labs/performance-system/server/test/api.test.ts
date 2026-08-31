import assert from 'node:assert/strict';
import test from 'node:test';
import { createPerformanceSystemApp } from '../src/app.ts';
import { PerformanceSystemStore } from '../src/store.ts';

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const store = new PerformanceSystemStore();
  const server = createPerformanceSystemApp(store).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  try {
    await run(`http://127.0.0.1:${address.port}/api/performance/v2`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
}

test('snapshot exposes multi-record business system', async () =>
  withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/snapshot`);
    const body = (await response.json()) as {
      success: boolean;
      data: { employees: unknown[]; indicators: unknown[]; cases: unknown[]; periods: unknown[] };
    };
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data.employees.length >= 20);
    assert.ok(body.data.indicators.length >= 12);
    assert.ok(body.data.cases.length >= 12);
    assert.ok(body.data.periods.length >= 8);
  }));

test('case state transition persists and invalid transition is rejected', async () =>
  withServer(async (baseUrl) => {
    const snapshot = (await (await fetch(`${baseUrl}/snapshot`)).json()) as {
      data: { cases: Array<{ id: string; status: string }> };
    };
    const ready = snapshot.data.cases.find((row) => row.status === 'READY');
    assert.ok(ready);
    const started = await fetch(`${baseUrl}/cases/${ready.id}/actions/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(started.status, 200);
    const invalid = await fetch(`${baseUrl}/cases/${ready.id}/actions/calculate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(invalid.status, 409);
  }));
