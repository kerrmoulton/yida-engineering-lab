import { getLabResourceFieldId, getLabResourceId, getLabServiceUrl } from '@yida-lab/runtime';
import { createControlledCrudPort } from './controlled-crud-bridge.ts';
import { csrfToken } from './file-import-client.ts';

type FileItem = {
  name: string;
  size: number;
  fileUuid: string;
  url: string;
  downloadUrl?: string;
  previewUrl?: string;
};

type RelayEvidence = {
  channel: 'yida-attachment-relay';
  yidaUploadSucceeded: boolean;
  recordCreated: boolean;
  backendDownloadSucceeded: boolean;
  temporaryUrlRequired: boolean;
  cleanupCompleted: boolean;
  remainingMarkerRecords: number;
  rowCount?: number;
  errorCode?: string;
  downloadHost?: string;
};

const APP_TYPE = () => (window as unknown as { pageConfig?: { appType?: string } }).pageConfig?.appType || '';
const FORM_UUID = getLabResourceId('platform.fileSandbox');
const TAG_FIELD = getLabResourceFieldId('platform.fileSandbox', 'experimentTag');
const ATTACHMENT_FIELD = getLabResourceFieldId('platform.fileSandbox', 'syntheticAttachment');
const PUBLIC_API = getLabServiceUrl('fileImportPublicApi');

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nestedValues(root: unknown, maxDepth = 5) {
  const values: unknown[] = [];
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  const seen = new Set<unknown>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current.value) || current.depth > maxDepth) continue;
    seen.add(current.value);
    values.push(current.value);
    if (Array.isArray(current.value)) {
      for (const value of current.value) queue.push({ value, depth: current.depth + 1 });
    } else if (isRecord(current.value)) {
      for (const value of Object.values(current.value)) queue.push({ value, depth: current.depth + 1 });
    }
  }
  return values;
}

function extractRows(value: unknown) {
  for (const candidate of nestedValues(value)) {
    if (Array.isArray(candidate) && candidate.every(isRecord)) return candidate;
  }
  return [];
}

function extractInstanceId(value: unknown) {
  for (const candidate of nestedValues(value)) {
    if (typeof candidate === 'string' && /^FINST[-_]/.test(candidate)) return candidate;
    if (!isRecord(candidate)) continue;
    for (const key of ['formInstId', 'formInstanceId', 'instanceId', 'id', 'result']) {
      const id = candidate[key];
      if (typeof id === 'string' && /^FINST[-_]/.test(id)) return id;
    }
  }
  return null;
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value || '');
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function signedContentDisposition(signInfo: Record<string, unknown>, file: File) {
  try {
    const text = decodeBase64Utf8(String(signInfo.policy || ''));
    const match = text.match(/"Content-Disposition":"([^"]+)"/);
    if (match?.[1]) return match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const policy = JSON.parse(text.replace(/\\\$/g, '$')) as { conditions?: unknown[] };
    for (const condition of policy.conditions || []) {
      if (isRecord(condition) && condition['Content-Disposition']) {
        return String(condition['Content-Disposition']);
      }
    }
  } catch {}
  return `attachment; filename=${encodeURIComponent(file.name)}`;
}

