export type ProcessBridgeSource = 'current' | 'parent' | 'top';

interface RuntimeProcessBridge {
  ready?: boolean;
  capabilities?: Record<string, boolean>;
  getLoginUserId?: () => Promise<unknown> | unknown;
  getLoginUserName?: () => Promise<unknown> | unknown;
  startProcessInstance?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  getProcessInstances?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  getProcessInstanceById?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  updateProcessInstance?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  getOperationRecords?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  executeTask?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  terminateProcessInstance?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface ProcessFields {
  experimentTag: string;
  summary: string;
  payload: string;
  experimentTime: string;
}

export interface SelfOnlyProcessPort {
  source: ProcessBridgeSource;
  ready: boolean;
  capabilities: Record<string, boolean>;
  getLoginUserId(): Promise<unknown>;
  getLoginUserName(): Promise<unknown>;
  start(params: Record<string, unknown>): Promise<unknown>;
  list(params: Record<string, unknown>): Promise<unknown>;
  get(params: Record<string, unknown>): Promise<unknown>;
  update(params: Record<string, unknown>): Promise<unknown>;
  getOperations(params: Record<string, unknown>): Promise<unknown>;
  execute(params: Record<string, unknown>): Promise<unknown>;
  terminate(params: Record<string, unknown>): Promise<unknown>;
}

export interface ProcessLifecycleEvidence {
  schemaVersion: 1;
  safety: {
    selfOnly: true;
    taggedOnly: true;
    uniqueRunningInstanceRequired: true;
    deleteAllowed: false;
    sensitiveValuesRedacted: true;
  };
  phase:
    | 'idle'
    | 'checking'
    | 'ready'
    | 'updating'
    | 'updated'
    | 'approving'
    | 'terminating'
    | 'complete'
    | 'failed';
  expectedAppMatched: boolean;
  identityMatched: boolean;
  discovery: {
    runningCount: number;
    taggedSelfOnlyCount: number;
    uniqueMatch: boolean;
    idCaptured: boolean;
  };
  operations: { available: boolean; count: number; currentUserTodoCount: number };
  completion: {
    updatePerformed: boolean;
    updateVerified: boolean;
    approvalPerformed: boolean;
    result: string;
    statusAfter: string;
  };
  termination: { performed: boolean; statusBefore: string; statusAfter: string };
  error?: string;
}

export interface PendingSelfOnlyProcess {
  processInstanceId: string;
  taskId: string;
}

export interface SelfOnlyProcessEvidence {
  schemaVersion: 1;
  safety: {
    level: 'L3';
    maxProcessInstances: 1;
    selfOnly: true;
    autoStart: false;
    autoApprove: false;
    sensitiveValuesRedacted: true;
  };
  phase: 'idle' | 'checking' | 'ready' | 'starting' | 'complete' | 'failed';
  expectedAppMatched: boolean;
  identity: {
    windowUserAvailable: boolean;
    bridgeUserAvailable: boolean;
    matched: boolean;
  };
  definition: {
    safe: boolean;
    nodeCount: number;
    approvers: string[];
    forbiddenSignals: string[];
  };
  bridge: {
    available: boolean;
    ready: boolean;
    source: string;
    capabilities: string[];
  };
  instance: { created: boolean; count: 0 | 1; idCaptured: boolean };
  error?: string;
}

export const SELF_ONLY_PROCESS_DEFINITION = {
  nodes: [{ type: 'approval', name: '发起人确认', approver: 'originator' }],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function accessibleWindows(root: Record<string, unknown>) {
  const candidates: Array<{ source: ProcessBridgeSource; value: Record<string, unknown> }> = [
    { source: 'current', value: root },
  ];
  for (const source of ['parent', 'top'] as const) {
    try {
      const value = root[source];
      if (isRecord(value) && !candidates.some((candidate) => candidate.value === value)) {
        candidates.push({ source, value });
      }
    } catch (_error) {
      continue;
    }
  }
  return candidates;
}

function requireMethod(
  bridge: RuntimeProcessBridge,
  name:
    | 'getLoginUserId'
    | 'getLoginUserName'
    | 'startProcessInstance'
    | 'getProcessInstances'
    | 'getProcessInstanceById'
    | 'updateProcessInstance'
    | 'getOperationRecords'
    | 'executeTask'
    | 'terminateProcessInstance',
) {
  const method = bridge[name];
  if (typeof method !== 'function') throw new Error(`流程桥方法不可用：${name}`);
  return method as (...args: unknown[]) => unknown;
}

export function createSelfOnlyProcessPort(rootValue: unknown): SelfOnlyProcessPort | null {
  const root = isRecord(rootValue) ? rootValue : {};
  for (const candidate of accessibleWindows(root)) {
    const raw = candidate.value.__OPENYIDA_YIDA_API__ || candidate.value.openyidaYidaApi;
    if (!isRecord(raw)) continue;
    const bridge = raw as RuntimeProcessBridge;
    const capabilities = isRecord(bridge.capabilities) ? bridge.capabilities : {};
    return {
      source: candidate.source,
      ready: bridge.ready !== false,
      capabilities,
      getLoginUserId() {
        return Promise.resolve(requireMethod(bridge, 'getLoginUserId')());
      },
      getLoginUserName() {
        return Promise.resolve(requireMethod(bridge, 'getLoginUserName')());
      },
      start(params) {
        return Promise.resolve(requireMethod(bridge, 'startProcessInstance')(params));
      },
      list(params) {
        return Promise.resolve(requireMethod(bridge, 'getProcessInstances')(params));
      },
      get(params) {
        return Promise.resolve(requireMethod(bridge, 'getProcessInstanceById')(params));
      },
      update(params) {
        return Promise.resolve(requireMethod(bridge, 'updateProcessInstance')(params));
      },
      getOperations(params) {
        return Promise.resolve(requireMethod(bridge, 'getOperationRecords')(params));
      },
      execute(params) {
        return Promise.resolve(requireMethod(bridge, 'executeTask')(params));
      },
      terminate(params) {
        return Promise.resolve(requireMethod(bridge, 'terminateProcessInstance')(params));
      },
    };
  }
  return null;
}

function normalizeScalar(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (!isRecord(value)) return '';
  for (const key of ['userId', 'value', 'result', 'data', 'content']) {
    const normalized = normalizeScalar(value[key]);
    if (normalized) return normalized;
  }
  return '';
}

function windowUserIds(rootValue: unknown) {
  const root = isRecord(rootValue) ? rootValue : {};
  const values = new Set<string>();
  for (const candidate of accessibleWindows(root)) {
    const user = candidate.value.loginUser;
    if (!isRecord(user)) continue;
    for (const key of ['userId', 'businessWorkNo', 'emplId', 'workNo']) {
      const value = normalizeScalar(user[key]);
      if (value) values.add(value);
    }
  }
  return values;
}

function collectDefinitionSignals(value: unknown) {
  const strings: string[] = [];
  const keys: string[] = [];
  const queue = [value];
  const seen = new Set<unknown>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (typeof current === 'string') {
      strings.push(current);
      continue;
    }
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (isRecord(current)) {
      for (const [key, child] of Object.entries(current)) {
        keys.push(key);
        queue.push(child);
      }
    }
  }
  return { strings, keys };
}

export function scanSelfOnlyDefinition(definition: unknown) {
  const nodes = isRecord(definition) && Array.isArray(definition.nodes) ? definition.nodes : [];
  const { strings, keys } = collectDefinitionSignals(definition);
  const approvers = nodes
    .filter(isRecord)
    .map((node) => normalizeScalar(node.approver))
    .filter(Boolean);
  const forbiddenWords = [
    'carbon',
    'role',
    'deptLeader',
    'directLeader',
    'users',
    'multiApproval',
    'message',
    'email',
    'connector',
  ];
  const forbiddenSignals = forbiddenWords.filter((word) => strings.includes(word) || keys.includes(word));
  const safe =
    nodes.length === 1 &&
    nodes.every(
      (node) =>
        isRecord(node) &&
        node.type === 'approval' &&
        node.name === '发起人确认' &&
        node.approver === 'originator',
    ) &&
    approvers.length === 1 &&
    approvers[0] === 'originator' &&
    forbiddenSignals.length === 0;
  return { safe, nodeCount: nodes.length, approvers, forbiddenSignals };
}

function baseEvidence(
  port: SelfOnlyProcessPort | null,
  expectedAppMatched: boolean,
): SelfOnlyProcessEvidence {
  return {
    schemaVersion: 1,
    safety: {
      level: 'L3',
      maxProcessInstances: 1,
      selfOnly: true,
      autoStart: false,
      autoApprove: false,
      sensitiveValuesRedacted: true,
    },
    phase: 'idle',
    expectedAppMatched,
    identity: { windowUserAvailable: false, bridgeUserAvailable: false, matched: false },
    definition: scanSelfOnlyDefinition(SELF_ONLY_PROCESS_DEFINITION),
    bridge: {
      available: Boolean(port),
      ready: Boolean(port?.ready),
      source: port?.source || 'none',
      capabilities: Object.entries(port?.capabilities || {})
        .filter(([, available]) => available)
        .map(([name]) => name)
        .sort(),
    },
    instance: { created: false, count: 0, idCaptured: false },
  };
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 180);
  if (isRecord(error)) {
    for (const key of ['errorCode', 'code', 'errorMsg', 'message']) {
      const value = error[key];
      if (typeof value === 'string' || typeof value === 'number') return String(value).slice(0, 180);
    }
  }
  return '未知错误';
}

