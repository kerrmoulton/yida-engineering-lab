import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const root = path.resolve(import.meta.dirname, '..');

export async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));
}

export async function readOptionalJson(relativePath) {
  try {
    return await readJson(relativePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

export function readArg(name, args = process.argv.slice(2)) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || null : null;
}

export async function loadManifest() {
  const manifest = await readJson('manifest.json');
  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
    throw new Error('manifest.json 至少需要声明一个页面');
  }
  const pageKeys = manifest.pages.map((page) => page.key);
  if (pageKeys.some((key) => !key) || new Set(pageKeys).size !== pageKeys.length) {
    throw new Error('manifest.json 中每个页面必须有唯一 key');
  }

  const localTargets =
    process.env.YIDA_LAB_IGNORE_LOCAL_TARGET === '1'
      ? null
      : await readOptionalJson('config/targets.local.json');
  if (localTargets) {
    manifest.application.appType = localTargets.appType || manifest.application.appType;
    manifest.application.name = localTargets.applicationName || manifest.application.name;
    manifest.application.webOrigin = localTargets.webOrigin || manifest.application.webOrigin;
    manifest.pages = manifest.pages.map((page) => ({
      ...page,
      formUuid: localTargets.pages?.[page.key]?.formUuid || page.formUuid,
    }));
    manifest.services = (manifest.services || []).map((service) => ({
      ...service,
      baseUrl: localTargets.services?.[service.key]?.baseUrl || service.baseUrl,
    }));
  }

  for (const page of manifest.pages) {
    if (page.formType !== 'display') throw new Error(`${page.key} 必须是 display 自定义页面`);
    if (!page.authorSource || !page.source || !page.baseline || !page.contract) {
      throw new Error(`${page.key} 缺少 authorSource/source/baseline/contract`);
    }
  }
  return manifest;
}

export function createServiceUrlMap(manifest, { requireConfigured = false } = {}) {
  const services = manifest.services || [];
  const keys = services.map((service) => service.key);
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length) {
    throw new Error('manifest.json 中每个服务必须有唯一 key');
  }
  return Object.fromEntries(
    services.map((service) => {
      if (requireConfigured && !service.baseUrl) {
        throw new Error(`服务 ${service.key} 缺少 baseUrl 映射`);
      }
      return [service.key, service.baseUrl || `#unconfigured-service=${encodeURIComponent(service.key)}`];
    }),
  );
}

export function createPageRouteMap(manifest, { requireRemote = false } = {}) {
  const appType = manifest.application?.appType;
  return Object.fromEntries(
    manifest.pages.map((page) => {
      if (requireRemote && (!appType || !page.formUuid)) {
        throw new Error(`页面 ${page.key} 缺少 appType/formUuid 映射`);
      }
      const url =
        appType && page.formUuid
          ? `/${appType}/workbench/${page.formUuid}`
          : `#unconfigured-page=${encodeURIComponent(page.key)}`;
      return [page.key, url];
    }),
  );
}

export function createLabRuntimeModule({ routes, services }) {
  return `
const PAGE_ROUTES = ${JSON.stringify(routes)};
const SERVICE_URLS = ${JSON.stringify(services)};
export function getLabPageUrl(key) {
  const value = PAGE_ROUTES[key];
  if (!value) throw new Error('Unknown Yida Lab page key: ' + key);
  return value;
}
export function getLabServiceUrl(key) {
  const value = SERVICE_URLS[key];
  if (!value) throw new Error('Unknown Yida Lab service key: ' + key);
  return value;
}
`;
}

export async function loadTarget({ requireRemote = false, pageKey } = {}) {
  const manifest = await loadManifest();
  const selectedKey = pageKey || readArg('--page') || process.env.YIDA_LAB_PAGE || null;
  if (!selectedKey && manifest.pages.length > 1) {
    throw new Error(
      `当前 manifest 包含多个页面，请使用 --page <key> 指定目标；可选值：${manifest.pages
        .map((page) => page.key)
        .join(', ')}`,
    );
  }
  const page = selectedKey
    ? manifest.pages.find((candidate) => candidate.key === selectedKey)
    : manifest.pages[0];
  if (!page) throw new Error(`manifest.json 未声明页面：${selectedKey}`);
  if (requireRemote && (!manifest.application?.appType || !page.formUuid)) {
    throw new Error(
      `页面 ${page.key} 缺少本地发布目标；请在 config/targets.local.json 配置 appType 和 formUuid`,
    );
  }
  return { manifest, page, appType: manifest.application.appType };
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  if (options.echo) {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 执行失败（exit ${result.status}）\n${stdout}\n${stderr}`);
  }
  return { stdout, stderr, combined: `${stdout}\n${stderr}` };
}

export function extractJsonDocuments(text) {
  const documents = [];
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf('{', index);
    if (start < 0) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let cursor = start; cursor < text.length; cursor += 1) {
      const char = text[cursor];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          end = cursor + 1;
          break;
        }
      }
    }
    if (end < 0) break;
    try {
      documents.push(JSON.parse(text.slice(start, end)));
      index = end;
    } catch (_) {
      index = start + 1;
    }
  }
  return documents;
}

export function commandJson(result, predicate) {
  const matches = extractJsonDocuments(result.combined).filter(predicate);
  if (!matches.length) throw new Error('命令输出中未找到符合契约的 JSON 结果');
  return matches[matches.length - 1];
}

export function stableValue(value, depth = 0) {
  if (Array.isArray(value)) return value.map((item) => stableValue(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const volatileKeys = depth === 0 ? new Set(['gmtModified', 'gmtCreate']) : new Set();
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !volatileKeys.has(key))
      .sort()
      .map((key) => [key, stableValue(value[key], depth + 1)]),
  );
}

export function digest(value) {
  const input = typeof value === 'string' ? value : JSON.stringify(stableValue(value));
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function findCanvasComponent(value) {
  if (!value || typeof value !== 'object') return null;
  if (
    value.componentName === 'YidaCodeCanvas' &&
    (typeof value.props?.runtimeCode === 'string' || typeof value.props?.code === 'string')
  ) {
    return value;
  }
  if (typeof value.props?.runtimeCode === 'string' && value.props?.importedModules) return value;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findCanvasComponent(child);
    if (found) return found;
  }
  return null;
}

export async function fetchLiveSchema(appType, formUuid) {
  const result = run('openyida', ['get-schema', appType, formUuid, '--json']);
  return commandJson(result, (value) => value?.success === true && value?.content?.pages);
}

export async function writeJsonAtomic(relativePath, value) {
  const destination = path.join(root, relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, destination);
}
