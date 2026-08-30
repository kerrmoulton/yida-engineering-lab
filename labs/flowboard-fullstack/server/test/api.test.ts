import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import writeXlsxFile from 'write-excel-file/node';
import { createApp } from '../src/app.ts';
import type { DingTalkOpenApiConfig } from '../src/dingtalk-openapi.ts';
import { createTaskStore } from '../src/store.ts';

type AppOptions = Parameters<typeof createApp>[0];

async function withServer(run: (baseUrl: string) => Promise<void>, options: AppOptions = {}) {
  const store = createTaskStore({ seed: [] });
  const server = createApp({ ...options, store }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
    store.close();
  }
}

test('health and private-network preflight expose observability headers', async () => {
  await withServer(async (baseUrl) => {
    const preflight = await fetch(`${baseUrl}/api/tasks`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://tenant.example.aliwork.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Private-Network': 'true',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://tenant.example.aliwork.com');
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

test('connector-compatible POST routes preserve PATCH and DELETE semantics', async () => {
  await withServer(async (baseUrl) => {
    const createdResponse = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '连接器兼容任务',
        description: '验证连接器只使用 GET 和 POST',
        priority: 'medium',
        assignee: '连接器测试',
      }),
    });
    const created = await createdResponse.json();

    const updatedResponse = await fetch(`${baseUrl}/api/tasks/${created.data.id}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    assert.equal(updatedResponse.status, 200);
    assert.equal((await updatedResponse.json()).data.status, 'done');

    const deletedResponse = await fetch(`${baseUrl}/api/tasks/${created.data.id}/delete`, {
      method: 'POST',
    });
    assert.equal(deletedResponse.status, 200);
    assert.equal((await deletedResponse.json()).data.id, created.data.id);
  });
});

async function syntheticWorkbook() {
  return writeXlsxFile([
    ['recordId', 'name', 'amount', 'active'],
    ['SYN-001', '伪造记录一', 12.5, true],
    ['SYN-002', '伪造记录二', 8, false],
  ]).toBuffer();
}

const testDingTalkConfig: DingTalkOpenApiConfig = {
  schemaVersion: 1,
  dingtalk: {
    applicationType: 'enterpriseInternal',
    appKey: 'test-app-key',
    appSecret: 'test-app-secret',
  },
  yida: {
    appType: 'APP_TEST_FILE_IMPORT',
    systemToken: 'test-system-token',
    userId: 'yida-test-public-account',
  },
  process: { originatorUserId: 'synthetic-originator-user' },
  temporaryUrl: {
    enabled: true,
    language: 'zh_CN',
    timeoutMs: 60_000,
    accessTokenRefreshSkewSeconds: 120,
  },
};

test('file import accepts synthetic multipart workbook and parsed JSON batches', async () => {
  await withServer(async (baseUrl) => {
    const workbook = await syntheticWorkbook();
    const workbookBytes = new Uint8Array(workbook.length);
    workbookBytes.set(workbook);
    const form = new FormData();
    form.set(
      'file',
      new File([workbookBytes], 'synthetic-import.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const uploadedResponse = await fetch(`${baseUrl}/api/import/upload`, {
      method: 'POST',
      headers: { Origin: 'https://tenant.example.aliwork.com', 'X-Request-Id': 'test-multipart' },
      body: form,
    });
    assert.equal(uploadedResponse.status, 200);
    assert.equal(
      uploadedResponse.headers.get('access-control-allow-origin'),
      'https://tenant.example.aliwork.com',
    );
    const uploaded = await uploadedResponse.json();
    assert.equal(uploaded.data.channel, 'direct-multipart');
    assert.equal(uploaded.data.rowCount, 2);
    assert.deepEqual(uploaded.data.columns, ['recordId', 'name', 'amount', 'active']);
    assert.match(uploaded.data.sha256, /^[a-f0-9]{64}$/);

    const rowsResponse = await fetch(`${baseUrl}/api/import/rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'test-json' },
      body: JSON.stringify({
        sessionId: 'synthetic-session',
        batchIndex: 0,
        rows: uploaded.data.rows,
      }),
    });
    assert.equal(rowsResponse.status, 200);
    const rows = await rowsResponse.json();
    assert.equal(rows.data.channel, 'parsed-json');
    assert.equal(rows.data.acceptedRows, 2);
    assert.match(rows.data.payloadSha256, /^[a-f0-9]{64}$/);
  });
});

