import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approveSelfOnlyProcess,
  createSelfOnlyProcessPort,
  inspectSelfOnlyLifecycle,
  runSelfOnlyPreflight,
  scanSelfOnlyDefinition,
  SELF_ONLY_PROCESS_DEFINITION,
  startSelfOnlyProcess,
  terminateSelfOnlyProcess,
  updateSelfOnlyProcess,
  type ProcessFields,
} from '../src/self-only-process-bridge.ts';

const fields: ProcessFields = {
  experimentTag: 'text_tag',
  summary: 'text_summary',
  payload: 'textarea_payload',
  experimentTime: 'date_time',
};

function createRoot(
  startProcessInstance = (_params: Record<string, unknown>) => ({
    success: true,
    result: { processInstanceId: 'PROC_INSTANCE_TEST' },
  }),
) {
  return {
    loginUser: { userId: 'private-user-id' },
    __OPENYIDA_YIDA_API__: {
      ready: true,
      capabilities: { getLoginUserId: true, getLoginUserName: true, startProcessInstance: true },
      getLoginUserId: () => ({ userId: 'private-user-id' }),
      getLoginUserName: () => 'Private User',
      startProcessInstance,
      invoke() {
        throw new Error('generic invoke must not be reachable');
      },
    },
  };
}

test('self-only process definition accepts only one originator approval node', () => {
  assert.deepEqual(scanSelfOnlyDefinition(SELF_ONLY_PROCESS_DEFINITION), {
    safe: true,
    nodeCount: 1,
    approvers: ['originator'],
    forbiddenSignals: [],
  });
  assert.equal(
    scanSelfOnlyDefinition({
      nodes: [{ type: 'approval', name: '发起人确认', approver: 'role' }],
      carbon: ['someone'],
    }).safe,
    false,
  );
});

test('process port exposes narrow methods without generic invoke', async () => {
  const port = createSelfOnlyProcessPort(createRoot());
  assert.ok(port);
  assert.deepEqual(Object.keys(port).sort(), [
    'capabilities',
    'execute',
    'get',
    'getLoginUserId',
    'getLoginUserName',
    'getOperations',
    'list',
    'ready',
    'source',
    'start',
    'terminate',
    'update',
  ]);
  assert.equal('invoke' in port, false);
  assert.deepEqual(await port.getLoginUserId(), { userId: 'private-user-id' });
});

test('preflight requires the window and bridge identities to match', async () => {
  const passed = await runSelfOnlyPreflight({
    root: createRoot(),
    expectedAppMatched: true,
  });
  assert.equal(passed.phase, 'ready');
  assert.equal(passed.identity.matched, true);

  const mismatched = createRoot();
  mismatched.loginUser.userId = 'different-user-id';
  const blocked = await runSelfOnlyPreflight({ root: mismatched, expectedAppMatched: true });
  assert.equal(blocked.phase, 'failed');
  assert.match(blocked.error || '', /不一致/);
});

test('explicit start creates exactly one instance and redacts all IDs from evidence', async () => {
  const calls: Record<string, unknown>[] = [];
  const result = await startSelfOnlyProcess({
    root: createRoot((params) => {
      calls.push(params);
      return { success: true, result: { processInstanceId: 'PROC_INSTANCE_TEST' } };
    }),
    appType: 'APP_TEST',
    formUuid: 'FORM_TEST',
    processCode: 'TPROC_TEST',
    fields,
    marker: 'YIDA_PROCESS_LAB_TEST',
    summary: 'self-only test',
    payload: '{"safe":true}',
    acknowledged: true,
    alreadyStarted: false,
  });
  assert.equal(calls.length, 1);
  assert.equal(result.phase, 'complete');
  assert.deepEqual(result.instance, { created: true, count: 1, idCaptured: true });
  assert.equal(calls[0].appType, 'APP_TEST');
  assert.equal(calls[0].processCode, 'TPROC_TEST');
  assert.equal(calls[0].formUuid, 'FORM_TEST');
  assert.equal(typeof calls[0].formDataJson, 'string');
  const data = JSON.parse(String(calls[0].formDataJson));
  assert.equal(data.text_tag, 'YIDA_PROCESS_LAB_TEST');
  assert.equal(data.text_summary, 'self-only test');
  assert.equal(data.textarea_payload, '{"safe":true}');
  assert.equal(typeof data.date_time, 'number');
  assert.doesNotMatch(JSON.stringify(result), /private-user-id|PROC_INSTANCE_TEST/);
});

