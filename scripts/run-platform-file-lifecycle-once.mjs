import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { completeKnownYidaLogin } from './browser/yida-login.mjs';
import { loadTarget, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

if (process.env.YIDA_LAB_CONFIRM_FILE_LIFECYCLE !== '1') {
  throw new Error('需要显式设置 YIDA_LAB_CONFIRM_FILE_LIFECYCLE=1');
}

const target = await loadTarget({ requireRemote: true, pageKey: 'platform.nativeComponents' });
const localTargets = await readOptionalJson('config/targets.local.json');
const fileResource = localTargets?.resources?.['platform.fileSandbox'];
if (!fileResource?.formUuid) throw new Error('platform.fileSandbox 缺少 formUuid');
const fields = fileResource.fields || {};
for (const key of ['experimentTag', 'syntheticAttachment', 'syntheticImage']) {
  if (!fields[key]) throw new Error(`platform.fileSandbox 缺少字段映射：${key}`);
}

const webOrigin = process.env.YIDA_LAB_REMOTE_ORIGIN || target.manifest.application.webOrigin;
if (!webOrigin) throw new Error('缺少宜搭网页域名');
const pageUrl = new URL(`/${target.appType}/workbench/${target.page.formUuid}`, webOrigin).href;
const profilePath = path.join(root, '.local/playwright/flowboard-remote-profile');
const outputDirectory = path.join(root, '.cache/playwright/platform-file-lifecycle');
await fs.mkdir(profilePath, { recursive: true });
await fs.mkdir(outputDirectory, { recursive: true });

const marker = `OYFL_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
const context = await chromium.launchPersistentContext(profilePath, {
  channel: 'chrome',
  headless: process.env.YIDA_LAB_REMOTE_HEADLESS === '1',
  viewport: { width: 1440, height: 1000 },
});

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nestedValues(rootValue, maxDepth = 6) {
  const values = [];
  const queue = [{ value: rootValue, depth: 0 }];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current.value) || current.depth > maxDepth) continue;
    seen.add(current.value);
    values.push(current.value);
    if (Array.isArray(current.value)) {
      for (const value of current.value) queue.push({ value, depth: current.depth + 1 });
    } else if (isRecord(current.value)) {
      for (const value of Object.values(current.value)) {
        queue.push({ value, depth: current.depth + 1 });
      }
    }
  }
  return values;
}

function extractRows(value) {
  let emptyRows = null;
  for (const candidate of nestedValues(value)) {
    if (!Array.isArray(candidate) || !candidate.every(isRecord)) continue;
    if (candidate.length > 0) return candidate;
    emptyRows ||= candidate;
  }
  return emptyRows || [];
}

function extractInstanceId(value) {
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

function formDataOf(value) {
  if (!isRecord(value)) return {};
  const raw = value.formData || value.data;
  if (isRecord(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return value;
}

function normalizeFileItems(value) {
  let current = value;
  if (typeof current === 'string') {
    try {
      current = JSON.parse(current);
    } catch {
      return [];
    }
  }
  if (isRecord(current) && Array.isArray(current.value)) current = current.value;
  return Array.isArray(current) ? current.filter(isRecord) : isRecord(current) ? [current] : [];
}

function safeFileShape(value) {
  const items = normalizeFileItems(value);
  const itemKeys = new Set();
  for (const item of items.slice(0, 3)) {
    for (const key of Object.keys(item)) {
      if (!/(token|secret|cookie|password)/i.test(key)) itemKeys.add(key);
    }
  }
  return {
    kind: Array.isArray(value) ? 'array' : typeof value,
    count: items.length,
    itemKeys: [...itemKeys].sort(),
  };
}

try {
  const page = context.pages()[0] || (await context.newPage());
  const pageErrors = [];
  const writeResponses = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(response.request().method())) return;
    writeResponses.push({ method: response.request().method(), status: response.status() });
  });
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const heading = page.getByRole('heading', { name: '宜搭原生组件兼容性实验' });
  const loginActions = await completeKnownYidaLogin(
    page,
    heading,
    localTargets?.browserAuth?.organization || null,
  );
  await heading.waitFor({ state: 'visible', timeout: 20_000 });

  const invokeBridge = (method, params) =>
    page.evaluate(
      async ({ methodName, methodParams }) => {
        const candidates = [window, window.parent, window.top];
        for (const candidate of candidates) {
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
  const searchSandboxRows = () =>
    invokeBridge('searchFormDatas', {
      formUuid: fileResource.formUuid,
      currentPage: 1,
      pageSize: 100,
    });
  const searchCurrentMarker = async () => {
    const rows = extractRows(await searchSandboxRows());
    return rows.filter((row) => formDataOf(row)[fields.experimentTag] === marker);
  };
  const waitForRows = async (expectedCount, timeout = 30_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const rows = await searchCurrentMarker();
      if (rows.length === expectedCount) return rows;
      await page.waitForTimeout(750);
    }
    throw new Error(`实验标记查询未达到 ${expectedCount} 条`);
  };

  const beforeRows = await searchCurrentMarker();
  if (beforeRows.length !== 0) throw new Error('本轮伪造实验标记已存在，停止提交');

  let capturedInstanceId = null;
  let cleanupCompleted = false;
  try {
    await page.getByTestId('file-sandbox-open').click();
    const formIframe = page.locator('iframe[title="宜搭文件存储实验沙箱"]');
    await formIframe.waitFor({ state: 'visible', timeout: 20_000 });
    const formFrame = await (await formIframe.elementHandle()).contentFrame();
    if (!formFrame) throw new Error('文件沙箱 submission iframe 未建立内容上下文');
    await formFrame.waitForFunction(
      () => document.querySelectorAll('input[type="file"]').length === 2,
      null,
      { timeout: 20_000 },
    );
    const inputs = formFrame.locator('input[type="file"]');
    const fixtures = [
      {
        name: 'openyida-synthetic-lifecycle.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('OpenYida synthetic lifecycle probe\n', 'utf8'),
      },
      {
        name: 'openyida-synthetic-lifecycle.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      },
    ];
    for (const [index, fixture] of fixtures.entries()) {
      const uploadItems = formFrame.locator('.next-upload-list-item');
      const previousItemCount = await uploadItems.count();
      await inputs.nth(index).setInputFiles(fixture);
      await formFrame.waitForFunction(
        (previousCount) => document.querySelectorAll('.next-upload-list-item').length > previousCount,
        previousItemCount,
        { timeout: 30_000 },
      );
      const uploadedItem = uploadItems.last();
      await uploadedItem.waitFor({ state: 'visible', timeout: 10_000 });
      if (fixture.mimeType === 'image/png') {
        await uploadedItem
          .locator('img, [class*="preview"], [class*="thumbnail"]')
          .first()
          .waitFor({ state: 'visible', timeout: 15_000 });
      }
    }
    await formFrame.waitForFunction(
      () =>
        ![...document.querySelectorAll('.next-upload-list-item')].some((item) =>
          /uploading|loading|progress/i.test(item.className),
        ),
      null,
      { timeout: 30_000 },
    );
    const markerInput = formFrame.getByPlaceholder('仅填写伪造实验标记');
    await markerInput.click();
    await markerInput.pressSequentially(marker, { delay: 2 });
    await markerInput.press('Tab');
    const valueAfterBlur = await markerInput.inputValue();
    if (valueAfterBlur !== marker) {
      const inputState = await markerInput.evaluate((element) => ({
        tagName: element.tagName,
        type: element.getAttribute('type'),
        readOnly: element.hasAttribute('readonly'),
        disabled: element.hasAttribute('disabled'),
        maxLength: element.getAttribute('maxlength'),
      }));
      throw new Error(
        `实验标记未进入原生输入框：${JSON.stringify({
          valueLengthAfterBlur: valueAfterBlur.length,
          markerLength: marker.length,
          inputState,
        })}`,
      );
    }
    const writeResponseCountBeforeSubmit = writeResponses.length;
    await formFrame.getByRole('button', { name: '提交', exact: true }).click();
    await page.waitForTimeout(500);
    const submitDialog = formFrame.locator('[role="dialog"]:visible, .next-dialog:visible').last();
    if ((await submitDialog.count()) === 1 && /提交|确认/.test(await submitDialog.innerText())) {
      const confirmButton = submitDialog.getByRole('button', { name: /^(确定|确认提交)$/ }).last();
      if (await confirmButton.isVisible()) await confirmButton.click();
    }
    await page.waitForTimeout(750);
    const submitDiagnostics = await formFrame.evaluate((experimentMarker) => {
      const selectors = [
        '[role="alert"]',
        '.next-message',
        '.next-notification',
        '.next-feedback',
        '.next-dialog',
        '[class*="error"]',
      ];
      const messages = [...document.querySelectorAll(selectors.join(','))]
        .filter((element) => {
          const style = window.getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden';
        })
        .map((element) => (element.textContent || '').trim().replaceAll(experimentMarker, '[MARKER]'))
        .filter(Boolean)
        .slice(0, 12);
      return {
        messages,
        invalidFieldCount: document.querySelectorAll('[aria-invalid="true"]').length,
        markerInputStillPresent: [...document.querySelectorAll('input, textarea')].some(
          (element) => element.value === experimentMarker,
        ),
      };
    }, marker);
    console.log(
      JSON.stringify({
        stage: 'post-submit-diagnostics',
        ...submitDiagnostics,
        submitWriteResponses: writeResponses.slice(writeResponseCountBeforeSubmit),
      }),
    );

    const createdRows = await waitForRows(1, 60_000);
    const createdRow = createdRows[0];
    capturedInstanceId = extractInstanceId(createdRow);
    if (!capturedInstanceId) throw new Error('提交后查询未返回实例 ID');
    const formData = formDataOf(createdRow);
    if (formData[fields.experimentTag] !== marker) throw new Error('读回实验标记不匹配');
    const attachmentShape = safeFileShape(formData[fields.syntheticAttachment]);
    const imageShape = safeFileShape(formData[fields.syntheticImage]);
    if (attachmentShape.count !== 1 || imageShape.count !== 1) {
      throw new Error('读回附件或图片字段数量不正确');
    }

    const eligibleRows = await searchCurrentMarker();
    if (eligibleRows.length !== 1 || extractInstanceId(eligibleRows[0]) !== capturedInstanceId) {
      throw new Error('删除前记录数量或实例 ID 不匹配');
    }
    await invokeBridge('deleteFormData', { formInstId: capturedInstanceId });
    await waitForRows(0);
    cleanupCompleted = true;

    if (pageErrors.length) throw new Error(`页面错误数量：${pageErrors.length}`);
    const evidence = {
      schemaVersion: 1,
      safety: {
        syntheticFilesOnly: true,
        maxCreatedRecords: 1,
        exactDeleteByCapturedInstanceId: true,
        physicalFileDeletionGuaranteed: false,
        sensitiveValuesRedacted: true,
      },
      loginActions,
      steps: {
        preflightMarkerCount: 0,
        formOpenedFromCanvas: true,
        attachmentUploaded: true,
        imageUploaded: true,
        formSubmitted: true,
        exactMarkerReadbackCount: 1,
        attachmentShape,
        imageShape,
        exactRecordDeleted: true,
        remainingMarkerCount: 0,
      },
      pageErrors: 0,
    };
    const evidencePath = path.join(outputDirectory, 'file-lifecycle.evidence.json');
    await writeJsonAtomic(path.relative(root, evidencePath), evidence);
    console.log(
      JSON.stringify(
        {
          success: true,
          pageKey: target.page.key,
          evidence: path.relative(root, evidencePath),
          assertions: evidence.steps,
        },
        null,
        2,
      ),
    );
  } finally {
    if (!cleanupCompleted) {
      const remainingRows = await searchCurrentMarker().catch(() => []);
      if (remainingRows.length === 1) {
        const cleanupId = extractInstanceId(remainingRows[0]);
        if (cleanupId && (!capturedInstanceId || cleanupId === capturedInstanceId)) {
          await invokeBridge('deleteFormData', { formInstId: cleanupId });
          await waitForRows(0);
        }
      }
    }
  }
} finally {
  await context.close();
}
