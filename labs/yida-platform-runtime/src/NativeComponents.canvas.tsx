import React from 'react';
import { Alert, Button, Card, ConfigProvider, Drawer, Space, Tag } from 'antd';
import { Boxes, ShieldCheck, Upload } from 'lucide-react';
import { getLabResourceId, getLabRuntimeProfile } from '@yida-lab/runtime';
import {
  normalizeNativeControlledValue,
  resolveNativeComponent,
  type NativeComponentName,
} from './native-components.ts';
import { NATIVE_COMPONENTS_CSS } from './native-styles.ts';

type ProbeStatus = 'unsupported' | 'mounted' | 'failed';
const NATIVE_COMPONENT_NAMES: NativeComponentName[] = [
  'EmployeeField',
  'DepartmentField',
  'SelectField',
  'AttachmentField',
  'ImageField',
  'DataManageViews',
];
const SECOND_BATCH = new Set<NativeComponentName>(['AttachmentField', 'ImageField', 'DataManageViews']);
interface ProbeResult {
  name: NativeComponentName;
  batch: 1 | 2;
  source: string;
  status: ProbeStatus;
  message: string;
}
interface InteractionResult {
  changeEvents: number;
  selected: boolean;
  cleared: boolean;
  controlledRefill: boolean;
  valueShape: { kind: string; count: number; itemKeys: string[] };
  observedChangeShape: { kind: string; count: number; itemKeys: string[] } | null;
  remoteUploadEnabled: boolean;
  remoteUploadAttempted: boolean;
  remoteUploadSucceeded: boolean;
  remoteUploadFailed: boolean;
  uploadErrorFileShape: { kind: string; count: number; itemKeys: string[] } | null;
  uploadErrorValueShape: { kind: string; count: number; itemKeys: string[] } | null;
  componentValueClearedAfterUpload: boolean;
}

const FILE_FORM_THEME_TOKENS = {
  '--color-brand1-2': '#e8efff',
  '--color-brand1-6': '#31599b',
  '--color-brand1-9': '#1e3764',
  '--color-group': '#31599b,#4f7ec8,#39a675,#d79234,#a45ca8',
};

function installYidaGlobalThemeIntoFrame(
  tokens: Record<string, string>,
  iframeElement: HTMLIFrameElement | null,
) {
  try {
    const document = iframeElement?.contentWindow?.document;
    if (!document?.head) return;
    const cssText = `:root, [data-yida-theme-root] {\n${Object.entries(tokens)
      .filter(([key]) => /^--[a-zA-Z0-9-_]+$/.test(key))
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n')}\n}`;
    let style = document.getElementById('yida-global-theme') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'yida-global-theme';
      document.head.insertBefore(style, document.head.firstChild);
    }
    style.innerHTML = cssText;
  } catch {
    // Cross-origin frames retain their own platform theme.
  }
}

class NativeBoundary extends React.Component<
  {
    name: NativeComponentName;
    onFailure: (name: NativeComponentName, error: Error) => void;
    children: React.ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onFailure(this.props.name, error);
  }
  render() {
    return this.state.failed ? (
      <div className="native-fallback">组件挂载失败，已由边界隔离。</div>
    ) : (
      this.props.children
    );
  }
}

function MountSignal({
  name,
  onMount,
}: {
  name: NativeComponentName;
  onMount: (name: NativeComponentName) => void;
}) {
  React.useEffect(() => onMount(name), [name, onMount]);
  return null;
}

function safeValueShape(value: unknown): InteractionResult['valueShape'] {
  const items = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const itemKeys = new Set<string>();
  for (const item of items.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue;
    for (const key of Object.keys(item).filter(
      (candidate) => !/(token|secret|cookie|password)/i.test(candidate),
    )) {
      itemKeys.add(key);
    }
  }
  return {
    kind: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
    count: items.length,
    itemKeys: [...itemKeys].sort(),
  };
}

const EMPTY_INTERACTION: InteractionResult = {
  changeEvents: 0,
  selected: false,
  cleared: false,
  controlledRefill: false,
  valueShape: { kind: 'undefined', count: 0, itemKeys: [] },
  observedChangeShape: null,
  remoteUploadEnabled: false,
  remoteUploadAttempted: false,
  remoteUploadSucceeded: false,
  remoteUploadFailed: false,
  uploadErrorFileShape: null,
  uploadErrorValueShape: null,
  componentValueClearedAfterUpload: false,
};

