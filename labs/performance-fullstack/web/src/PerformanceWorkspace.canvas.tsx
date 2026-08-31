import React from 'react';
import { Alert, Button, ConfigProvider, Input, InputNumber, Modal, Select, Spin, Tag } from 'antd';
import { History, LockKeyhole, Pencil, Play, Plus, RefreshCw, RotateCcw, Target } from 'lucide-react';
import { getLabPageUrl } from '@yida-lab/runtime';
import type {
  ConfigurationInput,
  EmployeeInput,
  EmployeeView,
  IndicatorDefinitionInput,
  IndicatorDefinitionView,
  OrganizationInput,
  OrganizationView,
  PerformanceStage,
  PerformanceWorkspace,
  ReviewsInput,
} from '../../shared/performance-contract.ts';
import {
  fetchWorkspace,
  performScenarioAction,
  PERFORMANCE_ENDPOINT,
  resetScenario,
  saveEmployee,
  saveIndicatorDefinition,
  saveOrganization,
} from './api/client.ts';
import { PERFORMANCE_CSS } from './styles.ts';

const THEME_TOKENS = {
  '--color-brand1-1': '#8B7CF6',
  '--color-brand1-2': '#F0EDFF',
  '--color-brand1-3': 'rgba(106,90,205,.22)',
  '--color-brand1-5': '#7566E8',
  '--color-brand1-6': '#6657D9',
  '--color-brand1-7': '#5547BE',
  '--color-brand1-9': '#37306F',
  '--color-brand1-10': 'rgba(55,48,111,.32)',
  '--color-brand-1': 'rgba(102,87,217,.24)',
  '--color-brand-2': '#8B7CF6',
  '--color-brand-3': '#6657D9',
  '--color-brand-4': '#37306F',
  '--color-group': '#6657D9,#2F8F83,#D88B45,#C05768,#6684A8,#8B7CF6',
};

const STAGES: Array<{ key: PerformanceStage; label: string }> = [
  { key: 'CONFIGURATION', label: '配置准备' },
  { key: 'DATA_ENTRY', label: '数据填报' },
  { key: 'SELF_REVIEW', label: '员工自评' },
  { key: 'REVIEW', label: '多方评价' },
  { key: 'CALCULATION', label: '核算结算' },
  { key: 'LOCKED', label: '结果锁定' },
];

export type PerformancePageKind =
  'overview' | 'people' | 'indicators' | 'configuration' | 'dataEntry' | 'assessment';

const PAGE_META: Record<PerformancePageKind, { title: string; eyebrow: string; key: string }> = {
  overview: { title: '绩效运行总览', eyebrow: 'Performance lifecycle', key: 'performance.overview' },
  people: { title: '人员与组织', eyebrow: 'Organization and people', key: 'performance.people' },
  indicators: { title: '绩效指标与量化', eyebrow: 'Indicator library', key: 'performance.indicators' },
  configuration: {
    title: '个人绩效配置',
    eyebrow: 'Personal configuration',
    key: 'performance.configuration',
  },
  dataEntry: {
    title: '数据填报与自评',
    eyebrow: 'Actual data and self review',
    key: 'performance.dataEntry',
  },
  assessment: {
    title: '评价、核算与结算',
    eyebrow: 'Assessment and settlement',
    key: 'performance.assessment',
  },
};

const ACTION_PAGE: Record<string, PerformancePageKind> = {
  'submit-configuration': 'configuration',
  'submit-actuals': 'dataEntry',
  'submit-self-review': 'dataEntry',
  'submit-reviewers': 'assessment',
  'calculate-and-settle': 'assessment',
};

function collectYidaThemeDocuments(startWindow: Window) {
  const documents: Document[] = [];
  let cursor: Window | null = startWindow;
  while (cursor) {
    try {
      if (cursor.document && !documents.includes(cursor.document)) documents.push(cursor.document);
      if (!cursor.parent || cursor.parent === cursor) break;
      cursor = cursor.parent;
    } catch (_error) {
      break;
    }
  }
  return documents;
}

function useYidaGlobalTheme(tokens: Record<string, string>) {
  React.useEffect(() => {
    const css = `:root, [data-yida-theme-root] {\n${Object.entries(tokens)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n')}\n}`;
    collectYidaThemeDocuments(window).forEach((documentItem) => {
      let style = documentItem.getElementById('yida-global-theme') as HTMLStyleElement | null;
      if (!style) {
        style = documentItem.createElement('style');
        style.id = 'yida-global-theme';
        documentItem.head.insertBefore(style, documentItem.head.firstChild);
      }
      if (style.innerHTML !== css) style.innerHTML = css;
    });
  }, [tokens]);
}

function errorText(error: unknown) {
  if (error instanceof TypeError)
    return '无法访问 localhost API。请确认服务已启动，并允许浏览器访问本地网络。';
  return error instanceof Error ? error.message : '请求失败';
}

