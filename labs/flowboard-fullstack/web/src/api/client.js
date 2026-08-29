import {
  createTaskSchema,
  healthResponseSchema,
  taskListResponseSchema,
  taskResponseSchema,
  updateTaskSchema,
} from '../../../shared/task-contract.ts';
import { getLabServiceUrl } from '@yida-lab/runtime';

const API_BASE_URL = getLabServiceUrl('flowboardApi');

function createRequestId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `flowboard-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function request(path, options = {}) {
  const requestId = createRequestId();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || `HTTP ${response.status}`;
    throw Object.assign(new Error(message), { requestId, status: response.status });
  }
  return { payload, requestId: response.headers.get('x-request-id') || requestId };
}

export async function fetchHealth(signal) {
  const result = await request('/health', { signal });
  return { data: healthResponseSchema.parse(result.payload), requestId: result.requestId };
}

export async function fetchTasks(filters, signal) {
  const query = new URLSearchParams();
  if (filters.search) query.set('search', filters.search);
  if (filters.status !== 'all') query.set('status', filters.status);
  const suffix = query.size ? `?${query.toString()}` : '';
  const result = await request(`/tasks${suffix}`, { signal });
  return { data: taskListResponseSchema.parse(result.payload), requestId: result.requestId };
}

export async function createTask(input) {
  const result = await request('/tasks', {
    method: 'POST',
    body: createTaskSchema.parse(input),
  });
  return { data: taskResponseSchema.parse(result.payload), requestId: result.requestId };
}

export async function updateTask(id, input) {
  const result = await request(`/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: updateTaskSchema.parse(input),
  });
  return { data: taskResponseSchema.parse(result.payload), requestId: result.requestId };
}

export async function deleteTask(id) {
  const result = await request(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return { data: taskResponseSchema.parse(result.payload), requestId: result.requestId };
}

export { API_BASE_URL };
