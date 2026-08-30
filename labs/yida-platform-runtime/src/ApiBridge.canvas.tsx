import React from 'react';
import { Alert, Button, Card, ConfigProvider, Spin, Tag } from 'antd';
import { Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { getLabResourceId, getLabRuntimeProfile } from '@yida-lab/runtime';
import { runReadonlyProbe, type ReadonlyProbeEvidence } from './readonly-api-bridge.ts';
import { API_BRIDGE_CSS } from './api-bridge-styles.ts';

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

function YidaComp() {
  const profile = getLabRuntimeProfile();
  const formUuid = getLabResourceId('platform.formSandbox');
  const actualAppType =
    (window as unknown as { pageConfig?: { appType?: string } }).pageConfig?.appType || '';
  const expectedAppMatched = Boolean(profile.expectedAppType && actualAppType === profile.expectedAppType);
  const [evidence, setEvidence] = React.useState<ReadonlyProbeEvidence | null>(null);
  const [loading, setLoading] = React.useState(false);
  const run = React.useCallback(async () => {
    setLoading(true);
    try {
      setEvidence(await runReadonlyProbe({ root: window, formUuid, expectedAppMatched }));
    } finally {
      setLoading(false);
    }
  }, [expectedAppMatched, formUuid]);
  React.useEffect(() => {
    void run();
  }, [run]);
  const passed = evidence?.checks.filter((item) => item.status === 'passed').length || 0;
  const brand = readBrandColor(6, '#31599b');

  return (
    <ConfigProvider
      getPopupContainer={(triggerNode) => triggerNode?.parentElement || document.body}
      theme={{ token: { colorPrimary: brand, borderRadius: 12 } }}
    >
      <main className="api-root" data-yida-theme-root="true" data-platform-runtime-probe="L2">
        <style>{API_BRIDGE_CSS}</style>
        <div className="api-shell">
          <header className="api-hero">
            <div>
              <span>Yida platform runtime lab</span>
              <h1>宜搭 API 桥只读实验</h1>
              <p>
                通过发布层注入的白名单桥读取当前用户上下文字段、沙箱表单字段定义与数据列表。页面不包含任何写方法。
              </p>
            </div>
            <Button icon={<RefreshCw size={16} />} onClick={() => void run()} loading={loading}>
              重新验证
            </Button>
          </header>
          <Alert
            type={expectedAppMatched ? 'success' : 'error'}
            showIcon
            message={
              expectedAppMatched
                ? '构建目标与当前应用一致；本页严格保持 L2 只读模式'
                : '应用不匹配，API 调用结果无效'
            }
          />
          <section className="api-summary">
            <div>
              <span>桥状态</span>
              <strong>{evidence?.bridge.available ? 'available' : 'unavailable'}</strong>
            </div>
            <div>
              <span>只读方法</span>
              <strong>{evidence?.bridge.methods.length || 0}</strong>
            </div>
            <div>
              <span>通过检查</span>
              <strong>{passed}/2</strong>
            </div>
            <div>
              <span>当前用户上下文</span>
              <strong>{evidence?.currentUserContext.available ? 'available' : 'unavailable'}</strong>
            </div>
          </section>
          <Card
            title={
              <span>
                <Database size={17} /> 只读调用结果
              </span>
            }
          >
            {loading && !evidence ? (
              <div className="api-loading">
                <Spin /> 正在调用只读桥
              </div>
            ) : (
              <div className="api-checks">
                {evidence?.checks.map((check) => (
                  <div className="api-check" key={check.method}>
                    <div>
                      <code>{check.method}</code>
                      <Tag
                        color={
                          check.status === 'passed' ? 'green' : check.status === 'failed' ? 'red' : 'default'
                        }
                      >
                        {check.status}
                      </Tag>
                    </div>
                    <p>
                      {check.responseShape
                        ? `返回 ${check.responseShape.kind}；集合数量 ${check.responseShape.collectionCount ?? '未识别'}；顶层字段 ${check.responseShape.topLevelKeys.length} 个`
                        : check.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card
            title={
              <span>
                <ShieldCheck size={17} /> 脱敏只读证据
              </span>
            }
          >
            <pre className="api-code">{JSON.stringify(evidence, null, 2)}</pre>
          </Card>
        </div>
      </main>
    </ConfigProvider>
  );
}

export default YidaComp;
