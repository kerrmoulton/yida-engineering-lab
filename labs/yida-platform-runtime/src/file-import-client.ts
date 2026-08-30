import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';
import { getLabConnectorId, getLabServiceUrl } from '@yida-lab/runtime';

export type ImportRow = Record<string, string | number | boolean | null>;
export type JsonTransport = 'direct' | 'connector';
export type UploadEndpoint = 'local' | 'public';

const LOCAL_API = getLabServiceUrl('fileImportApi');
const PUBLIC_API = getLabServiceUrl('fileImportPublicApi');
const CONNECTOR_ID = getLabConnectorId('fileImportApi');

function createRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() || `file-import-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function csrfToken() {
  const targets: Window[] = [];
  try {
    targets.push(window, window.parent, window.top as Window);
  } catch {}
  const keys = ['_csrf_token', 'csrfToken', 'csrf_token', 'global_csrf_token', '_tb_token_', 'csrf'];
  for (const target of targets.filter(Boolean)) {
    const runtime = target as Window & Record<string, unknown>;
    const yida = runtime.__YIDA__ as Record<string, unknown> | undefined;
    for (const source of [runtime.g_config, runtime.pageConfig, runtime.YIDA_CONFIG, yida, yida?.config]) {
      if (!source || typeof source !== 'object') continue;
      for (const key of keys) {
        const value = (source as Record<string, unknown>)[key];
        if (value) return String(value);
      }
    }
  }
  return '';
}

export function apiUrl(endpoint: UploadEndpoint) {
  return endpoint === 'local' ? LOCAL_API : PUBLIC_API;
}

export function endpointLabel(endpoint: UploadEndpoint) {
  return `${apiUrl(endpoint)}/import/upload`;
}

export async function createSyntheticWorkbookFile() {
  const blob = await writeXlsxFile([
    ['recordId', 'name', 'amount', 'active'],
    ['SYN-001', '伪造记录一', 12.5, true],
    ['SYN-002', '伪造记录二', 8, false],
    ['SYN-003', '伪造记录三', 21, true],
  ]).toBlob();
  return new File([blob], 'openyida-synthetic-import.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function normalizeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

export async function parseWorkbook(file: File) {
  const sheets = await readXlsxFile(file);
  const values = sheets[0]?.data || [];
  if (values.length < 2) throw new Error('Excel 至少需要一行表头和一行数据');
  const columns = values[0].map((value, index) => String(value || `column_${index + 1}`).trim());
  if (new Set(columns).size !== columns.length) throw new Error('Excel 表头不能重复');
  const rows = values
    .slice(1)
    .map((row) => Object.fromEntries(columns.map((column, index) => [column, normalizeCell(row[index])])));
  return { columns, rows };
}

export async function uploadMultipart(file: File, endpoint: UploadEndpoint) {
  const body = new FormData();
  body.set('file', file);
  body.set('source', `canvas-${endpoint}`);
  const response = await fetch(`${apiUrl(endpoint)}/import/upload`, {
    method: 'POST',
    headers: { 'X-Request-Id': createRequestId(), 'X-Import-Source': 'yida-canvas' },
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error?.code || `HTTP ${response.status}`);
  }
  return payload;
}

async function invokeConnector(operationId: string, body: Record<string, unknown>) {
  const token = csrfToken();
  const inputs = {
    path: {},
    query: {},
    header: { 'Content-Type': 'application/json', accept: 'application/json' },
    body,
  };
  const serviceInfo = {
    connectorInfo: {
      connectorId: CONNECTOR_ID,
      actionId: operationId,
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
    { method: 'POST', credentials: 'include', headers, body: form.toString() },
  );
  const outer = parseMaybeJson(await response.text()) as Record<string, unknown> | null;
  if (!response.ok || outer?.success === false || outer?.hasError === true) {
    throw new Error(String(outer?.errorMsg || outer?.message || `HTTP ${response.status}`));
  }
  let payload: unknown = outer;
  if (payload && typeof payload === 'object' && 'content' in payload) {
    payload = (payload as Record<string, unknown>).content;
  }
  if (payload && typeof payload === 'object' && 'serviceReturnValue' in payload) {
    payload = (payload as Record<string, unknown>).serviceReturnValue;
  }
  payload = parseMaybeJson(payload);
  if (!payload || typeof payload !== 'object' || (payload as Record<string, unknown>).success !== true) {
    throw new Error('连接器返回结构不是成功的文件导入响应');
  }
  return payload;
}

export async function submitParsedRows(rows: ImportRow[], transport: JsonTransport) {
  const body = { sessionId: createRequestId(), batchIndex: 0, rows };
  if (transport === 'connector') return invokeConnector('import_rows', body);
  const response = await fetch(`${LOCAL_API}/import/rows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': createRequestId() },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true)
    throw new Error(payload?.error?.code || `HTTP ${response.status}`);
  return payload;
}