function assertSuccessfulResponse(value: unknown) {
  if (isRecord(value) && value.success === false) {
    throw new Error(safeErrorMessage(value));
  }
}

function extractProcessInstanceId(value: unknown) {
  const queue = [value];
  const seen = new Set<unknown>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (typeof current === 'string' && current.trim()) return current.trim();
    if (Array.isArray(current)) queue.push(...current);
    else if (isRecord(current)) {
      for (const key of ['processInstanceId', 'procInstId', 'instanceId']) {
        const id = current[key];
        if (typeof id === 'string' && id.trim()) return id.trim();
      }
      for (const key of ['result', 'content', 'data']) {
        if (current[key] !== undefined) queue.push(current[key]);
      }
    }
  }
  return '';
}

function unwrapRows(value: unknown) {
  const queue = [value];
  const seen = new Set<unknown>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) return current.filter(isRecord);
    if (isRecord(current)) {
      for (const key of ['data', 'list', 'records', 'result', 'content', 'value']) {
        if (current[key] !== undefined) queue.push(current[key]);
      }
    }
  }
  return [];
}

function recordData(value: Record<string, unknown>) {
  return isRecord(value.data) ? value.data : isRecord(value.formData) ? value.formData : value;
}

function recordStatus(value: unknown) {
  const queue = [value];
  const seen = new Set<unknown>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (isRecord(current)) {
      for (const key of ['instanceStatus', 'status']) {
        const status = normalizeScalar(current[key]);
        if (status) return status.toUpperCase();
      }
      for (const key of ['result', 'content', 'data', 'value']) {
        if (current[key] !== undefined) queue.push(current[key]);
      }
    }
  }
  return '';
}

