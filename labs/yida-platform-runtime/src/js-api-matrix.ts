export type JsApiMatrixMethod =
  | 'searchFormDataIds'
  | 'getProcessInstanceIds'
  | 'getLoginUserId'
  | 'getLoginUserName'
  | 'getLocale'
  | 'isMobile'
  | 'isSubmissionPage'
  | 'isViewPage'
  | 'getDateTimeRange'
  | 'formatter';

export type ControlledUiMethod = 'toast' | 'dialog' | 'previewImage' | 'openPage' | 'routerPush';
export type ExternalAssetMethod = 'loadScript' | 'loadStyleSheet';

type MatrixStatus = 'verified' | 'failed' | 'unsupported';
type UiMatrixStatus = 'ready' | MatrixStatus;
type BridgeSource = 'current' | 'parent' | 'top';

interface RuntimeMatrixBridge {
  ready?: boolean;
  capabilities?: Record<string, boolean>;
  searchFormDataIds?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  getProcessInstanceIds?: (params: Record<string, unknown>) => Promise<unknown> | unknown;
  getLoginUserId?: () => Promise<unknown> | unknown;
  getLoginUserName?: () => Promise<unknown> | unknown;
  getLocale?: () => Promise<unknown> | unknown;
  isMobile?: () => Promise<unknown> | unknown;
  isSubmissionPage?: () => Promise<unknown> | unknown;
  isViewPage?: () => Promise<unknown> | unknown;
  getDateTimeRange?: (when: number, type: string) => Promise<unknown> | unknown;
  formatter?: (type: string, value: number, format: string) => Promise<unknown> | unknown;
  toast?: (options: Record<string, unknown>) => Promise<unknown> | unknown;
  dialog?: (options: Record<string, unknown>) => Promise<unknown> | unknown;
  previewImage?: (options: Record<string, unknown>) => Promise<unknown> | unknown;
  openPage?: (target: string) => Promise<unknown> | unknown;
  loadScript?: (url: string) => Promise<unknown> | unknown;
  loadStyleSheet?: (url: string) => Promise<unknown> | unknown;
  routerPush?: (
    target: string,
    params?: Record<string, unknown>,
    newTab?: boolean,
    isExternal?: boolean,
  ) => Promise<unknown> | unknown;
}

interface MatrixPort {
  source: BridgeSource;
  ready: boolean;
  capabilities: Record<string, boolean>;
  bridge: RuntimeMatrixBridge;
}

interface ResponseShape {
  kind: string;
  topLevelKeys: string[];
  collectionCount: number | null;
  valuePresent: boolean;
}

export interface JsApiMatrixEvidence {
  schemaVersion: 1;
  safety: {
    level: 'L4-readonly';
    mutations: false;
    sensitiveValuesRedacted: true;
    autoRun: true;
  };
  expectedAppMatched: boolean;
  bridge: { available: boolean; ready: boolean; source: string };
  summary: { total: number; verified: number; failed: number; unsupported: number };
  uiSummary: {
    total: number;
    ready: number;
    verified: number;
    failed: number;
    unsupported: number;
  };
  assetSummary: {
    total: number;
    ready: number;
    verified: number;
    failed: number;
    unsupported: number;
  };
  checks: Array<{
    method: JsApiMatrixMethod;
    category: 'data-id-query' | 'identity' | 'context' | 'pure-utility';
    official: true;
    observed: boolean;
    status: MatrixStatus;
    responseShape?: ResponseShape;
    message?: string;
  }>;
  uiChecks: Array<{
    method: ControlledUiMethod;
    category: 'controlled-ui';
    official: true;
    observed: boolean;
    status: UiMatrixStatus;
    message?: string;
  }>;
  assetChecks: Array<{
    method: ExternalAssetMethod;
    category: 'external-asset';
    official: true;
    observed: boolean;
    status: UiMatrixStatus;
    message?: string;
  }>;
}

const METHOD_SPECS: Array<{
  method: JsApiMatrixMethod;
  category: JsApiMatrixEvidence['checks'][number]['category'];
}> = [
  { method: 'searchFormDataIds', category: 'data-id-query' },
  { method: 'getProcessInstanceIds', category: 'data-id-query' },
  { method: 'getLoginUserId', category: 'identity' },
  { method: 'getLoginUserName', category: 'identity' },
  { method: 'getLocale', category: 'context' },
  { method: 'isMobile', category: 'context' },
  { method: 'isSubmissionPage', category: 'context' },
  { method: 'isViewPage', category: 'context' },
  { method: 'getDateTimeRange', category: 'pure-utility' },
  { method: 'formatter', category: 'pure-utility' },
];

