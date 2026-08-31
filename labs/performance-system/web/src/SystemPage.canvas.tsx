import React from 'react';
import {
  Alert,
  Button,
  ConfigProvider,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Spin,
  Tag,
  message,
} from 'antd';
import { Activity, Database, Plus, RefreshCw, Send, Settings2 } from 'lucide-react';
import type { PageQuery, SystemSnapshot } from '../../shared/contracts.ts';
import { fetchSnapshot, mutate, PERFORMANCE_V2_ENDPOINT } from './api.ts';
import { SYSTEM_CSS } from './styles.ts';

export type SystemPageKind =
  | 'dashboard'
  | 'masterData'
  | 'indicatorLibrary'
  | 'indicatorDelivery'
  | 'personalConfig'
  | 'myIndicators'
  | 'myDataEntry'
  | 'dataEntryAdmin'
  | 'myTasks'
  | 'caseManagement'
  | 'periodOperations'
  | 'results'
  | 'audit';

const PAGE_META: Record<SystemPageKind, { title: string; eyebrow: string; description: string }> = {
  dashboard: {
    title: '绩效运营工作台',
    eyebrow: 'Performance operations',
    description: '观察当前期间的配置、填报、评价和结算运行状态，直接处理阻塞事项。',
  },
  masterData: {
    title: '绩效基础数据中心',
    eyebrow: 'Master data',
    description: '维护组织、人员、绩效期间与角色关系，所有运行数据都引用这些主数据。',
  },
  indicatorLibrary: {
    title: '指标库',
    eyebrow: 'Indicator library',
    description: '维护指标定义、计分口径、来源方式、责任人和生命周期。',
  },
  indicatorDelivery: {
    title: '指标量化与下发',
    eyebrow: 'Quantify and deliver',
    description: '按期间与适用组织设置目标值，并把指标批量下发到个人配置。',
  },
  personalConfig: {
    title: '个人指标配置管理',
    eyebrow: 'Personal configuration',
    description: '检查每名员工的指标组合、总权重和准备状态，批量生成并下发配置。',
  },
  myIndicators: {
    title: '我的年度指标',
    eyebrow: 'My indicators',
    description: '查看本人当前期间的指标、目标、权重、数据责任人与评价关系。',
  },
  myDataEntry: {
    title: '我的数据填报',
    eyebrow: 'My actual data',
    description: '录入本人负责的实际值和证据，并提交到本地绩效状态机。',
  },
  dataEntryAdmin: {
    title: '数据填报管理',
    eyebrow: 'Actual data operations',
    description: '按组织追踪填报进度、缺失项和逾期情况，并进行集中补录。',
  },
  myTasks: {
    title: '我的绩效任务',
    eyebrow: 'My tasks',
    description: '处理本人自评与负责人评价任务，任务提交后推动绩效单进入下一状态。',
  },
  caseManagement: {
    title: '绩效流程管理',
    eyebrow: 'Case operations',
    description: '管理本地绩效业务单的状态流转、评分、重开、作废与锁定。',
  },
  periodOperations: {
    title: '绩效期间运行管理',
    eyebrow: 'Period operations',
    description: '执行期间预检、批量生成绩效单并观察批处理结果。',
  },
  results: {
    title: '绩效结果与分析',
    eyebrow: 'Results and insights',
    description: '分析等级分布、组织表现、排名和已发布结果。',
  },
  audit: {
    title: '系统运行与审计',
    eyebrow: 'Operations and audit',
    description: '查看批处理、错误重试和业务变更审计记录。',
  },
};

type Row = Record<string, unknown>;

