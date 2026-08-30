export type CrudMethodName =
  'searchFormDatas' | 'saveFormData' | 'getFormDataById' | 'updateFormData' | 'deleteFormData';

interface RuntimeCrudBridge {
  ready?: boolean;
  searchFormDatas?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  saveFormData?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  getFormDataById?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  updateFormData?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  deleteFormData?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface CrudFields {
  experimentTag: string;
  operationType: string;
  summary: string;
  payload: string;
  experimentTime: string;
}

export interface ControlledCrudPort {
  source: 'current' | 'parent' | 'top';
  ready: boolean;
  methods: CrudMethodName[];
  search(formUuid: string, tagFieldId: string, marker: string): Promise<unknown>;
  create(appType: string, formUuid: string, formData: Record<string, unknown>): Promise<unknown>;
  get(formInstId: string): Promise<unknown>;
  update(formInstId: string, formData: Record<string, unknown>): Promise<unknown>;
  delete(formInstId: string): Promise<unknown>;
}

export type CrudStepName =
  | 'preflight-search'
  | 'create'
  | 'search-after-create'
  | 'get-created-record'
  | 'update'
  | 'search-after-update'
  | 'delete-preflight'
  | 'delete'
  | 'confirm-absent';

export interface CrudStepEvidence {
  name: CrudStepName;
  method: CrudMethodName;
  status: 'passed' | 'failed';
  assertion: string;
}

export interface ControlledCrudEvidence {
  schemaVersion: 1;
  safety: {
    level: 'L3';
    mutations: true;
    maxCreatedRecords: 1;
    exactDeleteByInstanceId: true;
    sensitiveValuesRedacted: true;
  };
  expectedAppMatched: boolean;
  resourceKey: 'platform.formSandbox';
  phase: 'idle' | 'preparing' | 'awaiting-delete' | 'deleting' | 'complete' | 'failed';
  bridge: { available: boolean; ready: boolean; source: string; methods: string[] };
  markerGenerated: boolean;
  steps: CrudStepEvidence[];
  cleanup: { required: boolean; completed: boolean; remainingRecords: number | null };
  error?: string;
}

export interface PendingCrudRecord {
  marker: string;
  formInstId: string;
  formUuid: string;
  fields: CrudFields;
}

export interface CrudPreparationResult {
  evidence: ControlledCrudEvidence;
  pending: PendingCrudRecord | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function accessibleWindows(root: Record<string, unknown>) {
  const candidates: Array<{ source: ControlledCrudPort['source']; value: Record<string, unknown> }> = [
    { source: 'current', value: root },
  ];
  for (const source of ['parent', 'top'] as const) {
    try {
      const value = root[source];
      if (isRecord(value) && !candidates.some((item) => item.value === value))
        candidates.push({ source, value });
    } catch (_error) {
      continue;
    }
  }
  return candidates;
}

const CRUD_METHODS: CrudMethodName[] = [
  'searchFormDatas',
  'saveFormData',
  'getFormDataById',
  'updateFormData',
  'deleteFormData',
];

export function createControlledCrudPort(rootValue: unknown): ControlledCrudPort | null {
  const root = isRecord(rootValue) ? rootValue : {};
  for (const candidate of accessibleWindows(root)) {
    const raw = candidate.value.__OPENYIDA_YIDA_API__ || candidate.value.openyidaYidaApi;
    if (!isRecord(raw)) continue;
    const bridge = raw as RuntimeCrudBridge;
    const methods = CRUD_METHODS.filter((name) => typeof bridge[name] === 'function');
    if (!methods.length) continue;
    const requireMethod = (name: CrudMethodName) => {
      const method = bridge[name];
      if (typeof method !== 'function') throw new Error(`受控 CRUD 方法不可用：${name}`);
      return method;
    };
    return {
      source: candidate.source,
      ready: bridge.ready !== false,
      methods,
      search(formUuid, tagFieldId, marker) {
        return Promise.resolve(
          requireMethod('searchFormDatas')({
            formUuid,
            currentPage: 1,
            pageSize: 10,
            searchFieldJson: JSON.stringify([
              {
                key: tagFieldId,
                value: marker,
                type: 'TEXT',
                operator: 'eq',
                componentName: 'TextField',
              },
            ]),
          }),
        );
      },
      create(appType, formUuid, formData) {
        return Promise.resolve(
          requireMethod('saveFormData')({ appType, formUuid, formDataJson: JSON.stringify(formData) }),
        );
      },
      get(formInstId) {
        return Promise.resolve(requireMethod('getFormDataById')({ formInstId }));
      },
      update(formInstId, formData) {
        return Promise.resolve(
          requireMethod('updateFormData')({
            formInstId,
            updateFormDataJson: JSON.stringify(formData),
            useLatestVersion: 'y',
          }),
        );
      },
      delete(formInstId) {
        return Promise.resolve(requireMethod('deleteFormData')({ formInstId }));
      },
    };
  }
  return null;
}

function nestedValues(rootValue: unknown, maxDepth = 5) {
  const values: unknown[] = [];
  const queue: Array<{ value: unknown; depth: number }> = [{ value: rootValue, depth: 0 }];
  const seen = new Set<unknown>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current.value) || current.depth > maxDepth) continue;
    seen.add(current.value);
    values.push(current.value);
    if (Array.isArray(current.value)) {
      for (const value of current.value) queue.push({ value, depth: current.depth + 1 });
    } else if (isRecord(current.value)) {
      for (const value of Object.values(current.value)) queue.push({ value, depth: current.depth + 1 });
    }
  }
  return values;
}