function actorUserId(value: unknown) {
  if (!isRecord(value)) return '';
  for (const key of ['userId', 'operator', 'actualActionerId', 'originatorId']) {
    const id = normalizeScalar(value[key]);
    if (id) return id;
  }
  return '';
}

function operationTaskId(value: unknown) {
  if (!isRecord(value)) return '';
  for (const key of ['taskId', 'activityId', 'workItemId']) {
    const id = normalizeScalar(value[key]);
    if (id) return id;
  }
  return '';
}

function readFieldValue(value: unknown, fieldId: string) {
  const queue = [value];
  const seen = new Set<unknown>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (!isRecord(current)) continue;
    if (current[fieldId] !== undefined) return normalizeScalar(current[fieldId]);
    for (const key of ['result', 'content', 'data', 'formData', 'value']) {
      if (current[key] !== undefined) queue.push(current[key]);
    }
  }
  return '';
}

function isCurrentUserTodo(row: Record<string, unknown>, bridgeUserId: string) {
  return (
    (normalizeScalar(row.type).toUpperCase() === 'TODO' ||
      normalizeScalar(row.actionExt).toLowerCase() === 'doing') &&
    actorUserId(row) === bridgeUserId
  );
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function lifecycleEvidence(expectedAppMatched: boolean): ProcessLifecycleEvidence {
  return {
    schemaVersion: 1,
    safety: {
      selfOnly: true,
      taggedOnly: true,
      uniqueRunningInstanceRequired: true,
      deleteAllowed: false,
      sensitiveValuesRedacted: true,
    },
    phase: 'idle',
    expectedAppMatched,
    identityMatched: false,
    discovery: {
      runningCount: 0,
      taggedSelfOnlyCount: 0,
      uniqueMatch: false,
      idCaptured: false,
    },
    operations: { available: false, count: 0, currentUserTodoCount: 0 },
    completion: {
      updatePerformed: false,
      updateVerified: false,
      approvalPerformed: false,
      result: '',
      statusAfter: '',
    },
    termination: { performed: false, statusBefore: '', statusAfter: '' },
  };
}

export async function inspectSelfOnlyLifecycle(input: {
  root: unknown;
  expectedAppMatched: boolean;
  formUuid: string;
  experimentTagField: string;
}) {
  const evidence = lifecycleEvidence(input.expectedAppMatched);
  evidence.phase = 'checking';
  try {
    const preflight = await runSelfOnlyPreflight({
      root: input.root,
      expectedAppMatched: input.expectedAppMatched,
    });
    if (preflight.phase !== 'ready') throw new Error(preflight.error || '身份预检未通过');
    evidence.identityMatched = true;
    const port = createSelfOnlyProcessPort(input.root);
    if (!port) throw new Error('宜搭流程桥不可用');
    for (const method of [
      'getProcessInstances',
      'getProcessInstanceById',
      'getOperationRecords',
      'updateProcessInstance',
      'executeTask',
      'terminateProcessInstance',
    ]) {
      if (port.capabilities[method] !== true) throw new Error(`流程桥缺少 ${method} 能力`);
    }
    const bridgeUserId = normalizeScalar(await port.getLoginUserId());
    const response = await port.list({
      formUuid: input.formUuid,
      instanceStatus: 'RUNNING',
      originatorId: bridgeUserId,
      currentPage: 1,
      pageSize: 10,
      searchFieldJson: '',
    });
    assertSuccessfulResponse(response);
    const running = unwrapRows(response).filter((row) => recordStatus(row) === 'RUNNING');
    const matches = running.filter((row) => {
      const marker = normalizeScalar(recordData(row)[input.experimentTagField]);
      const originator = isRecord(row.originator) ? actorUserId(row.originator) : '';
      const actioners = Array.isArray(row.actioners) ? row.actioners.map(actorUserId).filter(Boolean) : [];
      return (
        marker.startsWith('YIDA_PROCESS_LAB_') &&
        originator === bridgeUserId &&
        actioners.length > 0 &&
        actioners.every((id) => id === bridgeUserId)
      );
    });
    evidence.discovery = {
      runningCount: running.length,
      taggedSelfOnlyCount: matches.length,
      uniqueMatch: matches.length === 1,
      idCaptured: false,
    };
    if (matches.length !== 1) throw new Error('无法唯一定位当前用户的运行中实验流程');
    const processInstanceId = extractProcessInstanceId(matches[0]);
    if (!processInstanceId) throw new Error('未识别到实验流程实例 ID');
    const detail = await port.get({ processInstanceId });
    assertSuccessfulResponse(detail);
    if (recordStatus(detail) !== 'RUNNING') throw new Error('实验流程已不处于 RUNNING 状态');
    const operations = await port.getOperations({ processInstanceId });
    assertSuccessfulResponse(operations);
    const operationRows = unwrapRows(operations);
    const currentUserTodos = operationRows.filter((row) => isCurrentUserTodo(row, bridgeUserId));
    if (currentUserTodos.length !== 1) throw new Error('未确认到当前用户唯一待办节点');
    const taskId = operationTaskId(currentUserTodos[0]);
    if (!taskId) throw new Error('未识别到当前用户待办任务 ID');
    evidence.discovery.idCaptured = true;
    evidence.operations = {
      available: true,
      count: operationRows.length,
      currentUserTodoCount: currentUserTodos.length,
    };
    evidence.termination.statusBefore = 'RUNNING';
    evidence.phase = 'ready';
    return { evidence, pending: { processInstanceId, taskId } as PendingSelfOnlyProcess };
  } catch (error) {
    evidence.phase = 'failed';
    evidence.error = safeErrorMessage(error);
    return { evidence, pending: null };
  }
}

export async function updateSelfOnlyProcess(input: {
  root: unknown;
  expectedAppMatched: boolean;
  acknowledged: boolean;
  pending: PendingSelfOnlyProcess | null;
  previousEvidence: ProcessLifecycleEvidence;
  fields: ProcessFields;
  summary: string;
  payload: string;
}) {
  const evidence: ProcessLifecycleEvidence = JSON.parse(JSON.stringify(input.previousEvidence));
  evidence.phase = 'updating';
  try {
    if (!input.expectedAppMatched) throw new Error('构建目标与当前应用不一致');
    if (!input.acknowledged) throw new Error('必须先确认更新当前本人实验流程');
    if (!input.pending?.processInstanceId || !input.pending.taskId) {
      throw new Error('缺少已通过门禁的流程实例或待办任务');
    }
    if (input.previousEvidence.phase !== 'ready') throw new Error('生命周期只读门禁尚未通过');
    if (!input.summary.trim() || !input.payload.trim()) throw new Error('摘要与实验载荷不能为空');
    const port = createSelfOnlyProcessPort(input.root);
    if (!port || port.capabilities.updateProcessInstance !== true) {
      throw new Error('宜搭流程更新能力不可用');
    }
    const summary = input.summary.trim();
    const payload = input.payload.trim();
    const response = await port.update({
      processInstanceId: input.pending.processInstanceId,
      updateFormDataJson: JSON.stringify({
        [input.fields.summary]: summary,
        [input.fields.payload]: payload,
        [input.fields.experimentTime]: Date.now(),
      }),
    });
    assertSuccessfulResponse(response);
    const detail = await port.get({ processInstanceId: input.pending.processInstanceId });
    assertSuccessfulResponse(detail);
    if (recordStatus(detail) !== 'RUNNING') throw new Error('更新后实验流程已不处于 RUNNING 状态');
    if (
      readFieldValue(detail, input.fields.summary) !== summary ||
      readFieldValue(detail, input.fields.payload) !== payload
    ) {
      throw new Error('流程字段更新后回读值不一致');
    }
    evidence.phase = 'updated';
    evidence.completion.updatePerformed = true;
    evidence.completion.updateVerified = true;
  } catch (error) {
    evidence.phase = 'failed';
    evidence.error = safeErrorMessage(error);
  }
  return evidence;
}

export async function approveSelfOnlyProcess(input: {
  root: unknown;
  expectedAppMatched: boolean;
  acknowledged: boolean;
  pending: PendingSelfOnlyProcess | null;
  previousEvidence: ProcessLifecycleEvidence;
}) {
  const evidence: ProcessLifecycleEvidence = JSON.parse(JSON.stringify(input.previousEvidence));
  evidence.phase = 'approving';
  try {
    if (!input.expectedAppMatched) throw new Error('构建目标与当前应用不一致');
    if (!input.acknowledged) throw new Error('必须先确认同意当前本人的唯一实验待办');
    if (!input.pending?.processInstanceId || !input.pending.taskId) {
      throw new Error('缺少已通过门禁的流程实例或待办任务');
    }
    if (input.previousEvidence.phase !== 'updated') throw new Error('流程数据尚未更新并回读验证');
    const port = createSelfOnlyProcessPort(input.root);
    if (!port || port.capabilities.executeTask !== true) {
      throw new Error('宜搭流程任务执行能力不可用');
    }
    const operationsBefore = await port.getOperations({
      processInstanceId: input.pending.processInstanceId,
    });
    assertSuccessfulResponse(operationsBefore);
    const bridgeUserId = normalizeScalar(await port.getLoginUserId());
    if (unwrapRows(operationsBefore).filter((row) => isCurrentUserTodo(row, bridgeUserId)).length !== 1) {
      throw new Error('执行同意前当前用户待办已不唯一');
    }
    const response = await port.execute({
      taskId: input.pending.taskId,
      procInstId: input.pending.processInstanceId,
      outResult: 'AGREE',
      remark: '本人流程桥自动化验证通过',
    });
    assertSuccessfulResponse(response);
    let statusAfter = '';
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const detail = await port.get({ processInstanceId: input.pending.processInstanceId });
      assertSuccessfulResponse(detail);
      statusAfter = recordStatus(detail);
      if (statusAfter === 'COMPLETED') break;
      await delay(250);
    }
    if (statusAfter !== 'COMPLETED') throw new Error('同意待办后实例状态未变为 COMPLETED');
    let operationRows: Record<string, unknown>[] = [];
    let currentUserTodoCount = 1;
    let approvalRecordFound = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const operations = await port.getOperations({
        processInstanceId: input.pending.processInstanceId,
      });
      assertSuccessfulResponse(operations);
      operationRows = unwrapRows(operations);
      currentUserTodoCount = operationRows.filter((row) => isCurrentUserTodo(row, bridgeUserId)).length;
      approvalRecordFound = operationRows.some(
        (row) =>
          actorUserId(row) === bridgeUserId &&
          (normalizeScalar(row.actionExt).toLowerCase() === 'agree' ||
            normalizeScalar(row.action) === '同意' ||
            normalizeScalar(row.operateType).toUpperCase() === 'EXECUTE_TASK_NORMAL'),
      );
      if (currentUserTodoCount === 0 && approvalRecordFound) {
        break;
      }
      await delay(250);
    }
    if (currentUserTodoCount !== 0) throw new Error('同意后当前用户待办仍未清空');
    if (!approvalRecordFound) throw new Error('同意后未识别到当前用户的审批历史记录');
    evidence.phase = 'complete';
    evidence.discovery.runningCount = 0;
    evidence.discovery.taggedSelfOnlyCount = 0;
    evidence.operations = { available: true, count: operationRows.length, currentUserTodoCount };
    evidence.completion = {
      updatePerformed: true,
      updateVerified: true,
      approvalPerformed: true,
      result: 'AGREE',
      statusAfter,
    };
  } catch (error) {
    evidence.phase = 'failed';
    evidence.error = safeErrorMessage(error);
  }
  return evidence;
}