function text(value: unknown) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}
function statusColor(status: unknown) {
  const value = String(status);
  if (
    [
      'ACTIVE',
      'PUBLISHED',
      'ISSUED',
      'SUBMITTED',
      'DONE',
      'COMPLETED',
      'LOCKED',
      'SUCCEEDED',
      'RUNNING',
    ].includes(value)
  )
    return 'green';
  if (['DRAFT', 'READY', 'OPEN', 'PLANNED', 'SELF_REVIEW', 'REVIEWING', 'CALCULATING'].includes(value))
    return 'blue';
  if (['OVERDUE', 'MISSING', 'PARTIAL'].includes(value)) return 'orange';
  if (['VOID', 'FAILED', 'INACTIVE', 'RETIRED'].includes(value)) return 'red';
  return 'default';
}
function StatusTag({ value }: { value: unknown }) {
  return <Tag color={statusColor(value)}>{text(value)}</Tag>;
}
function errorText(error: unknown) {
  return error instanceof TypeError
    ? '无法访问 localhost API。请确认服务已启动，并允许浏览器访问本地网络。'
    : error instanceof Error
      ? error.message
      : '请求失败';
}

function DataTable({
  columns,
  rows,
  rowActions,
}: {
  columns: Array<{ key: string; label: string; render?: (row: Row) => React.ReactNode }>;
  rows: Row[];
  rowActions?: (row: Row) => React.ReactNode;
}) {
  if (!rows.length)
    return (
      <div className="perf-v2-empty">
        <Empty description="当前筛选条件下没有业务记录" />
      </div>
    );
  return (
    <div className="perf-v2-table-wrap">
      <table className="perf-v2-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
            {rowActions && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id || index)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render ? column.render(row) : text(row[column.key])}</td>
              ))}
              {rowActions && <td>{rowActions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Panel({
  title,
  description,
  action,
  children,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`perf-v2-panel${compact ? ' compact' : ''}`}>
      <div className="perf-v2-panel-title">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SideRail({ snapshot }: { snapshot: SystemSnapshot }) {
  const overdue = snapshot.tasks.filter((row) => row.status === 'OVERDUE').length;
  const missing = snapshot.actualData.filter((row) => row.status === 'MISSING').length;
  const drafts = snapshot.configs.filter((row) => row.status === 'DRAFT').length;
  return (
    <aside className="perf-v2-side">
      <Panel title="当前阻塞" compact>
        <div className="perf-v2-blocker">
          <strong>{missing} 项数据缺失</strong>
          <span>需要数据责任人补充实际值</span>
        </div>
        <div className="perf-v2-blocker">
          <strong>{overdue} 个任务逾期</strong>
          <span>需要负责人完成评价</span>
        </div>
        <div className="perf-v2-blocker">
          <strong>{drafts} 份配置未就绪</strong>
          <span>不能参与批量生成绩效单</span>
        </div>
      </Panel>
      <Panel title="最近活动" compact>
        {snapshot.audits.slice(0, 5).map((row) => (
          <div className="perf-v2-event" key={String(row.id)}>
            <strong>{text(row.action)}</strong>
            <p>{text(row.detail)}</p>
            <time>{text(row.createdAt).slice(0, 19).replace('T', ' ')}</time>
          </div>
        ))}
      </Panel>
    </aside>
  );
}

function Dashboard({ snapshot }: { snapshot: SystemSnapshot }) {
  const stateCounts = snapshot.cases.reduce<Record<string, number>>((map, row) => {
    const key = String(row.status);
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
  return (
    <>
      <Panel title="期间执行分布" description="绩效单不是固定演示路径，而是同时处于多种业务状态。">
        <div className="perf-v2-chart">
          {Object.entries(stateCounts).map(([state, count]) => (
            <div
              className="perf-v2-bar"
              key={state}
              style={{ height: `${Math.max(24, count * 28)}px` }}
              title={`${state}: ${count}`}
            >
              <span>{state}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="待处理绩效任务" description="展示真实 SQLite 中尚未完成的任务。">
        <DataTable
          rows={snapshot.tasks.filter((row) => row.status !== 'DONE').slice(0, 8)}
          columns={[
            { key: 'employeeName', label: '绩效对象' },
            { key: 'taskType', label: '任务类型' },
            { key: 'assigneeName', label: '处理人' },
            { key: 'dueDate', label: '截止日期' },
            { key: 'status', label: '状态', render: (row) => <StatusTag value={row.status} /> },
          ]}
        />
      </Panel>
    </>
  );
}

function MasterData({ snapshot, act }: ViewProps) {
  const [draft, setDraft] = React.useState<Row | null>(null);
  const [kind, setKind] = React.useState<'organization' | 'employee'>('organization');
  const openOrg = () => {
    setKind('organization');
    setDraft({ code: '', name: '', level: 3, managerName: '', status: 'ACTIVE' });
  };
  const openEmployee = () => {
    setKind('employee');
    setDraft({
      employeeNo: '',
      name: '',
      position: '',
      organizationId: snapshot.organizations.find((row) => row.level === 3)?.id,
      role: 'EMPLOYEE',
    });
  };
  const save = async () => {
    if (!draft) return;
    await act(kind === 'organization' ? '/organizations' : '/employees', draft);
    setDraft(null);
  };
  return (
    <>
      <Panel
        title="组织架构"
        description="三级组织结构与负责人"
        action={
          <Button type="primary" icon={<Plus size={15} />} onClick={openOrg}>
            新增组织
          </Button>
        }
      >
        <DataTable
          rows={snapshot.organizations}
          columns={[
            { key: 'code', label: '编码' },
            { key: 'name', label: '组织名称' },
            { key: 'level', label: '层级' },
            { key: 'managerName', label: '负责人' },
            { key: 'status', label: '状态', render: (row) => <StatusTag value={row.status} /> },
          ]}
        />
      </Panel>
      <Panel
        title="人员与角色"
        description="人员、岗位、部门及系统角色"
        action={
          <Button icon={<Plus size={15} />} onClick={openEmployee}>
            新增人员
          </Button>
        }
      >
        <DataTable
          rows={snapshot.employees}
          columns={[
            { key: 'employeeNo', label: '工号' },
            { key: 'name', label: '姓名' },
            { key: 'position', label: '岗位' },
            { key: 'organizationName', label: '组织' },
            { key: 'role', label: '角色' },
            { key: 'status', label: '状态', render: (row) => <StatusTag value={row.status} /> },
          ]}
        />
      </Panel>
      <Modal
        title={kind === 'organization' ? '维护组织' : '维护人员'}
        open={Boolean(draft)}
        onCancel={() => setDraft(null)}
        onOk={save}
      >
        {draft && (
          <div style={{ display: 'grid', gap: 12 }}>
            {kind === 'organization' ? (
              <>
                <Input
                  placeholder="组织编码"
                  value={String(draft.code || '')}
                  onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                />
                <Input
                  placeholder="组织名称"
                  value={String(draft.name || '')}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
                <Input
                  placeholder="负责人"
                  value={String(draft.managerName || '')}
                  onChange={(event) => setDraft({ ...draft, managerName: event.target.value })}
                />
                <InputNumber
                  min={1}
                  max={6}
                  style={{ width: '100%' }}
                  value={Number(draft.level)}
                  onChange={(value) => setDraft({ ...draft, level: value })}
                />
              </>
            ) : (
              <>
                <Input
                  placeholder="工号"
                  value={String(draft.employeeNo || '')}
                  onChange={(event) => setDraft({ ...draft, employeeNo: event.target.value })}
                />
                <Input
                  placeholder="姓名"
                  value={String(draft.name || '')}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
                <Input
                  placeholder="岗位"
                  value={String(draft.position || '')}
                  onChange={(event) => setDraft({ ...draft, position: event.target.value })}
                />
                <Select
                  value={String(draft.organizationId || '')}
                  options={snapshot.organizations
                    .filter((row) => row.level === 3)
                    .map((row) => ({ value: String(row.id), label: String(row.name) }))}
                  onChange={(value) => setDraft({ ...draft, organizationId: value })}
                />
                <Select
                  value={String(draft.role || 'EMPLOYEE')}
                  options={['EMPLOYEE', 'ORG_MANAGER', 'DATA_PROVIDER', 'REVIEWER', 'PERFORMANCE_ADMIN'].map(
                    (value) => ({ value, label: value }),
                  )}
                  onChange={(value) => setDraft({ ...draft, role: value })}
                />
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function IndicatorLibrary({ snapshot, act }: ViewProps) {
  const [draft, setDraft] = React.useState<Row | null>(null);
  const save = async () => {
    if (!draft) return;
    await act('/indicators', draft);
    setDraft(null);
  };
  return (
    <>
      <Panel
        title="指标定义"
        description="指标发布后不可直接退回草稿"
        action={
          <Button
            type="primary"
            icon={<Plus size={15} />}
            onClick={() =>
              setDraft({
                code: '',
                name: '',
                category: '组织能力',
                sourceType: 'MANUAL',
                unit: '分',
                defaultWeight: 10,
                scoringRule: 'MANUAL_SCORE',
                ownerName: snapshot.currentUser.name,
                status: 'DRAFT',
              })
            }
          >
            新增指标
          </Button>
        }
      >
        <DataTable
          rows={snapshot.indicators}
          columns={[
            { key: 'code', label: '编码' },
            {
              key: 'name',
              label: '指标名称',
              render: (row) => (
                <>
                  <strong>{text(row.name)}</strong>
                  <small>{text(row.category)}</small>
                </>
              ),
            },
            { key: 'sourceType', label: '来源' },
            { key: 'defaultWeight', label: '默认权重' },
            { key: 'ownerName', label: '负责人' },
            { key: 'scopeCount', label: '适用组织' },
            { key: 'status', label: '状态', render: (row) => <StatusTag value={row.status} /> },
          ]}
          rowActions={(row) =>
            row.status === 'DRAFT' ? (
              <Button size="small" type="primary" onClick={() => act(`/indicators/${row.id}/publish`)}>
                发布
              </Button>
            ) : null
          }
        />
      </Panel>
      <Modal title="新增绩效指标" open={Boolean(draft)} onCancel={() => setDraft(null)} onOk={save}>
        {draft && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Input
              placeholder="指标编码"
              value={String(draft.code)}
              onChange={(event) => setDraft({ ...draft, code: event.target.value })}
            />
            <Input
              placeholder="指标名称"
              value={String(draft.name)}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <Input
              placeholder="指标分类"
              value={String(draft.category)}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            />
            <Select
              value={String(draft.sourceType)}
              options={[
                { value: 'SYSTEM', label: '系统采集' },
                { value: 'MANUAL', label: '人工评价' },
              ]}
              onChange={(value) => setDraft({ ...draft, sourceType: value })}
            />
            <Input
              placeholder="单位"
              value={String(draft.unit)}
              onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
            />
            <InputNumber
              min={1}
              max={100}
              style={{ width: '100%' }}
              value={Number(draft.defaultWeight)}
              onChange={(value) => setDraft({ ...draft, defaultWeight: value })}
            />
          </div>
        )}
      </Modal>
    </>
  );
}

function IndicatorDelivery({ snapshot, act, periodId }: ViewProps) {
  return (
    <Panel
      title="量化与组织下发"
      description="每条记录对应指标、期间和组织的真实下发状态"
      action={
        <Button
          type="primary"
          icon={<Send size={15} />}
          onClick={() => act('/assignments/issue', { periodId })}
        >
          下发待处理指标
        </Button>
      }
    >
      <DataTable
        rows={snapshot.assignments}
        columns={[
          { key: 'indicatorName', label: '指标' },
          { key: 'periodName', label: '期间' },
          { key: 'organizationName', label: '适用组织' },
          { key: 'assignedCount', label: '覆盖人数' },
          { key: 'issuedAt', label: '下发时间' },
          { key: 'status', label: '状态', render: (row) => <StatusTag value={row.status} /> },
        ]}
      />
    </Panel>
  );
}

function PersonalConfig({ snapshot, act, periodId }: ViewProps) {
  return (
    <Panel
      title="个人指标配置"
      description="准备状态、指标数和权重是生成绩效单的前置条件"
      action={
        <Button
          type="primary"
          icon={<Settings2 size={15} />}
          onClick={() => act('/configs/generate', { periodId })}
        >
          生成缺失配置
        </Button>
      }
    >
      <DataTable
        rows={snapshot.configs}
        columns={[
          { key: 'employeeNo', label: '工号' },
          { key: 'employeeName', label: '员工' },
          { key: 'organizationName', label: '组织' },
          { key: 'itemCount', label: '指标数' },
          { key: 'totalWeight', label: '总权重' },
          { key: 'source', label: '来源' },
          { key: 'status', label: '状态', render: (row) => <StatusTag value={row.status} /> },
        ]}
        rowActions={(row) =>
          row.status === 'READY' || row.status === 'DRAFT' ? (
            <Button size="small" onClick={() => act(`/configs/${row.id}/issue`)}>
              下发
            </Button>
          ) : null
        }
      />
    </Panel>
  );
}

function MyIndicators({ snapshot }: { snapshot: SystemSnapshot }) {
  const config = snapshot.configs.find((row) => row.employeeId === snapshot.currentUser.id);
  const rows = snapshot.actualData.filter((row) => row.employeeId === snapshot.currentUser.id);
  return (
    <>
      <Panel title="本人配置摘要">
        <dl className="perf-v2-kv">
          <dt>当前人员</dt>
          <dd>{snapshot.currentUser.name}</dd>
          <dt>配置状态</dt>
          <dd>
            <StatusTag value={config?.status} />
          </dd>
          <dt>指标总数</dt>
          <dd>{text(config?.itemCount)}</dd>
          <dt>总权重</dt>
          <dd>{text(config?.totalWeight)}</dd>
        </dl>
      </Panel>
      <Panel title="当前期间指标">
        <DataTable
          rows={rows}
          columns={[
            { key: 'indicatorName', label: '指标' },
            { key: 'unit', label: '单位' },
            { key: 'value', label: '当前实际值' },
            { key: 'evidence', label: '业务证据' },
            { key: 'status', label: '数据状态', render: (row) => <StatusTag value={row.status} /> },
          ]}
        />
      </Panel>
    </>
  );
}

function ActualDataView({ snapshot, act, admin = false }: ViewProps & { admin?: boolean }) {
  const [draft, setDraft] = React.useState<Row | null>(null);
  const rows = admin
    ? snapshot.actualData
    : snapshot.actualData.filter((row) => row.employeeId === snapshot.currentUser.id);
  const submit = async () => {
    if (!draft) return;
    await act(`/actual-data/${draft.id}/submit`, { value: Number(draft.value), evidence: draft.evidence });
    setDraft(null);
  };
  return (
    <>
      <Panel
        title={admin ? '全员填报进度' : '本人数据任务'}
        description={admin ? '集中查看缺失、草稿和已提交数据' : '只有提交后才进入考核计算'}
      >
        <DataTable
          rows={rows}
          columns={[
            { key: 'employeeName', label: '员工' },
            { key: 'indicatorName', label: '指标' },
            { key: 'value', label: '实际值' },
            { key: 'unit', label: '单位' },
            { key: 'evidence', label: '凭证' },
            { key: 'status', label: '状态', render: (row) => <StatusTag value={row.status} /> },
          ]}
          rowActions={(row) =>
            row.status !== 'LOCKED' ? (
              <Button
                size="small"
                onClick={() => setDraft({ ...row, value: row.value ?? 90, evidence: row.evidence || '' })}
              >
                录入
              </Button>
            ) : null
          }
        />
      </Panel>
      <Modal title="录入实际绩效数据" open={Boolean(draft)} onCancel={() => setDraft(null)} onOk={submit}>
        {draft && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Alert
              type="info"
              showIcon
              message={`${text(draft.employeeName)} · ${text(draft.indicatorName)}`}
            />
            <InputNumber
              min={0}
              style={{ width: '100%' }}
              value={Number(draft.value)}
              onChange={(value) => setDraft({ ...draft, value })}
            />
            <Input.TextArea
              rows={3}
              placeholder="业务证据或说明"
              value={String(draft.evidence || '')}
              onChange={(event) => setDraft({ ...draft, evidence: event.target.value })}
            />
          </div>
        )}
      </Modal>
    </>
  );
}

function TaskView({ snapshot, act }: ViewProps) {
  const [draft, setDraft] = React.useState<Row | null>(null);
  const submit = async () => {
    if (!draft) return;
    const action = draft.taskType === 'SELF_REVIEW' ? 'submitSelfReview' : 'submitReview';
    await act(`/cases/${draft.caseId}/actions/${action}`, {
      score: Number(draft.score || 90),
      comment: draft.comment || '',
    });
    setDraft(null);
  };
  return (
    <>
      <Panel title="我的待办任务" description="当前测试角色同时承担管理员、员工和评价人视角">
        <DataTable
          rows={snapshot.tasks.filter((row) => row.status !== 'DONE')}
          columns={[
            { key: 'employeeName', label: '绩效对象' },
            { key: 'taskType', label: '任务类型' },
            { key: 'assigneeName', label: '处理人' },
            { key: 'dueDate', label: '截止日期' },
            { key: 'status', label: '状态', render: (row) => <StatusTag value={row.status} /> },
          ]}
          rowActions={(row) => (
            <Button size="small" type="primary" onClick={() => setDraft({ ...row, score: 90, comment: '' })}>
              处理
            </Button>
          )}
        />
      </Panel>
      <Modal title="提交绩效任务" open={Boolean(draft)} onCancel={() => setDraft(null)} onOk={submit}>
        {draft && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Alert showIcon type="info" message={`${text(draft.employeeName)} · ${text(draft.taskType)}`} />
            <InputNumber
              min={0}
              max={120}
              style={{ width: '100%' }}
              value={Number(draft.score)}
              onChange={(value) => setDraft({ ...draft, score: value })}
            />
            <Input.TextArea
              rows={3}
              placeholder="评价说明"
              value={String(draft.comment)}
              onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
            />
          </div>
        )}
      </Modal>
    </>
  );
}

function CaseManagement({ snapshot, act }: ViewProps) {
  const actionFor = (row: Row) => {
    const status = String(row.status);
    if (status === 'READY') return 'start';
    if (status === 'CALCULATING') return 'calculate';
    if (status === 'COMPLETED') return 'lock';
    return null;
  };
  return (
    <Panel title="绩效业务单" description="这里的流程是 SQLite 状态机，不会发起任何宜搭审批">
      <DataTable
        rows={snapshot.cases}
        columns={[
          { key: 'employeeNo', label: '工号' },
          { key: 'employeeName', label: '员工' },
          { key: 'organizationName', label: '组织' },
          { key: 'status', label: '业务状态', render: (row) => <StatusTag value={row.status} /> },
          { key: 'totalScore', label: '总分' },
          { key: 'grade', label: '等级' },
          { key: 'version', label: '版本' },
        ]}
        rowActions={(row) =>
          actionFor(row) ? (
            <Button size="small" onClick={() => act(`/cases/${row.id}/actions/${actionFor(row)}`, {})}>
              {actionFor(row) === 'start' ? '开始自评' : actionFor(row) === 'calculate' ? '核算' : '锁定'}
            </Button>
          ) : (
            <span style={{ color: '#9a9fad' }}>等待任务</span>
          )
        }
      />
    </Panel>
  );
}

function PeriodOperations({ snapshot, act, periodId }: ViewProps) {
  const issued = snapshot.configs.filter((row) => row.status === 'ISSUED' || row.status === 'LOCKED').length;
  return (
    <>
      <Panel
        title="运行前检查"
        action={
          <Button
            type="primary"
            icon={<Activity size={15} />}
            onClick={() => act('/cases/generate', { periodId })}
          >
            批量生成绩效单
          </Button>
        }
      >
        <div className="perf-v2-grade">
          <div>
            <strong>{snapshot.employees.length}</strong>
            <span>在职人员</span>
          </div>
          <div>
            <strong>{issued}</strong>
            <span>配置就绪</span>
          </div>
          <div>
            <strong>{snapshot.cases.length}</strong>
            <span>已生成绩效单</span>
          </div>
          <div>
            <strong>{snapshot.summary.blockers}</strong>
            <span>缺失数据</span>
          </div>
          <div>
            <strong>{snapshot.summary.openTasks}</strong>
            <span>开放任务</span>
          </div>
        </div>
      </Panel>
      <Panel title="批处理记录">
        <DataTable
          rows={snapshot.jobs}
          columns={[
            { key: 'jobType', label: '任务类型' },
            { key: 'status', label: '状态', render: (row) => <StatusTag value={row.status} /> },
            { key: 'processed', label: '处理数' },
            { key: 'succeeded', label: '成功' },
            { key: 'failed', label: '失败' },
            { key: 'detail', label: '说明' },
            { key: 'createdAt', label: '运行时间' },
          ]}
        />
      </Panel>
    </>
  );
}

function Results({ snapshot }: { snapshot: SystemSnapshot }) {
  const grades = ['A', 'B+', 'B', 'C', 'D'].map((grade) => ({
    grade,
    count: snapshot.results.filter((row) => row.grade === grade).length,
  }));
  return (
    <>
      <Panel title="等级分布">
        <div className="perf-v2-grade">
          {grades.map((item) => (
            <div key={item.grade}>
              <strong>{item.count}</strong>
              <span>{item.grade} 等级</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="绩效结果明细">
        <DataTable
          rows={snapshot.results}
          columns={[
            { key: 'rankNo', label: '排名' },
            { key: 'employeeName', label: '员工' },
            { key: 'organizationName', label: '组织' },
            { key: 'totalScore', label: '总分' },
            { key: 'grade', label: '等级', render: (row) => <StatusTag value={row.grade} /> },
            { key: 'publishedAt', label: '发布时间' },
          ]}
        />
      </Panel>
    </>
  );
}

function Audit({ snapshot, act }: ViewProps) {
  return (
    <>
      <Panel title="批处理运行记录">
        <DataTable
          rows={snapshot.jobs}
          columns={[
            { key: 'jobType', label: '任务' },
            { key: 'status', label: '状态', render: (row) => <StatusTag value={row.status} /> },
            { key: 'processed', label: '处理' },
            { key: 'succeeded', label: '成功' },
            { key: 'failed', label: '失败' },
            { key: 'detail', label: '详情' },
          ]}
          rowActions={(row) =>
            row.status === 'PARTIAL' || row.status === 'FAILED' ? (
              <Button size="small" onClick={() => act(`/jobs/${row.id}/retry`)}>
                重试
              </Button>
            ) : null
          }
        />
      </Panel>
      <Panel title="业务审计事件">
        <DataTable
          rows={snapshot.audits}
          columns={[
            { key: 'createdAt', label: '时间' },
            { key: 'actor', label: '操作人' },
            { key: 'action', label: '动作' },
            { key: 'objectType', label: '对象类型' },
            { key: 'objectId', label: '对象标识' },
            { key: 'detail', label: '说明' },
          ]}
        />
      </Panel>
    </>
  );
}

interface ViewProps {
  snapshot: SystemSnapshot;
  act: (path: string, payload?: unknown) => Promise<void>;
  periodId: string;
}

function MainView({ kind, ...props }: ViewProps & { kind: SystemPageKind }) {
  if (kind === 'dashboard') return <Dashboard snapshot={props.snapshot} />;
  if (kind === 'masterData') return <MasterData {...props} />;
  if (kind === 'indicatorLibrary') return <IndicatorLibrary {...props} />;
  if (kind === 'indicatorDelivery') return <IndicatorDelivery {...props} />;
  if (kind === 'personalConfig') return <PersonalConfig {...props} />;
  if (kind === 'myIndicators') return <MyIndicators snapshot={props.snapshot} />;
  if (kind === 'myDataEntry') return <ActualDataView {...props} />;
  if (kind === 'dataEntryAdmin') return <ActualDataView {...props} admin />;
  if (kind === 'myTasks') return <TaskView {...props} />;
  if (kind === 'caseManagement') return <CaseManagement {...props} />;
  if (kind === 'periodOperations') return <PeriodOperations {...props} />;
  if (kind === 'results') return <Results snapshot={props.snapshot} />;
  return <Audit {...props} />;
}

export function PerformanceSystemPage({ kind }: { kind: SystemPageKind }) {
  const [snapshot, setSnapshot] = React.useState<SystemSnapshot | null>(null);
  const [query, setQuery] = React.useState<PageQuery>({ periodId: 'PER-2026-Q3' });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const meta = PAGE_META[kind];
  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await fetchSnapshot(query));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [query]);
  React.useEffect(() => {
    void load();
  }, [load]);
  const act = async (path: string, payload?: unknown) => {
    setLoading(true);
    try {
      const next = await mutate(path, payload);
      setSnapshot(next);
      setError(null);
      message.success('操作已保存');
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  };
  const brand = '#6657d9';
  return (
    <ConfigProvider
      getPopupContainer={(trigger) => trigger?.parentElement || document.body}
      theme={{ token: { colorPrimary: brand, borderRadius: 10, fontSize: 13 } }}
    >
      <main className="perf-v2" data-yida-theme-root="true" data-performance-api={PERFORMANCE_V2_ENDPOINT}>
        <style>{SYSTEM_CSS}</style>
        <div className="perf-v2-content">
          <header className="perf-v2-head">
            <div>
              <div className="perf-v2-eyebrow">{meta.eyebrow}</div>
              <h1>{meta.title}</h1>
              <p className="perf-v2-sub">{meta.description}</p>
            </div>
            <div className="perf-v2-actions">
              <Button icon={<RefreshCw size={15} />} onClick={() => void load()}>
                刷新数据
              </Button>
              <Tag color="purple">本地状态机</Tag>
              <Tag color="green">SQLite</Tag>
            </div>
          </header>
          <div className="perf-v2-filter">
            <Input.Search
              allowClear
              placeholder="搜索员工、工号或岗位"
              value={query.keyword}
              onChange={(event) => setQuery((current) => ({ ...current, keyword: event.target.value }))}
            />
            <Select
              value={query.periodId}
              options={(snapshot?.periods || []).map((row) => ({
                value: String(row.id),
                label: String(row.name),
              }))}
              onChange={(value) => setQuery((current) => ({ ...current, periodId: value }))}
            />
            <Select
              allowClear
              placeholder="全部组织"
              value={query.organizationId}
              options={(snapshot?.organizations || [])
                .filter((row) => row.level === 3)
                .map((row) => ({ value: String(row.id), label: String(row.name) }))}
              onChange={(value) => setQuery((current) => ({ ...current, organizationId: value }))}
            />
            <Button icon={<Database size={15} />} onClick={() => setQuery({ periodId: 'PER-2026-Q3' })}>
              重置筛选
            </Button>
          </div>
          {error && (
            <Alert
              style={{ marginBottom: 14 }}
              type="error"
              showIcon
              message={error}
              action={
                <Button size="small" onClick={() => void load()}>
                  重试
                </Button>
              }
            />
          )}
          {snapshot && (
            <div className="perf-v2-summary">
              <div className="perf-v2-stat">
                <small>在职人员</small>
                <strong>{snapshot.summary.activeEmployees}</strong>
              </div>
              <div className="perf-v2-stat">
                <small>已发布指标</small>
                <strong>{snapshot.summary.publishedIndicators}</strong>
              </div>
              <div className="perf-v2-stat">
                <small>已下发配置</small>
                <strong>{snapshot.summary.issuedConfigs}</strong>
              </div>
              <div className="perf-v2-stat">
                <small>开放任务</small>
                <strong>{snapshot.summary.openTasks}</strong>
              </div>
              <div className="perf-v2-stat">
                <small>已完成绩效</small>
                <strong>{snapshot.summary.completedCases}</strong>
              </div>
              <div className="perf-v2-stat warn">
                <small>数据阻塞</small>
                <strong>{snapshot.summary.blockers}</strong>
              </div>
            </div>
          )}
          <Spin spinning={loading}>
            {snapshot ? (
              <div className="perf-v2-grid">
                <div style={{ display: 'grid', gap: 14 }}>
                  <MainView
                    kind={kind}
                    snapshot={snapshot}
                    act={act}
                    periodId={query.periodId || 'PER-2026-Q3'}
                  />
                </div>
                <SideRail snapshot={snapshot} />
              </div>
            ) : !loading && !error ? (
              <Empty description="暂无系统数据" />
            ) : (
              <div style={{ minHeight: 260 }} />
            )}
          </Spin>
        </div>
      </main>
    </ConfigProvider>
  );
}
