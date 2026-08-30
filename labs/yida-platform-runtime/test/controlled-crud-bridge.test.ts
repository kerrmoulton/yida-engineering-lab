import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createControlledCrudPort,
  deleteControlledCrud,
  prepareControlledCrud,
  type CrudFields,
} from '../src/controlled-crud-bridge.ts';

const fields: CrudFields = {
  experimentTag: 'text_tag',
  operationType: 'select_operation',
  summary: 'text_summary',
  payload: 'textarea_payload',
  experimentTime: 'date_time',
};

test('controlled CRUD port exposes fixed methods and exact parameter contracts', async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const bridge = Object.fromEntries(
    ['searchFormDatas', 'saveFormData', 'getFormDataById', 'updateFormData', 'deleteFormData'].map(
      (method) => [
        method,
        (params: Record<string, unknown>) => {
          calls.push({ method, params });
          return { success: true };
        },
      ],
    ),
  );
  const port = createControlledCrudPort({ __OPENYIDA_YIDA_API__: { ready: true, ...bridge, invoke() {} } });
  assert.ok(port);
  assert.equal('invoke' in port, false);
  await port.create('APP_TEST', 'FORM_TEST', { text_tag: 'MARKER' });
  await port.update('FINST_TEST', { text_summary: 'updated' });
  await port.delete('FINST_TEST');
  assert.deepEqual(calls, [
    {
      method: 'saveFormData',
      params: { appType: 'APP_TEST', formUuid: 'FORM_TEST', formDataJson: '{"text_tag":"MARKER"}' },
    },
    {
      method: 'updateFormData',
      params: {
        formInstId: 'FINST_TEST',
        updateFormDataJson: '{"text_summary":"updated"}',
        useLatestVersion: 'y',
      },
    },
    { method: 'deleteFormData', params: { formInstId: 'FINST_TEST' } },
  ]);
});

test('controlled CRUD executes one tagged record and deletes only its captured instance ID', async () => {
  let record: { formInstId: string; formData: Record<string, unknown> } | null = null;
  const bridge = {
    ready: true,
    searchFormDatas(params: Record<string, unknown>) {
      const query = JSON.parse(String(params.searchFieldJson));
      const marker = query[0].value;
      return { content: { data: record && record.formData.text_tag === marker ? [record] : [] } };
    },
    saveFormData(params: Record<string, unknown>) {
      record = { formInstId: 'FINST_TEST', formData: JSON.parse(String(params.formDataJson)) };
      return { success: true, result: 'FINST_TEST' };
    },
    getFormDataById() {
      return { success: true, result: record };
    },
    updateFormData(params: Record<string, unknown>) {
      assert.ok(record);
      const patch = JSON.parse(String(params.updateFormDataJson));
      record.formData = {
        ...record.formData,
        ...patch,
        select_operation: '更新',
        select_operation_id: patch.select_operation,
      };
      return { success: true };
    },
    deleteFormData(params: Record<string, unknown>) {
      assert.equal(params.formInstId, 'FINST_TEST');
      record = null;
      return { success: true };
    },
  };
  const prepared = await prepareControlledCrud({
    root: { __OPENYIDA_YIDA_API__: bridge },
    appType: 'APP_TEST',
    formUuid: 'FORM_TEST',
    fields,
    marker: 'YIDA_RUNTIME_LAB_TEST',
  });
  assert.equal(prepared.evidence.phase, 'awaiting-delete');
  assert.equal(prepared.evidence.steps.length, 6);
  assert.ok(prepared.pending);
  const completed = await deleteControlledCrud({
    root: { __OPENYIDA_YIDA_API__: bridge },
    expectedAppMatched: true,
    pending: prepared.pending,
    previousEvidence: prepared.evidence,
  });
  assert.equal(completed.phase, 'complete');
  assert.equal(completed.steps.length, 9);
  assert.deepEqual(completed.cleanup, { required: false, completed: true, remainingRecords: 0 });
  assert.equal(record, null);
  assert.doesNotMatch(JSON.stringify(completed), /FINST_TEST|YIDA_RUNTIME_LAB_TEST/);
});

test('controlled CRUD stops before create when the exact marker already exists', async () => {
  let createCalls = 0;
  const bridge = {
    ready: true,
    searchFormDatas: () => ({ data: [{ formInstId: 'FINST_EXISTING', formData: { text_tag: 'MARKER' } }] }),
    saveFormData: () => {
      createCalls += 1;
    },
    getFormDataById() {},
    updateFormData() {},
    deleteFormData() {},
  };
  const result = await prepareControlledCrud({
    root: { __OPENYIDA_YIDA_API__: bridge },
    appType: 'APP_TEST',
    formUuid: 'FORM_TEST',
    fields,
    marker: 'MARKER',
  });
  assert.equal(result.evidence.phase, 'failed');
  assert.equal(result.pending, null);
  assert.equal(createCalls, 0);
});