export async function terminateSelfOnlyProcess(input: {
  root: unknown;
  expectedAppMatched: boolean;
  acknowledged: boolean;
  pending: PendingSelfOnlyProcess | null;
  previousEvidence: ProcessLifecycleEvidence;
}) {
  const evidence: ProcessLifecycleEvidence = JSON.parse(JSON.stringify(input.previousEvidence));
  evidence.phase = 'terminating';
  try {
    if (!input.expectedAppMatched) throw new Error('构建目标与当前应用不一致');
    if (!input.acknowledged) throw new Error('必须先确认终止当前本人实验流程');
    if (!input.pending?.processInstanceId) throw new Error('缺少已通过门禁的流程实例');
    if (input.previousEvidence.phase !== 'ready') throw new Error('生命周期只读门禁尚未通过');
    const port = createSelfOnlyProcessPort(input.root);
    if (!port || port.capabilities.terminateProcessInstance !== true) {
      throw new Error('宜搭流程终止能力不可用');
    }
    const response = await port.terminate({
      processInstanceId: input.pending.processInstanceId,
    });
    assertSuccessfulResponse(response);
    const detail = await port.get({ processInstanceId: input.pending.processInstanceId });
    assertSuccessfulResponse(detail);
    const statusAfter = recordStatus(detail);
    if (statusAfter !== 'TERMINATED') throw new Error('终止调用后实例状态未变为 TERMINATED');
    const bridgeUserId = normalizeScalar(await port.getLoginUserId());
    const operations = await port.getOperations({
      processInstanceId: input.pending.processInstanceId,
    });
    assertSuccessfulResponse(operations);
    const operationRows = unwrapRows(operations);
    const currentUserTodoCount = operationRows.filter((row) => isCurrentUserTodo(row, bridgeUserId)).length;
    if (currentUserTodoCount !== 0) throw new Error('终止后当前用户待办仍未清空');
    evidence.phase = 'complete';
    evidence.discovery = {
      runningCount: 0,
      taggedSelfOnlyCount: 0,
      uniqueMatch: true,
      idCaptured: true,
    };
    evidence.operations = {
      available: true,
      count: operationRows.length,
      currentUserTodoCount,
    };
    evidence.termination = { performed: true, statusBefore: 'RUNNING', statusAfter };
  } catch (error) {
    evidence.phase = 'failed';
    evidence.error = safeErrorMessage(error);
  }
  return evidence;
}

