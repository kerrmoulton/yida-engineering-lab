import React from 'react';
import { Alert, Button, ConfigProvider, Input, Modal, Select, Spin } from 'antd';
import { Activity, Plus, RefreshCw, Search } from 'lucide-react';
import { API_BASE_URL, createTask, deleteTask, fetchHealth, fetchTasks, updateTask } from './api/client.js';
import { BoardColumn } from './components/BoardColumn.jsx';
import { FLOWBOARD_CSS } from './styles.js';

const COLUMNS = [
  { key: 'backlog', label: '待处理' },
  { key: 'in_progress', label: '进行中' },
  { key: 'done', label: '已完成' },
];

function readBrandColor(level, defaultColor) {
  try {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(`--color-brand1-${level || 6}`)
      .trim();
    return value || defaultColor;
  } catch (_error) {
    return defaultColor;
  }
}

function describeError(error) {
  if (error?.name === 'AbortError') return null;
  if (error?.issues) return 'API 响应没有通过共享契约校验。';
  if (error instanceof TypeError) {
    return '无法访问本地 API。请确认服务已启动，并允许浏览器访问本地网络。';
  }
  return error?.message || '请求失败，请稍后重试。';
}

function YidaComp() {
  const [tasks, setTasks] = React.useState([]);
  const [health, setHealth] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [requestId, setRequestId] = React.useState('尚未请求');
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [selectedId, setSelectedId] = React.useState(null);
  const [busyTaskId, setBusyTaskId] = React.useState(null);
  const [deleteCandidateId, setDeleteCandidateId] = React.useState(null);
  const [deleting, setDeleting] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState({ title: '', assignee: '', priority: 'medium' });
  const brand = readBrandColor(6, '#5b6fc7');

  const load = React.useCallback(
    (signal) => {
      setLoading(true);
      setError(null);
      return Promise.all([fetchTasks({ search, status }, signal), fetchHealth(signal)])
        .then(([taskResult, healthResult]) => {
          setTasks(taskResult.data.data);
          setHealth(healthResult.data.data);
          setRequestId(taskResult.requestId);
          setSelectedId((current) =>
            taskResult.data.data.some((task) => task.id === current)
              ? current
              : taskResult.data.data[0]?.id || null,
          );
        })
        .catch((loadError) => {
          const message = describeError(loadError);
          if (message) setError(message);
        })
        .finally(() => setLoading(false));
    },
    [search, status],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => load(controller.signal), 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const reload = React.useCallback(() => {
    const controller = new AbortController();
    load(controller.signal);
  }, [load]);

  const mutate = React.useCallback(
    async (taskId, operation) => {
      setBusyTaskId(taskId);
      setError(null);
      try {
        const result = await operation();
        setRequestId(result.requestId);
        reload();
      } catch (mutationError) {
        setError(describeError(mutationError));
      } finally {
        setBusyTaskId(null);
      }
    },
    [reload],
  );

  const handleCreate = React.useCallback(async () => {
    if (!draft.title.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createTask({
        title: draft.title,
        description: '通过 Flowboard Canvas 页面创建。',
        priority: draft.priority,
        assignee: draft.assignee,
      });
      setRequestId(result.requestId);
      setDraft({ title: '', assignee: '', priority: 'medium' });
      setSelectedId(result.data.data.id);
      reload();
    } catch (createError) {
      setError(describeError(createError));
    } finally {
      setCreating(false);
    }
  }, [creating, draft, reload]);

  const groupedTasks = React.useMemo(
    () =>
      Object.fromEntries(
        COLUMNS.map((column) => [column.key, tasks.filter((task) => task.status === column.key)]),
      ),
    [tasks],
  );
  const selectedTask = tasks.find((task) => task.id === selectedId) || null;
  const deleteCandidate = tasks.find((task) => task.id === deleteCandidateId) || null;
  const handleDelete = React.useCallback(async () => {
    if (!deleteCandidateId || deleting) return;
    setDeleting(true);
    setBusyTaskId(deleteCandidateId);
    setError(null);
    try {
      const result = await deleteTask(deleteCandidateId);
      setRequestId(result.requestId);
      setDeleteCandidateId(null);
      reload();
    } catch (deleteError) {
      setError(describeError(deleteError));
    } finally {
      setDeleting(false);
      setBusyTaskId(null);
    }
  }, [deleteCandidateId, deleting, reload]);
  const actions = React.useMemo(
    () => ({
      select: setSelectedId,
      move: (id, nextStatus) => mutate(id, () => updateTask(id, { status: nextStatus })),
      remove: setDeleteCandidateId,
    }),
    [mutate],
  );

  return (
    <ConfigProvider
      getPopupContainer={(triggerNode) => triggerNode?.parentElement || document.body}
      theme={{ token: { colorPrimary: brand, borderRadius: 12, controlHeight: 38 } }}
    >
      <main className="flow-root" data-yida-theme-root="true">
        <style>{FLOWBOARD_CSS}</style>
        <div className="flow-shell">
          <header className="flow-hero">
            <div>
              <span className="flow-eyebrow">Full-stack engineering lab</span>
              <h1>Flowboard</h1>
              <p>用真实本地 API 验证 Canvas、多文件构建、共享契约与可观察请求链路。</p>
            </div>
            <div className={`flow-health ${health ? 'is-online' : ''}`}>
              <span className="flow-health-dot" />
              <Activity size={16} />
              {health ? '本地 API 在线' : '等待本地 API'}
            </div>
          </header>

          <section className="flow-summary" aria-label="任务摘要">
            <div className="flow-summary-item">
              <span>全部任务</span>
              <strong>{tasks.length}</strong>
            </div>
            <div className="flow-summary-item">
              <span>进行中</span>
              <strong>{groupedTasks.in_progress.length}</strong>
            </div>
            <div className="flow-summary-item">
              <span>已完成</span>
              <strong>{groupedTasks.done.length}</strong>
            </div>
            <div className="flow-summary-item">
              <span>最近请求</span>
              <strong title={requestId}>{requestId}</strong>
            </div>
          </section>

          {error ? (
            <Alert
              className="flow-error"
              type="error"
              showIcon
              message={error}
              action={<Button onClick={reload}>重试</Button>}
            />
          ) : null}

          <section className="flow-toolbar">
            <div className="flow-create">
              <Input
                value={draft.title}
                placeholder="输入任务标题"
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                onPressEnter={handleCreate}
              />
              <Input
                value={draft.assignee}
                placeholder="负责人"
                onChange={(event) => setDraft((current) => ({ ...current, assignee: event.target.value }))}
              />
              <Select
                value={draft.priority}
                onChange={(priority) => setDraft((current) => ({ ...current, priority }))}
                options={[
                  { value: 'low', label: '低优先级' },
                  { value: 'medium', label: '中优先级' },
                  { value: 'high', label: '高优先级' },
                ]}
              />
              <Button
                type="primary"
                icon={<Plus size={16} />}
                loading={creating}
                disabled={!draft.title.trim()}
                onClick={handleCreate}
              >
                新建任务
              </Button>
            </div>
            <div className="flow-filters">
              <Input
                prefix={<Search size={16} />}
                value={search}
                placeholder="搜索标题、说明或负责人"
                onChange={(event) => setSearch(event.target.value)}
                allowClear
              />
              <Select
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: '全部状态' },
                  ...COLUMNS.map((column) => ({ value: column.key, label: column.label })),
                ]}
              />
              <Button icon={<RefreshCw size={16} />} onClick={reload}>
                刷新
              </Button>
            </div>
          </section>

          <div className="flow-layout">
            <Spin spinning={loading} tip="正在读取本地 API">
              <section className="flow-board" aria-label="任务看板">
                {COLUMNS.map((column) => (
                  <BoardColumn
                    key={column.key}
                    definition={column}
                    tasks={groupedTasks[column.key]}
                    selectedId={selectedId}
                    busyTaskId={busyTaskId}
                    actions={actions}
                  />
                ))}
              </section>
            </Spin>
            <aside className="flow-context">
              <section className="flow-panel">
                <h2>任务上下文</h2>
                {selectedTask ? (
                  <dl className="flow-detail-grid">
                    <div>
                      <dt>标题</dt>
                      <dd>{selectedTask.title}</dd>
                    </div>
                    <div>
                      <dt>负责人</dt>
                      <dd>{selectedTask.assignee || '未分配'}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{COLUMNS.find((column) => column.key === selectedTask.status)?.label}</dd>
                    </div>
                    <div>
                      <dt>更新时间</dt>
                      <dd>{new Date(selectedTask.updatedAt).toLocaleString()}</dd>
                    </div>
                  </dl>
                ) : (
                  <p>选择一个任务查看详情。</p>
                )}
              </section>
              <section className="flow-panel flow-diagnostic">
                <h2>联调诊断</h2>
                <code>endpoint: {API_BASE_URL}</code>
                <code>contract: typed/shared-runtime</code>
                <code>requestId: {requestId}</code>
                <code>transport: browser to localhost</code>
              </section>
            </aside>
          </div>
          <Modal
            title="删除任务"
            open={Boolean(deleteCandidate)}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            confirmLoading={deleting}
            onOk={handleDelete}
            onCancel={() => setDeleteCandidateId(null)}
          >
            <p>即将删除任务“{deleteCandidate?.title || ''}”，该操作会立即写入本地 API。</p>
          </Modal>
        </div>
      </main>
    </ConfigProvider>
  );
}

export default YidaComp;
