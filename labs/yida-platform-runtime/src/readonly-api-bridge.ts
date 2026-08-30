export type ReadonlyMethodName = 'getFormComponentDefinationList' | 'searchFormDatas';

interface RuntimeBridge {
  ready?: boolean;
  getFormComponentDefinationList?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  searchFormDatas?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface ReadonlyPort {
  source: 'current' | 'parent' | 'top';
  ready: boolean;
  methods: ReadonlyMethodName[];
  getFormDefinition(formUuid: string): Promise<unknown>;
  searchFormDatas(formUuid: string): Promise<unknown>;
}

export interface ReadonlyProbeEvidence {
  schemaVersion: 1;
  safety: { level: 'L2'; sensitiveValuesRedacted: true; mutations: false };
  expectedAppMatched: boolean;
  resourceKey: 'platform.formSandbox';
  currentUserContext: { available: boolean; fieldNames: string[] };
  bridge: { available: boolean; ready: boolean; source: string; methods: string[] };
  checks: Array<{
    method: ReadonlyMethodName;
    status: 'passed' | 'failed' | 'unsupported';
    responseShape?: ResponseShape;
    message?: string;
  }>;
}

interface ResponseShape {
  kind: string;
  topLevelKeys: string[];
  collectionCount: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function accessibleWindows(root: Record<string, unknown>) {
  const candidates: Array<{ source: ReadonlyPort['source']; value: Record<string, unknown> }> = [
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

export function createReadonlyYidaPort(rootValue: unknown): ReadonlyPort | null {
  const root = isRecord(rootValue) ? rootValue : {};
  for (const candidate of accessibleWindows(root)) {
    const raw = candidate.value.__OPENYIDA_YIDA_API__ || candidate.value.openyidaYidaApi;
    if (!isRecord(raw)) continue;
    const bridge = raw as RuntimeBridge;
    const methods = (['getFormComponentDefinationList', 'searchFormDatas'] as const).filter(
      (name) => typeof bridge[name] === 'function',
    );
    if (!methods.length) continue;
    return {
      source: candidate.source,
      ready: bridge.ready !== false,
      methods,
      getFormDefinition(formUuid) {
        if (typeof bridge.getFormComponentDefinationList !== 'function') {
          return Promise.reject(new Error('只读字段定义方法不可用'));
        }
        return Promise.resolve(bridge.getFormComponentDefinationList({ formUuid }));
      },
      searchFormDatas(formUuid) {
        if (typeof bridge.searchFormDatas !== 'function') {
          return Promise.reject(new Error('只读表单查询方法不可用'));
        }
        return Promise.resolve(
          bridge.searchFormDatas({ formUuid, currentPage: 1, pageSize: 10, searchFieldJson: '' }),
        );
      },
    };
  }
  return null;
}

function firstCollection(value: unknown, depth = 0): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value) || depth > 4) return null;
  for (const key of ['data', 'records', 'list', 'values', 'result', 'content']) {
    const result = firstCollection(value[key], depth + 1);
    if (result) return result;
  }
  return null;
}

export function summarizeReadonlyResponse(value: unknown): ResponseShape {
  const collection = firstCollection(value);
  return {
    kind: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
    topLevelKeys: isRecord(value)
      ? Object.keys(value)
          .filter((key) => !/(token|secret|cookie|password|authorization)/i.test(key))
          .sort()
          .slice(0, 40)
      : [],
    collectionCount: collection ? collection.length : null,
  };
}

function currentUserContext(rootValue: unknown) {
  const root = isRecord(rootValue) ? rootValue : {};
  for (const candidate of accessibleWindows(root)) {
    const value = candidate.value.loginUser;
    if (isRecord(value)) {
      return {
        available: true,
        fieldNames: Object.keys(value)
          .filter((key) => !/(token|secret|cookie|password)/i.test(key))
          .sort(),
      };
    }
  }
  return { available: false, fieldNames: [] };
}

export async function runReadonlyProbe(input: {
  root: unknown;
  formUuid: string;
  expectedAppMatched: boolean;
}): Promise<ReadonlyProbeEvidence> {
  const port = createReadonlyYidaPort(input.root);
  const evidence: ReadonlyProbeEvidence = {
    schemaVersion: 1,
    safety: { level: 'L2', sensitiveValuesRedacted: true, mutations: false },
    expectedAppMatched: input.expectedAppMatched,
    resourceKey: 'platform.formSandbox',
    currentUserContext: currentUserContext(input.root),
    bridge: {
      available: Boolean(port),
      ready: Boolean(port?.ready),
      source: port?.source || 'none',
      methods: port?.methods || [],
    },
    checks: [],
  };
  if (!port) {
    evidence.checks = (['getFormComponentDefinationList', 'searchFormDatas'] as const).map((method) => ({
      method,
      status: 'unsupported',
      message: '当前页面未发现只读宜搭 API 桥',
    }));
    return evidence;
  }
  const calls: Array<[ReadonlyMethodName, () => Promise<unknown>]> = [
    ['getFormComponentDefinationList', () => port.getFormDefinition(input.formUuid)],
    ['searchFormDatas', () => port.searchFormDatas(input.formUuid)],
  ];
  for (const [method, invoke] of calls) {
    if (!port.methods.includes(method)) {
      evidence.checks.push({ method, status: 'unsupported', message: '桥未暴露此只读方法' });
      continue;
    }
    try {
      const value = await invoke();
      evidence.checks.push({ method, status: 'passed', responseShape: summarizeReadonlyResponse(value) });
    } catch (error) {
      evidence.checks.push({
        method,
        status: 'failed',
        message: error instanceof Error ? error.message.slice(0, 180) : '未知错误',
      });
    }
  }
  return evidence;
}
