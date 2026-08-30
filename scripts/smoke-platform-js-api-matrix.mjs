import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { completeKnownYidaLogin } from './browser/yida-login.mjs';
import { loadTarget, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

const target = await loadTarget({ requireRemote: true, pageKey: 'platform.jsApiMatrix' });
const localTargets = await readOptionalJson('config/targets.local.json');
const webOrigin = process.env.YIDA_LAB_REMOTE_ORIGIN || target.manifest.application.webOrigin;
if (!webOrigin) throw new Error('缺少宜搭网页域名');
const pageUrl = new URL(`/${target.appType}/workbench/${target.page.formUuid}`, webOrigin).href;
const profilePath = path.join(root, '.local/playwright/flowboard-remote-profile');
const outputDirectory = path.join(root, '.cache/playwright/platform-js-api-matrix');
await fs.mkdir(profilePath, { recursive: true });
await fs.mkdir(outputDirectory, { recursive: true });
const context = await chromium.launchPersistentContext(profilePath, {
  channel: 'chrome',
  headless: process.env.YIDA_LAB_REMOTE_HEADLESS === '1',
  viewport: { width: 1440, height: 1050 },
});

async function readEvidence(page) {
  return JSON.parse(await page.getByTestId('matrix-evidence').innerText());
}

async function waitForCheckStatus(page, collection, method, status = 'verified') {
  await page.waitForFunction(
    ({ collectionName, methodName, expectedStatus }) => {
      const text = document.querySelector('[data-testid="matrix-evidence"]')?.textContent;
      if (!text) return false;
      try {
        return (
          JSON.parse(text)[collectionName]?.find((check) => check.method === methodName)?.status ===
          expectedStatus
        );
      } catch {
        return false;
      }
    },
    { collectionName: collection, methodName: method, expectedStatus: status },
    { timeout: 15_000 },
  );
}

async function verifyNavigationPopup(page, testId, method, expectedFormUuid) {
  const popupPromise = context.waitForEvent('page', { timeout: 15_000 });
  await page.getByTestId(testId).click();
  const popup = await popupPromise;
  try {
    await popup.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    if (!popup.url().includes(expectedFormUuid)) {
      throw new Error(`${method} 打开的页面不是配置中的运行时盘点页：${popup.url()}`);
    }
  } finally {
    await popup.close();
  }
  await waitForCheckStatus(page, 'uiChecks', method);
}

try {
  const page = context.pages()[0] || (await context.newPage());
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const heading = page.getByRole('heading', { name: '宜搭 JS API 能力矩阵' });
  const loginActions = await completeKnownYidaLogin(
    page,
    heading,
    localTargets?.browserAuth?.organization || null,
  );
  await heading.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const text = document.querySelector('[data-testid="matrix-evidence"]')?.textContent;
      if (!text || text === 'null') return false;
      try {
        return JSON.parse(text).checks?.length === 10;
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 30_000 },
  );
  let evidence = await readEvidence(page);
  if (evidence.schemaVersion !== 1) throw new Error('能力矩阵 schemaVersion 不正确');
  if (evidence.safety?.level !== 'L4-readonly' || evidence.safety?.mutations !== false) {
    throw new Error('能力矩阵安全声明不正确');
  }
  if (!evidence.expectedAppMatched || !evidence.bridge?.available || !evidence.bridge?.ready) {
    throw new Error('应用匹配或桥状态不满足验收条件');
  }
  if (
    evidence.summary?.total !== 10 ||
    evidence.summary?.verified !== 10 ||
    evidence.summary?.failed !== 0 ||
    evidence.summary?.unsupported !== 0
  ) {
    throw new Error(
      `能力矩阵未全部通过：${JSON.stringify({ summary: evidence.summary, bridge: evidence.bridge, checks: evidence.checks })}`,
    );
  }
  if (
    evidence.uiSummary?.total !== 5 ||
    evidence.uiSummary?.ready !== 5 ||
    evidence.uiSummary?.verified !== 0
  ) {
    throw new Error(`受控 UI API 初始状态不正确：${JSON.stringify(evidence.uiSummary)}`);
  }
  if (
    evidence.assetSummary?.total !== 2 ||
    evidence.assetSummary?.ready !== 2 ||
    evidence.assetSummary?.verified !== 0
  ) {
    throw new Error(`外部资源 API 初始状态不正确：${JSON.stringify(evidence.assetSummary)}`);
  }

  await page.getByTestId('matrix-ui-toast').click();
  await page.getByText('JS API 能力矩阵验证', { exact: true }).waitFor({ timeout: 5_000 });
  await waitForCheckStatus(page, 'uiChecks', 'toast');

  await page.getByTestId('matrix-ui-dialog').click();
  await page.getByText('dialog API 验证', { exact: true }).waitFor({ timeout: 5_000 });
  await page.keyboard.press('Escape');
  await waitForCheckStatus(page, 'uiChecks', 'dialog');

  await page.getByTestId('matrix-ui-preview').click();
  await waitForCheckStatus(page, 'uiChecks', 'previewImage');
  await page.keyboard.press('Escape');

  const runtimeInventoryFormUuid = localTargets?.pages?.['platform.runtimeInventory']?.formUuid;
  if (!runtimeInventoryFormUuid) throw new Error('缺少 platform.runtimeInventory 本地页面配置');
  await verifyNavigationPopup(page, 'matrix-ui-open-page', 'openPage', runtimeInventoryFormUuid);
  await verifyNavigationPopup(page, 'matrix-ui-router-push', 'routerPush', runtimeInventoryFormUuid);

  await page.getByTestId('matrix-asset-script').click();
  await waitForCheckStatus(page, 'assetChecks', 'loadScript');
  if ((await page.evaluate(() => typeof window.QRCode)) !== 'function') {
    throw new Error('loadScript 返回成功，但页面未发现 QRCode 全局');
  }

  await page.getByTestId('matrix-asset-style').click();
  await waitForCheckStatus(page, 'assetChecks', 'loadStyleSheet');
  const styleLoaded = await page.evaluate(() =>
    Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(
      (node) => node.href === 'https://g.alicdn.com/code/lib/normalize/8.0.1/normalize.min.css',
    ),
  );
  if (!styleLoaded) throw new Error('loadStyleSheet 返回成功，但页面未发现测试样式链接');

  evidence = await readEvidence(page);
  if (
    evidence.uiSummary?.verified !== 5 ||
    evidence.uiSummary?.ready !== 0 ||
    evidence.uiSummary?.failed !== 0 ||
    evidence.uiSummary?.unsupported !== 0
  ) {
    throw new Error(`受控 UI API 未全部通过：${JSON.stringify(evidence.uiSummary)}`);
  }
  if (
    evidence.assetSummary?.verified !== 2 ||
    evidence.assetSummary?.ready !== 0 ||
    evidence.assetSummary?.failed !== 0 ||
    evidence.assetSummary?.unsupported !== 0
  ) {
    throw new Error(`外部资源 API 未全部通过：${JSON.stringify(evidence.assetSummary)}`);
  }
  if (pageErrors.length) throw new Error(`页面错误：${pageErrors.join(' | ')}`);
  const serialized = JSON.stringify(evidence);
  const forbiddenValues = [
    localTargets?.browserAuth?.organization?.corpId,
    localTargets?.browserAuth?.organization?.corpName,
    localTargets?.resources?.['platform.formSandbox']?.formUuid,
    localTargets?.resources?.['platform.processSandbox']?.formUuid,
  ].filter(Boolean);
  for (const value of forbiddenValues) {
    if (serialized.includes(value)) throw new Error('脱敏证据包含本地组织或资源标识');
  }
  const screenshotPath = path.join(outputDirectory, 'js-api-matrix.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const result = {
    success: true,
    pageKey: target.page.key,
    loginActions,
    verified: evidence.summary.verified,
    failed: evidence.summary.failed,
    unsupported: evidence.summary.unsupported,
    controlledUiVerified: evidence.uiSummary.verified,
    externalAssetVerified: evidence.assetSummary.verified,
    mutations: false,
    pageErrors: 0,
    screenshot: path.relative(root, screenshotPath),
  };
  await writeJsonAtomic('.cache/playwright/platform-js-api-matrix/result.json', result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
