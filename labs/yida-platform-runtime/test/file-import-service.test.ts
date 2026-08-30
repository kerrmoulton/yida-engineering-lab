import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFileImportService,
  type FileImportDependencies,
  FileImportServiceError,
  type ImportRow,
  resolveDefaultFileImportRequest,
  type FileImportResult,
} from '../src/file-import-service.ts';

const file = new File(['synthetic workbook'], 'synthetic.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});
const rows: ImportRow[] = [
  { recordId: 'SYN-001', amount: 12.5 },
  { recordId: 'SYN-002', amount: 8 },
];

function createDependencies() {
  const calls: string[] = [];
  const dependencies: FileImportDependencies = {
    createOperationId: () => `operation-${calls.length + 1}`,
    uploadMultipart: async (_file: File, endpoint: 'local' | 'public') => {
      calls.push(`multipart:${endpoint}`);
      return {
        success: true,
        data: { rowCount: 2, columns: ['recordId', 'amount'], sha256: 'multipart-sha' },
        meta: { requestId: 'multipart-request' },
      };
    },
    parseWorkbook: async () => {
      calls.push('parse:browser');
      return { columns: ['recordId', 'amount'], rows };
    },
    submitParsedRows: async (_rows: ImportRow[], transport: 'direct' | 'connector') => {
      calls.push(`json:${transport}`);
      return {
        success: true,
        data: { acceptedRows: 2, payloadSha256: 'json-sha' },
        meta: { requestId: 'json-request' },
      };
    },
    relayYidaAttachment: async () => {
      calls.push('relay:yida');
      return {
        backendDownloadSucceeded: true,
        cleanupCompleted: true,
        rowCount: 2,
        columns: ['recordId', 'amount'],
      };
    },
  };
  return {
    calls,
    dependencies,
  };
}

function assertUnifiedResult(result: FileImportResult) {
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.status, 'completed');
  assert.equal(result.file.name, 'synthetic.xlsx');
  assert.equal(result.rowCount, 2);
  assert.equal(result.acceptedRows, 2);
  assert.deepEqual(result.columns, ['recordId', 'amount']);
  assert.match(result.operationId, /^operation-/);
}

test('one importFile method normalizes all three transport adapters', async () => {
  const { calls, dependencies } = createDependencies();
  const service = createFileImportService(dependencies, {
    defaultRequest: { channel: 'browser-json', transport: 'connector' },
  });

  const multipart = await service.importFile(file, { channel: 'direct-multipart', endpoint: 'local' });
  const json = await service.importFile(file, { channel: 'browser-json', transport: 'connector' });
  const relay = await service.importFile(file, { channel: 'yida-attachment' });

  for (const result of [multipart, json, relay]) assertUnifiedResult(result);
  assert.deepEqual(
    [multipart.channel, json.channel, relay.channel],
    ['direct-multipart', 'browser-json', 'yida-attachment'],
  );
  assert.deepEqual(
    [multipart.transport, json.transport, relay.transport],
    ['localhost-multipart', 'connector-json', 'yida-attachment'],
  );
  assert.deepEqual(calls, ['multipart:local', 'parse:browser', 'json:connector', 'relay:yida']);
});

test('runtime profile changes the adapter without changing the page call', async () => {
  const local = createDependencies();
  const localService = createFileImportService(local.dependencies, {
    defaultRequest: resolveDefaultFileImportRequest({ stage: 'local', defaultTransport: 'direct' }),
  });
  const testRuntime = createDependencies();
  const testService = createFileImportService(testRuntime.dependencies, {
    defaultRequest: resolveDefaultFileImportRequest({ stage: 'test', defaultTransport: 'connector' }),
  });

  const localResult = await localService.importFile(file);
  const testResult = await testService.importFile(file);

  assert.equal(localResult.transport, 'localhost-multipart');
  assert.equal(testResult.transport, 'connector-json');
  assert.deepEqual(local.calls, ['multipart:local']);
  assert.deepEqual(testRuntime.calls, ['parse:browser', 'json:connector']);
});

test('Yida relay stays behind the same contract and exposes a deterministic phase on failure', async () => {
  const { dependencies } = createDependencies();
  dependencies.relayYidaAttachment = async () => ({
    backendDownloadSucceeded: false,
    cleanupCompleted: true,
    errorCode: 'YIDA_OPENAPI_DISABLED',
  });
  const service = createFileImportService(dependencies, {
    defaultRequest: { channel: 'browser-json', transport: 'connector' },
  });

  await assert.rejects(
    () => service.importFile(file, { channel: 'yida-attachment' }),
    (error: unknown) => {
      assert.ok(error instanceof FileImportServiceError);
      assert.equal(error.channel, 'yida-attachment');
      assert.equal(error.phase, 'yida-attachment-relay');
      assert.equal(error.code, 'YIDA_OPENAPI_DISABLED');
      return true;
    },
  );
});
