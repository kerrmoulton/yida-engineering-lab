export type CapabilityKind = 'context' | 'api' | 'component';
export type CapabilityStatus = 'official' | 'observed' | 'verified' | 'unstable' | 'unsupported';
export type CapabilitySource = 'current' | 'parent' | 'top' | 'bridge' | 'local' | 'none';

export interface RuntimeCapability {
  name: string;
  kind: CapabilityKind;
  status: CapabilityStatus;
  source: CapabilitySource;
  shape?: string[];
  message?: string;
}

export interface RuntimeInventory {
  schemaVersion: 1;
  scannedAt: string;
  expectedAppMatched: boolean;
  expectedAppConfigured: boolean;
  actualAppTypeMasked: string;
  client: 'pc' | 'mobile' | 'dingtalk' | 'unknown';
  capabilities: RuntimeCapability[];
  nativeComponentNames: string[];
  safety: {
    level: 'L0';
    sensitiveValuesRedacted: true;
    unknownFunctionsCalled: false;
  };
}

interface WindowCandidate {
  label: CapabilitySource;
  value: Record<string, unknown>;
}

const ROOTS: Array<{ name: string; kind: CapabilityKind; status: CapabilityStatus }> = [
  { name: 'pageConfig', kind: 'context', status: 'official' },
  { name: 'loginUser', kind: 'context', status: 'official' },
  { name: 'Deep', kind: 'component', status: 'observed' },
  { name: 'DeepYida', kind: 'component', status: 'observed' },
  { name: 'YidaNativeComponents', kind: 'component', status: 'observed' },
  { name: '__YIDA__', kind: 'context', status: 'observed' },
  { name: 'YIDA_CONFIG', kind: 'context', status: 'observed' },
  { name: 'g_config', kind: 'context', status: 'observed' },
  { name: 'dd', kind: 'api', status: 'official' },
  { name: '__OPENYIDA_YIDA_API__', kind: 'api', status: 'observed' },
  { name: 'openyidaYidaApi', kind: 'api', status: 'observed' },
];

const BRIDGE_METHODS = [
  'getLoginUserId',
  'getLoginUserName',
  'getLocale',
  'isMobile',
  'isSubmissionPage',
  'isViewPage',
  'getDateTimeRange',
  'formatter',
  'dialog',
  'toast',
  'openPage',
  'previewImage',
  'loadScript',
  'loadStyleSheet',
  'routerPush',
  'searchFormDatas',
  'searchFormDataIds',
  'getFormDataById',
  'getFormComponentDefinationList',
  'saveFormData',
  'updateFormData',
  'deleteFormData',
  'startProcessInstance',
  'updateProcessInstance',
  'deleteProcessInstance',
  'getProcessInstances',
  'getProcessInstanceIds',
  'getProcessInstanceById',
  'terminateProcessInstance',
  'getOperationRecords',
  'executeTask',
];

const SENSITIVE_KEY = /(token|secret|cookie|csrf|authorization|password|credential|session)/i;
const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*(?:Field|Card|Container|Views|Banner|Entry|Table|Portal)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && (typeof value === 'object' || typeof value === 'function');
}

function descriptorValue(target: Record<string, unknown>, key: string): unknown {
  let current: object | null = target;
  for (let depth = 0; current && depth < 4; depth += 1) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(current, key);
    } catch (_error) {
      return undefined;
    }
    if (descriptor) return 'value' in descriptor ? descriptor.value : undefined;
    try {
      current = Object.getPrototypeOf(current);
    } catch (_error) {
      return undefined;
    }
  }
  return undefined;
}

function safePropertyNames(value: unknown): string[] {
  if (!isRecord(value)) return [];
  try {
    return Object.getOwnPropertyNames(value)
      .filter((key) => !SENSITIVE_KEY.test(key))
      .sort()
      .slice(0, 240);
  } catch (_error) {
    return [];
  }
}

function safeWindowReference(
  target: Record<string, unknown>,
  key: 'parent' | 'top',
): Record<string, unknown> | null {
  try {
    const value = target[key];
    return isRecord(value) ? value : null;
  } catch (_error) {
    return null;
  }
}

function collectWindows(root: Record<string, unknown>): WindowCandidate[] {
  const candidates: WindowCandidate[] = [{ label: 'current', value: root }];
  const parent = safeWindowReference(root, 'parent');
  if (parent && parent !== root) candidates.push({ label: 'parent', value: parent });
  const top = safeWindowReference(root, 'top');
  if (top && top !== root && top !== parent) candidates.push({ label: 'top', value: top });
  return candidates;
}

