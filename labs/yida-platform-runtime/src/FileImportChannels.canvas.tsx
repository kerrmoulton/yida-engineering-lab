import React from 'react';
import { Alert, Button, Card, ConfigProvider, Drawer, Radio, Space, Table, Tag } from 'antd';
import { FileJson, FileUp, FlaskConical, Network, ShieldCheck } from 'lucide-react';
import { getLabResourceId, getLabRuntimeProfile } from '@yida-lab/runtime';
import {
  apiUrl,
  createSyntheticWorkbookFile,
  endpointLabel,
  parseWorkbook,
  submitParsedRows,
  uploadMultipart,
  type ImportRow,
  type JsonTransport,
  type UploadEndpoint,
} from './file-import-client.ts';
import {
  createFileImportService,
  FileImportServiceError,
  resolveDefaultFileImportRequest,
  type FileImportRequest,
  type FileImportResult,
} from './file-import-service.ts';
import { FILE_IMPORT_CSS } from './file-import-styles.ts';
import { triggerFilePicker } from './file-picker.ts';
import { resolveNativeComponent } from './native-components.ts';
import { runYidaAttachmentRelay } from './yida-attachment-relay.ts';

type ResultState = { status: 'idle' | 'running' | 'passed' | 'failed'; detail: string };
const INITIAL_RESULT: ResultState = { status: 'idle', detail: '尚未执行' };

function readBrandColor() {
  try {
    return (
      getComputedStyle(document.documentElement).getPropertyValue('--color-brand1-6').trim() || '#536fb3'
    );
  } catch {
    return '#536fb3';
  }
}

function summarize(result: FileImportResult) {
  return JSON.stringify(
    {
      interface: 'importService.importFile',
      channel: result.channel,
      transport: result.transport,
      rowCount: result.rowCount,
      acceptedRows: result.acceptedRows,
      parser: result.diagnostics.parser,
      requestId: result.requestId,
    },
    null,
    2,
  );
}

function errorDetail(error: unknown) {
  if (error instanceof FileImportServiceError) {
    return JSON.stringify(
      { interface: 'importService.importFile', channel: error.channel, phase: error.phase, code: error.code },
      null,
      2,
    );
  }
  return error instanceof Error ? error.message : String(error);
}

