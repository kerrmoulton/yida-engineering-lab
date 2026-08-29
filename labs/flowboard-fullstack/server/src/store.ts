import { randomUUID } from 'node:crypto';
import type { CreateTaskInput, Task, TaskStatus, UpdateTaskInput } from '../../shared/task-contract.ts';

const INITIAL_TASKS: Task[] = [
  {
    id: 'task-contract',
    title: '确认 API 契约',
    description: '前后端共用 TypeScript 运行时契约，并验证异常响应。',
    status: 'done',
    priority: 'high',
    assignee: '工程实验组',
    createdAt: '2026-08-29T01:00:00.000Z',
    updatedAt: '2026-08-29T02:00:00.000Z',
  },
  {
    id: 'task-pna',
    title: '验证本地网络授权',
    description: '从宜搭页面访问 127.0.0.1 API，记录浏览器授权行为。',
    status: 'in_progress',
    priority: 'high',
    assignee: '联调负责人',
    createdAt: '2026-08-29T01:30:00.000Z',
    updatedAt: '2026-08-29T02:30:00.000Z',
  },
  {
    id: 'task-observability',
    title: '补齐请求可观测性',
    description: '页面与服务端关联同一个 requestId。',
    status: 'backlog',
    priority: 'medium',
    assignee: '工具链负责人',
    createdAt: '2026-08-29T02:00:00.000Z',
    updatedAt: '2026-08-29T02:00:00.000Z',
  },
];

export interface TaskFilters {
  search?: string;
  status?: TaskStatus;
}

export function createTaskStore(seed: Task[] = INITIAL_TASKS) {
  let tasks = seed.map((task) => ({ ...task }));

  return {
    list(filters: TaskFilters = {}) {
      const search = filters.search?.trim().toLocaleLowerCase() || '';
      return tasks.filter((task) => {
        const matchesStatus = !filters.status || task.status === filters.status;
        const haystack = `${task.title} ${task.description} ${task.assignee}`.toLocaleLowerCase();
        return matchesStatus && (!search || haystack.includes(search));
      });
    },
    count() {
      return tasks.length;
    },
    create(input: CreateTaskInput) {
      const now = new Date().toISOString();
      const task: Task = {
        id: randomUUID(),
        ...input,
        status: 'backlog',
        createdAt: now,
        updatedAt: now,
      };
      tasks = [task, ...tasks];
      return task;
    },
    update(id: string, input: UpdateTaskInput) {
      const index = tasks.findIndex((task) => task.id === id);
      if (index < 0) return null;
      const updated = { ...tasks[index], ...input, updatedAt: new Date().toISOString() };
      tasks = tasks.map((task, taskIndex) => (taskIndex === index ? updated : task));
      return updated;
    },
    remove(id: string) {
      const task = tasks.find((candidate) => candidate.id === id) || null;
      if (task) tasks = tasks.filter((candidate) => candidate.id !== id);
      return task;
    },
  };
}

export type TaskStore = ReturnType<typeof createTaskStore>;