function extractRows(value: unknown) {
  for (const candidate of nestedValues(value)) {
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }
  return [];
}

function extractInstanceId(value: unknown) {
  for (const candidate of nestedValues(value)) {
    if (typeof candidate === 'string' && /^FINST[-_]/.test(candidate)) return candidate;
    if (isRecord(candidate)) {
      for (const key of ['formInstId', 'formInstanceId', 'instanceId', 'id', 'result']) {
        const id = candidate[key];
        if (typeof id === 'string' && /^FINST[-_]/.test(id)) return id;
      }
    }
  }
  return null;
}

function formDataOf(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const raw = value.formData || value.data;
  if (isRecord(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) return parsed;
    } catch (_error) {
      return {};
    }
  }
  return value;
}

function assertSuccessfulResponse(value: unknown, method: CrudMethodName) {
  for (const candidate of nestedValues(value, 2)) {
    if (isRecord(candidate) && candidate.success === false) {
      throw new Error(`${method} 返回失败`);
    }
  }
}

function assertSingleTaggedRow(rows: Record<string, unknown>[], fields: CrudFields, marker: string) {
  if (rows.length !== 1) throw new Error(`标记查询应返回 1 条，实际 ${rows.length} 条`);
  const data = formDataOf(rows[0]);
  if (data[fields.experimentTag] !== marker) throw new Error('查询结果的实验标记不匹配');
  return rows[0];
}

function baseEvidence(port: ControlledCrudPort | null, expectedAppMatched: boolean): ControlledCrudEvidence {
  return {
    schemaVersion: 1,
    safety: {
      level: 'L3',
      mutations: true,
      maxCreatedRecords: 1,
      exactDeleteByInstanceId: true,
      sensitiveValuesRedacted: true,
    },
    expectedAppMatched,
    resourceKey: 'platform.formSandbox',
    phase: 'idle',
    bridge: {
      available: Boolean(port),
      ready: Boolean(port?.ready),
      source: port?.source || 'none',
      methods: port?.methods || [],
    },
    markerGenerated: false,
    steps: [],
    cleanup: { required: false, completed: false, remainingRecords: null },
  };
}

function passed(name: CrudStepName, method: CrudMethodName, assertion: string): CrudStepEvidence {
  return { name, method, status: 'passed', assertion };
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 180);
  if (isRecord(error)) {
    const fields = ['errorCode', 'code', 'errorMsg', 'message']
      .map((key) => error[key])
      .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
      .map(String)
      .filter(Boolean);
    if (fields.length) return fields.join(' | ').slice(0, 180);
  }
  return String(error || '未知错误').slice(0, 180);
}

export function inspectControlledCrud(root: unknown, expectedAppMatched: boolean) {
  return baseEvidence(createControlledCrudPort(root), expectedAppMatched);
}