export function inspectSelfOnlyProcess(root: unknown, expectedAppMatched: boolean) {
  return baseEvidence(createSelfOnlyProcessPort(root), expectedAppMatched);
}

export async function runSelfOnlyPreflight(input: {
  root: unknown;
  expectedAppMatched: boolean;
  definition?: unknown;
}) {
  const port = createSelfOnlyProcessPort(input.root);
  const evidence = baseEvidence(port, input.expectedAppMatched);
  evidence.phase = 'checking';
  evidence.definition = scanSelfOnlyDefinition(input.definition || SELF_ONLY_PROCESS_DEFINITION);
  try {
    if (!input.expectedAppMatched) throw new Error('构建目标与当前应用不一致');
    if (!port || !port.ready) throw new Error('宜搭流程桥不可用');
    if (port.capabilities.getLoginUserId !== true) throw new Error('流程桥缺少登录人 ID 能力');
    if (port.capabilities.startProcessInstance !== true) throw new Error('流程桥缺少流程发起能力');
    if (!evidence.definition.safe) throw new Error('流程定义未通过仅发起人安全扫描');
    const ids = windowUserIds(input.root);
    const bridgeUserId = normalizeScalar(await port.getLoginUserId());
    evidence.identity = {
      windowUserAvailable: ids.size > 0,
      bridgeUserAvailable: Boolean(bridgeUserId),
      matched: Boolean(bridgeUserId && ids.has(bridgeUserId)),
    };
    if (!evidence.identity.windowUserAvailable) throw new Error('window.loginUser 不可用');
    if (!evidence.identity.bridgeUserAvailable) throw new Error('桥接登录人 ID 不可用');
    if (!evidence.identity.matched) throw new Error('window.loginUser 与桥接登录人不一致');
    evidence.phase = 'ready';
  } catch (error) {
    evidence.phase = 'failed';
    evidence.error = safeErrorMessage(error);
  }
  return evidence;
}

