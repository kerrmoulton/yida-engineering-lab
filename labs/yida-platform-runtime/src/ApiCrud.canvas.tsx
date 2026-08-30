import React from 'react';
import { Alert, Button, Card, ConfigProvider, Tag } from 'antd';
import { DatabaseZap, ShieldCheck, Trash2 } from 'lucide-react';
import { getLabResourceFieldId, getLabResourceId, getLabRuntimeProfile } from '@yida-lab/runtime';
import {
  deleteControlledCrud,
  inspectControlledCrud,
  prepareControlledCrud,
  type ControlledCrudEvidence,
  type CrudFields,
  type PendingCrudRecord,
} from './controlled-crud-bridge.ts';
import { API_CRUD_CSS } from './api-crud-styles.ts';

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
  const uuid =
    typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `YIDA_RUNTIME_LAB_${uuid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
}

function YidaComp() {
  const profile = getLabRuntimeProfile();
  const formUuid = getLabResourceId('platform.formSandbox');
  const fields: CrudFields = React.useMemo(
    () => ({
      experimentTag: getLabResourceFieldId('platform.formSandbox', 'experimentTag'),
      operationType: getLabResourceFieldId('platform.formSandbox', 'operationType'),
      summary: getLabResourceFieldId('platform.formSandbox', 'summary'),
      payload: getLabResourceFieldId('platform.formSandbox', 'payload'),
      experimentTime: getLabResourceFieldId('platform.formSandbox', 'experimentTime'),
    }),
    [],
  );
  const actualAppType =
    (window as unknown as { pageConfig?: { appType?: string } }).pageConfig?.appType || '';
  const expectedAppMatched = Boolean(profile.expectedAppType && actualAppType === profile.expectedAppType);
  const [evidence, setEvidence] = React.useState<ControlledCrudEvidence>(() =>
    inspectControlledCrud(window, expectedAppMatched),
  );
  const [pending, setPending] = React.useState<PendingCrudRecord | null>(null);
  const [marker, setMarker] = React.useState(() => createRunMarker());
  const [busy, setBusy] = React.useState(false);
  const brand = readBrandColor(6, '#31599b');

  const prepare = React.useCallback(async () => {
    setBusy(true);
    try {
      const result = await prepareControlledCrud({
        root: window,
        appType: expectedAppMatched ? actualAppType : '',
        formUuid,
        fields,
        marker,
      });
      setEvidence(result.evidence);
      setPending(result.pending);
    } finally {
      setBusy(false);
    }
  }, [actualAppType, expectedAppMatched, fields, formUuid, marker]);

  const remove = React.useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const next = await deleteControlledCrud({
        root: window,
        expectedAppMatched,
        pending,
        previousEvidence: evidence,
      });
      setEvidence(next);
      if (next.phase === 'complete') {
        setPending(null);
        setMarker(createRunMarker());
      }
    } finally {
      setBusy(false);
    }
  }, [evidence, expectedAppMatched, pending]);

  const allMethodsAvailable = evidence.bridge.methods.length === 5;
  const canPrepare = expectedAppMatched && allMethodsAvailable && !pending && !busy;
  const canDelete = expectedAppMatched && Boolean(pending) && !busy;

  return (
    <ConfigProvider
      getPopupContainer={(triggerNode) => triggerNode?.parentElement || document.body}
      theme={{ token: { colorPrimary: brand, borderRadius: 12 } }}
    >
      <main className="crud-root" data-yida-theme-root="true" data-platform-runtime-probe="L3">
        <style>{API_CRUD_CSS}</style>
        <div className="crud-shell">
          <header className="crud-hero">
            <div>
              <span>Yida platform runtime lab</span>
              <h1>宜搭 API 桥受控 CRUD 实验</h1>
              <p>
                在专用空表中最多创建一条带唯一标记的记录，逐步验证创建、精确查询、详情、更新与按实例 ID
                删除。页面加载不会触发任何写操作。
              </p>
            </div>
            <ShieldCheck size={34} />
          </header>
          <Alert
            type={expectedAppMatched ? 'success' : 'error'}
            showIcon
            message={
              expectedAppMatched
                ? '构建目标与当前应用一致；写入范围限制为 1 条本轮标记记录'
                : '应用不匹配，所有写操作已禁用'
            }
          />
          <section className="crud-summary">
            <div>
              <span>安全等级</span>
              <strong>L3 controlled</strong>
            </div>
            <div>
              <span>桥方法</span>
              <strong>{evidence.bridge.methods.length}/5</strong>
            </div>
            <div>
              <span>当前阶段</span>
              <strong>{evidence.phase}</strong>
            </div>
            <div>
              <span>通过步骤</span>
              <strong>{evidence.steps.filter((item) => item.status === 'passed').length}/9</strong>
            </div>
          </section>
          <Card
            title={
              <span>
                <DatabaseZap size={17} /> 受控执行
              </span>
            }
          >
            <div className="crud-actions">
              <div>
                <strong>步骤一：创建并验证更新</strong>
                <p>预检标记不存在后创建 1 条记录，完成查询、详情、更新和再次查询。不会自动删除。</p>
                <Button
                  type="primary"
                  data-testid="crud-start"
                  onClick={() => void prepare()}
                  disabled={!canPrepare}
                  loading={busy && !pending}
                >
                  运行到删除前
                </Button>
              </div>
              <div>
                <strong>步骤二：精确删除并确认清空</strong>
                <p>
                  {pending ? `待删除 1 条；实验标记 ${pending.marker}` : '仅当步骤一完整通过后才会启用。'}
                </p>
                <Button
                  danger
                  icon={<Trash2 size={16} />}
                  data-testid="crud-delete"
                  onClick={() => void remove()}
                  disabled={!canDelete}
                  loading={busy && Boolean(pending)}
                >
                  删除本次 1 条记录并确认清空
                </Button>
              </div>
            </div>
          </Card>
          <Card title="步骤证据">
            <div className="crud-steps">
              {evidence.steps.map((step) => (
                <div className="crud-step" key={step.name}>
                  <div>
                    <code>{step.name}</code>
                    <Tag color="green">{step.status}</Tag>
                  </div>
                  <p>
                    {step.method}：{step.assertion}
                  </p>
                </div>
              ))}
              {!evidence.steps.length && <p className="crud-empty">等待用户主动运行。</p>}
            </div>
          </Card>
          {evidence.error && <Alert type="error" showIcon message={evidence.error} />}
          <Card title="脱敏结构化证据">
            <pre className="crud-code">{JSON.stringify(evidence, null, 2)}</pre>
          </Card>
        </div>
      </main>
    </ConfigProvider>
  );
}

export default YidaComp;
