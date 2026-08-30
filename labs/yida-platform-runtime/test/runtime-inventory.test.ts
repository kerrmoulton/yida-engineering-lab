import assert from 'node:assert/strict';
import test from 'node:test';
import { scanYidaRuntime } from '../src/runtime-inventory.ts';

test('runtime inventory finds official context and masks appType', () => {
  const root: Record<string, unknown> = {
    pageConfig: { appType: 'APP_TEST_APPLICATION', corpId: 'ding-private' },
    loginUser: { userId: 'private-user', name: 'Private Name', businessWorkNo: 'private-work-no' },
    navigator: { userAgent: 'Desktop Browser' },
  };
  root.parent = root;
  root.top = root;
  const result = scanYidaRuntime(root, 'APP_TEST_APPLICATION');
  const serialized = JSON.stringify(result);
  assert.equal(result.expectedAppMatched, true);
  assert.equal(result.actualAppTypeMasked, 'APP_••••TION');
  assert.match(serialized, /window\.loginUser/);
  assert.doesNotMatch(serialized, /private-user|Private Name|private-work-no|ding-private/);
});

test('runtime inventory discovers renderable native component names without calling them', () => {
  let calls = 0;
  function EmployeeField() {
    calls += 1;
    return null;
  }
  const root: Record<string, unknown> = {
    Deep: { EmployeeField, plainValue: { value: 1 } },
    DeepYida: [{ displayName: 'PortalTopBanner', component: function PortalTopBanner() {} }],
  };
  root.parent = root;
  root.top = root;
  const result = scanYidaRuntime(root);
  assert.deepEqual(result.nativeComponentNames, ['EmployeeField', 'PortalTopBanner']);
  assert.equal(calls, 0);
  assert.equal(result.safety.unknownFunctionsCalled, false);
});

test('runtime inventory does not invoke accessor properties', () => {
  let getterCalls = 0;
  const root: Record<string, unknown> = {};
  Object.defineProperty(root, 'loginUser', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return { userId: 'must-not-be-read' };
    },
  });
  root.parent = root;
  root.top = root;
  const result = scanYidaRuntime(root);
  assert.equal(getterCalls, 0);
  assert.equal(result.capabilities.find((item) => item.name === 'window.loginUser')?.status, 'unsupported');
});

test('runtime inventory only exposes allowlisted bridge method names', () => {
  const bridge = {
    getLoginUserId() {
      throw new Error('L0 must not call bridge methods');
    },
    accessToken: 'must-not-leak',
  };
  const root: Record<string, unknown> = { __OPENYIDA_YIDA_API__: bridge };
  root.parent = root;
  root.top = root;
  const result = scanYidaRuntime(root);
  const serialized = JSON.stringify(result);
  assert.match(serialized, /getLoginUserId/);
  assert.doesNotMatch(serialized, /must-not-leak|accessToken/);
});