test('start remains side-effect free without explicit acknowledgement', async () => {
  let starts = 0;
  const result = await startSelfOnlyProcess({
    root: createRoot(() => {
      starts += 1;
      return { success: true, result: { processInstanceId: 'PROC_INSTANCE_TEST' } };
    }),
    appType: 'APP_TEST',
    formUuid: 'FORM_TEST',
    processCode: 'TPROC_TEST',
    fields,
    marker: 'YIDA_PROCESS_LAB_TEST',
    summary: 'self-only test',
    payload: '{}',
    acknowledged: false,
    alreadyStarted: false,
  });
  assert.equal(starts, 0);
  assert.equal(result.phase, 'failed');
});

function createLifecycleRoot(completionReadDelay = 0) {
  let status = 'RUNNING';
  let summary = 'before summary';
  let payload = '{"before":true}';
  let terminateCalls = 0;
  let updateCalls = 0;
  let executeCalls = 0;
  let completionReadsRemaining = 0;
  const instance = () => ({
    processInstanceId: 'private-process-id',
    formUuid: 'FORM_TEST',
    instanceStatus: status === 'COMPLETED' && completionReadsRemaining-- > 0 ? 'RUNNING' : status,
    originator: { userId: 'private-user-id' },
    actioners: [{ userId: 'private-user-id' }],
    data: {
      text_tag: 'YIDA_PROCESS_LAB_TEST',
      text_summary: summary,
      textarea_payload: payload,
    },
  });
  const root = createRoot();
  Object.assign(root.__OPENYIDA_YIDA_API__.capabilities, {
    getProcessInstances: true,
    getProcessInstanceById: true,
    getOperationRecords: true,
    updateProcessInstance: true,
    executeTask: true,
    terminateProcessInstance: true,
  });
  Object.assign(root.__OPENYIDA_YIDA_API__, {
    getProcessInstances: () => ({ success: true, content: { data: [instance()] } }),
    getProcessInstanceById: () => ({ success: true, content: instance() }),
    getOperationRecords: () => ({
      success: true,
      content:
        status === 'RUNNING'
          ? [
              { type: 'HISTORY', operator: 'private-user-id' },
              {
                type: 'TODO',
                taskId: 'private-task-id',
                actionExt: 'doing',
                operator: 'private-user-id',
              },
            ]
          : [
              { type: 'HISTORY', operator: 'private-user-id' },
              {
                type: 'HISTORY',
                actionExt: status === 'TERMINATED' ? 'revoked' : 'agree',
                operator: 'private-user-id',
              },
            ],
    }),
    updateProcessInstance: (params: Record<string, unknown>) => {
      updateCalls += 1;
      const patch = JSON.parse(String(params.updateFormDataJson));
      summary = patch.text_summary;
      payload = patch.textarea_payload;
      return { success: true };
    },
    executeTask: () => {
      executeCalls += 1;
      status = 'COMPLETED';
      completionReadsRemaining = completionReadDelay;
      return { success: true };
    },
    terminateProcessInstance: () => {
      terminateCalls += 1;
      status = 'TERMINATED';
      return { success: true };
    },
  });
  return {
    root,
    terminateCalls: () => terminateCalls,
    updateCalls: () => updateCalls,
    executeCalls: () => executeCalls,
  };
}

