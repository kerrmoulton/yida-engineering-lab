import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTROLLED_UI_METHODS,
  EXTERNAL_ASSET_METHODS,
  JS_API_MATRIX_METHODS,
  runControlledUiApi,
  runExternalAssetApi,
  runJsApiMatrixProbe,
} from '../src/js-api-matrix.ts';

function createRoot() {
  const calls: string[] = [];
  const styleLinks: Array<{ href: string }> = [];
  const root: Record<string, unknown> = {
    document: {
      querySelectorAll: () => styleLinks,
    },
  };
  const bridge = {
    ready: true,
    capabilities: Object.fromEntries(
      [...JS_API_MATRIX_METHODS, ...CONTROLLED_UI_METHODS, ...EXTERNAL_ASSET_METHODS].map((method) => [
        method,
        true,
      ]),
    ),
    searchFormDataIds: (params: Record<string, unknown>) => {
      calls.push(`form:${params.formUuid}`);
      return { success: true, content: { data: ['private-form-instance-id'] } };
    },
    getProcessInstanceIds: (params: Record<string, unknown>) => {
      calls.push(`process:${params.formUuid}`);
      return { success: true, content: { data: ['private-process-instance-id'] } };
    },
    getLoginUserId: () => 'private-user-id',
    getLoginUserName: () => 'Private User',
    getLocale: () => 'zh_CN',
    isMobile: () => false,
    isSubmissionPage: () => false,
    isViewPage: () => false,
    getDateTimeRange: () => [1705276800000, 1705363199999],
    formatter: () => '2024-01-15',
    toast: (options: Record<string, unknown>) => calls.push(`toast:${options.title}`),
    dialog: (options: Record<string, unknown>) => calls.push(`dialog:${options.content}`),
    previewImage: (options: Record<string, unknown>) =>
      calls.push(`preview:${Array.isArray(options.urls) ? options.urls.length : 0}`),
    openPage: (target: string) => calls.push(`open:${target}`),
    routerPush: (target: string, params: Record<string, unknown>, newTab: boolean) =>
      calls.push(`router:${target}:${params.yidaLabProbe}:${newTab}`),
    loadScript: (url: string) => {
      calls.push(`script:${url}`);
      root.QRCode = function QRCode() {};
    },
    loadStyleSheet: (url: string) => {
      calls.push(`style:${url}`);
      styleLinks.push({ href: url });
    },
  };
  root.__OPENYIDA_YIDA_API__ = bridge;
  return { root, calls };
}

test('readonly JS API matrix verifies ten methods without exposing returned values', async () => {
  const fixture = createRoot();
  const evidence = await runJsApiMatrixProbe({
    root: fixture.root,
    expectedAppMatched: true,
    formUuid: 'private-form-uuid',
    processFormUuid: 'private-process-form-uuid',
  });
  assert.deepEqual(evidence.summary, { total: 10, verified: 10, failed: 0, unsupported: 0 });
  assert.deepEqual(evidence.uiSummary, {
    total: 5,
    ready: 5,
    verified: 0,
    failed: 0,
    unsupported: 0,
  });
  assert.deepEqual(evidence.assetSummary, {
    total: 2,
    ready: 2,
    verified: 0,
    failed: 0,
    unsupported: 0,
  });
  assert.deepEqual(fixture.calls, ['form:private-form-uuid', 'process:private-process-form-uuid']);
  assert.equal(evidence.safety.mutations, false);
  assert.doesNotMatch(
    JSON.stringify(evidence),
    /private-user-id|Private User|private-form-instance-id|private-process-instance-id|zh_CN|2024-01-15/,
  );
});

test('external asset APIs verify the loaded script global and stylesheet link', async () => {
  const fixture = createRoot();
  for (const method of EXTERNAL_ASSET_METHODS) {
    const check = await runExternalAssetApi({ root: fixture.root, method });
    assert.equal(check.status, 'verified');
  }
  assert.deepEqual(fixture.calls, [
    'script:https://g.alicdn.com/code/lib/qrcodejs/1.0.0/qrcode.min.js',
    'style:https://g.alicdn.com/code/lib/normalize/8.0.1/normalize.min.css',
  ]);
});

test('controlled UI APIs run only when explicitly requested and use configured navigation targets', async () => {
  const fixture = createRoot();
  for (const method of CONTROLLED_UI_METHODS) {
    const check = await runControlledUiApi({
      root: fixture.root,
      expectedAppMatched: true,
      method,
      targetPagePath: '/APP_TEST/workbench/FORM_TARGET',
      targetFormUuid: 'FORM_TARGET',
    });
    assert.equal(check.status, 'verified');
  }
  assert.deepEqual(fixture.calls, [
    'toast:JS API 能力矩阵验证',
    'dialog:dialog API 验证',
    'preview:1',
    'open:/APP_TEST/workbench/FORM_TARGET',
    'router:FORM_TARGET:routerPush:true',
  ]);
});

test('controlled navigation is blocked on an unexpected app', async () => {
  const fixture = createRoot();
  for (const method of ['openPage', 'routerPush'] as const) {
    const check = await runControlledUiApi({
      root: fixture.root,
      expectedAppMatched: false,
      method,
      targetPagePath: '/APP_TEST/workbench/FORM_TARGET',
      targetFormUuid: 'FORM_TARGET',
    });
    assert.equal(check.status, 'failed');
  }
  assert.deepEqual(fixture.calls, []);
});

test('resource ID queries are blocked when the runtime app does not match', async () => {
  const fixture = createRoot();
  const evidence = await runJsApiMatrixProbe({
    root: fixture.root,
    expectedAppMatched: false,
    formUuid: 'private-form-uuid',
    processFormUuid: 'private-process-form-uuid',
  });
  assert.equal(evidence.summary.failed, 2);
  assert.equal(evidence.summary.verified, 8);
  assert.deepEqual(fixture.calls, []);
});