function YidaComp() {
  const profile = getLabRuntimeProfile();
  const fileSandboxFormUuid = getLabResourceId('platform.fileSandbox');
  const actualAppType =
    (window as unknown as { pageConfig?: { appType?: string } }).pageConfig?.appType || '';
  const expectedAppMatched = Boolean(profile.expectedAppType && actualAppType === profile.expectedAppType);
  const [fileFormOpen, setFileFormOpen] = React.useState(false);
  const fileFormIframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const resolutions = React.useMemo(
    () =>
      NATIVE_COMPONENT_NAMES.map((name) =>
        resolveNativeComponent(window as unknown as Record<string, unknown>, name),
      ),
    [],
  );
  const [results, setResults] = React.useState<ProbeResult[]>(() =>
    resolutions.map(({ name, source, component }) => ({
      name,
      batch: SECOND_BATCH.has(name) ? 2 : 1,
      source,
      status: component ? 'unsupported' : 'unsupported',
      message: component ? '已发现，等待挂载' : '当前运行时未发现',
    })),
  );
  const [values, setValues] = React.useState<Record<NativeComponentName, unknown>>({
    EmployeeField: [],
    DepartmentField: [],
    SelectField: undefined,
    AttachmentField: [],
    ImageField: [],
    DataManageViews: undefined,
  });
  const [interactions, setInteractions] = React.useState<Record<NativeComponentName, InteractionResult>>({
    EmployeeField: { ...EMPTY_INTERACTION },
    DepartmentField: { ...EMPTY_INTERACTION },
    SelectField: { ...EMPTY_INTERACTION },
    AttachmentField: { ...EMPTY_INTERACTION },
    ImageField: { ...EMPTY_INTERACTION },
    DataManageViews: { ...EMPTY_INTERACTION },
  });
  const lastSelectedValues = React.useRef<Partial<Record<NativeComponentName, unknown>>>({});
  const [remoteUploadModes, setRemoteUploadModes] = React.useState({
    AttachmentField: false,
    ImageField: false,
  });
  const openFileForm = React.useCallback(() => {
    if (!expectedAppMatched || !actualAppType || !fileSandboxFormUuid) return;
    const path = `/${actualAppType}/submission/${fileSandboxFormUuid}?isRenderNav=false`;
    if (window.matchMedia?.('(max-width: 767px)').matches) {
      window.location.href = path;
      return;
    }
    setFileFormOpen(true);
  }, [actualAppType, expectedAppMatched, fileSandboxFormUuid]);
  const update = React.useCallback((name: NativeComponentName, patch: Partial<ProbeResult>) => {
    setResults((current) => current.map((item) => (item.name === name ? { ...item, ...patch } : item)));
  }, []);
  const mount = React.useCallback(
    (name: NativeComponentName) => update(name, { status: 'mounted', message: '真实页面挂载成功' }),
    [update],
  );
  const fail = React.useCallback(
    (name: NativeComponentName, error: Error) =>
      update(name, { status: 'failed', message: error.message.slice(0, 160) }),
    [update],
  );
  const setInteraction = React.useCallback(
    (name: NativeComponentName, value: unknown, patch: Partial<InteractionResult>) => {
      setValues((current) => ({ ...current, [name]: value }));
      setInteractions((current) => ({
        ...current,
        [name]: {
          ...current[name],
          ...patch,
          valueShape: safeValueShape(value),
        },
      }));
    },
    [],
  );
  const changed = React.useCallback(
    (name: NativeComponentName, value: unknown) => {
      const nextValue = normalizeNativeControlledValue(name, value);
      if (safeValueShape(nextValue).count > 0) lastSelectedValues.current[name] = nextValue;
      setInteraction(name, nextValue, {
        changeEvents: interactions[name].changeEvents + 1,
        selected: safeValueShape(nextValue).count > 0,
        observedChangeShape: safeValueShape(value),
      });
    },
    [interactions, setInteraction],
  );
  const clearValue = React.useCallback((name: NativeComponentName) => {
    const value = name === 'SelectField' ? undefined : [];
    setValues((current) => ({ ...current, [name]: value }));
    setInteractions((current) => ({
      ...current,
      [name]: {
        ...current[name],
        cleared: true,
        selected: false,
        componentValueClearedAfterUpload:
          current[name].componentValueClearedAfterUpload || current[name].remoteUploadSucceeded,
        valueShape: safeValueShape(value),
      },
    }));
  }, []);
  const enableRemoteUpload = React.useCallback(
    (name: 'AttachmentField' | 'ImageField') => {
      if (!expectedAppMatched) return;
      setRemoteUploadModes((current) => ({ ...current, [name]: true }));
      setInteractions((current) => ({
        ...current,
        [name]: {
          ...current[name],
          remoteUploadEnabled: true,
          remoteUploadAttempted: false,
          remoteUploadSucceeded: false,
          remoteUploadFailed: false,
          uploadErrorFileShape: null,
          uploadErrorValueShape: null,
          componentValueClearedAfterUpload: false,
        },
      }));
    },
    [expectedAppMatched],
  );
  const markUploadAttempt = React.useCallback(
    (name: 'AttachmentField' | 'ImageField') => {
      if (!remoteUploadModes[name]) return;
      setInteractions((current) => ({
        ...current,
        [name]: { ...current[name], remoteUploadAttempted: true },
      }));
    },
    [remoteUploadModes],
  );
  const uploadSucceeded = React.useCallback(
    (name: 'AttachmentField' | 'ImageField', value: unknown) => {
      const nextValue = normalizeNativeControlledValue(name, value);
      if (safeValueShape(nextValue).count > 0) lastSelectedValues.current[name] = nextValue;
      setInteraction(name, nextValue, {
        selected: safeValueShape(nextValue).count > 0,
        remoteUploadAttempted: true,
        remoteUploadSucceeded: true,
        remoteUploadFailed: false,
      });
      setRemoteUploadModes((current) => ({ ...current, [name]: false }));
    },
    [setInteraction],
  );
  const uploadFailed = React.useCallback(
    (name: 'AttachmentField' | 'ImageField', file: unknown, value: unknown) => {
      setInteractions((current) => ({
        ...current,
        [name]: {
          ...current[name],
          remoteUploadAttempted: true,
          remoteUploadSucceeded: false,
          remoteUploadFailed: true,
          uploadErrorFileShape: safeValueShape(file),
          uploadErrorValueShape: safeValueShape(value),
        },
      }));
      setRemoteUploadModes((current) => ({ ...current, [name]: false }));
    },
    [],
  );
  const refillCurrent = React.useCallback(
    (name: NativeComponentName) => {
      const observedValue = lastSelectedValues.current[name];
      if (observedValue !== undefined) {
        setInteraction(name, observedValue, { controlledRefill: true, selected: true });
        return;
      }
      if (name === 'AttachmentField' || name === 'ImageField' || name === 'DataManageViews') return;
      const loginUser = (window as unknown as { loginUser?: Record<string, unknown> }).loginUser || {};
      const value =
        name === 'EmployeeField'
          ? [
              {
                userId: loginUser.userId || '',
                emplId: loginUser.businessWorkNo || loginUser.userId || '',
                workNo: loginUser.businessWorkNo || '',
                name: loginUser.userName || '',
                text: loginUser.userName || '',
              },
            ]
          : [
              {
                deptId: loginUser.deptId || '',
                value: loginUser.deptId || '',
                name: loginUser.deptName || '',
                text: loginUser.deptName || '',
              },
            ];
      setInteraction(name, value, { controlledRefill: true, selected: true });
    },
    [setInteraction],
  );

  const evidence = {
    schemaVersion: 1,
    safety: {
      level: 'L1',
      sensitiveValuesRedacted: true,
      mutations: Object.values(interactions).some((item) => item.remoteUploadSucceeded),
      syntheticFilesOnly: true,
      remoteFileDeletionGuaranteed: false,
    },
    expectedAppMatched,
    components: results,
    interactions,
  };

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#31599b', borderRadius: 12 } }}>
      <main className="native-root" data-yida-theme-root="true" data-platform-runtime-probe="L1">
        <style>{NATIVE_COMPONENTS_CSS}</style>
        <div className="native-shell">
          <header className="native-hero">
            <span>Yida platform runtime lab</span>
            <h1>宜搭原生组件兼容性实验</h1>
            <p>
              逐项挂载当前页面真实注入的组件。每项均由独立错误边界隔离；只记录值的类型与结构，不保存人员或部门值。
            </p>
          </header>
          <Alert
            type={expectedAppMatched ? 'success' : 'error'}
            showIcon
            message={
              expectedAppMatched
                ? '构建目标与当前应用一致；L1 仅允许用户主动组件交互'
                : '应用不匹配，实验结果无效'
            }
          />
          <Alert
            type="warning"
            showIcon
            message="附件和图片默认不上传；只有点击红色一次性开关后，下一次选择才会把伪造测试文件上传到宜搭存储"
          />
          <Card
            title={
              <span>
                <Upload size={16} /> 真实表单上传容器
              </span>
            }
          >
            <p>独立 Canvas 组件不具备内建存储上下文。业务页面应通过原生提交页承载附件和图片上传。</p>
            <Button
              type="primary"
              data-testid="file-sandbox-open"
              onClick={openFileForm}
              disabled={!expectedAppMatched}
            >
              打开原生上传表单
            </Button>
          </Card>
          <section className="native-grid">
            {resolutions.map(({ name, source, component: Component }) => (
              <Card
                key={name}
                title={
                  <span>
                    <Boxes size={16} /> {name}
                  </span>
                }
                extra={<Tag color={Component ? 'gold' : 'default'}>{source}</Tag>}
              >
                {Component ? (
                  <NativeBoundary name={name} onFailure={fail}>
                    <MountSignal name={name} onMount={mount} />
                    {name === 'SelectField' ? (
                      <Component
                        label=""
                        placeholder="请选择实验选项"
                        dataSource={[
                          { text: '选项 A', value: 'a' },
                          { text: '选项 B', value: 'b' },
                        ]}
                        value={values[name]}
                        onChange={(value: unknown) => changed(name, value)}
                      />
                    ) : name === 'AttachmentField' || name === 'ImageField' ? (
                      <Component
                        label=""
                        fieldId={
                          name === 'ImageField'
                            ? 'openyidaSyntheticImageProbe'
                            : 'openyidaSyntheticAttachmentProbe'
                        }
                        autoUpload={remoteUploadModes[name]}
                        method="post"
                        withCredentials={false}
                        multiple={false}
                        limit={1}
                        listType={name === 'ImageField' ? 'image' : 'text'}
                        normalListType={name === 'ImageField' ? 'image' : undefined}
                        accept={name === 'ImageField' ? 'image/png' : '.txt'}
                        buttonText={name === 'ImageField' ? '选择测试图片' : '选择测试附件'}
                        value={values[name]}
                        onChange={(value: unknown) => changed(name, value)}
                        onSelect={() => markUploadAttempt(name)}
                        onSuccess={(_file: unknown, value: unknown) => uploadSucceeded(name, value)}
                        onError={(file: unknown, value: unknown) => uploadFailed(name, file, value)}
                      />
                    ) : name === 'DataManageViews' ? (
                      <Component data={[]} dataSource={[]} readOnly />
                    ) : (
                      <Component
                        label=""
                        placeholder={
                          name === 'EmployeeField'
                            ? '请选择当前组织成员（可不选择）'
                            : '请选择部门（可不选择）'
                        }
                        multiple={false}
                        value={values[name]}
                        onChange={(value: unknown) => changed(name, value)}
                      />
                    )}
                  </NativeBoundary>
                ) : (
                  <div className="native-fallback">当前运行时未发现该组件。</div>
                )}
                <div className="native-result">
                  <Tag
                    color={
                      results.find((item) => item.name === name)?.status === 'mounted'
                        ? 'green'
                        : results.find((item) => item.name === name)?.status === 'failed'
                          ? 'red'
                          : 'default'
                    }
                  >
                    {results.find((item) => item.name === name)?.status}
                  </Tag>
                  <span>{results.find((item) => item.name === name)?.message}</span>
                </div>
                {Component && name !== 'DataManageViews' ? (
                  <Space className="native-controls" wrap>
                    {name === 'AttachmentField' || name === 'ImageField' ? (
                      <Button
                        danger
                        size="small"
                        data-testid={`${name}-enable-upload`}
                        onClick={() => enableRemoteUpload(name)}
                        disabled={!expectedAppMatched || remoteUploadModes[name]}
                      >
                        {remoteUploadModes[name] ? '下一次选择将上传' : '启用一次伪造文件上传'}
                      </Button>
                    ) : null}
                    {name === 'EmployeeField' ||
                    name === 'DepartmentField' ||
                    name === 'AttachmentField' ||
                    name === 'ImageField' ? (
                      <Button size="small" data-testid={`${name}-refill`} onClick={() => refillCurrent(name)}>
                        {name === 'EmployeeField'
                          ? '回填当前登录人'
                          : name === 'DepartmentField'
                            ? '回填当前部门'
                            : '回填最近选择'}
                      </Button>
                    ) : null}
                    <Button size="small" data-testid={`${name}-clear`} onClick={() => clearValue(name)}>
                      清空受控值
                    </Button>
                    <Tag>{interactions[name].valueShape.count ? '已有受控值' : '当前为空'}</Tag>
                  </Space>
                ) : null}
              </Card>
            ))}
          </section>
          <Card
            title={
              <span>
                <ShieldCheck size={16} /> 脱敏挂载证据
              </span>
            }
          >
            <pre className="native-code">{JSON.stringify(evidence, null, 2)}</pre>
          </Card>
        </div>
        <Drawer
          title="宜搭文件存储实验沙箱"
          open={fileFormOpen}
          width="50vw"
          destroyOnClose
          onClose={() => setFileFormOpen(false)}
          bodyStyle={{ padding: 0, overflow: 'hidden' }}
        >
          {fileFormOpen ? (
            <iframe
              ref={fileFormIframeRef}
              title="宜搭文件存储实验沙箱"
              src={`/${actualAppType}/submission/${fileSandboxFormUuid}?isRenderNav=false`}
              onLoad={() =>
                installYidaGlobalThemeIntoFrame(FILE_FORM_THEME_TOKENS, fileFormIframeRef.current)
              }
              style={{
                width: '100%',
                height: '100%',
                minHeight: 'calc(100vh - 56px)',
                border: 0,
                display: 'block',
              }}
            />
          ) : null}
        </Drawer>
      </main>
    </ConfigProvider>
  );
}

export default YidaComp;