const CONTROLLED_UI_SPECS: Array<{
  method: ControlledUiMethod;
  category: 'controlled-ui';
}> = [
  { method: 'toast', category: 'controlled-ui' },
  { method: 'dialog', category: 'controlled-ui' },
  { method: 'previewImage', category: 'controlled-ui' },
  { method: 'openPage', category: 'controlled-ui' },
  { method: 'routerPush', category: 'controlled-ui' },
];

const EXTERNAL_ASSET_SPECS: Array<{
  method: ExternalAssetMethod;
  category: 'external-asset';
}> = [
  { method: 'loadScript', category: 'external-asset' },
  { method: 'loadStyleSheet', category: 'external-asset' },
];

const PROBE_SCRIPT_URL = 'https://g.alicdn.com/code/lib/qrcodejs/1.0.0/qrcode.min.js';
const PROBE_STYLE_URL = 'https://g.alicdn.com/code/lib/normalize/8.0.1/normalize.min.css';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function accessibleWindows(root: Record<string, unknown>) {
  const candidates: Array<{ source: BridgeSource; value: Record<string, unknown> }> = [
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

function createMatrixPort(rootValue: unknown): MatrixPort | null {
  const root = isRecord(rootValue) ? rootValue : {};
  for (const candidate of accessibleWindows(root)) {
    const raw = candidate.value.__OPENYIDA_YIDA_API__ || candidate.value.openyidaYidaApi;
    if (!isRecord(raw)) continue;
    const bridge = raw as RuntimeMatrixBridge;
    return {
      source: candidate.source,
      ready: bridge.ready !== false,
      capabilities: isRecord(bridge.capabilities) ? bridge.capabilities : {},
      bridge,
    };
  }
  return null;
}

function firstCollection(value: unknown, depth = 0): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value) || depth > 5) return null;
  for (const key of ['data', 'records', 'list', 'values', 'result', 'content']) {
    const result = firstCollection(value[key], depth + 1);
    if (result) return result;
  }
  return null;
}

function summarizeResponse(value: unknown): ResponseShape {
  const collection = firstCollection(value);
  return {
    kind: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
    topLevelKeys: isRecord(value)
      ? Object.keys(value)
          .filter((key) => !/(token|secret|cookie|password|authorization|credential|session)/i.test(key))
          .sort()
          .slice(0, 30)
      : [],
    collectionCount: collection ? collection.length : null,
    valuePresent: value !== undefined && value !== null && value !== '',
  };
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '未知错误');
  return message
    .replace(/\b(?:APP_[A-Za-z0-9_-]+|FORM-[A-Za-z0-9_-]+|ding[A-Za-z0-9_-]+)\b/g, '[redacted]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[redacted]')
    .replace(/\b\d{6,}\b/g, '[redacted]')
    .slice(0, 180);
}

function requireMethod(bridge: RuntimeMatrixBridge, method: JsApiMatrixMethod) {
  const value = bridge[method];
  if (typeof value !== 'function') throw new Error(`API 方法不可用：${method}`);
  return value as (...args: unknown[]) => unknown;
}

function requireUiMethod(bridge: RuntimeMatrixBridge, method: ControlledUiMethod) {
  const value = bridge[method];
  if (typeof value !== 'function') throw new Error(`API 方法不可用：${method}`);
  return value as (...args: unknown[]) => unknown;
}

function requireAssetMethod(bridge: RuntimeMatrixBridge, method: ExternalAssetMethod) {
  const value = bridge[method];
  if (typeof value !== 'function') throw new Error(`API 方法不可用：${method}`);
  return value as (url: string) => unknown;
}

function callMethod(
  bridge: RuntimeMatrixBridge,
  method: JsApiMatrixMethod,
  formUuid: string,
  processFormUuid: string,
) {
  if (method === 'searchFormDataIds') {
    return requireMethod(
      bridge,
      method,
    )({
      formUuid,
      currentPage: 1,
      pageSize: 5,
      searchFieldJson: '',
    });
  }
  if (method === 'getProcessInstanceIds') {
    return requireMethod(
      bridge,
      method,
    )({
      formUuid: processFormUuid,
      instanceStatus: 'COMPLETED',
      currentPage: 1,
      pageSize: 5,
      searchFieldJson: '',
    });
  }
  if (method === 'getDateTimeRange') {
    return requireMethod(bridge, method)(Date.UTC(2024, 0, 15, 12), 'day');
  }
  if (method === 'formatter') {
    return requireMethod(bridge, method)('date', Date.UTC(2024, 0, 15, 12), 'YYYY-MM-DD');
  }
  return requireMethod(bridge, method)();
}

