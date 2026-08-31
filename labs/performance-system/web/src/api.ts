import { getLabServiceUrl } from '@yida-lab/runtime';
import type { ApiFailure, ApiSuccess, PageQuery, SystemSnapshot } from '../../shared/contracts.ts';

export const PERFORMANCE_V2_ENDPOINT = getLabServiceUrl('performanceV2Api');

function queryString(query: PageQuery) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

async function request<T>(path: string, options?: RequestInit) {
  const response = await fetch(`${PERFORMANCE_V2_ENDPOINT}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-role': 'PERFORMANCE_ADMIN',
      ...(options?.headers || {}),
    },
  });
  const body = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !body.success)
    throw new Error(body.success ? `HTTP ${response.status}` : body.error.message);
  return body.data;
}

export function fetchSnapshot(query: PageQuery) {
  const suffix = queryString(query);
  return request<SystemSnapshot>(`/snapshot${suffix ? `?${suffix}` : ''}`);
}

export function mutate(path: string, payload: unknown = {}) {
  return request<SystemSnapshot>(path, { method: 'POST', body: JSON.stringify(payload) });
}
