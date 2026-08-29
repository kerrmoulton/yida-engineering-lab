import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { CreateTaskInput, Task, TaskStatus, UpdateTaskInput } from '../../shared/task-contract.ts';

export const INITIAL_TASKS: Task[] = [
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

export interface TaskStore {
  list(filters?: TaskFilters): Task[];
  count(): number;
  create(input: CreateTaskInput): Task;
  update(id: string, input: UpdateTaskInput): Task | null;
  remove(id: string): Task | null;
  reset(seed?: Task[]): void;
  close(): void;
}

interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: Task['status'];
  priority: Task['priority'];
  assignee: string;
  created_at: string;
  updated_at: string;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createTaskStore(options: { databasePath?: string; seed?: Task[] } = {}): TaskStore {
  const databasePath = options.databasePath || ':memory:';
  if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('backlog', 'in_progress', 'done')),
      priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
      assignee TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const insert = database.prepare(`
    INSERT INTO tasks (id, title, description, status, priority, assignee, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  function seedTasks(seed: Task[]) {
    database.exec('BEGIN');
    try {
      for (const task of seed) {
        insert.run(
          task.id,
          task.title,
          task.description,
          task.status,
          task.priority,
          task.assignee,
          task.createdAt,
          task.updatedAt,
        );
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  const initialSeed = options.seed ?? INITIAL_TASKS;
  const existing = database.prepare('SELECT COUNT(*) AS count FROM tasks').get() as { count: number };
  if (existing.count === 0 && initialSeed.length) seedTasks(initialSeed);

  return {
    list(filters = {}) {
      const conditions: string[] = [];
      const parameters: SQLInputValue[] = [];
      if (filters.status) {
        conditions.push('status = ?');
        parameters.push(filters.status);
      }
      const search = filters.search?.trim().toLocaleLowerCase();
      if (search) {
        conditions.push("lower(title || ' ' || description || ' ' || assignee) LIKE ?");
        parameters.push(`%${search}%`);
      }
      const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      const rows = database
        .prepare(`SELECT * FROM tasks${where} ORDER BY created_at DESC, id ASC`)
        .all(...parameters) as unknown as TaskRow[];
      return rows.map(rowToTask);
    },
    count() {
      return (database.prepare('SELECT COUNT(*) AS count FROM tasks').get() as { count: number }).count;
    },
    create(input) {
      const now = new Date().toISOString();
      const task: Task = { id: randomUUID(), ...input, status: 'backlog', createdAt: now, updatedAt: now };
      insert.run(
        task.id,
        task.title,
        task.description,
        task.status,
        task.priority,
        task.assignee,
        task.createdAt,
        task.updatedAt,
      );
      return task;
    },
    update(id, input) {
      const current = database.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
      if (!current) return null;
      const updated: Task = { ...rowToTask(current), ...input, updatedAt: new Date().toISOString() };
      database
        .prepare(
          `
          UPDATE tasks
          SET title = ?, description = ?, status = ?, priority = ?, assignee = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .run(
          updated.title,
          updated.description,
          updated.status,
          updated.priority,
          updated.assignee,
          updated.updatedAt,
          id,
        );
      return updated;
    },
    remove(id) {
      const current = database.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
      if (!current) return null;
      database.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      return rowToTask(current);
    },
    reset(seed = INITIAL_TASKS) {
      database.exec('DELETE FROM tasks');
      if (seed.length) seedTasks(seed);
    },
    close() {
      database.close();
    },
  };
}
