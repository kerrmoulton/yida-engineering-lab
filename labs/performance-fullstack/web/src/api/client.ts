import { getLabServiceUrl } from '@yida-lab/runtime';
import type { ApiFailure, ApiSuccess, PerformanceWorkspace } from '../../../shared/performance-contract.ts';
import { isWorkspace } from '../../../shared/performance-contract.ts';

const API_BASE = getLabServiceUrl('performanceApi');

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `performance-${Date.now()}`;
}

async function call(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiSuccess<unknown> | ApiFailure;
  if (!response.ok || !payload.success) {
    const failure = payload as ApiFailure;
    throw Object.assign(new Error(failure.error?.message || `HTTP ${response.status}`), {
      code: failure.error?.code,
      requestId: failure.meta?.requestId,
    });
  }
  if (!isWorkspace(payload.data)) throw new Error('API 响应没有通过工作台契约校验');
  return { workspace: payload.data, requestId: payload.meta.requestId };
}

export function fetchWorkspace(signal?: AbortSignal) {
  return fetch(`${API_BASE}/workspace`, {
    headers: { 'X-Request-Id': requestId() },
    signal,
  }).then(async (response) => {
    const payload = (await response.json()) as ApiSuccess<PerformanceWorkspace> | ApiFailure;
    if (!response.ok || !payload.success) throw new Error('工作台加载失败');
    if (!isWorkspace(payload.data)) throw new Error('API 响应没有通过工作台契约校验');
    return { workspace: payload.data, requestId: payload.meta.requestId };
  });
}

export const performScenarioAction = (action: string, payload?: unknown) =>
  call(`/actions/${encodeURIComponent(action)}`, 'POST', payload);
export const resetScenario = () => call('/scenario/reset', 'POST');
export const saveOrganization = (payload: unknown) => call('/organizations', 'POST', payload);
export const saveEmployee = (payload: unknown) => call('/employees', 'POST', payload);
export const saveIndicatorDefinition = (payload: unknown) => call('/indicators', 'POST', payload);
export const PERFORMANCE_ENDPOINT = API_BASE;
