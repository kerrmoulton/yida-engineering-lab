import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Task } from '../../shared/task-contract.ts';
import Flowboard from '../src/Flowboard.canvas.tsx';

const NOW = '2026-08-29T08:00:00.000Z';

function response(payload: unknown, requestId: string, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    }),
  );
}

function createFetchHarness() {
  let tasks: Task[] = [
    {
      id: 'task-local-preview',
      title: '验证本地预览',
      description: '同一份 Canvas 源码由 Vite 加载。',
      status: 'backlog',
      priority: 'high',
      assignee: '前端实验组',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];
  let sequence = 0;

  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const requestId = `web-test-${++sequence}`;
    if (url.pathname === '/api/health') {
      return response(
        {
          success: true,
          data: { service: 'flowboard-api', status: 'ok', taskCount: tasks.length, now: NOW },
          meta: { requestId },
        },
        requestId,
      );
    }
    if (url.pathname === '/api/tasks' && (!init.method || init.method === 'GET')) {
      const search = (url.searchParams.get('search') || '').toLocaleLowerCase();
      const data = tasks.filter((task) =>
        `${task.title} ${task.description} ${task.assignee}`.toLocaleLowerCase().includes(search),
      );
      return response({ success: true, data, meta: { total: data.length, requestId } }, requestId);
    }
    if (url.pathname === '/api/tasks' && init.method === 'POST') {
      const inputTask = JSON.parse(String(init.body));
      const task = {
        id: 'task-created-in-test',
        ...inputTask,
        status: 'backlog',
        createdAt: NOW,
        updatedAt: NOW,
      };
      tasks = [task, ...tasks];
      return response({ success: true, data: task, meta: { requestId } }, requestId, 201);
    }
    throw new Error(`Unexpected request: ${init.method || 'GET'} ${url}`);
  });
}

describe('Flowboard Canvas local preview', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', createFetchHarness());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test('loads the shared Canvas entry and renders API data', async () => {
    render(<Flowboard />);

    expect(await screen.findByText('本地 API 在线')).toBeInTheDocument();
    expect(screen.getAllByText('验证本地预览')).not.toHaveLength(0);
    expect(screen.getAllByText('前端实验组')).not.toHaveLength(0);
  });

  test('creates a task through the real API client contract', async () => {
    const user = userEvent.setup();
    render(<Flowboard />);
    await screen.findByRole('article');

    await user.type(screen.getByPlaceholderText('输入任务标题'), '组件测试创建任务');
    await user.type(screen.getByPlaceholderText('负责人'), '测试负责人');
    await user.click(screen.getByRole('button', { name: '新建任务' }));

    expect(await screen.findAllByText('组件测试创建任务')).not.toHaveLength(0);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/tasks'), expect.anything()),
    );
  });

  test('surfaces contract failures as a visible development error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const requestId = 'web-test-contract-error';
        if (url.pathname === '/api/health') {
          return response(
            {
              success: true,
              data: { service: 'flowboard-api', status: 'ok', taskCount: 0, now: NOW },
              meta: { requestId },
            },
            requestId,
          );
        }
        return response(
          { success: true, data: [{ id: 'incomplete-task' }], meta: { total: 1, requestId } },
          requestId,
        );
      }),
    );

    render(<Flowboard />);

    expect(await screen.findByText('API 响应没有通过共享契约校验。')).toBeInTheDocument();
  });
});