function renderableName(value: unknown, fallback: string): string | null {
  if (typeof value === 'function') {
    const named = descriptorValue(value as unknown as Record<string, unknown>, 'displayName');
    return typeof named === 'string' && named ? named : value.name || fallback;
  }
  if (!isRecord(value)) return null;
  const render = descriptorValue(value, 'render');
  if (typeof render === 'function') return fallback;
  for (const key of ['component', 'Component', 'default']) {
    if (typeof descriptorValue(value, key) === 'function') return fallback;
  }
  return null;
}

function collectComponentNames(value: unknown): string[] {
  const names = new Set<string>();
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 500)) {
      if (!isRecord(item)) continue;
      const displayName = descriptorValue(item, 'displayName');
      const name = descriptorValue(item, 'name');
      const candidate = typeof displayName === 'string' ? displayName : typeof name === 'string' ? name : '';
      if (candidate && renderableName(item, candidate)) names.add(candidate);
    }
  }
  if (isRecord(value)) {
    for (const key of safePropertyNames(value)) {
      if (!COMPONENT_NAME.test(key)) continue;
      const candidate = descriptorValue(value, key);
      if (renderableName(candidate, key)) names.add(key);
    }
  }
  return [...names].sort();
}

function maskIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  if (value.length <= 8) return `${value.slice(0, 2)}••`;
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function detectClient(root: Record<string, unknown>): RuntimeInventory['client'] {
  const navigatorValue = descriptorValue(root, 'navigator');
  const userAgent = isRecord(navigatorValue) ? descriptorValue(navigatorValue, 'userAgent') : '';
  const text = typeof userAgent === 'string' ? userAgent : '';
  if (/dingtalk/i.test(text)) return 'dingtalk';
  if (/android|iphone|ipad|mobile/i.test(text)) return 'mobile';
  return text ? 'pc' : 'unknown';
}

function firstRootValue(windows: WindowCandidate[], name: string) {
  for (const candidate of windows) {
    const value = descriptorValue(candidate.value, name);
    if (value !== undefined && value !== null) return { ...candidate, rootValue: value };
  }
  return null;
}

export function scanYidaRuntime(rootValue: unknown, expectedAppType = ''): RuntimeInventory {
  const root = isRecord(rootValue) ? rootValue : {};
  const windows = collectWindows(root);
  const capabilities: RuntimeCapability[] = [];
  const nativeNames = new Set<string>();

  for (const definition of ROOTS) {
    const found = firstRootValue(windows, definition.name);
    if (!found) {
      capabilities.push({
        name: `window.${definition.name}`,
        kind: definition.kind,
        status: 'unsupported',
        source: 'none',
        message: '当前可访问窗口中未发现',
      });
      continue;
    }
    const shape = safePropertyNames(found.rootValue);
    capabilities.push({
      name: `window.${definition.name}`,
      kind: definition.kind,
      status: definition.status,
      source: found.label,
      shape,
    });
    if (definition.kind === 'component') {
      for (const name of collectComponentNames(found.rootValue)) nativeNames.add(name);
    }
    if (definition.name === '__OPENYIDA_YIDA_API__' || definition.name === 'openyidaYidaApi') {
      for (const method of BRIDGE_METHODS) {
        if (isRecord(found.rootValue) && typeof descriptorValue(found.rootValue, method) === 'function') {
          capabilities.push({
            name: method,
            kind: 'api',
            status: 'observed',
            source: 'bridge',
            message: '仅确认方法存在，L0 未调用',
          });
        }
      }
    }
  }

  const pageConfig = firstRootValue(windows, 'pageConfig');
  const actualAppType =
    pageConfig && isRecord(pageConfig.rootValue) ? descriptorValue(pageConfig.rootValue, 'appType') : '';
  const actualAppTypeText = typeof actualAppType === 'string' ? actualAppType : '';

  return {
    schemaVersion: 1,
    scannedAt: new Date().toISOString(),
    expectedAppMatched: Boolean(expectedAppType && actualAppTypeText === expectedAppType),
    expectedAppConfigured: Boolean(expectedAppType),
    actualAppTypeMasked: maskIdentifier(actualAppTypeText),
    client: detectClient(root),
    capabilities,
    nativeComponentNames: [...nativeNames].sort(),
    safety: {
      level: 'L0',
      sensitiveValuesRedacted: true,
      unknownFunctionsCalled: false,
    },
  };
}
