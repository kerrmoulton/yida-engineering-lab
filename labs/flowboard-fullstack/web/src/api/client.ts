import {
  createTaskSchema,
  healthResponseSchema,
  taskListResponseSchema,
  taskResponseSchema,
  updateTaskSchema,
} from '../../../shared/task-contract.ts';
import type { CreateTaskInput, UpdateTaskInput } from '../../../shared/task-contract.ts';
import contractJson from '../../../../../contracts/flowboard-api.contract.json';
import { getLabConnectorId, getLabRuntimeProfile, getLabServiceUrl } from '@yida-lab/runtime';

type TransportKind = 'direct' | 'connector';
type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface ApiOperation {
  key: string;
  title: string;
  direct: { method: HttpMethod; path: string };
  connector: { operationId: string; method: HttpMethod; path: string };
}

interface RequestArguments {
  path?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

interface RequestResult {
  payload: unknown;
  requestId: string;
}

const TRANSPORT_STORAGE_KEY = 'yidaEngineeringLab.transport';
const API_BASE_URL = getLabServiceUrl('flowboardApi');
const CONNECTOR_ID = getLabConnectorId('flowboardApi');
const RUNTIME_PROFILE = getLabRuntimeProfile();
const OPERATIONS = new Map(
  (contractJson.operations as ApiOperation[]).map((operation) => [operation.key, operation]),
);

function createRequestId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `flowboard-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch (_error) {
    return value;
  }
}

function browserContexts() {
  const contexts: Window[] = [];
  for (const candidate of [window, window.parent, window.top]) {
    try {
      if (candidate && !contexts.includes(candidate)) contexts.push(candidate);
    } catch (_error) {}
  }
  return contexts;
}

function requestedTransport(): TransportKind | null {
  const locations: string[] = [];
  for (const context of browserContexts()) {
    try {
      locations.push(context.location.href);
    } catch (_error) {}
  }
  try {
    if (document.referrer) locations.push(document.referrer);
  } catch (_error) {}
  for (const location of locations) {
    try {
      const requested = new URL(location).searchParams.get('transport');
      if (requested === 'direct' || requested === 'connector') return requested;
    } catch (_error) {}
  }
  return null;
}

function transportStores() {
  const stores: Storage[] = [];
  for (const context of browserContexts()) {
    try {
      if (!stores.includes(context.sessionStorage)) stores.push(context.sessionStorage);
    } catch (_error) {}
  }
  return stores;
}

function readTransport(): TransportKind {
  if (!RUNTIME_PROFILE.allowDirectOverride) return RUNTIME_PROFILE.defaultTransport;
  const requested = requestedTransport();
  const stores = transportStores();
  if (requested === 'direct') stores.forEach((store) => store.setItem(TRANSPORT_STORAGE_KEY, 'direct'));
  if (requested === 'connector') stores.forEach((store) => store.removeItem(TRANSPORT_STORAGE_KEY));
  if (stores.some((store) => store.getItem(TRANSPORT_STORAGE_KEY) === 'direct')) return 'direct';
  return RUNTIME_PROFILE.defaultTransport;
}

export const API_TRANSPORT: TransportKind = readTransport();
export const CAN_RESET_TRANSPORT =
  API_TRANSPORT === 'direct' && RUNTIME_PROFILE.defaultTransport === 'connector';
export const API_ENDPOINT_LABEL =
  API_TRANSPORT === 'direct' ? API_BASE_URL : `宜搭连接器 · ${contractJson.prefix}`;

export function resetTransportOverride() {
  transportStores().forEach((store) => store.removeItem(TRANSPORT_STORAGE_KEY));
  window.location.reload();
}

function interpolatePath(template: string, parameters: Record<string, string> = {}) {
  return template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = parameters[name];
    if (!value) throw new Error(`API 路径缺少参数：${name}`);
    return encodeURIComponent(value);
  });
}

function appendQuery(path: string, query: Record<string, string> = {}) {
  const search = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== '') search.set(key, value);
  });
  return search.size ? `${path}?${search.toString()}` : path;
}

function csrfToken() {
  const windows: Window[] = [];
  try {
    windows.push(window, window.parent, window.top as Window);
  } catch (_error) {}
  const keys = ['_csrf_token', 'csrfToken', 'csrf_token', 'global_csrf_token', '_tb_token_', 'csrf'];
  for (const target of windows.filter(Boolean)) {
    const runtimeWindow = target as Window & Record<string, unknown>;
    const yida = runtimeWindow.__YIDA__ as Record<string, unknown> | undefined;
    const sources = [
      runtimeWindow.g_config,
      runtimeWindow.pageConfig,
      runtimeWindow.YIDA_CONFIG,
      yida,
      yida?.config,
      yida?.pageConfig,
    ];
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      for (const key of keys) {
        const value = (source as Record<string, unknown>)[key];
        if (value) return String(value);
      }
    }
  }
  return '';
}

async function callDirect(operation: ApiOperation, args: RequestArguments, requestId: string) {
  const path = appendQuery(interpolatePath(operation.direct.path, args.path), args.query);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: operation.direct.method,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
    signal: args.signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || `HTTP ${response.status}`;
    throw Object.assign(new Error(message), { requestId, status: response.status });
  }
  return { payload, requestId: response.headers.get('x-request-id') || requestId };
}

async function callConnector(operation: ApiOperation, args: RequestArguments, requestId: string) {
  if (!CONNECTOR_ID || CONNECTOR_ID.startsWith('#unconfigured-connector=')) {
    throw new Error('当前构建未配置 Flowboard 宜搭连接器');
  }
  const token = csrfToken();
  const inputs = {
    path: args.path || {},
    query: args.query || {},
    header: { 'Content-Type': 'application/json', accept: 'application/json', 'X-Request-Id': requestId },
    body: args.body || {},
  };
  const serviceInfo = {
    connectorInfo: {
      connectorId: CONNECTOR_ID,
      actionId: operation.connector.operationId,
      type: 'httpConnector',
      connection: null,
    },
  };
  const form = new URLSearchParams();
  form.set('inputs', JSON.stringify(inputs));
  form.set('serviceInfo', JSON.stringify(serviceInfo));
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  };
  if (token) {
    headers.global_csrf_token = token;
    headers['x-csrf-token'] = token;
  }
  const response = await fetch(
    `/query/publicService/invokeService.json${token ? `?_csrf_token=${encodeURIComponent(token)}` : ''}`,
    {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form.toString(),
      signal: args.signal,
    },
  );
  const outer = parseMaybeJson(await response.text()) as Record<string, unknown> | null;
  if (!response.ok || outer?.success === false || outer?.hasError === true) {
    const message = outer?.errorMsg || outer?.msg || outer?.message || `HTTP ${response.status}`;
    throw Object.assign(new Error(String(message)), { requestId, status: response.status });
  }
  let payload: unknown = outer;
  if (payload && typeof payload === 'object' && 'content' in payload) {
    payload = (payload as Record<string, unknown>).content;
  }
  if (payload && typeof payload === 'object' && 'serviceReturnValue' in payload) {
    payload = (payload as Record<string, unknown>).serviceReturnValue;
  }
  payload = parseMaybeJson(payload);
  const payloadRequestId =
    payload && typeof payload === 'object'
      ? (payload as { meta?: { requestId?: string } }).meta?.requestId
      : undefined;
  return { payload, requestId: payloadRequestId || requestId };
}

async function request(operationKey: string, args: RequestArguments = {}): Promise<RequestResult> {
  const operation = OPERATIONS.get(operationKey);
  if (!operation) throw new Error(`未知 Flowboard API 契约键：${operationKey}`);
  const requestId = createRequestId();
  return API_TRANSPORT === 'direct'
    ? callDirect(operation, args, requestId)
    : callConnector(operation, args, requestId);
}

export async function fetchHealth(signal?: AbortSignal) {
  const result = await request('health.get', { signal });
  return { data: healthResponseSchema.parse(result.payload), requestId: result.requestId };
}

export async function fetchTasks(filters: { search: string; status: string }, signal?: AbortSignal) {
  const query: Record<string, string> = {};
  if (filters.search) query.search = filters.search;
  if (filters.status !== 'all') query.status = filters.status;
  const result = await request('tasks.list', { query, signal });
  return { data: taskListResponseSchema.parse(result.payload), requestId: result.requestId };
}

export async function createTask(input: CreateTaskInput) {
  const result = await request('tasks.create', { body: createTaskSchema.parse(input) });
  return { data: taskResponseSchema.parse(result.payload), requestId: result.requestId };
}

export async function updateTask(id: string, input: UpdateTaskInput) {
  const result = await request('tasks.update', {
    path: { id },
    body: updateTaskSchema.parse(input),
  });
  return { data: taskResponseSchema.parse(result.payload), requestId: result.requestId };
}

export async function deleteTask(id: string) {
  const result = await request('tasks.remove', { path: { id } });
  return { data: taskResponseSchema.parse(result.payload), requestId: result.requestId };
}
