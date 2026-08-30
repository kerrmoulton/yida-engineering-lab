import React from 'react';
import { Alert, Button, Card, ConfigProvider, Table, Tag, Typography, message } from 'antd';
import { Clipboard, RefreshCw, ScanSearch, ShieldCheck } from 'lucide-react';
import { getLabRuntimeProfile } from '@yida-lab/runtime';
import { scanYidaRuntime, type RuntimeCapability, type RuntimeInventory } from './runtime-inventory.ts';
import { RUNTIME_INVENTORY_CSS } from './styles.ts';

const { Text } = Typography;

interface RuntimeProfile {
  expectedAppType?: string | null;
}

function statusColor(status: RuntimeCapability['status']) {
  if (status === 'official') return 'blue';
  if (status === 'verified') return 'green';
  if (status === 'observed') return 'gold';
  if (status === 'unstable') return 'orange';
  return 'default';
}

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
  const profile = getLabRuntimeProfile() as RuntimeProfile;
  const expectedAppType = profile.expectedAppType || '';
  const [inventory, setInventory] = React.useState<RuntimeInventory>(() =>
    scanYidaRuntime(window, expectedAppType),
  );
  const brand = readBrandColor(6, '#4f6db2');
  const rescan = React.useCallback(
    () => setInventory(scanYidaRuntime(window, expectedAppType)),
    [expectedAppType],
  );
  const copyEvidence = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(inventory, null, 2));
      message.success('已复制脱敏证据');
    } catch (_error) {
      message.error('当前浏览器不允许复制，请在页面中查看证据');
    }
  }, [inventory]);

  const discovered = inventory.capabilities.filter((item) => item.source !== 'none').length;
  const bridges = inventory.capabilities.filter((item) => item.source === 'bridge').length;
  const columns = [
    { title: '能力', dataIndex: 'name', key: 'name', width: 250 },
    { title: '类别', dataIndex: 'kind', key: 'kind', width: 100 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: RuntimeCapability['status']) => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    { title: '来源', dataIndex: 'source', key: 'source', width: 100 },
    {
      title: '安全结构摘要',
      dataIndex: 'shape',
      key: 'shape',
      render: (value: string[] | undefined, row: RuntimeCapability) =>
        value?.length
          ? `${value.slice(0, 12).join(', ')}${value.length > 12 ? ` 等 ${value.length} 项` : ''}`
          : row.message || '无',
    },
  ];

  return (
    <ConfigProvider
      getPopupContainer={(triggerNode) => triggerNode?.parentElement || document.body}
      theme={{ token: { colorPrimary: brand, borderRadius: 12, controlHeight: 38 } }}
    >
      <main className="runtime-root" data-yida-theme-root="true" data-platform-runtime-probe="L0">
        <style>{RUNTIME_INVENTORY_CSS}</style>
        <div className="runtime-shell">
          <header className="runtime-hero">
            <div>
              <span className="runtime-eyebrow">Yida platform runtime lab</span>
              <h1>宜搭运行时只读探针</h1>
              <p>
                安全清点当前页面注入的上下文、桥接方法和原生组件名称。探针不调用未知函数，不读取凭证，也不产生表单或流程数据。
              </p>
            </div>
            <div className="runtime-actions">
              <Button icon={<RefreshCw size={16} />} onClick={rescan}>
                重新扫描
              </Button>
              <Button icon={<Clipboard size={16} />} onClick={copyEvidence}>
                复制脱敏证据
              </Button>
            </div>
          </header>

          {!inventory.expectedAppConfigured ? (
            <Alert type="warning" showIcon message="当前构建未配置预期应用，所有写操作必须保持禁用" />
          ) : inventory.expectedAppMatched ? (
            <Alert type="success" showIcon message="构建目标与当前宜搭应用一致；本页仍严格保持 L0 只读模式" />
          ) : (
            <Alert type="error" showIcon message="构建目标与当前宜搭应用不一致，后续有副作用实验将被阻断" />
          )}

          <section className="runtime-summary" aria-label="运行时摘要">
            <div className="runtime-summary-item">
              <span>发现能力</span>
              <strong>{discovered}</strong>
            </div>
            <div className="runtime-summary-item">
              <span>原生组件候选</span>
              <strong>{inventory.nativeComponentNames.length}</strong>
            </div>
            <div className="runtime-summary-item">
              <span>桥接方法</span>
              <strong>{bridges}</strong>
            </div>
            <div className="runtime-summary-item">
              <span>当前应用</span>
              <strong>
                <code>{inventory.actualAppTypeMasked || '未发现'}</code>
              </strong>
            </div>
          </section>

          <Card
            className="runtime-card"
            title={
              <span>
                <ScanSearch size={17} /> 能力清单
              </span>
            }
          >
            <Table<RuntimeCapability>
              rowKey={(row) => `${row.source}:${row.name}`}
              size="small"
              pagination={false}
              scroll={{ x: 760 }}
              columns={columns}
              dataSource={inventory.capabilities}
            />
          </Card>

          <Card className="runtime-card" title="原生组件候选">
            {inventory.nativeComponentNames.length ? (
              <div className="runtime-component-list">
                {inventory.nativeComponentNames.map((name) => (
                  <Tag key={name} color="geekblue">
                    {name}
                  </Tag>
                ))}
              </div>
            ) : (
              <div className="runtime-empty">当前可访问窗口中尚未发现可安全识别的原生组件候选。</div>
            )}
          </Card>

          <Card
            className="runtime-card"
            title={
              <span>
                <ShieldCheck size={17} /> 脱敏证据
              </span>
            }
          >
            <Text type="secondary">只包含能力名称、字段名和状态，不包含字段值、人员信息或凭证。</Text>
            <pre className="runtime-code">{JSON.stringify(inventory, null, 2)}</pre>
          </Card>
        </div>
      </main>
    </ConfigProvider>
  );
}

export default YidaComp;
