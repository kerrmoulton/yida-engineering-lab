export const TASK_STATUSES = ['backlog', 'in_progress', 'done'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  assignee: string;
}

export type UpdateTaskInput = Partial<
  Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'assignee'>
>;

export class ContractError extends Error {
  issues: Array<{ path: string; message: string }>;

  constructor(issues: Array<{ path: string; message: string }>) {
    super('Contract validation failed');
    this.name = 'ContractError';
    this.issues = issues;
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContractError([{ path, message: 'expected object' }]);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string, options: { min?: number; max: number }) {
  if (typeof value !== 'string') {
    throw new ContractError([{ path, message: 'expected string' }]);
  }
  const normalized = value.trim();
  if (normalized.length < (options.min || 0) || normalized.length > options.max) {
    throw new ContractError([{ path, message: `expected ${options.min || 0}-${options.max} chars` }]);
  }
  return normalized;
}

function enumValue<T extends readonly string[]>(value: unknown, path: string, values: T): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new ContractError([{ path, message: `expected one of ${values.join(',')}` }]);
  }
  return value as T[number];
}

function isoDateTime(value: unknown, path: string) {
  const normalized = text(value, path, { min: 1, max: 40 });
  if (Number.isNaN(Date.parse(normalized))) {
    throw new ContractError([{ path, message: 'expected ISO datetime' }]);
  }
  return normalized;
}

function integer(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ContractError([{ path, message: 'expected non-negative integer' }]);
  }
  return value;
}

function parseTask(value: unknown): Task {
  const input = record(value, 'task');
  return {
    id: text(input.id, 'task.id', { min: 1, max: 120 }),
    title: text(input.title, 'task.title', { min: 1, max: 120 }),
    description: text(input.description, 'task.description', { max: 500 }),
    status: enumValue(input.status, 'task.status', TASK_STATUSES),
    priority: enumValue(input.priority, 'task.priority', TASK_PRIORITIES),
    assignee: text(input.assignee, 'task.assignee', { max: 60 }),
    createdAt: isoDateTime(input.createdAt, 'task.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'task.updatedAt'),
  };
}

function parser<T>(parse: (value: unknown) => T) {
  return { parse };
}

export const taskStatusSchema = parser((value) => enumValue(value, 'status', TASK_STATUSES));

export const taskSchema = parser(parseTask);

export const createTaskSchema = parser<CreateTaskInput>((value) => {
  const input = record(value, 'input');
  return {
    title: text(input.title, 'input.title', { min: 1, max: 120 }),
    description: text(input.description, 'input.description', { max: 500 }),
    priority: enumValue(input.priority, 'input.priority', TASK_PRIORITIES),
    assignee: text(input.assignee, 'input.assignee', { max: 60 }),
  };
});

export const updateTaskSchema = parser<UpdateTaskInput>((value) => {
  const input = record(value, 'input');
  const output: UpdateTaskInput = {};
  if ('title' in input) output.title = text(input.title, 'input.title', { min: 1, max: 120 });
  if ('description' in input) {
    output.description = text(input.description, 'input.description', { max: 500 });
  }
  if ('status' in input) output.status = enumValue(input.status, 'input.status', TASK_STATUSES);
  if ('priority' in input) {
    output.priority = enumValue(input.priority, 'input.priority', TASK_PRIORITIES);
  }
  if ('assignee' in input) output.assignee = text(input.assignee, 'input.assignee', { max: 60 });
  if (!Object.keys(output).length) {
    throw new ContractError([{ path: 'input', message: 'at least one field is required' }]);
  }
  return output;
});

function parseMeta(value: unknown) {
  const meta = record(value, 'meta');
  return { requestId: text(meta.requestId, 'meta.requestId', { min: 1, max: 120 }) };
}

export const taskListResponseSchema = parser((value) => {
  const response = record(value, 'response');
  if (response.success !== true || !Array.isArray(response.data)) {
    throw new ContractError([{ path: 'response', message: 'expected successful task list' }]);
  }
  const meta = record(response.meta, 'meta');
  return {
    success: true as const,
    data: response.data.map(parseTask),
    meta: { ...parseMeta(meta), total: integer(meta.total, 'meta.total') },
  };
});

export const taskResponseSchema = parser((value) => {
  const response = record(value, 'response');
  if (response.success !== true) {
    throw new ContractError([{ path: 'response.success', message: 'expected true' }]);
  }
  return { success: true as const, data: parseTask(response.data), meta: parseMeta(response.meta) };
});

export const healthResponseSchema = parser((value) => {
  const response = record(value, 'response');
  const data = record(response.data, 'data');
  if (response.success !== true || data.service !== 'flowboard-api' || data.status !== 'ok') {
    throw new ContractError([{ path: 'response', message: 'expected healthy flowboard-api response' }]);
  }
  return {
    success: true as const,
    data: {
      service: 'flowboard-api' as const,
      status: 'ok' as const,
      taskCount: integer(data.taskCount, 'data.taskCount'),
      now: isoDateTime(data.now, 'data.now'),
    },
    meta: parseMeta(response.meta),
  };
});