export async function prepareControlledCrud(input: {
  root: unknown;
  appType: string;
  formUuid: string;
  fields: CrudFields;
  marker: string;
}): Promise<CrudPreparationResult> {
  const port = createControlledCrudPort(input.root);
  const evidence = baseEvidence(port, Boolean(input.appType));
  evidence.phase = 'preparing';
  evidence.markerGenerated = true;
  let pending: PendingCrudRecord | null = null;
  try {
    if (!input.appType) throw new Error('运行时应用与构建目标不一致');
    if (!port || !port.ready) throw new Error('宜搭 CRUD 桥不可用');
    const missing = CRUD_METHODS.filter((name) => !port.methods.includes(name));
    if (missing.length) throw new Error(`CRUD 桥缺少方法：${missing.join(', ')}`);

    const before = extractRows(await port.search(input.formUuid, input.fields.experimentTag, input.marker));
    if (before.length !== 0) throw new Error('本轮实验标记已经存在，停止创建');
    evidence.steps.push(passed('preflight-search', 'searchFormDatas', 'marker count equals zero'));

    const createdAt = Date.now();
    const createResponse = await port.create(input.appType, input.formUuid, {
      [input.fields.experimentTag]: input.marker,
      [input.fields.operationType]: 'create',
      [input.fields.summary]: '受控 CRUD 初始记录',
      [input.fields.payload]: JSON.stringify({ schemaVersion: 1, phase: 'created' }),
      [input.fields.experimentTime]: createdAt,
    });
    assertSuccessfulResponse(createResponse, 'saveFormData');
    const formInstId = extractInstanceId(createResponse);
    if (!formInstId) throw new Error('创建成功但未识别到真实 formInstId');
    pending = { marker: input.marker, formInstId, formUuid: input.formUuid, fields: input.fields };
    evidence.steps.push(
      passed('create', 'saveFormData', 'one tagged record created and instance id captured'),
    );

    const createdRows = extractRows(
      await port.search(input.formUuid, input.fields.experimentTag, input.marker),
    );
    const createdRow = assertSingleTaggedRow(createdRows, input.fields, input.marker);
    if (extractInstanceId(createdRow) !== formInstId) throw new Error('创建后查询返回的实例 ID 不匹配');
    evidence.steps.push(
      passed('search-after-create', 'searchFormDatas', 'exact marker returns one created record'),
    );

    const detail = await port.get(formInstId);
    assertSuccessfulResponse(detail, 'getFormDataById');
    const detailData = formDataOf(
      nestedValues(detail).find((value) => isRecord(value) && isRecord(value.formData)) || detail,
    );
    if (detailData[input.fields.experimentTag] !== input.marker) throw new Error('详情返回的实验标记不匹配');
    evidence.steps.push(passed('get-created-record', 'getFormDataById', 'detail marker matches current run'));

    const updateResponse = await port.update(formInstId, {
      [input.fields.operationType]: 'update',
      [input.fields.summary]: '受控 CRUD 已更新',
      [input.fields.payload]: JSON.stringify({ schemaVersion: 1, phase: 'updated' }),
      [input.fields.experimentTime]: Date.now(),
    });
    assertSuccessfulResponse(updateResponse, 'updateFormData');
    evidence.steps.push(passed('update', 'updateFormData', 'only the captured instance was updated'));

    const updatedRows = extractRows(
      await port.search(input.formUuid, input.fields.experimentTag, input.marker),
    );
    const updatedData = formDataOf(assertSingleTaggedRow(updatedRows, input.fields, input.marker));
    const operationValue =
      updatedData[`${input.fields.operationType}_id`] || updatedData[input.fields.operationType];
    if (operationValue !== 'update' || updatedData[input.fields.summary] !== '受控 CRUD 已更新') {
      throw new Error('更新后查询未返回预期字段值');
    }
    evidence.steps.push(passed('search-after-update', 'searchFormDatas', 'updated values are observable'));
    evidence.phase = 'awaiting-delete';
    evidence.cleanup.required = true;
    return { evidence, pending };
  } catch (error) {
    evidence.phase = 'failed';
    evidence.cleanup.required = Boolean(pending);
    evidence.error = safeErrorMessage(error);
    return { evidence, pending };
  }
}

export async function deleteControlledCrud(input: {
  root: unknown;
  expectedAppMatched: boolean;
  pending: PendingCrudRecord;
  previousEvidence: ControlledCrudEvidence;
}) {
  const evidence: ControlledCrudEvidence = {
    ...input.previousEvidence,
    phase: 'deleting',
    steps: [...input.previousEvidence.steps],
    cleanup: { ...input.previousEvidence.cleanup },
    error: undefined,
  };
  try {
    if (!input.expectedAppMatched) throw new Error('运行时应用与构建目标不一致');
    const port = createControlledCrudPort(input.root);
    if (!port || !port.ready) throw new Error('宜搭 CRUD 桥不可用');
    const rows = extractRows(
      await port.search(input.pending.formUuid, input.pending.fields.experimentTag, input.pending.marker),
    );
    const row = assertSingleTaggedRow(rows, input.pending.fields, input.pending.marker);
    if (extractInstanceId(row) !== input.pending.formInstId) {
      throw new Error('删除前查询的实例 ID 与本轮创建结果不一致');
    }
    evidence.steps.push(
      passed('delete-preflight', 'searchFormDatas', 'one exact tagged instance is eligible'),
    );

    const deleted = await port.delete(input.pending.formInstId);
    assertSuccessfulResponse(deleted, 'deleteFormData');
    evidence.steps.push(passed('delete', 'deleteFormData', 'captured formInstId deleted'));

    const remaining = extractRows(
      await port.search(input.pending.formUuid, input.pending.fields.experimentTag, input.pending.marker),
    );
    if (remaining.length !== 0) throw new Error(`删除后仍查询到 ${remaining.length} 条本轮记录`);
    evidence.steps.push(passed('confirm-absent', 'searchFormDatas', 'exact marker count equals zero'));
    evidence.phase = 'complete';
    evidence.cleanup = { required: false, completed: true, remainingRecords: 0 };
  } catch (error) {
    evidence.phase = 'failed';
    evidence.cleanup.required = true;
    evidence.error = safeErrorMessage(error);
  }
  return evidence;
}
