import React from 'react';
import { Alert, Button, Checkbox, ConfigProvider, Input, Tag } from 'antd';
import {
  AlertTriangle,
  CheckCircle2,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Workflow,
} from 'lucide-react';
import {
  getLabResourceFieldId,
  getLabResourceId,
  getLabResourceProcessCode,
  getLabRuntimeProfile,
} from '@yida-lab/runtime';
import {
  approveSelfOnlyProcess,
  inspectSelfOnlyProcess,
  inspectSelfOnlyLifecycle,
  runSelfOnlyPreflight,
  SELF_ONLY_PROCESS_DEFINITION,
  startSelfOnlyProcess,
  terminateSelfOnlyProcess,
  updateSelfOnlyProcess,
  type PendingSelfOnlyProcess,
  type ProcessFields,
  type ProcessLifecycleEvidence,
  type SelfOnlyProcessEvidence,
} from './self-only-process-bridge.ts';
import { PROCESS_SANDBOX_CSS } from './process-sandbox-styles.ts';

function readBrandColor(level: number, fallback: string) {
  try {
    return (
      getComputedStyle(document.documentElement).getPropertyValue(`--color-brand1-${level}`).trim() ||
      fallback
    );
  } catch (_error) {
    return fallback;
  }
}

function createRunMarker() {
  const random = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `YIDA_PROCESS_LAB_${random.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
}

function statusTag(passed: boolean, waiting = false) {
  if (waiting) return <Tag>等待检查</Tag>;
  return <Tag color={passed ? 'green' : 'red'}>{passed ? '通过' : '阻断'}</Tag>;
}

function YidaComp() {
  const profile = getLabRuntimeProfile();
  const formUuid = getLabResourceId('platform.processSandbox');
  const processCode = getLabResourceProcessCode('platform.processSandbox');
  const fields: ProcessFields = React.useMemo(
    () => ({
      experimentTag: getLabResourceFieldId('platform.processSandbox', 'experimentTag'),
      summary: getLabResourceFieldId('platform.processSandbox', 'summary'),
      payload: getLabResourceFieldId('platform.processSandbox', 'payload'),
      experimentTime: getLabResourceFieldId('platform.processSandbox', 'experimentTime'),
    }),
    [],
  );
  const actualAppType =
    (window as unknown as { pageConfig?: { appType?: string } }).pageConfig?.appType || '';
  const expectedAppMatched = Boolean(profile.expectedAppType && actualAppType === profile.expectedAppType);
  const [evidence, setEvidence] = React.useState<SelfOnlyProcessEvidence>(() =>
    inspectSelfOnlyProcess(window, expectedAppMatched),
  );
  const [summary, setSummary] = React.useState('宜搭平台运行时自处理流程验证');
  const [payload, setPayload] = React.useState('{"schemaVersion":1,"purpose":"self-only-process"}');
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [marker] = React.useState(createRunMarker);
  const [busy, setBusy] = React.useState(false);
  const [lifecycleBusy, setLifecycleBusy] = React.useState(false);
  const [terminateAcknowledged, setTerminateAcknowledged] = React.useState(false);
  const [updateAcknowledged, setUpdateAcknowledged] = React.useState(false);
  const [approvalAcknowledged, setApprovalAcknowledged] = React.useState(false);
  const [lifecycleEvidence, setLifecycleEvidence] = React.useState<ProcessLifecycleEvidence>({
    schemaVersion: 1,
    safety: {
      selfOnly: true,
      taggedOnly: true,
      uniqueRunningInstanceRequired: true,
      deleteAllowed: false,
      sensitiveValuesRedacted: true,
    },
    phase: 'idle',
    expectedAppMatched,
    identityMatched: false,
    discovery: {
      runningCount: 0,
      taggedSelfOnlyCount: 0,
      uniqueMatch: false,
      idCaptured: false,
    },
    operations: { available: false, count: 0, currentUserTodoCount: 0 },
    completion: {
      updatePerformed: false,
      updateVerified: false,
      approvalPerformed: false,
      result: '',
      statusAfter: '',
    },
    termination: { performed: false, statusBefore: '', statusAfter: '' },
  });
  const [pendingLifecycle, setPendingLifecycle] = React.useState<PendingSelfOnlyProcess | null>(null);
  const startedRef = React.useRef(false);
  const brand = readBrandColor(6, '#31599b');

  const runPreflight = React.useCallback(async () => {
    setBusy(true);
    try {
      setEvidence(
        await runSelfOnlyPreflight({
          root: window,
          expectedAppMatched,
          definition: SELF_ONLY_PROCESS_DEFINITION,
        }),
      );
    } finally {
      setBusy(false);
    }
  }, [expectedAppMatched]);

  const startProcess = React.useCallback(async () => {
    if (startedRef.current) return;
    setBusy(true);
    try {
      const result = await startSelfOnlyProcess({
        root: window,
        appType: expectedAppMatched ? actualAppType : '',
        formUuid,
        processCode,
        fields,
        marker,
        summary: summary.trim(),
        payload: payload.trim(),
        acknowledged,
        alreadyStarted: startedRef.current,
      });
      if (result.phase === 'complete') startedRef.current = true;
      setEvidence(result);
    } finally {
      setBusy(false);
    }
  }, [
    acknowledged,
    actualAppType,
    expectedAppMatched,
    fields,
    formUuid,
    marker,
    payload,
    processCode,
    summary,
  ]);

  const inspectLifecycle = React.useCallback(async () => {
    setLifecycleBusy(true);
    try {
      const result = await inspectSelfOnlyLifecycle({
        root: window,
        expectedAppMatched,
        formUuid,
        experimentTagField: fields.experimentTag,
      });
      setLifecycleEvidence(result.evidence);
      setPendingLifecycle(result.pending);
    } finally {
      setLifecycleBusy(false);
    }
  }, [expectedAppMatched, fields.experimentTag, formUuid]);

  const terminateLifecycle = React.useCallback(async () => {
    setLifecycleBusy(true);
    try {
      const result = await terminateSelfOnlyProcess({
        root: window,
        expectedAppMatched,
        acknowledged: terminateAcknowledged,
        pending: pendingLifecycle,
        previousEvidence: lifecycleEvidence,
      });
      setLifecycleEvidence(result);
      if (result.phase === 'complete') setPendingLifecycle(null);
    } finally {
      setLifecycleBusy(false);
    }
  }, [expectedAppMatched, lifecycleEvidence, pendingLifecycle, terminateAcknowledged]);

  const updateLifecycle = React.useCallback(async () => {
    setLifecycleBusy(true);
    try {
      const result = await updateSelfOnlyProcess({
        root: window,
        expectedAppMatched,
        acknowledged: updateAcknowledged,
        pending: pendingLifecycle,
        previousEvidence: lifecycleEvidence,
        fields,
        summary,
        payload,
      });
      setLifecycleEvidence(result);
    } finally {
      setLifecycleBusy(false);
    }
  }, [expectedAppMatched, fields, lifecycleEvidence, payload, pendingLifecycle, summary, updateAcknowledged]);

  const approveLifecycle = React.useCallback(async () => {
    setLifecycleBusy(true);
    try {
      const result = await approveSelfOnlyProcess({
        root: window,
        expectedAppMatched,
        acknowledged: approvalAcknowledged,
        pending: pendingLifecycle,
        previousEvidence: lifecycleEvidence,
      });
      setLifecycleEvidence(result);
      if (result.phase === 'complete') setPendingLifecycle(null);
    } finally {
      setLifecycleBusy(false);
    }
  }, [approvalAcknowledged, expectedAppMatched, lifecycleEvidence, pendingLifecycle]);

  const ready = evidence.phase === 'ready';
  const complete = evidence.phase === 'complete';
  const canStart = ready && acknowledged && summary.trim().length > 0 && !busy && !complete;
  const waiting = evidence.phase === 'idle' || evidence.phase === 'checking';
  const lifecycleReady = lifecycleEvidence.phase === 'ready';
  const lifecycleUpdated = lifecycleEvidence.phase === 'updated';
  const lifecycleComplete = lifecycleEvidence.phase === 'complete';
  const completedByApproval = lifecycleEvidence.completion.statusAfter === 'COMPLETED';
  const canUpdate =
    lifecycleReady &&
    updateAcknowledged &&
    Boolean(pendingLifecycle) &&
    summary.trim().length > 0 &&
    payload.trim().length > 0 &&
    !lifecycleBusy;
  const canApprove = lifecycleUpdated && approvalAcknowledged && Boolean(pendingLifecycle) && !lifecycleBusy;
  const canTerminate =
    lifecycleReady &&
    terminateAcknowledged &&
    Boolean(pendingLifecycle) &&
    !lifecycleBusy &&
    !lifecycleComplete;

  const checks = [
    {
      name: '应用环境一致',
      detail: '构建期预期应用与当前 pageConfig.appType 完全一致',
      passed: evidence.expectedAppMatched,
      icon: Workflow,
    },
    {
      name: '登录身份一致',
      detail: 'window.loginUser 与 getLoginUserId 归一化后指向同一用户',
      passed: evidence.identity.matched,
      icon: UserCheck,
    },
    {
      name: '流程定义安全',
      detail: '仅 1 个 approval 节点，审批人为 originator',
      passed: evidence.definition.safe,
      icon: ShieldCheck,
    },
    {
      name: '实例数量受限',
      detail: '当前页面会话最多发起 1 条，成功后永久禁用按钮',
      passed: evidence.instance.count <= 1,
      icon: CheckCircle2,
    },
  ];

  return (
    <ConfigProvider
      getPopupContainer={(triggerNode) => triggerNode?.parentElement || document.body}
      theme={{ token: { colorPrimary: brand, borderRadius: 12 } }}
    >
      <main className="process-root" data-yida-theme-root="true" data-platform-runtime-probe="L3-process">
        <style>{PROCESS_SANDBOX_CSS}</style>
        <div className="process-shell">
          <header className="process-hero">
            <div>
              <span>Yida platform runtime lab</span>
              <h1>宜搭平台流程沙箱</h1>
              <p>
                验证 Canvas
                是否能在应用、身份和流程定义三重门禁下，发起最多一条只发送给当前登录人本人的流程。页面加载不会触发任何写操作。
              </p>
            </div>
            <ShieldCheck size={36} />
          </header>

          <Alert
            type={complete ? 'success' : ready ? 'warning' : evidence.phase === 'failed' ? 'error' : 'info'}
            showIcon
            message={
              complete
                ? '已创建 1 条仅本人处理的流程实例；本页面会话已锁定，不会再次发起'
                : ready
                  ? '只读门禁全部通过；仍需勾选本人确认后才能发起'
                  : evidence.phase === 'failed'
                    ? evidence.error || '门禁未通过，流程发起已禁用'
                    : '请先执行只读安全预检'
            }
          />

          <section className="process-summary">
            <div>
              <span>安全等级</span>
              <strong>L3 self-only</strong>
            </div>
            <div>
              <span>流程节点</span>
              <strong>{evidence.definition.nodeCount}/1</strong>
            </div>
            <div>
              <span>身份匹配</span>
              <strong>{evidence.identity.matched ? '一致' : '待验证'}</strong>
            </div>
            <div>
              <span>已发起实例</span>
              <strong>{evidence.instance.count}/1</strong>
            </div>
          </section>

          <section className="process-grid">
            <div className="process-panel">
              <h2>安全门禁</h2>
              <div className="process-checks">
                {checks.map((check) => {
                  const Icon = check.icon;
                  return (
                    <div className="process-check" key={check.name}>
                      <div>
                        <Icon size={18} />
                        <div>
                          <strong>{check.name}</strong>
                          <p>{check.detail}</p>
                        </div>
                      </div>
                      {statusTag(check.passed, waiting && check.name === '登录身份一致')}
                    </div>
                  );
                })}
              </div>

              <div className="process-form">
                <label>
                  申请摘要
                  <Input
                    value={summary}
                    maxLength={80}
                    onChange={(event) => setSummary(event.target.value)}
                  />
                </label>
                <label>
                  实验载荷
                  <Input.TextArea
                    value={payload}
                    rows={4}
                    maxLength={500}
                    onChange={(event) => setPayload(event.target.value)}
                  />
                </label>
                <div className="process-confirm">
                  <Checkbox
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  >
                    我确认：流程将发送给当前登录人本人，不会发送给其他人员
                  </Checkbox>
                </div>
                <div className="process-actions">
                  <Button
                    data-testid="process-preflight"
                    icon={<RefreshCw size={16} />}
                    onClick={() => void runPreflight()}
                    loading={busy && !complete}
                    disabled={busy || complete}
                  >
                    执行只读安全预检
                  </Button>
                  <Button
                    type="primary"
                    data-testid="process-start"
                    icon={<PlayCircle size={16} />}
                    onClick={() => void startProcess()}
                    loading={busy && ready}
                    disabled={!canStart}
                  >
                    发起 1 条仅本人处理流程
                  </Button>
                </div>
              </div>
            </div>

            <aside className="process-panel">
              <h2>副作用边界</h2>
              <div className="process-boundary">
                <div>
                  <UserCheck size={18} />
                  <div>
                    <strong>处理人</strong>
                    <p>审批人固定为 originator，即当前流程发起人。</p>
                  </div>
                </div>
                <div>
                  <AlertTriangle size={18} />
                  <div>
                    <strong>明确禁止</strong>
                    <p>无抄送、无固定人员、无角色、无主管、无消息和连接器节点。</p>
                  </div>
                </div>
                <div>
                  <Workflow size={18} />
                  <div>
                    <strong>实例上限</strong>
                    <p>页面加载零写入；用户主动点击后最多创建 1 条；不会自动审批。</p>
                  </div>
                </div>
              </div>
            </aside>
          </section>

          <section className="process-panel">
            <h2>运行中实例生命周期</h2>
            <Alert
              type={
                lifecycleComplete
                  ? 'success'
                  : lifecycleReady
                    ? 'warning'
                    : lifecycleEvidence.phase === 'failed'
                      ? 'error'
                      : 'info'
              }
              showIcon
              message={
                lifecycleComplete
                  ? completedByApproval
                    ? '唯一本人实验流程已更新并由当前用户同意，回读为 COMPLETED；记录仍保留'
                    : '唯一本人实验流程已终止并回读为 TERMINATED；记录仍保留'
                  : lifecycleUpdated
                    ? '流程字段已更新并回读一致；可在再次明确确认后同意本人唯一待办'
                    : lifecycleReady
                      ? '已唯一定位当前用户的 RUNNING 实验流程，可选择更新并完成，或终止并保留记录'
                      : lifecycleEvidence.phase === 'failed'
                        ? lifecycleEvidence.error || '生命周期门禁未通过'
                        : '先只读查询实例详情与审批记录，不会改变流程状态'
              }
            />
            <div className="process-summary process-lifecycle-summary">
              <div>
                <span>运行中实例</span>
                <strong>{lifecycleEvidence.discovery.runningCount}</strong>
              </div>
              <div>
                <span>本人实验匹配</span>
                <strong>{lifecycleEvidence.discovery.taggedSelfOnlyCount}</strong>
              </div>
              <div>
                <span>当前用户待办</span>
                <strong>{lifecycleEvidence.operations.currentUserTodoCount}</strong>
              </div>
              <div>
                <span>实例状态</span>
                <strong>
                  {lifecycleEvidence.termination.statusAfter ||
                    lifecycleEvidence.completion.statusAfter ||
                    lifecycleEvidence.termination.statusBefore ||
                    '待查询'}
                </strong>
              </div>
            </div>
            <div className="process-confirm">
              <Checkbox
                data-testid="lifecycle-update-acknowledge"
                checked={updateAcknowledged}
                disabled={!lifecycleReady || lifecycleComplete}
                onChange={(event) => setUpdateAcknowledged(event.target.checked)}
              >
                我确认：仅更新当前登录人本人的唯一实验流程摘要与载荷
              </Checkbox>
            </div>
            <div className="process-confirm">
              <Checkbox
                data-testid="lifecycle-approve-acknowledge"
                checked={approvalAcknowledged}
                disabled={!lifecycleUpdated || lifecycleComplete}
                onChange={(event) => setApprovalAcknowledged(event.target.checked)}
              >
                我确认：以当前登录人身份同意本人的唯一实验待办
              </Checkbox>
            </div>
            <div className="process-confirm">
              <Checkbox
                data-testid="lifecycle-acknowledge"
                checked={terminateAcknowledged}
                disabled={!lifecycleReady || lifecycleComplete}
                onChange={(event) => setTerminateAcknowledged(event.target.checked)}
              >
                我确认：仅终止当前登录人本人的唯一实验流程，并保留流程记录
              </Checkbox>
            </div>
            <div className="process-actions">
              <Button
                data-testid="lifecycle-inspect"
                icon={<RefreshCw size={16} />}
                loading={lifecycleBusy && lifecycleEvidence.phase !== 'ready'}
                disabled={lifecycleBusy || lifecycleComplete}
                onClick={() => void inspectLifecycle()}
              >
                查询本人运行中实验流程
              </Button>
              <Button
                data-testid="lifecycle-update"
                icon={<RefreshCw size={16} />}
                loading={lifecycleBusy && lifecycleReady}
                disabled={!canUpdate}
                onClick={() => void updateLifecycle()}
              >
                更新流程字段并回读
              </Button>
              <Button
                type="primary"
                data-testid="lifecycle-approve"
                icon={<CheckCircle2 size={16} />}
                loading={lifecycleBusy && lifecycleUpdated}
                disabled={!canApprove}
                onClick={() => void approveLifecycle()}
              >
                同意本人待办并完成
              </Button>
              <Button
                danger
                data-testid="lifecycle-terminate"
                icon={<AlertTriangle size={16} />}
                loading={lifecycleBusy && lifecycleReady}
                disabled={!canTerminate}
                onClick={() => void terminateLifecycle()}
              >
                终止并保留流程记录
              </Button>
            </div>
            <pre data-testid="lifecycle-evidence" className="process-code lifecycle-code">
              {JSON.stringify(lifecycleEvidence, null, 2)}
            </pre>
          </section>

          <section className="process-panel">
            <h2>脱敏结构化证据</h2>
            <pre data-testid="process-evidence" className="process-code">
              {JSON.stringify(evidence, null, 2)}
            </pre>
          </section>
        </div>
      </main>
    </ConfigProvider>
  );
}

export default YidaComp;
