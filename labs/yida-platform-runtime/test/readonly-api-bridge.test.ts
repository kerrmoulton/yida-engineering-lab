import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createReadonlyYidaPort,
  runReadonlyProbe,
  summarizeReadonlyResponse,
} from '../src/readonly-api-bridge.ts';

test('readonly port exposes only allowlisted methods and normalizes parameters', async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const root = {
    __OPENYIDA_YIDA_API__: {
      ready: true,
      getFormComponentDefinationList(params: Record<string, unknown>) {
        calls.push({ method: 'definition', params });
        return [];
      },
      searchFormDatas(params: Record<string, unknown>) {
        calls.push({ method: 'search', params });
        return { data: [] };
      },
      saveFormData() {
        throw new Error('must not be reachable');
      },
    },
  };
  const port = createReadonlyYidaPort(root);
  assert.ok(port);
  assert.deepEqual(Object.keys(port).sort(), [
    'getFormDefinition',
    'methods',
    'ready',
    'searchFormDatas',
    'source',
  ]);
  await port.getFormDefinition('FORM_TEST');
  await port.searchFormDatas('FORM_TEST');
  assert.deepEqual(calls, [
    { method: 'definition', params: { formUuid: 'FORM_TEST' } },
    {
      method: 'search',
      params: { formUuid: 'FORM_TEST', currentPage: 1, pageSize: 10, searchFieldJson: '' },
    },
  ]);
});

test('readonly evidence contains shapes but not returned values', async () => {
  const root = {
    loginUser: { userId: 'private-user', userName: 'Private Name' },
    pageConfig: { appType: 'APP_TEST' },
    __OPENYIDA_YIDA_API__: {
      ready: true,
      getFormComponentDefinationList: () => [{ label: 'Sensitive Label', fieldId: 'private-field' }],
      searchFormDatas: () => ({ data: [{ formInstId: 'private-instance' }] }),
    },
  };
  const evidence = await runReadonlyProbe({ root, formUuid: 'FORM_TEST', expectedAppMatched: true });
  const serialized = JSON.stringify(evidence);
  assert.deepEqual(
    evidence.checks.map((item) => item.status),
    ['passed', 'passed'],
  );
  assert.doesNotMatch(serialized, /private-user|Private Name|Sensitive Label|private-field|private-instance/);
});

test('response summary unwraps nested collections without exposing items', () => {
  assert.deepEqual(summarizeReadonlyResponse({ content: { data: [{ id: 'private' }] }, success: true }), {
    kind: 'object',
    topLevelKeys: ['content', 'success'],
    collectionCount: 1,
  });
});
