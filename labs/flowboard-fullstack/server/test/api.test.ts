import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import { createTaskStore } from '../src/store.ts';

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const server = createApp({ store: createTaskStore([]) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('health and private-network preflight expose observability headers', async () => {
  await withServer(async (baseUrl) => {
    const preflight = await fetch(`${baseUrl}/api/tasks`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://fegroup.aliwork.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Private-Network': 'true',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://fegroup.aliwork.com');
    assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');

    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { 'X-Request-Id': 'test-health' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'test-health');
    const body = await response.json();
    assert.equal(body.data.service, 'flowboard-api');
    assert.equal(body.data.taskCount, 0);
  });
});

test('task CRUD validates input and persists state for the process lifetime', async () => {
  await withServer(async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });
    assert.equal(invalid.status, 400);

    const createdResponse = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '联调任务',
        description: '验证创建接口',
        priority: 'high',
        assignee: '测试人员',
      }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.data.status, 'backlog');

    const updatedResponse = await fetch(`${baseUrl}/api/tasks/${created.data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    assert.equal(updatedResponse.status, 200);
    assert.equal((await updatedResponse.json()).data.status, 'done');

    const listResponse = await fetch(`${baseUrl}/api/tasks?status=done&search=联调`);
    const list = await listResponse.json();
    assert.equal(list.meta.total, 1);

    const deletedResponse = await fetch(`${baseUrl}/api/tasks/${created.data.id}`, {
      method: 'DELETE',
    });
    assert.equal(deletedResponse.status, 200);
    assert.equal((await deletedResponse.json()).data.id, created.data.id);
  });
});