export async function startSelfOnlyProcess(input: {
  root: unknown;
  appType: string;
  formUuid: string;
  processCode: string;
  fields: ProcessFields;
  marker: string;
  summary: string;
  payload: string;
  acknowledged: boolean;
  alreadyStarted: boolean;
}) {
  const preflight = await runSelfOnlyPreflight({
    root: input.root,
    expectedAppMatched: Boolean(input.appType),
  });
  if (preflight.phase !== 'ready') return preflight;
  preflight.phase = 'starting';
  try {
    if (!input.acknowledged) throw new Error('必须先确认流程仅发送给当前登录人本人');
    if (input.alreadyStarted) throw new Error('当前页面会话已经发起过流程');
    const port = createSelfOnlyProcessPort(input.root);
    if (!port) throw new Error('宜搭流程桥不可用');
    const response = await port.start({
      appType: input.appType,
      processCode: input.processCode,
      formUuid: input.formUuid,
      formDataJson: JSON.stringify({
        [input.fields.experimentTag]: input.marker,
        [input.fields.summary]: input.summary,
        [input.fields.payload]: input.payload,
        [input.fields.experimentTime]: Date.now(),
      }),
    });
    assertSuccessfulResponse(response);
    const processInstanceId = extractProcessInstanceId(response);
    if (!processInstanceId) throw new Error('流程返回成功但未识别到实例 ID');
    preflight.phase = 'complete';
    preflight.instance = { created: true, count: 1, idCaptured: true };
  } catch (error) {
    preflight.phase = 'failed';
    preflight.error = safeErrorMessage(error);
  }
  return preflight;
}
