import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { PerformanceSystemPage } from '../src/SystemPage.canvas.tsx';

const snapshot = {
  generatedAt: '',
  currentUser: { id: 'SYN-EMP-001', name: '林澈', role: 'PERFORMANCE_ADMIN' },
  summary: {
    activeEmployees: 24,
    publishedIndicators: 10,
    issuedConfigs: 16,
    openTasks: 8,
    completedCases: 4,
    blockers: 20,
  },
  organizations: [{ id: 'ORG-FE', name: '体验研发部', level: 3 }],
  employees: [],
  periods: [{ id: 'PER-2026-Q3', name: '2026 年第 3 季度' }],
  indicators: [],
  assignments: [],
  configs: [],
  actualData: [],
  cases: [],
  tasks: [],
  results: [],
  jobs: [],
  audits: [],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, data: snapshot, meta: { requestId: 'req' } }),
    })),
  );
});
test('renders operational dashboard from API data', async () => {
  render(<PerformanceSystemPage kind="dashboard" />);
  await waitFor(() => expect(screen.getByText('绩效运营工作台')).toBeInTheDocument());
  expect(screen.getByText('24')).toBeInTheDocument();
  expect(screen.getByText('期间执行分布')).toBeInTheDocument();
});
