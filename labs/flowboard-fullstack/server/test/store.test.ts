import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTaskStore, INITIAL_TASKS } from '../src/store.ts';

test('SQLite store persists across process-style reopen and can reset deterministically', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flowboard-store-'));
  const databasePath = path.join(directory, 'tasks.sqlite');
  try {
    const first = createTaskStore({ databasePath, seed: [] });
    const created = first.create({
      title: '持久化任务',
      description: '验证数据库重开后仍然存在',
      priority: 'medium',
      assignee: '数据库测试',
    });
    first.close();

    const reopened = createTaskStore({ databasePath, seed: [] });
    assert.equal(
      reopened.list().some((task) => task.id === created.id),
      true,
    );
    reopened.reset();
    assert.deepEqual(
      reopened
        .list()
        .map((task) => task.id)
        .sort(),
      INITIAL_TASKS.map((task) => task.id).sort(),
    );
    reopened.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