function YidaComp() {
  const profile = getLabRuntimeProfile();
  const { defaultTransport, stage } = profile;
  const fileSandboxFormUuid = getLabResourceId('platform.fileSandbox');
  const actualAppType =
    (window as unknown as { pageConfig?: { appType?: string } }).pageConfig?.appType || '';
  const [file, setFile] = React.useState<File | null>(null);
  const [columns, setColumns] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<ImportRow[]>([]);
  const [uploadEndpoint, setUploadEndpoint] = React.useState<UploadEndpoint>('public');
  const [directResult, setDirectResult] = React.useState<ResultState>(INITIAL_RESULT);
  const [nativeResult, setNativeResult] = React.useState<ResultState>(INITIAL_RESULT);
  const [relayResult, setRelayResult] = React.useState<ResultState>(INITIAL_RESULT);
  const [jsonResult, setJsonResult] = React.useState<ResultState>(INITIAL_RESULT);
  const [fileFormOpen, setFileFormOpen] = React.useState(false);
  const browserPickerHostRef = React.useRef<HTMLDivElement | null>(null);
  const nativePickerHostRef = React.useRef<HTMLDivElement | null>(null);
  const attachment = React.useMemo(
    () => resolveNativeComponent(window as unknown as Record<string, unknown>, 'AttachmentField'),
    [],
  );
  const NativeAttachment = attachment.component;
  const importService = React.useMemo(
    () =>
      createFileImportService(
        {
          uploadMultipart,
          parseWorkbook,
          submitParsedRows,
          relayYidaAttachment: runYidaAttachmentRelay,
        },
        { defaultRequest: resolveDefaultFileImportRequest({ defaultTransport, stage }) },
      ),
    [defaultTransport, stage],
  );

  const chooseFile = React.useCallback(async (nextFile: File) => {
    setFile(nextFile);
    const parsed = await parseWorkbook(nextFile);
    setColumns(parsed.columns);
    setRows(parsed.rows);
    setJsonResult({ status: 'idle', detail: `已在浏览器解析 ${parsed.rows.length} 行` });
  }, []);

  const generateFile = React.useCallback(async () => {
    await chooseFile(await createSyntheticWorkbookFile());
  }, [chooseFile]);

  const openBrowserPicker = React.useCallback(() => {
    const result = triggerFilePicker(browserPickerHostRef.current);
    if (!result.opened) {
      setDirectResult({ status: 'failed', detail: result.code });
    }
  }, []);

  const openNativePicker = React.useCallback(() => {
    const result = triggerFilePicker(nativePickerHostRef.current);
    setNativeResult(
      result.opened
        ? {
            status: 'running',
            detail: `自定义按钮已触发隐藏的宜搭上传控件\ntriggerKind: ${result.triggerKind}`,
          }
        : {
            status: 'failed',
            detail: `${result.code}\n当前 AttachmentField 未暴露可触发的文件输入或按钮`,
          },
    );
  }, []);

  const executeImport = React.useCallback(
    async (request: FileImportRequest, setResult: React.Dispatch<React.SetStateAction<ResultState>>) => {
      if (!file) return;
      setResult({ status: 'running', detail: `正在通过统一接口执行 ${request.channel}` });
      try {
        const result = await importService.importFile(file, request);
        setResult({ status: 'passed', detail: summarize(result) });
      } catch (error) {
        setResult({ status: 'failed', detail: errorDetail(error) });
      }
    },
    [file, importService],
  );

  const runDirect = React.useCallback(async () => {
    await executeImport({ channel: 'direct-multipart', endpoint: uploadEndpoint }, setDirectResult);
  }, [executeImport, uploadEndpoint]);

  const runJson = React.useCallback(
    async (transport: JsonTransport) => {
      await executeImport({ channel: 'browser-json', transport }, setJsonResult);
    },
    [executeImport],
  );

  const runRelay = React.useCallback(async () => {
    await executeImport({ channel: 'yida-attachment' }, setRelayResult);
  }, [executeImport]);

  const runDefault = React.useCallback(async () => {
    if (!file) return;
    setJsonResult({ status: 'running', detail: '正在按运行时策略自动选择通道' });
    try {
      const result = await importService.importFile(file);
      setJsonResult({ status: 'passed', detail: summarize(result) });
    } catch (error) {
      setJsonResult({ status: 'failed', detail: errorDetail(error) });
    }
  }, [file, importService]);

  const tableColumns = columns.map((column) => ({ title: column, dataIndex: column, key: column }));
  const nativeProps = {
    value: [],
    url: `${apiUrl(uploadEndpoint)}/import/upload`,
    name: 'file',
    accept: '.xlsx',
    autoUpload: true,
    multiple: false,
    limit: 1,
    maxFileSize: 2,
    data: { source: 'yida-native-attachment' },
    onSuccess: (_selectedFile: unknown, value: unknown) =>
      setNativeResult({
        status: 'passed',
        detail: `原生组件上传成功\n${JSON.stringify(value, null, 2).slice(0, 900)}`,
      }),
    onError: (selectedFile: unknown, value: unknown) =>
      setNativeResult({
        status: 'failed',
        detail: `原生组件上传失败\n${JSON.stringify({ selectedFile, value }, null, 2).slice(0, 900)}`,
      }),
    onProgress: () => setNativeResult({ status: 'running', detail: '原生 AttachmentField 正在上传' }),
  };

  return (
    <ConfigProvider
      theme={{ token: { colorPrimary: readBrandColor(), borderRadius: 12, controlHeight: 38 } }}
    >
      <main className="file-import-root" data-yida-theme-root="true" data-file-import-probe="three-channels">
        <style>{FILE_IMPORT_CSS}</style>
        <div className="file-import-shell">
          <header className="file-import-hero">
            <span className="file-import-eyebrow">Platform engineering experiment</span>
            <h1>宜搭文件导入三通道实验</h1>
            <p>使用同一个程序生成的 Excel，分别验证浏览器直传、宜搭附件中转和浏览器解析后 JSON 提交。</p>
          </header>

          <Alert
            type="info"
            showIcon
            message={`构建环境：${profile.stage}；默认 API 传输：${profile.defaultTransport}`}
            description={`页面统一调用 importService.importFile；当前默认策略为 ${importService.defaultRequest.channel}。所有实验文件均在内存中生成，只包含 SYN 标记的伪造记录。`}
          />

          <Card>
            <Space wrap>
              <Button
                type="primary"
                icon={<FlaskConical size={16} />}
                onClick={generateFile}
                data-testid="generate-synthetic-xlsx"
              >
                生成伪造 Excel
              </Button>
              <Button
                icon={<FileUp size={16} />}
                onClick={openBrowserPicker}
                data-testid="custom-file-picker"
              >
                自定义按钮选择 Excel
              </Button>
              <div ref={browserPickerHostRef} className="file-import-picker-host" aria-hidden="true">
                <input
                  type="file"
                  accept=".xlsx"
                  tabIndex={-1}
                  data-testid="hidden-browser-file-input"
                  onChange={(event) => {
                    const selectedFile = event.currentTarget.files?.[0];
                    if (selectedFile) void chooseFile(selectedFile);
                    event.currentTarget.value = '';
                  }}
                />
              </div>
              <Tag color={file ? 'green' : 'default'}>
                {file ? `${file.name} · ${file.size} bytes` : '尚未选择文件'}
              </Tag>
            </Space>
          </Card>

          <section className="file-import-grid">
            <Card
              className="file-import-card"
              title={
                <h2>
                  <Network size={18} />
                  浏览器直接 multipart
                </h2>
              }
            >
              <div className="file-import-controls">
                <Radio.Group
                  value={uploadEndpoint}
                  onChange={(event) => setUploadEndpoint(event.target.value)}
                >
                  <Radio.Button value="public">公网 API</Radio.Button>
                  <Radio.Button value="local">localhost</Radio.Button>
                </Radio.Group>
                <div className="file-import-file">{endpointLabel(uploadEndpoint)}</div>
                <Button type="primary" disabled={!file} onClick={runDirect} data-testid="direct-upload">
                  使用标准 FormData 上传
                </Button>
                <div className="file-import-native">
                  <span className="file-import-native-label">自定义按钮触发隐藏的宜搭 AttachmentField</span>
                  {NativeAttachment ? (
                    <>
                      <Button onClick={openNativePicker} data-testid="custom-native-file-picker">
                        自定义按钮选择宜搭附件
                      </Button>
                      <div
                        ref={nativePickerHostRef}
                        className="file-import-native-host"
                        aria-hidden="true"
                        data-testid="hidden-native-attachment-host"
                      >
                        <NativeAttachment {...nativeProps} />
                      </div>
                    </>
                  ) : (
                    <Alert type="warning" message="当前运行时没有可渲染的 AttachmentField" />
                  )}
                  <Tag>{attachment.source}</Tag>
                </div>
                <pre className="file-import-status" data-status={directResult.status}>
                  {directResult.detail}
                </pre>
                <pre
                  className="file-import-status"
                  data-testid="native-upload-status"
                  data-status={nativeResult.status}
                >
                  {nativeResult.detail}
                </pre>
              </div>
            </Card>

            <Card
              className="file-import-card"
              title={
                <h2>
                  <ShieldCheck size={18} />
                  宜搭附件中转
                </h2>
              }
            >
              <p>
                先进入专用宜搭表单上传伪造 Excel，再用临时免登 URL
                交给后端下载。自动化脚本会精确清理本轮记录。
              </p>
              <Button
                disabled={!actualAppType || !fileSandboxFormUuid}
                onClick={() => setFileFormOpen(true)}
                data-testid="open-yida-file-sandbox"
              >
                打开宜搭文件沙箱
              </Button>
              <Button type="primary" disabled={!file} onClick={runRelay} data-testid="yida-relay-run">
                运行宜搭附件中转
              </Button>
              <pre
                className="file-import-status"
                data-testid="yida-relay-status"
                data-status={relayResult.status}
              >
                {relayResult.detail}
              </pre>
            </Card>

            <Card
              className="file-import-card"
              title={
                <h2>
                  <FileJson size={18} />
                  浏览器解析后提交 JSON
                </h2>
              }
            >
              <p>文件不上传，浏览器先解析并预览，再把结构化行数据交给普通 JSON API。</p>
              <div className="file-import-actions">
                <Button disabled={!rows.length} onClick={() => runJson('direct')} data-testid="json-direct">
                  localhost JSON
                </Button>
                <Button
                  type="primary"
                  disabled={!rows.length}
                  onClick={() => runJson('connector')}
                  data-testid="json-connector"
                >
                  宜搭连接器 JSON
                </Button>
                <Button disabled={!file} onClick={runDefault} data-testid="import-default">
                  按环境自动选择
                </Button>
              </div>
              <pre className="file-import-status" data-testid="json-status" data-status={jsonResult.status}>
                {jsonResult.detail}
              </pre>
            </Card>
          </section>

          <Card className="file-import-preview" title={`浏览器解析预览 · ${rows.length} 行`}>
            <Table
              rowKey={(_, index) => String(index)}
              size="small"
              pagination={false}
              columns={tableColumns}
              dataSource={rows.slice(0, 10)}
              scroll={{ x: true }}
            />
          </Card>
        </div>

        <Drawer
          title="宜搭文件存储实验沙箱"
          open={fileFormOpen}
          width="50vw"
          destroyOnClose
          onClose={() => setFileFormOpen(false)}
          bodyStyle={{ padding: 0 }}
        >
          {fileFormOpen ? (
            <iframe
              title="宜搭文件存储实验沙箱"
              src={`/${actualAppType}/submission/${fileSandboxFormUuid}?isRenderNav=false`}
              style={{ width: '100%', height: 'calc(100vh - 56px)', border: 0, display: 'block' }}
            />
          ) : null}
        </Drawer>
      </main>
    </ConfigProvider>
  );
}

export default YidaComp;
