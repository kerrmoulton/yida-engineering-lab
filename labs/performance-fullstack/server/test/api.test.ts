import assert from 'node:assert/strict';
import test from 'node:test';
import type { PerformanceWorkspace } from '../../shared/performance-contract.ts';
import { createPerformanceApp } from '../src/app.ts';
import { PerformanceStore } from '../src/store.ts';

test('workspace API returns request correlation and advances state', async () => {
  const store = new PerformanceStore();
  const server = createPerformanceApp(store).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing test address');
    const base = `http://127.0.0.1:${address.port}/api/performance`;
    const initial = await fetch(`${base}/workspace`, { headers: { 'x-request-id': 'SYN-REQ-1' } });
    const initialPayload = await initial.json();
    assert.equal(initialPayload.data.stage, 'CONFIGURATION');
    assert.equal(initialPayload.meta.requestId, 'SYN-REQ-1');
    const workspace = initialPayload.data as PerformanceWorkspace;
    const advanced = await fetch(`${base}/actions/submit-configuration`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        employeeId: workspace.employee.id,
        indicators: workspace.indicators.map(({ definitionId, weight, target }) => ({
          definitionId,
          weight,
          target,
        })),
        reviewers: workspace.reviewers.map(({ id, name, weight }) => ({ id, name, weight })),
      }),
    });
    assert.equal((await advanced.json()).data.stage, 'DATA_ENTRY');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
