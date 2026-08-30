import React from 'react';
import { Alert, Button, ConfigProvider, Spin, Table, Tag } from 'antd';
import { RefreshCw, ScanSearch, ShieldCheck } from 'lucide-react';
import { getLabPageUrl, getLabResourceId, getLabRuntimeProfile } from '@yida-lab/runtime';
import {
  runControlledUiApi,
  runExternalAssetApi,
  runJsApiMatrixProbe,
  type ControlledUiMethod,
  type ExternalAssetMethod,
  type JsApiMatrixEvidence,
} from './js-api-matrix.ts';
import { JS_API_MATRIX_CSS } from './js-api-matrix-styles.ts';

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

function statusColor(status: string) {
  if (status === 'verified') return 'green';
  if (status === 'failed') return 'red';
  return 'default';
}

function YidaComp() {
  const profile = getLabRuntimeProfile();
  const formUuid = getLabResourceId('platform.formSandbox');
  const processFormUuid = getLabResourceId('platform.processSandbox');
  const targetPagePath = getLabPageUrl('platform.runtimeInventory');
  const targetPageUrl = new URL(targetPagePath, window.location.origin).href;
  const targetFormUuid = targetPagePath.split('/').filter(Boolean).pop() || '';
  const actualAppType =
    (window as unknown as { pageConfig?: { appType?: string } }).pageConfig?.appType || '';
  const expectedAppMatched = Boolean(profile.expectedAppType && actualAppType === profile.expectedAppType);
  const [evidence, setEvidence] = React.useState<JsApiMatrixEvidence | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [uiLoading, setUiLoading] = React.useState<ControlledUiMethod | null>(null);
  const [assetLoading, setAssetLoading] = React.useState<ExternalAssetMethod | null>(null);
  const run = React.useCallback(async () => {
    setLoading(true);
    try {
      let nextEvidence: JsApiMatrixEvidence | null = null;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        nextEvidence = await runJsApiMatrixProbe({
          root: window,
          expectedAppMatched,
          formUuid,
          processFormUuid,
        });
        if (nextEvidence.bridge.ready && nextEvidence.summary.unsupported === 0) {
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      setEvidence(nextEvidence);
    } finally {
      setLoading(false);
    }
  }, [expectedAppMatched, formUuid, processFormUuid]);
  React.useEffect(() => {
    void run();
  }, [run]);
  const runUiApi = React.useCallback(
    async (method: ControlledUiMethod) => {
      setUiLoading(method);
      try {
        const result = await runControlledUiApi({
          root: window,
          expectedAppMatched,
          method,
          targetPagePath: targetPageUrl,
          targetFormUuid,
        });
        setEvidence((current) => {
          if (!current) return current;
          const uiChecks = current.uiChecks.map((check) => (check.method === method ? result : check));
          return {
            ...current,
            uiChecks,
            uiSummary: {
              total: uiChecks.length,
              ready: uiChecks.filter((check) => check.status === 'ready').length,
              verified: uiChecks.filter((check) => check.status === 'verified').length,
              failed: uiChecks.filter((check) => check.status === 'failed').length,
              unsupported: uiChecks.filter((check) => check.status === 'unsupported').length,
            },
          };
        });
      } finally {
        setUiLoading(null);
      }
    },
    [expectedAppMatched, targetFormUuid, targetPageUrl],
  );
  const runAssetApi = React.useCallback(async (method: ExternalAssetMethod) => {
    setAssetLoading(method);
    try {
      const result = await runExternalAssetApi({ root: window, method });
      setEvidence((current) => {
        if (!current) return current;
        const assetChecks = current.assetChecks.map((check) => (check.method === method ? result : check));
        return {
          ...current,
          assetChecks,
          assetSummary: {
            total: assetChecks.length,
            ready: assetChecks.filter((check) => check.status === 'ready').length,
            verified: assetChecks.filter((check) => check.status === 'verified').length,
            failed: assetChecks.filter((check) => check.status === 'failed').length,
            unsupported: assetChecks.filter((check) => check.status === 'unsupported').length,
          },
        };
      });
    } finally {
      setAssetLoading(null);
    }
  }, []);
  const brand = readBrandColor(6, '#31599b');
  const columns = [
    {
      title: 'API',
      dataIndex: 'method',
      key: 'method',
      render: (value: string) => <span className="matrix-method">{value}</span>,
    },
    { title: '分类', dataIndex: 'category', key: 'category', width: 150 },
    {
      title: '发现',
      dataIndex: 'observed',
      key: 'observed',
      width: 90,
      render: (value: boolean) => (
        <Tag color={value ? 'blue' : 'default'}>{value ? 'observed' : 'missing'}</Tag>
      ),
    },
    {
      title: '验证状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    {
      title: '脱敏返回结构',
      key: 'shape',
      render: (_value: unknown, row: JsApiMatrixEvidence['checks'][number]) => (
        <span className="matrix-shape">
          {row.responseShape
            ? `${row.responseShape.kind} / collection ${row.responseShape.collectionCount ?? '-'} / keys ${row.responseShape.topLevelKeys.length}`
            : row.message || '-'}
        </span>
      ),
    },
  ];

  return (
    <ConfigProvider
      getPopupContainer={(triggerNode) => triggerNode?.parentElement || document.body}
      theme={{ token: { colorPrimary: brand, borderRadius: 12 } }}
    >
      <main
        className="matrix-root"
        data-yida-theme-root="true"
        data-platform-runtime-probe="L4-js-api-matrix"
      >
        <style>{JS_API_MATRIX_CSS}</style>
        <div className="matrix-shell">
          <header className="matrix-hero">
            <div>
              <span>Yida platform runtime lab</span>
              <h1>宜搭 JS API 能力矩阵</h1>
              <p>
                首批验证两个 ID
                查询、身份、页面上下文和纯格式化工具。页面只保存返回类型、字段名和集合数量，不保存用户、实例或表单字段值。
              </p>
            </div>
            <Button
              data-testid="matrix-rerun"
              icon={<RefreshCw size={16} />}
              onClick={() => void run()}
              loading={loading}
            >
              重新执行只读矩阵
            </Button>
          </header>
          <Alert
            type={expectedAppMatched ? 'success' : 'error'}
            showIcon
            message={
              expectedAppMatched
                ? '当前应用与构建目标一致；10 项检查均为无写副作用调用'
                : '当前应用与构建目标不一致；资源查询已阻断'
            }
          />
          <section className="matrix-summary">
            <div>
              <span>检查总数</span>
              <strong>{evidence?.summary.total || 10}</strong>
            </div>
            <div>
              <span>已验证</span>
              <strong>{evidence?.summary.verified || 0}</strong>
            </div>
            <div>
              <span>失败</span>
              <strong>{evidence?.summary.failed || 0}</strong>
            </div>
            <div>
              <span>不支持</span>
              <strong>{evidence?.summary.unsupported || 0}</strong>
            </div>
          </section>
          <section className="matrix-panel">
            <h2>第二批：受控 UI 与导航能力</h2>
            <p>
              这 5 项不会自动执行。每个按钮只调用一次对应原生
              API；两个导航动作只允许打开本应用的运行时盘点页。
            </p>
            <div className="matrix-ui-grid">
              {(
                [
                  ['toast', '显示 Toast', 'matrix-ui-toast'],
                  ['dialog', '打开 Dialog', 'matrix-ui-dialog'],
                  ['previewImage', '预览测试图片', 'matrix-ui-preview'],
                  ['openPage', 'openPage 打开盘点页', 'matrix-ui-open-page'],
                  ['routerPush', 'router.push 打开盘点页', 'matrix-ui-router-push'],
                ] as const
              ).map(([method, label, testId]) => {
                const check = evidence?.uiChecks.find((item) => item.method === method);
                return (
                  <div className="matrix-ui-card" key={method}>
                    <div>
                      <span className="matrix-method">{method}</span>
                      <Tag color={statusColor(check?.status || 'ready')}>{check?.status || 'loading'}</Tag>
                    </div>
                    <Button
                      data-testid={testId}
                      onClick={() => void runUiApi(method)}
                      loading={uiLoading === method}
                      disabled={!check || check.status === 'unsupported'}
                    >
                      {label}
                    </Button>
                    <small>{check?.message || '仅在点击后执行'}</small>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="matrix-panel">
            <h2>第三批：外部资源加载能力</h2>
            <p>
              使用已验证可访问的阿里 CDN 小型资源。只有点击按钮才加载，并检查脚本全局或样式链接是否真正生效。
            </p>
            <div className="matrix-ui-grid matrix-asset-grid">
              {(
                [
                  ['loadScript', '加载 QRCode 脚本', 'matrix-asset-script'],
                  ['loadStyleSheet', '加载 Normalize CSS', 'matrix-asset-style'],
                ] as const
              ).map(([method, label, testId]) => {
                const check = evidence?.assetChecks.find((item) => item.method === method);
                return (
                  <div className="matrix-ui-card" key={method}>
                    <div>
                      <span className="matrix-method">{method}</span>
                      <Tag color={statusColor(check?.status || 'ready')}>{check?.status || 'loading'}</Tag>
                    </div>
                    <Button
                      data-testid={testId}
                      onClick={() => void runAssetApi(method)}
                      loading={assetLoading === method}
                      disabled={!check || check.status === 'unsupported'}
                    >
                      {label}
                    </Button>
                    <small>{check?.message || '仅在点击后加载固定测试资源'}</small>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="matrix-panel">
            <h2>
              <ScanSearch size={18} /> 第一批能力覆盖
            </h2>
            <p>official 表示参考契约中公开；observed 表示当前真实页面桥存在；verified 表示本次调用成功。</p>
            {loading && !evidence ? (
              <div className="matrix-loading">
                <Spin /> 正在执行只读能力矩阵
              </div>
            ) : (
              <Table
                className="matrix-table"
                rowKey="method"
                columns={columns}
                dataSource={evidence?.checks || []}
                pagination={false}
                scroll={{ x: 820 }}
              />
            )}
          </section>
          <section className="matrix-panel">
            <h2>
              <ShieldCheck size={18} /> 脱敏结构化证据
            </h2>
            <p>证据不包含 API 返回值，只包含能力状态和结构摘要。</p>
            <pre data-testid="matrix-evidence" className="matrix-code">
              {JSON.stringify(evidence, null, 2)}
            </pre>
          </section>
        </div>
      </main>
    </ConfigProvider>
  );
}

export default YidaComp;
