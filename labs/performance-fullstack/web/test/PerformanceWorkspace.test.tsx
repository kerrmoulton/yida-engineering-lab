import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import PerformanceOverview from '../src/PerformanceOverview.canvas.tsx';

afterEach(() => vi.restoreAllMocks());

test('renders the synthetic workspace returned by the localhost contract', async () => {
  const payload = {
    success: true,
    data: {
      scenarioId: 'SYN-PERF-2026-Q3',
      period: '2026-Q3',
      employee: { id: 'SYN-EMP-001', name: '合成员工一号', organization: '合成组织' },
      stage: 'CONFIGURATION',
      assessmentStatus: 'PREPARING',
      configStatus: 'DRAFT',
      configWeight: 100,
      submittedActuals: 0,
      totalActuals: 3,
      finalScore: null,
      grade: null,
      organizations: [
        { id: 'SYN-ORG-1', code: 'ORG-001', name: '合成组织', manager: '负责人', status: 'ACTIVE' },
      ],
      employees: [
        {
          id: 'SYN-EMP-001',
          employeeNo: 'EMP-001',
          name: '合成员工一号',
          position: '工程师',
          organizationId: 'SYN-ORG-1',
          organizationName: '合成组织',
          status: 'ACTIVE',
        },
      ],
      indicatorDefinitions: [
        {
          id: 'SYN-DEF-1',
          code: 'IND-001',
          name: '周期目标达成率',
          category: '经营',
          mode: 'SYSTEM',
          unit: '%',
          defaultWeight: 40,
          defaultTarget: 100,
          status: 'ACTIVE',
        },
      ],
      nextAction: { key: 'submit-configuration', title: '提交个人配置', description: '校验配置。' },
      indicators: [
        {
          id: 'SYN-I',
          definitionId: 'SYN-DEF-1',
          code: 'IND-001',
          name: '周期目标达成率',
          mode: 'SYSTEM',
          weight: 40,
          target: 100,
          actual: null,
          rawScore: null,
          selfScore: null,
          finalScore: null,
        },
      ],
      reviewers: [],
      reviewerScores: [],
      audits: [],
    },
    meta: { requestId: 'SYN-REQ' },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
  render(<PerformanceOverview />);
  await waitFor(() => expect(screen.getByText('绩效运行总览')).toBeInTheDocument());
  expect(screen.getByText('周期执行快照')).toBeInTheDocument();
  expect(screen.getByText('提交个人配置')).toBeInTheDocument();
});