export async function runJsApiMatrixProbe(input: {
  root: unknown;
  expectedAppMatched: boolean;
  formUuid: string;
  processFormUuid: string;
}): Promise<JsApiMatrixEvidence> {
  const port = createMatrixPort(input.root);
  const evidence: JsApiMatrixEvidence = {
    schemaVersion: 1,
    safety: {
      level: 'L4-readonly',
      mutations: false,
      sensitiveValuesRedacted: true,
      autoRun: true,
    },
    expectedAppMatched: input.expectedAppMatched,
    bridge: {
      available: Boolean(port),
      ready: Boolean(port?.ready),
      source: port?.source || 'none',
    },
    summary: { total: METHOD_SPECS.length, verified: 0, failed: 0, unsupported: 0 },
    uiSummary: {
      total: CONTROLLED_UI_SPECS.length,
      ready: 0,
      verified: 0,
      failed: 0,
      unsupported: 0,
    },
    assetSummary: {
      total: EXTERNAL_ASSET_SPECS.length,
      ready: 0,
      verified: 0,
      failed: 0,
      unsupported: 0,
    },
    checks: [],
    uiChecks: CONTROLLED_UI_SPECS.map((spec) => {
      const observed =
        port?.capabilities[spec.method] === true && typeof port.bridge[spec.method] === 'function';
      return {
        ...spec,
        official: true as const,
        observed,
        status: observed && port?.ready ? ('ready' as const) : ('unsupported' as const),
        ...(!observed || !port?.ready ? { message: '当前页面桥未暴露此方法' } : {}),
      };
    }),
    assetChecks: EXTERNAL_ASSET_SPECS.map((spec) => {
      const observed =
        port?.capabilities[spec.method] === true && typeof port.bridge[spec.method] === 'function';
      return {
        ...spec,
        official: true as const,
        observed,
        status: observed && port?.ready ? ('ready' as const) : ('unsupported' as const),
        ...(!observed || !port?.ready ? { message: '当前页面桥未暴露此方法' } : {}),
      };
    }),
  };
  for (const spec of METHOD_SPECS) {
    const observed =
      port?.capabilities[spec.method] === true && typeof port.bridge[spec.method] === 'function';
    if (!port || !port.ready || !observed) {
      evidence.checks.push({
        ...spec,
        official: true,
        observed,
        status: 'unsupported',
        message: '当前页面桥未暴露此方法',
      });
      continue;
    }
    if (!input.expectedAppMatched && spec.category === 'data-id-query') {
      evidence.checks.push({
        ...spec,
        official: true,
        observed,
        status: 'failed',
        message: '构建目标与当前应用不一致，已阻止资源查询',
      });
      continue;
    }
    try {
      const result = await Promise.resolve(
        callMethod(port.bridge, spec.method, input.formUuid, input.processFormUuid),
      );
      if (isRecord(result) && result.success === false) throw new Error('API 返回 success=false');
      evidence.checks.push({
        ...spec,
        official: true,
        observed,
        status: 'verified',
        responseShape: summarizeResponse(result),
      });
    } catch (error) {
      evidence.checks.push({
        ...spec,
        official: true,
        observed,
        status: 'failed',
        message: safeError(error),
      });
    }
  }
  evidence.summary = {
    total: evidence.checks.length,
    verified: evidence.checks.filter((check) => check.status === 'verified').length,
    failed: evidence.checks.filter((check) => check.status === 'failed').length,
    unsupported: evidence.checks.filter((check) => check.status === 'unsupported').length,
  };
  evidence.uiSummary = {
    total: evidence.uiChecks.length,
    ready: evidence.uiChecks.filter((check) => check.status === 'ready').length,
    verified: evidence.uiChecks.filter((check) => check.status === 'verified').length,
    failed: evidence.uiChecks.filter((check) => check.status === 'failed').length,
    unsupported: evidence.uiChecks.filter((check) => check.status === 'unsupported').length,
  };
  evidence.assetSummary = {
    total: evidence.assetChecks.length,
    ready: evidence.assetChecks.filter((check) => check.status === 'ready').length,
    verified: evidence.assetChecks.filter((check) => check.status === 'verified').length,
    failed: evidence.assetChecks.filter((check) => check.status === 'failed').length,
    unsupported: evidence.assetChecks.filter((check) => check.status === 'unsupported').length,
  };
  return evidence;
}

