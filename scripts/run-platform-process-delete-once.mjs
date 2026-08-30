import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { completeKnownYidaLogin } from './browser/yida-login.mjs';
import { loadTarget, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

if (process.env.YIDA_LAB_CONFIRM_SELF_ONLY_DELETE !== '1') {
  throw new Error('真实流程删除已阻断：必须显式设置 YIDA_LAB_CONFIRM_SELF_ONLY_DELETE=1');
}

const target = await loadTarget({ requireRemote: true, pageKey: 'platform.processSandbox' });
const localTargets = await readOptionalJson('config/targets.local.json');
const resource = localTargets?.resources?.['platform.processSandbox'];
if (!resource?.formUuid || !resource.processCode) {
  throw new Error('platform.processSandbox 缺少 formUuid 或 processCode');
}
const fields = resource.fields || {};
for (const key of ['experimentTag', 'summary', 'payload', 'experimentTime']) {
  if (!fields[key]) throw new Error(`platform.processSandbox 缺少字段映射：${key}`);
}

const webOrigin = process.env.YIDA_LAB_REMOTE_ORIGIN || target.manifest.application.webOrigin;
if (!webOrigin) throw new Error('缺少宜搭网页域名');
const pageUrl = new URL(`/${target.appType}/workbench/${target.page.formUuid}`, webOrigin).href;
const profilePath = path.join(root, '.local/playwright/flowboard-remote-profile');
const outputDirectory = path.join(root, '.cache/playwright/platform-process');
await fs.mkdir(profilePath, { recursive: true });
await fs.mkdir(outputDirectory, { recursive: true });
await writeJsonAtomic('.cache/openyida/process-delete/schema-map.json', {
  schemaVersion: 1,
  appType: target.appType,
  formUuid: resource.formUuid,
  processCode: resource.processCode,
  fields,
});

let marker = `YIDA_PROCESS_LAB_DELETE_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
const summary = '本人流程实例删除验证';
const payload = JSON.stringify({ schemaVersion: 1, purpose: 'self-only-process-delete' });
const context = await chromium.launchPersistentContext(profilePath, {
  channel: 'chrome',
  headless: process.env.YIDA_LAB_REMOTE_HEADLESS === '1',
  viewport: { width: 1440, height: 1000 },
});

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeScalar(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (!isRecord(value)) return '';
  for (const key of ['userId', 'value', 'result', 'data', 'content']) {
    const normalized = normalizeScalar(value[key]);
    if (normalized) return normalized;
  }
  return '';
}

function unwrapRows(value) {
  const queue = [value];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) return current.filter(isRecord);
    if (isRecord(current)) {
      for (const key of ['data', 'list', 'records', 'result', 'content', 'value']) {
        if (current[key] !== undefined) queue.push(current[key]);
      }
    }
  }
  return [];
}

function unwrapDetail(value) {
  let current = value;
  const seen = new Set();
  for (let depth = 0; depth < 8 && isRecord(current) && !seen.has(current); depth += 1) {
    seen.add(current);
    if (
      current.processInstanceId !== undefined ||
      current.procInstId !== undefined ||
      current.instanceStatus !== undefined
    ) {
      return current;
    }
    const next = ['data', 'result', 'content', 'value']
      .map((key) => current[key])
      .find((candidate) => isRecord(candidate));
    if (!next) break;
    current = next;
  }
  return isRecord(current) ? current : {};
}

function instanceIdOf(value) {
  if (!isRecord(value)) return '';
  for (const key of ['processInstanceId', 'procInstId', 'instanceId']) {
    const id = value[key];
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  for (const key of ['result', 'content', 'data']) {
    const nested = value[key];
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
    const id = instanceIdOf(nested);
    if (id) return id;
  }
  return '';
}

function formDataOf(value) {
  const detail = unwrapDetail(value);
  const raw = detail.formData || detail.data;
  if (isRecord(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return detail;
}

function statusOf(value) {
  const detail = unwrapDetail(value);
  return normalizeScalar(detail.instanceStatus || detail.status).toUpperCase();
}

function assertSuccessfulResponse(value, action) {
  if (isRecord(value) && value.success === false) {
    throw new Error(`${action}失败`);
  }
}

try {
  const page = context.pages()[0] || (await context.newPage());
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const heading = page.getByRole('heading', { name: '宜搭平台流程沙箱' });
  const loginActions = await completeKnownYidaLogin(
    page,
    heading,
    localTargets?.browserAuth?.organization || null,
  );
  await heading.waitFor({ state: 'visible', timeout: 20_000 });

  const invokeBridge = (method, params) =>
    page.evaluate(
      async ({ methodName, methodParams }) => {
        for (const candidate of [window, window.parent, window.top]) {
          try {
            const bridge = candidate.__OPENYIDA_YIDA_API__ || candidate.openyidaYidaApi;
            if (bridge && typeof bridge[methodName] === 'function') {
              return bridge[methodName](methodParams);
            }
          } catch {
            continue;
          }
        }
        throw new Error(`宜搭桥方法不可用：${methodName}`);
      },
      { methodName: method, methodParams: params },
    );
  const environment = await page.evaluate((expectedAppType) => {
    for (const candidate of [window, window.parent, window.top]) {
      try {
        if (candidate.pageConfig?.appType) {
          return { matched: candidate.pageConfig.appType === expectedAppType };
        }
      } catch {
        continue;
      }
    }
    return { matched: false };
  }, target.appType);
  if (!environment.matched) throw new Error('当前页面与构建目标应用不一致');

  const bridgeUserId = normalizeScalar(await invokeBridge('getLoginUserId'));
  if (!bridgeUserId) throw new Error('未识别当前登录用户');
  const listInstances = () =>
    invokeBridge('getProcessInstances', {
      formUuid: resource.formUuid,
      currentPage: 1,
      pageSize: 100,
      searchFieldJson: '',
    });
  const matchingRows = async () =>
    unwrapRows(await listInstances()).filter(
      (row) => normalizeScalar(formDataOf(row)[fields.experimentTag]) === marker,
    );
  const recoverableRows = unwrapRows(await listInstances()).filter((row) => {
    const data = formDataOf(row);
    return (
      normalizeScalar(data[fields.experimentTag]).startsWith('YIDA_PROCESS_LAB_DELETE_') &&
      normalizeScalar(data[fields.summary]) === summary &&
      normalizeScalar(data[fields.payload]) === payload &&
      statusOf(row) === 'RUNNING'
    );
  });
  if (recoverableRows.length > 1) throw new Error('发现多条运行中的删除实验流程，停止操作');
  const recoveredRow = recoverableRows[0] || null;
  if (recoveredRow) marker = normalizeScalar(formDataOf(recoveredRow)[fields.experimentTag]);

  let capturedInstanceId = '';
  let exactInstanceDeleted = false;
  let recoveredPendingInstance = Boolean(recoveredRow);
  try {
    if (recoveredRow) {
      capturedInstanceId = instanceIdOf(recoveredRow);
    } else {
      if ((await matchingRows()).length !== 0) throw new Error('本轮实验标记已存在，停止发起');
      const startResponse = await invokeBridge('startProcessInstance', {
        appType: target.appType,
        formUuid: resource.formUuid,
        processCode: resource.processCode,
        formDataJson: JSON.stringify({
          [fields.experimentTag]: marker,
          [fields.summary]: summary,
          [fields.payload]: payload,
          [fields.experimentTime]: Date.now(),
        }),
      });
      assertSuccessfulResponse(startResponse, '流程发起');
      capturedInstanceId = instanceIdOf(startResponse);
      if (!capturedInstanceId) {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const rows = await matchingRows();
          if (rows.length === 1) {
            capturedInstanceId = instanceIdOf(rows[0]);
            recoveredPendingInstance = true;
            break;
          }
          await page.waitForTimeout(500);
        }
      }
    }
    if (!capturedInstanceId) throw new Error('无法从发起响应或唯一标记列表捕获流程实例 ID');

    const detailBefore = await invokeBridge('getProcessInstanceById', {
      processInstanceId: capturedInstanceId,
    });
    assertSuccessfulResponse(detailBefore, '流程详情读回');
    const detail = unwrapDetail(detailBefore);
    if (instanceIdOf(detail) !== capturedInstanceId) throw new Error('流程详情实例 ID 不匹配');
    if (normalizeScalar(formDataOf(detail)[fields.experimentTag]) !== marker) {
      throw new Error('流程详情实验标记不匹配');
    }
    if (normalizeScalar(detail.formUuid) !== resource.formUuid) throw new Error('流程详情表单 ID 不匹配');
    const originatorId = normalizeScalar(detail.originator || detail.originatorId);
    const actionerIds = Array.isArray(detail.actioners)
      ? detail.actioners.map(normalizeScalar).filter(Boolean)
      : [];
    if (originatorId !== bridgeUserId) throw new Error('流程发起人与当前登录用户不一致');
    if (actionerIds.length < 1 || actionerIds.some((id) => id !== bridgeUserId)) {
      throw new Error('流程处理人并非仅当前登录用户');
    }
    if (statusOf(detail) !== 'RUNNING') throw new Error('删除前流程不处于 RUNNING 状态');
    const exactRowsBeforeDelete = await matchingRows();
    if (exactRowsBeforeDelete.length !== 1 || instanceIdOf(exactRowsBeforeDelete[0]) !== capturedInstanceId) {
      throw new Error('删除前无法唯一定位本轮流程实例');
    }

    const deleteResponse = await invokeBridge('deleteProcessInstance', {
      processInstanceId: capturedInstanceId,
    });
    assertSuccessfulResponse(deleteResponse, '流程删除');

    let remainingCount = 1;
    let detailUnavailable = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      remainingCount = (await matchingRows()).length;
      try {
        const deletedDetail = await invokeBridge('getProcessInstanceById', {
          processInstanceId: capturedInstanceId,
        });
        detailUnavailable =
          (isRecord(deletedDetail) && deletedDetail.success === false) ||
          (!instanceIdOf(unwrapDetail(deletedDetail)) && !statusOf(deletedDetail));
      } catch {
        detailUnavailable = true;
      }
      if (remainingCount === 0 && detailUnavailable) break;
      await page.waitForTimeout(500);
    }
    if (remainingCount !== 0) throw new Error('删除后列表中仍存在本轮实验流程');
    if (!detailUnavailable) throw new Error('删除后流程详情仍然可读取');
    exactInstanceDeleted = true;
    if (pageErrors.length) throw new Error(`页面错误数量：${pageErrors.length}`);

    const evidence = {
      schemaVersion: 1,
      safety: {
        selfOnly: true,
        taggedOnly: true,
        maxCreatedInstances: 1,
        exactDeleteByCapturedInstanceId: true,
        existingInstancesTouched: 0,
        sensitiveValuesRedacted: true,
      },
      loginActions,
      assertions: {
        expectedAppMatched: true,
        recoverableInstanceCount: recoverableRows.length,
        recoveredPendingInstance,
        targetInstanceCount: 1,
        detailReadbackMatched: true,
        originatorMatchedCurrentUser: true,
        actionersCurrentUserOnly: true,
        statusBeforeDelete: 'RUNNING',
        exactInstanceDeleted: true,
        remainingMarkerCount: 0,
        deletedDetailUnavailable: true,
      },
      pageErrors: 0,
    };
    await writeJsonAtomic('.cache/playwright/platform-process/process-delete.evidence.json', evidence);
    console.log(
      JSON.stringify(
        {
          success: true,
          pageKey: target.page.key,
          evidence: '.cache/playwright/platform-process/process-delete.evidence.json',
          assertions: evidence.assertions,
        },
        null,
        2,
      ),
    );
  } finally {
    if (capturedInstanceId && !exactInstanceDeleted) {
      try {
        const detail = await invokeBridge('getProcessInstanceById', {
          processInstanceId: capturedInstanceId,
        });
        const exactMatch =
          instanceIdOf(unwrapDetail(detail)) === capturedInstanceId &&
          normalizeScalar(formDataOf(detail)[fields.experimentTag]) === marker;
        if (exactMatch) {
          await invokeBridge('deleteProcessInstance', { processInstanceId: capturedInstanceId });
        }
      } catch {
        // The instance is already unavailable or cleanup cannot be retried safely.
      }
    }
  }
} finally {
  await context.close();
}