function IndicatorTable({ workspace }: { workspace: PerformanceWorkspace }) {
  return (
    <div className="perf-table-wrap">
      <table className="perf-table">
        <thead>
          <tr>
            <th>指标</th>
            <th>来源</th>
            <th>目标</th>
            <th>实际</th>
            <th>原始分</th>
            <th>自评</th>
            <th>最终分</th>
          </tr>
        </thead>
        <tbody>
          {workspace.indicators.map((indicator) => (
            <tr key={indicator.id}>
              <td>
                <strong>{indicator.name}</strong>
                <br />
                <span>
                  {indicator.code} · 权重 {indicator.weight}
                </span>
              </td>
              <td>
                <Tag color={indicator.mode === 'SYSTEM' ? 'blue' : 'gold'}>
                  {indicator.mode === 'SYSTEM' ? '系统计算' : '人工评价'}
                </Tag>
              </td>
              <td className="is-number">{indicator.target}</td>
              <td className="is-number">{indicator.actual ?? '待填报'}</td>
              <td className="is-number">{indicator.rawScore ?? '—'}</td>
              <td className="is-number">{indicator.selfScore ?? '—'}</td>
              <td className="is-number">
                <strong>{indicator.finalScore ?? '—'}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function openPerformancePage(kind: PerformancePageKind) {
  const url = getLabPageUrl(PAGE_META[kind].key);
  if (url.startsWith('#unconfigured-page=')) return;
  try {
    const shellWindow = window.top && window.top !== window ? window.top : window;
    shellWindow.location.assign(url);
  } catch (_error) {
    window.location.assign(url);
  }
}

type RunAction = (action: string, payload?: unknown) => Promise<void>;
type RunMutation = (
  operation: () => Promise<{ workspace: PerformanceWorkspace; requestId: string }>,
) => Promise<void>;

function PeopleManagement({
  workspace,
  busy,
  mutate,
}: {
  workspace: PerformanceWorkspace;
  busy: boolean;
  mutate: RunMutation;
}) {
  const [organizationDraft, setOrganizationDraft] = React.useState<OrganizationInput | null>(null);
  const [employeeDraft, setEmployeeDraft] = React.useState<EmployeeInput | null>(null);
  const activeOrganizations = workspace.organizations.filter((item) => item.status === 'ACTIVE');
  const editOrganization = (item?: OrganizationView) =>
    setOrganizationDraft(item ? { ...item } : { code: '', name: '', manager: '', status: 'ACTIVE' });
  const editEmployee = (item?: EmployeeView) =>
    setEmployeeDraft(
      item
        ? {
            id: item.id,
            employeeNo: item.employeeNo,
            name: item.name,
            position: item.position,
            organizationId: item.organizationId,
            status: item.status,
          }
        : {
            employeeNo: '',
            name: '',
            position: '',
            organizationId: activeOrganizations[0]?.id || '',
            status: 'ACTIVE',
          },
    );
  return (
    <div className="perf-master-stack">
      <section>
        <div className="perf-section-title">
          <div>
            <h3>组织架构</h3>
            <p>维护组织编码、名称、负责人和启停状态。</p>
          </div>
          <Button type="primary" icon={<Plus size={16} />} onClick={() => editOrganization()}>
            新增组织
          </Button>
        </div>
        <div className="perf-table-wrap">
          <table className="perf-table">
            <thead>
              <tr>
                <th>组织编码</th>
                <th>组织名称</th>
                <th>负责人</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {workspace.organizations.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.code}</strong>
                  </td>
                  <td>{item.name}</td>
                  <td>{item.manager}</td>
                  <td>
                    <Tag color={item.status === 'ACTIVE' ? 'green' : 'default'}>
                      {item.status === 'ACTIVE' ? '启用' : '停用'}
                    </Tag>
                  </td>
                  <td>
                    <Button size="small" icon={<Pencil size={14} />} onClick={() => editOrganization(item)}>
                      编辑
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <div className="perf-section-title">
          <div>
            <h3>人员档案</h3>
            <p>人员是绩效配置的考核对象，停用后不能创建新配置。</p>
          </div>
          <Button type="primary" icon={<Plus size={16} />} onClick={() => editEmployee()}>
            新增人员
          </Button>
        </div>
        <div className="perf-table-wrap">
          <table className="perf-table">
            <thead>
              <tr>
                <th>工号</th>
                <th>姓名</th>
                <th>岗位</th>
                <th>所属组织</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {workspace.employees.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.employeeNo}</strong>
                  </td>
                  <td>{item.name}</td>
                  <td>{item.position}</td>
                  <td>{item.organizationName}</td>
                  <td>
                    <Tag color={item.status === 'ACTIVE' ? 'green' : 'default'}>
                      {item.status === 'ACTIVE' ? '在职' : '停用'}
                    </Tag>
                  </td>
                  <td>
                    <Button size="small" icon={<Pencil size={14} />} onClick={() => editEmployee(item)}>
                      编辑
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Modal
        title={organizationDraft?.id ? '编辑组织' : '新增组织'}
        open={Boolean(organizationDraft)}
        confirmLoading={busy}
        onCancel={() => setOrganizationDraft(null)}
        onOk={async () => {
          if (!organizationDraft) return;
          await mutate(() => saveOrganization(organizationDraft));
          setOrganizationDraft(null);
        }}
        okText="保存"
      >
        {organizationDraft ? (
          <div className="perf-modal-form">
            <label>
              <span>组织编码</span>
              <Input
                value={organizationDraft.code}
                onChange={(event) => setOrganizationDraft({ ...organizationDraft, code: event.target.value })}
              />
            </label>
            <label>
              <span>组织名称</span>
              <Input
                value={organizationDraft.name}
                onChange={(event) => setOrganizationDraft({ ...organizationDraft, name: event.target.value })}
              />
            </label>
            <label>
              <span>负责人</span>
              <Input
                value={organizationDraft.manager}
                onChange={(event) =>
                  setOrganizationDraft({ ...organizationDraft, manager: event.target.value })
                }
              />
            </label>
            <label>
              <span>状态</span>
              <Select
                value={organizationDraft.status}
                options={[
                  { value: 'ACTIVE', label: '启用' },
                  { value: 'INACTIVE', label: '停用' },
                ]}
                onChange={(status) => setOrganizationDraft({ ...organizationDraft, status })}
              />
            </label>
          </div>
        ) : null}
      </Modal>
      <Modal
        title={employeeDraft?.id ? '编辑人员' : '新增人员'}
        open={Boolean(employeeDraft)}
        confirmLoading={busy}
        onCancel={() => setEmployeeDraft(null)}
        onOk={async () => {
          if (!employeeDraft) return;
          await mutate(() => saveEmployee(employeeDraft));
          setEmployeeDraft(null);
        }}
        okText="保存"
      >
        {employeeDraft ? (
          <div className="perf-modal-form">
            <label>
              <span>工号</span>
              <Input
                value={employeeDraft.employeeNo}
                onChange={(event) => setEmployeeDraft({ ...employeeDraft, employeeNo: event.target.value })}
              />
            </label>
            <label>
              <span>姓名</span>
              <Input
                value={employeeDraft.name}
                onChange={(event) => setEmployeeDraft({ ...employeeDraft, name: event.target.value })}
              />
            </label>
            <label>
              <span>岗位</span>
              <Input
                value={employeeDraft.position}
                onChange={(event) => setEmployeeDraft({ ...employeeDraft, position: event.target.value })}
              />
            </label>
            <label>
              <span>所属组织</span>
              <Select
                value={employeeDraft.organizationId}
                options={activeOrganizations.map((item) => ({
                  value: item.id,
                  label: `${item.code} · ${item.name}`,
                }))}
                onChange={(organizationId) => setEmployeeDraft({ ...employeeDraft, organizationId })}
              />
            </label>
            <label>
              <span>状态</span>
              <Select
                value={employeeDraft.status}
                options={[
                  { value: 'ACTIVE', label: '在职' },
                  { value: 'INACTIVE', label: '停用' },
                ]}
                onChange={(status) => setEmployeeDraft({ ...employeeDraft, status })}
              />
            </label>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function IndicatorLibrary({
  workspace,
  busy,
  mutate,
}: {
  workspace: PerformanceWorkspace;
  busy: boolean;
  mutate: RunMutation;
}) {
  const [draft, setDraft] = React.useState<IndicatorDefinitionInput | null>(null);
  const edit = (item?: IndicatorDefinitionView) =>
    setDraft(
      item
        ? { ...item }
        : {
            code: '',
            name: '',
            category: '',
            mode: 'SYSTEM',
            unit: '',
            defaultWeight: 0,
            defaultTarget: 0,
            status: 'ACTIVE',
          },
    );
  return (
    <div>
      <div className="perf-section-title">
        <div>
          <h3>企业指标库</h3>
          <p>统一维护指标定义；个人绩效配置只引用启用指标并生成执行快照。</p>
        </div>
        <Button type="primary" icon={<Plus size={16} />} onClick={() => edit()}>
          新增指标
        </Button>
      </div>
      <div className="perf-table-wrap">
        <table className="perf-table">
          <thead>
            <tr>
              <th>编码 / 名称</th>
              <th>分类</th>
              <th>计分方式</th>
              <th>单位</th>
              <th>默认权重</th>
              <th>默认目标</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {workspace.indicatorDefinitions.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <br />
                  <span>{item.code}</span>
                </td>
                <td>{item.category}</td>
                <td>
                  <Tag color={item.mode === 'SYSTEM' ? 'blue' : 'gold'}>
                    {item.mode === 'SYSTEM' ? '系统计算' : '人工评价'}
                  </Tag>
                </td>
                <td>{item.unit}</td>
                <td>{item.defaultWeight}</td>
                <td>{item.defaultTarget}</td>
                <td>
                  <Tag color={item.status === 'ACTIVE' ? 'green' : 'default'}>
                    {item.status === 'ACTIVE' ? '启用' : '停用'}
                  </Tag>
                </td>
                <td>
                  <Button size="small" icon={<Pencil size={14} />} onClick={() => edit(item)}>
                    编辑
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal
        title={draft?.id ? '编辑指标' : '新增指标'}
        open={Boolean(draft)}
        confirmLoading={busy}
        onCancel={() => setDraft(null)}
        onOk={async () => {
          if (!draft) return;
          await mutate(() => saveIndicatorDefinition(draft));
          setDraft(null);
        }}
        okText="保存"
      >
        {draft ? (
          <div className="perf-modal-form">
            <label>
              <span>指标编码</span>
              <Input
                value={draft.code}
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
              />
            </label>
            <label>
              <span>指标名称</span>
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label>
              <span>指标分类</span>
              <Input
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
              />
            </label>
            <label>
              <span>计分方式</span>
              <Select
                value={draft.mode}
                options={[
                  { value: 'SYSTEM', label: '系统计算' },
                  { value: 'MANUAL', label: '人工评价' },
                ]}
                onChange={(mode) => setDraft({ ...draft, mode })}
              />
            </label>
            <label>
              <span>单位</span>
              <Input
                value={draft.unit}
                onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
              />
            </label>
            <label>
              <span>默认权重</span>
              <InputNumber
                min={0.01}
                value={draft.defaultWeight}
                onChange={(defaultWeight) =>
                  setDraft({ ...draft, defaultWeight: Number(defaultWeight || 0) })
                }
              />
            </label>
            <label>
              <span>默认目标</span>
              <InputNumber
                min={0.01}
                value={draft.defaultTarget}
                onChange={(defaultTarget) =>
                  setDraft({ ...draft, defaultTarget: Number(defaultTarget || 0) })
                }
              />
            </label>
            <label>
              <span>状态</span>
              <Select
                value={draft.status}
                options={[
                  { value: 'ACTIVE', label: '启用' },
                  { value: 'INACTIVE', label: '停用' },
                ]}
                onChange={(status) => setDraft({ ...draft, status })}
              />
            </label>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function ConfigurationEditor({
  workspace,
  busy,
  runAction,
}: {
  workspace: PerformanceWorkspace;
  busy: boolean;
  runAction: RunAction;
}) {
  const [draft, setDraft] = React.useState<ConfigurationInput>(() => ({
    employeeId: workspace.employee.id,
    indicators: workspace.indicators.map(({ definitionId, weight, target }) => ({
      definitionId,
      weight,
      target,
    })),
    reviewers: workspace.reviewers.map(({ id, name, weight }) => ({ id, name, weight })),
  }));
  React.useEffect(() => {
    setDraft({
      employeeId: workspace.employee.id,
      indicators: workspace.indicators.map(({ definitionId, weight, target }) => ({
        definitionId,
        weight,
        target,
      })),
      reviewers: workspace.reviewers.map(({ id, name, weight }) => ({ id, name, weight })),
    });
  }, [workspace]);
  const editable = workspace.stage === 'CONFIGURATION';
  const indicatorWeight = draft.indicators.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const reviewerWeight = draft.reviewers.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const patchIndicator = (index: number, patch: Partial<ConfigurationInput['indicators'][number]>) =>
    setDraft((current) => ({
      ...current,
      indicators: current.indicators.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  const patchReviewer = (id: string, patch: Partial<ConfigurationInput['reviewers'][number]>) =>
    setDraft((current) => ({
      ...current,
      reviewers: current.reviewers.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  return (
    <div>
      <div className="perf-form-grid">
        <label>
          <span>考核对象</span>
          <Select
            value={draft.employeeId}
            disabled={!editable}
            options={workspace.employees
              .filter((item) => item.status === 'ACTIVE')
              .map((item) => ({
                value: item.id,
                label: `${item.employeeNo} · ${item.name} · ${item.position}`,
              }))}
            onChange={(employeeId) => setDraft((current) => ({ ...current, employeeId }))}
          />
        </label>
        <label>
          <span>所属组织</span>
          <Input
            value={workspace.employees.find((item) => item.id === draft.employeeId)?.organizationName || '—'}
            disabled
          />
        </label>
      </div>
      <div className="perf-section-title">
        <div>
          <h3>个人指标配置</h3>
          <p>从企业指标库选择指标，权重与目标形成当前周期的不可变执行快照。</p>
        </div>
        <div className="perf-inline-actions">
          <Tag color={indicatorWeight === 100 ? 'green' : 'red'}>指标权重 {indicatorWeight}</Tag>
          {editable ? (
            <Button
              size="small"
              icon={<Plus size={14} />}
              disabled={
                draft.indicators.length >=
                workspace.indicatorDefinitions.filter((item) => item.status === 'ACTIVE').length
              }
              onClick={() => {
                const selected = new Set(draft.indicators.map((item) => item.definitionId));
                const next = workspace.indicatorDefinitions.find(
                  (item) => item.status === 'ACTIVE' && !selected.has(item.id),
                );
                if (next)
                  setDraft((current) => ({
                    ...current,
                    indicators: [
                      ...current.indicators,
                      { definitionId: next.id, weight: next.defaultWeight, target: next.defaultTarget },
                    ],
                  }));
              }}
            >
              添加指标
            </Button>
          ) : null}
        </div>
      </div>
      <div className="perf-table-wrap">
        <table className="perf-table perf-edit-table">
          <thead>
            <tr>
              <th>指标</th>
              <th>计分方式</th>
              <th>权重</th>
              <th>目标值</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {draft.indicators.map((indicator, index) => {
              const definition = workspace.indicatorDefinitions.find(
                (item) => item.id === indicator.definitionId,
              );
              return (
                <tr key={`${indicator.definitionId}-${index}`}>
                  <td>
                    <Select
                      aria-label={`第${index + 1}项指标`}
                      value={indicator.definitionId}
                      disabled={!editable}
                      options={workspace.indicatorDefinitions
                        .filter((item) => item.status === 'ACTIVE')
                        .map((item) => ({
                          value: item.id,
                          label: `${item.code} · ${item.name}`,
                          disabled: draft.indicators.some(
                            (selected, selectedIndex) =>
                              selectedIndex !== index && selected.definitionId === item.id,
                          ),
                        }))}
                      onChange={(definitionId) => {
                        const selected = workspace.indicatorDefinitions.find(
                          (item) => item.id === definitionId,
                        );
                        patchIndicator(index, {
                          definitionId,
                          weight: selected?.defaultWeight || indicator.weight,
                          target: selected?.defaultTarget || indicator.target,
                        });
                      }}
                    />
                  </td>
                  <td>
                    <Tag color={definition?.mode === 'SYSTEM' ? 'blue' : 'gold'}>
                      {definition?.mode === 'SYSTEM' ? '系统计算' : '人工评价'}
                    </Tag>
                  </td>
                  <td>
                    <InputNumber
                      aria-label={`${definition?.name || '指标'}权重`}
                      min={1}
                      max={100}
                      value={indicator.weight}
                      disabled={!editable}
                      onChange={(weight) => patchIndicator(index, { weight: Number(weight || 0) })}
                    />
                  </td>
                  <td>
                    <InputNumber
                      aria-label={`${definition?.name || '指标'}目标值`}
                      min={0.01}
                      value={indicator.target}
                      disabled={!editable}
                      onChange={(target) => patchIndicator(index, { target: Number(target || 0) })}
                    />
                  </td>
                  <td>
                    <Button
                      size="small"
                      danger
                      disabled={!editable || draft.indicators.length <= 1}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          indicators: current.indicators.filter((_, itemIndex) => itemIndex !== index),
                        }))
                      }
                    >
                      移除
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="perf-section-title">
        <div>
          <h3>评价关系</h3>
          <p>评价人权重必须合计 100%，用于人工指标的加权评分。</p>
        </div>
        <Tag color={reviewerWeight === 100 ? 'green' : 'red'}>评价权重 {reviewerWeight}%</Tag>
      </div>
      <div className="perf-reviewers">
        {draft.reviewers.map((reviewer) => (
          <div className="perf-reviewer" key={reviewer.id}>
            <Input
              aria-label={`${reviewer.name}名称`}
              value={reviewer.name}
              disabled={!editable}
              onChange={(event) => patchReviewer(reviewer.id, { name: event.target.value })}
            />
            <label>
              <span>权重</span>
              <InputNumber
                aria-label={`${reviewer.name}权重`}
                min={1}
                max={100}
                addonAfter="%"
                value={reviewer.weight}
                disabled={!editable}
                onChange={(weight) => patchReviewer(reviewer.id, { weight: Number(weight || 0) })}
              />
            </label>
          </div>
        ))}
      </div>
      <div className="perf-submit-bar">
        <span>{editable ? '提交后配置形成执行快照，进入数据填报。' : '配置已提交，当前只读。'}</span>
        <Button
          type="primary"
          loading={busy}
          disabled={!editable || indicatorWeight !== 100 || reviewerWeight !== 100}
          onClick={() => runAction('submit-configuration', draft)}
        >
          保存并提交配置
        </Button>
      </div>
    </div>
  );
}

function DataEntryEditor({
  workspace,
  busy,
  runAction,
}: {
  workspace: PerformanceWorkspace;
  busy: boolean;
  runAction: RunAction;
}) {
  const enteringActuals = workspace.stage === 'DATA_ENTRY';
  const enteringSelfReview = workspace.stage === 'SELF_REVIEW';
  const [values, setValues] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    setValues(
      Object.fromEntries(
        workspace.indicators.map((item) => [
          item.id,
          enteringSelfReview ? (item.selfScore ?? 0) : (item.actual ?? 0),
        ]),
      ),
    );
  }, [workspace, enteringSelfReview]);
  return (
    <div>
      <Alert
        type={enteringActuals || enteringSelfReview ? 'info' : 'success'}
        showIcon
        message={
          enteringActuals ? '填写实际完成值' : enteringSelfReview ? '填写员工自评分' : '数据填报与自评已完成'
        }
        description={
          enteringSelfReview
            ? '自评满分为当前指标权重，仅供评价人参考。'
            : '系统指标会根据实际值和目标值自动生成原始分，并按权重封顶。'
        }
      />
      <div className="perf-table-wrap">
        <table className="perf-table perf-edit-table">
          <thead>
            <tr>
              <th>指标</th>
              <th>目标值</th>
              <th>权重</th>
              <th>{enteringSelfReview ? '自评分' : '实际完成值'}</th>
              <th>系统原始分</th>
            </tr>
          </thead>
          <tbody>
            {workspace.indicators.map((indicator) => (
              <tr key={indicator.id}>
                <td>
                  <strong>{indicator.name}</strong>
                  <br />
                  <span>{indicator.code}</span>
                </td>
                <td>{indicator.target}</td>
                <td>{indicator.weight}</td>
                <td>
                  <InputNumber
                    aria-label={`${indicator.name}${enteringSelfReview ? '自评分' : '实际值'}`}
                    min={0}
                    max={enteringSelfReview ? indicator.weight : undefined}
                    value={values[indicator.id]}
                    disabled={!enteringActuals && !enteringSelfReview}
                    onChange={(value) =>
                      setValues((current) => ({ ...current, [indicator.id]: Number(value || 0) }))
                    }
                  />
                </td>
                <td>{indicator.rawScore ?? '提交实际值后计算'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="perf-submit-bar">
        <span>
          {enteringActuals
            ? '确认实际数据准确后提交。'
            : enteringSelfReview
              ? '提交后进入多方评价。'
              : '当前阶段不允许修改。'}
        </span>
        {enteringActuals ? (
          <Button type="primary" loading={busy} onClick={() => runAction('submit-actuals', { values })}>
            提交实际数据
          </Button>
        ) : null}
        {enteringSelfReview ? (
          <Button
            type="primary"
            loading={busy}
            onClick={() => runAction('submit-self-review', { scores: values })}
          >
            提交员工自评
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AssessmentEditor({
  workspace,
  busy,
  runAction,
}: {
  workspace: PerformanceWorkspace;
  busy: boolean;
  runAction: RunAction;
}) {
  const editable = workspace.stage === 'REVIEW';
  const [scores, setScores] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    setScores(
      Object.fromEntries(
        workspace.reviewerScores.map((item) => [`${item.reviewerId}:${item.indicatorId}`, item.score]),
      ),
    );
  }, [workspace]);
  const payload: ReviewsInput = {
    scores: workspace.reviewers.flatMap((reviewer) =>
      workspace.indicators.map((indicator) => ({
        reviewerId: reviewer.id,
        indicatorId: indicator.id,
        score: Number(scores[`${reviewer.id}:${indicator.id}`] ?? 0),
      })),
    ),
  };
  return (
    <div>
      <Alert
        type={editable ? 'info' : workspace.stage === 'CALCULATION' ? 'warning' : 'success'}
        showIcon
        message={
          editable
            ? '多方评价矩阵'
            : workspace.stage === 'CALCULATION'
              ? '评价已完成，等待核算结算'
              : '评价结果已锁定'
        }
        description="每位评价人逐项评分，单项分不能超过指标权重；后端按评价人权重计算人工指标得分。"
      />
      <div className="perf-table-wrap">
        <table className="perf-table perf-edit-table perf-matrix">
          <thead>
            <tr>
              <th>评价人</th>
              {workspace.indicators.map((item) => (
                <th key={item.id}>
                  {item.name}
                  <br />
                  满分 {item.weight}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workspace.reviewers.map((reviewer) => (
              <tr key={reviewer.id}>
                <td>
                  <strong>{reviewer.name}</strong>
                  <br />
                  <span>权重 {reviewer.weight}%</span>
                </td>
                {workspace.indicators.map((indicator) => {
                  const key = `${reviewer.id}:${indicator.id}`;
                  return (
                    <td key={indicator.id}>
                      <InputNumber
                        aria-label={`${reviewer.name}-${indicator.name}评分`}
                        min={0}
                        max={indicator.weight}
                        value={scores[key]}
                        disabled={!editable}
                        onChange={(value) =>
                          setScores((current) => ({ ...current, [key]: Number(value || 0) }))
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="perf-submit-bar">
        <span>
          {editable
            ? '提交完整评价矩阵后进入核算。'
            : workspace.stage === 'CALCULATION'
              ? '核算将生成总分、等级并锁定执行快照。'
              : '本周期结果不可再修改。'}
        </span>
        {editable ? (
          <Button type="primary" loading={busy} onClick={() => runAction('submit-reviewers', payload)}>
            提交评价矩阵
          </Button>
        ) : null}
        {workspace.stage === 'CALCULATION' ? (
          <Button type="primary" danger loading={busy} onClick={() => runAction('calculate-and-settle')}>
            核算并锁定结果
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PageContent({
  kind,
  workspace,
  busy,
  runAction,
  mutate,
}: {
  kind: PerformancePageKind;
  workspace: PerformanceWorkspace;
  busy: boolean;
  runAction: RunAction;
  mutate: RunMutation;
}) {
  if (kind === 'overview') {
    return (
      <div>
        <h3>周期执行快照</h3>
        <p>
          当前对象为 {workspace.employee.name}，所属 {workspace.employee.organization}。本地 SQLite
          保存完整执行事实，宜搭页面仅承担界面。
        </p>
        <div className="perf-page-links">
          {(
            ['people', 'indicators', 'configuration', 'dataEntry', 'assessment'] as PerformancePageKind[]
          ).map((pageKind) => (
            <Button key={pageKind} onClick={() => openPerformancePage(pageKind)}>
              {PAGE_META[pageKind].title}
            </Button>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'people') return <PeopleManagement workspace={workspace} busy={busy} mutate={mutate} />;
  if (kind === 'indicators') return <IndicatorLibrary workspace={workspace} busy={busy} mutate={mutate} />;
  if (kind === 'configuration') {
    return <ConfigurationEditor workspace={workspace} busy={busy} runAction={runAction} />;
  }
  if (kind === 'assessment') {
    return <AssessmentEditor workspace={workspace} busy={busy} runAction={runAction} />;
  }
  if (kind === 'dataEntry')
    return <DataEntryEditor workspace={workspace} busy={busy} runAction={runAction} />;
  return <IndicatorTable workspace={workspace} />;
}

export function PerformancePage({ kind }: { kind: PerformancePageKind }) {
  useYidaGlobalTheme(THEME_TOKENS);
  const [workspace, setWorkspace] = React.useState<PerformanceWorkspace | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [requestId, setRequestId] = React.useState('尚未请求');
  const [resetOpen, setResetOpen] = React.useState(false);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWorkspace(signal);
      setWorkspace(result.workspace);
      setRequestId(result.requestId);
    } catch (loadError) {
      if (!(loadError instanceof Error && loadError.name === 'AbortError')) setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const mutate = React.useCallback(
    async (operation: () => Promise<{ workspace: PerformanceWorkspace; requestId: string }>) => {
      setBusy(true);
      setError(null);
      try {
        const result = await operation();
        setWorkspace(result.workspace);
        setRequestId(result.requestId);
      } catch (mutationError) {
        setError(errorText(mutationError));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handleReset = React.useCallback(async () => {
    setResetOpen(false);
    await mutate(resetScenario);
  }, [mutate]);
  const runAction = React.useCallback<RunAction>(
    async (action, payload) => mutate(() => performScenarioAction(action, payload)),
    [mutate],
  );

  if (loading && !workspace) {
    return (
      <main className="perf-root perf-loading" data-yida-theme-root="true">
        <style>{PERFORMANCE_CSS}</style>
        <Spin size="large" />
      </main>
    );
  }

  const currentIndex = workspace ? STAGES.findIndex((stage) => stage.key === workspace.stage) : 0;
  const pageMeta = PAGE_META[kind];
  const actionPage = workspace?.nextAction.key ? ACTION_PAGE[workspace.nextAction.key] : null;

  return (
    <ConfigProvider
      theme={{ token: { colorPrimary: '#6657D9', borderRadius: 12, controlHeight: 38 } }}
      getPopupContainer={(node) => node?.parentElement || document.body}
    >
      <main className="perf-root" data-yida-theme-root="true" data-theme-scope="page">
        <style>{PERFORMANCE_CSS}</style>
        <div className="perf-shell">
          <header className="perf-command">
            <div>
              <span className="perf-eyebrow">{pageMeta.eyebrow}</span>
              <h1>{pageMeta.title}</h1>
            </div>
            <div className="perf-actions">
              <span className="perf-endpoint" title={PERFORMANCE_ENDPOINT}>
                performance-api · {requestId}
              </span>
              <Button icon={<RefreshCw size={16} />} onClick={() => load()} disabled={busy}>
                刷新
              </Button>
              <Button icon={<RotateCcw size={16} />} onClick={() => setResetOpen(true)} disabled={busy}>
                重置合成数据
              </Button>
            </div>
          </header>

          {error ? (
            <Alert
              className="perf-error"
              type="error"
              showIcon
              message={error}
              action={<Button onClick={() => load()}>重试</Button>}
            />
          ) : null}

          {workspace ? (
            <>
              <section className="perf-metrics" aria-label="运行摘要">
                <div className="perf-metric">
                  <span>当前周期</span>
                  <strong>{workspace.period}</strong>
                </div>
                <div className="perf-metric">
                  <span>配置权重</span>
                  <strong>{workspace.configWeight}</strong>
                </div>
                <div className="perf-metric">
                  <span>已提交数据</span>
                  <strong>
                    {workspace.submittedActuals}/{workspace.totalActuals}
                  </strong>
                </div>
                <div className="perf-metric">
                  <span>最终结果</span>
                  <strong>
                    {workspace.finalScore === null
                      ? '待核算'
                      : `${workspace.finalScore} · ${workspace.grade}`}
                  </strong>
                </div>
              </section>

              <section className="perf-stage-track" aria-label="绩效执行阶段">
                {STAGES.map((stage, index) => (
                  <div
                    key={stage.key}
                    className={`perf-stage ${index < currentIndex ? 'is-done' : ''} ${index === currentIndex ? 'is-current' : ''}`}
                  >
                    <b>阶段 {index + 1}</b>
                    <span>{stage.label}</span>
                  </div>
                ))}
              </section>

              <section className="perf-grid">
                <div className="perf-panel">
                  <PageContent
                    kind={kind}
                    workspace={workspace}
                    busy={busy}
                    runAction={runAction}
                    mutate={mutate}
                  />
                </div>
                <aside className="perf-rail">
                  {kind === 'overview' ? (
                    <section className="perf-panel perf-next">
                      {workspace.stage === 'LOCKED' ? <LockKeyhole size={22} /> : <Play size={22} />}
                      <h3>{workspace.nextAction.title}</h3>
                      <p>{workspace.nextAction.description}</p>
                      <Button
                        type="primary"
                        ghost
                        icon={workspace.stage === 'LOCKED' ? <LockKeyhole size={16} /> : <Play size={16} />}
                        disabled={!actionPage}
                        onClick={() => actionPage && openPerformancePage(actionPage)}
                      >
                        {actionPage ? `前往${PAGE_META[actionPage].title}` : '周期已完成'}
                      </Button>
                    </section>
                  ) : (
                    <section className="perf-panel perf-next">
                      <Target size={22} />
                      <h3>{PAGE_META[kind].title}</h3>
                      <p>
                        本页操作通过 localhost API 提交，由 Express 校验并写入
                        SQLite；跨模块请使用宜搭左侧导航。
                      </p>
                      <Button ghost onClick={() => openPerformancePage('overview')}>
                        返回运行总览
                      </Button>
                    </section>
                  )}
                  <section className="perf-panel">
                    <h3>
                      <Target size={17} /> 领域约束
                    </h3>
                    <ul className="perf-rule-list">
                      <li>个人配置权重必须精确等于 100</li>
                      <li>评价人权重必须精确等于 100</li>
                      <li>自评只作参考，不直接进入最终分</li>
                      <li>结算后执行快照不可修改</li>
                    </ul>
                  </section>
                  <section className="perf-panel">
                    <h3>
                      <History size={17} /> 最近审计
                    </h3>
                    <ul className="perf-audit">
                      {workspace.audits.map((audit) => (
                        <li key={audit.id}>
                          <span className="perf-audit-dot" />
                          <div>
                            <strong>{audit.action}</strong>
                            {audit.detail}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                  {workspace.stage === 'LOCKED' ? (
                    <div className="perf-lock">
                      <LockKeyhole size={18} /> 本周期已结算，只读锁定生效。
                    </div>
                  ) : null}
                </aside>
              </section>
            </>
          ) : null}
        </div>
        <Modal
          title="重置合成场景"
          open={resetOpen}
          onCancel={() => setResetOpen(false)}
          onOk={handleReset}
          okText="确认重置"
          cancelText="取消"
        >
          <p>只会重置本地 SQLite 中的 `SYN-PERF-2026-Q3`，不会操作任何宜搭表单、流程或业务数据。</p>
        </Modal>
      </main>
    </ConfigProvider>
  );
}