test('lifecycle inspection locates one tagged self-only running instance without exposing IDs', async () => {
  const fixture = createLifecycleRoot();
  const result = await inspectSelfOnlyLifecycle({
    root: fixture.root,
    expectedAppMatched: true,
    formUuid: 'FORM_TEST',
    experimentTagField: 'text_tag',
  });
  assert.equal(result.evidence.phase, 'ready');
  assert.equal(result.evidence.discovery.uniqueMatch, true);
  assert.equal(result.evidence.operations.currentUserTodoCount, 1);
  assert.equal(result.pending?.processInstanceId, 'private-process-id');
  assert.equal(result.pending?.taskId, 'private-task-id');
  assert.doesNotMatch(JSON.stringify(result.evidence), /private-user-id|private-process-id/);
});

test('lifecycle update changes only requested fields and verifies the readback', async () => {
  const fixture = createLifecycleRoot();
  const inspected = await inspectSelfOnlyLifecycle({
    root: fixture.root,
    expectedAppMatched: true,
    formUuid: 'FORM_TEST',
    experimentTagField: 'text_tag',
  });
  const evidence = await updateSelfOnlyProcess({
    root: fixture.root,
    expectedAppMatched: true,
    acknowledged: true,
    pending: inspected.pending,
    previousEvidence: inspected.evidence,
    fields,
    summary: 'after summary',
    payload: '{"after":true}',
  });
  assert.equal(fixture.updateCalls(), 1);
  assert.equal(evidence.phase, 'updated');
  assert.equal(evidence.completion.updatePerformed, true);
  assert.equal(evidence.completion.updateVerified, true);
  assert.doesNotMatch(JSON.stringify(evidence), /private-user-id|private-process-id|private-task-id/);
});

test('lifecycle approval completes the updated self-only process exactly once', async () => {
  const fixture = createLifecycleRoot(2);
  const inspected = await inspectSelfOnlyLifecycle({
    root: fixture.root,
    expectedAppMatched: true,
    formUuid: 'FORM_TEST',
    experimentTagField: 'text_tag',
  });
  const updated = await updateSelfOnlyProcess({
    root: fixture.root,
    expectedAppMatched: true,
    acknowledged: true,
    pending: inspected.pending,
    previousEvidence: inspected.evidence,
    fields,
    summary: 'after summary',
    payload: '{"after":true}',
  });
  const evidence = await approveSelfOnlyProcess({
    root: fixture.root,
    expectedAppMatched: true,
    acknowledged: true,
    pending: inspected.pending,
    previousEvidence: updated,
  });
  assert.equal(fixture.executeCalls(), 1);
  assert.equal(evidence.phase, 'complete');
  assert.deepEqual(evidence.completion, {
    updatePerformed: true,
    updateVerified: true,
    approvalPerformed: true,
    result: 'AGREE',
    statusAfter: 'COMPLETED',
  });
  assert.equal(evidence.operations.currentUserTodoCount, 0);
  assert.doesNotMatch(JSON.stringify(evidence), /private-user-id|private-process-id|private-task-id/);
});

test('lifecycle termination changes RUNNING to TERMINATED exactly once', async () => {
  const fixture = createLifecycleRoot();
  const inspected = await inspectSelfOnlyLifecycle({
    root: fixture.root,
    expectedAppMatched: true,
    formUuid: 'FORM_TEST',
    experimentTagField: 'text_tag',
  });
  const evidence = await terminateSelfOnlyProcess({
    root: fixture.root,
    expectedAppMatched: true,
    acknowledged: true,
    pending: inspected.pending,
    previousEvidence: inspected.evidence,
  });
  assert.equal(fixture.terminateCalls(), 1);
  assert.equal(evidence.phase, 'complete');
  assert.deepEqual(evidence.termination, {
    performed: true,
    statusBefore: 'RUNNING',
    statusAfter: 'TERMINATED',
  });
  assert.equal(evidence.discovery.runningCount, 0);
  assert.equal(evidence.operations.currentUserTodoCount, 0);
  assert.doesNotMatch(JSON.stringify(evidence), /private-user-id|private-process-id/);
});