export async function runControlledUiApi(input: {
  root: unknown;
  expectedAppMatched: boolean;
  method: ControlledUiMethod;
  targetPagePath: string;
  targetFormUuid: string;
}): Promise<JsApiMatrixEvidence['uiChecks'][number]> {
  const port = createMatrixPort(input.root);
  const observed =
    port?.capabilities[input.method] === true && typeof port.bridge[input.method] === 'function';
  const base = {
    method: input.method,
    category: 'controlled-ui' as const,
    official: true as const,
    observed,
  };
  if (!port || !port.ready || !observed) {
    return { ...base, status: 'unsupported', message: '当前页面桥未暴露此方法' };
  }
  if (!input.expectedAppMatched && (input.method === 'openPage' || input.method === 'routerPush')) {
    return { ...base, status: 'failed', message: '构建目标与当前应用不一致，已阻止页面跳转' };
  }
  try {
    if (input.method === 'toast') {
      await Promise.resolve(
        requireUiMethod(
          port.bridge,
          input.method,
        )({
          title: 'JS API 能力矩阵验证',
          type: 'success',
          duration: 1500,
        }),
      );
    } else if (input.method === 'dialog') {
      await Promise.resolve(
        requireUiMethod(
          port.bridge,
          input.method,
        )({
          type: 'alert',
          title: '宜搭 JS API 能力矩阵',
          content: 'dialog API 验证',
          footerActions: ['ok'],
        }),
      );
    } else if (input.method === 'previewImage') {
      const image =
        'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#31599b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="34">Yida JS API Matrix</text></svg>',
        );
      await Promise.resolve(requireUiMethod(port.bridge, input.method)({ current: image, urls: [image] }));
    } else if (input.method === 'openPage') {
      if (!input.targetPagePath) throw new Error('目标页面路径缺失');
      await Promise.resolve(requireUiMethod(port.bridge, input.method)(input.targetPagePath));
    } else {
      if (!input.targetFormUuid) throw new Error('目标页面 ID 缺失');
      await Promise.resolve(
        requireUiMethod(port.bridge, input.method)(
          input.targetFormUuid,
          { yidaLabProbe: 'routerPush' },
          true,
          false,
        ),
      );
    }
    return { ...base, status: 'verified' };
  } catch (error) {
    return { ...base, status: 'failed', message: safeError(error) };
  }
}

export async function runExternalAssetApi(input: {
  root: unknown;
  method: ExternalAssetMethod;
}): Promise<JsApiMatrixEvidence['assetChecks'][number]> {
  const port = createMatrixPort(input.root);
  const observed =
    port?.capabilities[input.method] === true && typeof port.bridge[input.method] === 'function';
  const base = {
    method: input.method,
    category: 'external-asset' as const,
    official: true as const,
    observed,
  };
  if (!port || !port.ready || !observed) {
    return { ...base, status: 'unsupported', message: '当前页面桥未暴露此方法' };
  }
  try {
    const root = isRecord(input.root) ? input.root : {};
    if (input.method === 'loadScript') {
      await Promise.resolve(requireAssetMethod(port.bridge, input.method)(PROBE_SCRIPT_URL));
      if (typeof root.QRCode !== 'function') throw new Error('脚本加载完成但 QRCode 全局未出现');
    } else {
      await Promise.resolve(requireAssetMethod(port.bridge, input.method)(PROBE_STYLE_URL));
      const documentValue = root.document as Document | undefined;
      const loaded = Array.from(documentValue?.querySelectorAll('link[rel="stylesheet"]') || []).some(
        (node) => (node as HTMLLinkElement).href === PROBE_STYLE_URL,
      );
      if (!loaded) throw new Error('样式加载完成但 stylesheet link 未出现');
    }
    return { ...base, status: 'verified' };
  } catch (error) {
    return { ...base, status: 'failed', message: safeError(error) };
  }
}

export const JS_API_MATRIX_METHODS = METHOD_SPECS.map((spec) => spec.method);
export const CONTROLLED_UI_METHODS = CONTROLLED_UI_SPECS.map((spec) => spec.method);
export const EXTERNAL_ASSET_METHODS = EXTERNAL_ASSET_SPECS.map((spec) => spec.method);