async function uploadToYida(file: File, appType: string): Promise<FileItem> {
  const stamp = Date.now();
  const objectName = `${appType}/${new Date().getFullYear()}/${stamp}-${file.name}`;
  const query = new URLSearchParams({
    scene: 'AttachmentField',
    _api: 'nattyFetch',
    _mock: 'false',
    _csrf_token: csrfToken(),
    appType,
    fileName: file.name,
    fileSize: String(file.size),
    contentType: file.type || 'application/octet-stream',
    isOpen: 'n',
    newContext: 'y',
    objectName,
    procInstId: '',
    businessType: '',
    accelerate: 'y',
    _stamp: String(stamp),
  });
  const signResponse = await fetch(`/ossSign?${query}`, {
    credentials: 'include',
    headers: { accept: 'application/json, text/json', 'x-requested-with': 'XMLHttpRequest' },
  });
  const signPayload = (await signResponse.json()) as Record<string, unknown>;
  if (!signResponse.ok || signPayload.success === false || !isRecord(signPayload.content)) {
    throw new Error(String(signPayload.errorMsg || 'YIDA_OSS_SIGN_FAILED'));
  }
  const signInfo = signPayload.content;
  const form = new FormData();
  form.append('key', String(signInfo.objectName));
  form.append('policy', String(signInfo.policy));
  form.append('OSSAccessKeyId', String(signInfo.accessid));
  form.append('signature', String(signInfo.signature));
  form.append('success_action_status', '200');
  form.append('Content-Disposition', signedContentDisposition(signInfo, file));
  form.append('file', file, file.name);
  const uploadResponse = await fetch(String(signInfo.host), { method: 'POST', body: form });
  if (!uploadResponse.ok) throw new Error(`YIDA_OSS_UPLOAD_${uploadResponse.status}`);
  return {
    name: file.name,
    size: file.size,
    fileUuid: String(signInfo.objectName),
    url: String(signInfo.url || signInfo.downloadUrl),
    downloadUrl: String(signInfo.downloadUrl || signInfo.url),
    previewUrl: String(signInfo.previewUrl || ''),
  };
}

async function backendFetch(fileUrl: string) {
  const absoluteUrl = new URL(fileUrl, window.location.origin).href;
  const response = await fetch(`${PUBLIC_API}/import/fetch-yida`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Import-Source': 'yida-attachment-relay' },
    body: JSON.stringify({ downloadUrl: absoluteUrl }),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return {
    ok: response.ok && payload?.success === true,
    payload,
    downloadHost: new URL(absoluteUrl).hostname,
  };
}

export async function runYidaAttachmentRelay(file: File): Promise<RelayEvidence> {
  const appType = APP_TYPE();
  const port = createControlledCrudPort(window);
  if (!appType || !port?.ready) throw new Error('宜搭附件实验上下文不可用');
  const marker = `OYFI_${Date.now().toString(36)}_${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const evidence: RelayEvidence = {
    channel: 'yida-attachment-relay',
    yidaUploadSucceeded: false,
    recordCreated: false,
    backendDownloadSucceeded: false,
    temporaryUrlRequired: false,
    cleanupCompleted: false,
    remainingMarkerRecords: -1,
  };
  let instanceId: string | null = null;
  try {
    const before = extractRows(await port.search(FORM_UUID, TAG_FIELD, marker));
    if (before.length) throw new Error('本轮附件标记已存在');
    const item = await uploadToYida(file, appType);
    evidence.yidaUploadSucceeded = true;
    const created = await port.create(appType, FORM_UUID, {
      [TAG_FIELD]: marker,
      [ATTACHMENT_FIELD]: [item],
    });
    instanceId = extractInstanceId(created);
    if (!instanceId) throw new Error('宜搭附件记录未返回实例 ID');
    evidence.recordCreated = true;
    const fetched = await backendFetch(item.downloadUrl || item.url);
    evidence.downloadHost = fetched.downloadHost;
    evidence.backendDownloadSucceeded = fetched.ok;
    if (fetched.ok) {
      const data = isRecord(fetched.payload?.data) ? fetched.payload.data : {};
      evidence.rowCount = Number(data.rowCount || 0);
    } else {
      evidence.temporaryUrlRequired = true;
      const error = isRecord(fetched.payload?.error) ? fetched.payload.error : {};
      evidence.errorCode = String(error.code || 'YIDA_PROTECTED_URL');
    }
  } finally {
    if (instanceId) await port.delete(instanceId);
    const remaining = extractRows(await port.search(FORM_UUID, TAG_FIELD, marker));
    evidence.remainingMarkerRecords = remaining.length;
    evidence.cleanupCompleted = remaining.length === 0;
  }
  return evidence;
}