test('file import rejects non-xlsx uploads and untrusted download hosts', async () => {
  await withServer(async (baseUrl) => {
    const form = new FormData();
    form.set('file', new File(['not a workbook'], 'private.txt', { type: 'text/plain' }));
    const invalidFile = await fetch(`${baseUrl}/api/import/upload`, { method: 'POST', body: form });
    assert.equal(invalidFile.status, 400);
    assert.equal((await invalidFile.json()).error.code, 'ONLY_XLSX_ALLOWED');

    const untrustedUrl = await fetch(`${baseUrl}/api/import/fetch-yida`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloadUrl: 'https://example.com/not-allowed.xlsx' }),
    });
    assert.equal(untrustedUrl.status, 400);
    assert.equal((await untrustedUrl.json()).error.code, 'DOWNLOAD_HOST_NOT_ALLOWED');
  });
});

test('Yida attachment relay exchanges credentials server-side and parses a synthetic workbook', async () => {
  const workbook = await syntheticWorkbook();
  const calls: string[] = [];
  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    calls.push(url.pathname);
    if (url.pathname === '/v1.0/oauth2/accessToken') {
      const credentials = JSON.parse(String(init?.body || '{}'));
      assert.deepEqual(credentials, { appKey: 'test-app-key', appSecret: 'test-app-secret' });
      return Response.json({ accessToken: 'test-access-token', expireIn: 7_200 });
    }
    if (url.pathname === '/v1.0/yida/apps/temporaryUrls/APP_TEST_FILE_IMPORT') {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('x-acs-dingtalk-access-token'), 'test-access-token');
      assert.equal(url.searchParams.get('systemToken'), 'test-system-token');
      assert.equal(url.searchParams.get('userId'), 'yida-test-public-account');
      assert.equal(
        url.searchParams.get('fileUrl'),
        'https://tenant.example.aliwork.com/ossFileHandle?fileName=synthetic.xlsx&type=download',
      );
      return Response.json({ result: 'https://test-bucket.aliyuncs.com/synthetic.xlsx' });
    }
    if (url.href === 'https://test-bucket.aliyuncs.com/synthetic.xlsx') {
      return new Response(new Uint8Array(workbook), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Length': String(workbook.length),
        },
      });
    }
    return Response.json({ error: 'unexpected request' }, { status: 500 });
  }) as typeof fetch;

  await withServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/import/fetch-yida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          downloadUrl:
            'https://tenant.example.aliwork.com/ossFileHandle?fileName=synthetic.xlsx&type=download',
        }),
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.data.channel, 'yida-temporary-url');
      assert.equal(payload.data.rowCount, 2);
      assert.equal(payload.data.finalHost, 'test-bucket.aliyuncs.com');
      assert.deepEqual(calls, [
        '/v1.0/oauth2/accessToken',
        '/v1.0/yida/apps/temporaryUrls/APP_TEST_FILE_IMPORT',
        '/synthetic.xlsx',
      ]);
    },
    { fileImport: { dingtalkConfig: testDingTalkConfig, fetchImpl: mockFetch } },
  );
});

test('Yida attachment relay fails deterministically when backend credentials are missing', async () => {
  await withServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/import/fetch-yida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          downloadUrl:
            'https://tenant.example.aliwork.com/ossFileHandle?fileName=synthetic.xlsx&type=download',
        }),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'DINGTALK_AUTH_NOT_CONFIGURED');
    },
    {
      fileImport: {
        loadDingTalkConfig: () => {
          throw new Error('DINGTALK_AUTH_NOT_CONFIGURED');
        },
      },
    },
  );
});

test('Yida OpenAPI remains closed by default and performs no external request', async () => {
  let externalCalls = 0;
  await withServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/import/fetch-yida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          downloadUrl:
            'https://tenant.example.aliwork.com/ossFileHandle?fileName=synthetic.xlsx&type=download',
        }),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'YIDA_OPENAPI_DISABLED');
      assert.equal(externalCalls, 0);
    },
    {
      fileImport: {
        dingtalkConfig: {
          ...testDingTalkConfig,
          temporaryUrl: { ...testDingTalkConfig.temporaryUrl, enabled: false },
        },
        fetchImpl: (async () => {
          externalCalls += 1;
          throw new Error('external fetch must not run');
        }) as typeof fetch,
      },
    },
  );
});
