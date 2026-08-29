import {
  createTaskSchema,
  healthResponseSchema,
  taskListResponseSchema,
  taskResponseSchema,
  updateTaskSchema,
} from '../../../shared/task-contract.ts';
import type { CreateTaskInput, UpdateTaskInput } from '../../../shared/task-contract.ts';
import { getLabServiceUrl } from '@yida-lab/runtime';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

interface RequestResult {
  payload: unknown;
  requestId: string;
}

const API_BASE_URL = getLabServiceUrl('flowboardApi');

function createRequestId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `flowboard-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function request(path: string, options: RequestOptions = {}): Promise<RequestResult> {
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

export async function fetchHealth(signal?: AbortSignal) {
  const result = await request('/health', { signal });
  return { data: healthResponseSchema.parse(result.payload), requestId: result.requestId };
}

export async function fetchTasks(filters: { search: string; status: string }, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (filters.search) query.set('search', filters.search);
  if (filters.status !== 'all') query.set('status', filters.status);
  const suffix = query.size ? `?${query.toString()}` : '';
  const result = await request(`/tasks${suffix}`, { signal });
  return { data: taskListResponseSchema.parse(result.payload), requestId: result.requestId };
}

export async function createTask(input: CreateTaskInput) {
  const result = await request('/tasks', {
    method: 'POST',
    body: createTaskSchema.parse(input),
  });
  return { data: taskResponseSchema.parse(result.payload), requestId: result.requestId };
}

export async function updateTask(id: string, input: UpdateTaskInput) {
  const result = await request(`/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: updateTaskSchema.parse(input),
  });
  return { data: taskResponseSchema.parse(result.payload), requestId: result.requestId };
}

export async function deleteTask(id: string) {
  const result = await request(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return { data: taskResponseSchema.parse(result.payload), requestId: result.requestId };
}

export { API_BASE_URL };
