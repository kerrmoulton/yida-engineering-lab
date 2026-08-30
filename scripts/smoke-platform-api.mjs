import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { completeKnownYidaLogin } from './browser/yida-login.mjs';
import { loadTarget, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

const target = await loadTarget({ requireRemote: true, pageKey: 'platform.apiBridge' });
const localTargets = await readOptionalJson('config/targets.local.json');
const webOrigin = process.env.YIDA_LAB_REMOTE_ORIGIN || target.manifest.application.webOrigin;
if (!webOrigin) throw new Error('缺少宜搭网页域名');

const pageUrl = new URL(`/${target.appType}/workbench/${target.page.formUuid}`, webOrigin).href;
const profilePath = path.join(root, '.local/playwright/flowboard-remote-profile');
const outputDirectory = path.join(root, '.cache/playwright/platform-api');
await fs.mkdir(profilePath, { recursive: true });
await fs.mkdir(outputDirectory, { recursive: true });
const context = await chromium.launchPersistentContext(profilePath, {
  channel: 'chrome',
  headless: process.env.YIDA_LAB_REMOTE_HEADLESS === '1',
  viewport: { width: 1440, height: 1000 },
});

try {
  const page = context.pages()[0] || (await context.newPage());
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const heading = page.getByRole('heading', { name: '宜搭 API 桥只读实验' });
  const loginActions = await completeKnownYidaLogin(
    page,
    heading,
    localTargets?.browserAuth?.organization || null,
  );
  await heading.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const value = document.querySelector('pre.api-code')?.textContent;
      if (!value) return false;
      try {
        const evidence = JSON.parse(value);
        return (
          evidence.checks?.length === 2 && evidence.checks.every((item) => item.status !== 'unsupported')
        );
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 30_000 },
  );

  const evidence = JSON.parse(await page.locator('pre.api-code').innerText());
  if (evidence.schemaVersion !== 1) throw new Error('只读 API 证据 schemaVersion 不正确');
  if (evidence.safety?.level !== 'L2' || evidence.safety?.mutations !== false) {
    throw new Error('L2 安全声明不正确');
  }
  if (evidence.safety?.sensitiveValuesRedacted !== true) throw new Error('只读证据未声明脱敏');
  if (evidence.expectedAppMatched !== true) throw new Error('运行时应用与构建目标不一致');
  if (!evidence.currentUserContext?.available) throw new Error('当前登录人上下文不可用');
  if (!evidence.bridge?.available || !evidence.bridge?.ready) throw new Error('宜搭只读 API 桥不可用');
  const expectedMethods = ['getFormComponentDefinationList', 'searchFormDatas'];
  for (const method of expectedMethods) {
    if (!evidence.bridge.methods.includes(method)) throw new Error(`只读桥缺少方法：${method}`);
  }
  const failed = evidence.checks.filter((item) => item.status !== 'passed');
  if (failed.length) throw new Error(`只读 API 调用失败：${JSON.stringify(failed)}`);
  const searchCheck = evidence.checks.find((item) => item.method === 'searchFormDatas');
  if (searchCheck?.responseShape?.collectionCount !== 0) {
    throw new Error(`专用实验表单应保持零记录，实际识别为 ${searchCheck?.responseShape?.collectionCount}`);
  }
  if (pageErrors.length) throw new Error(`页面错误：${pageErrors.join(' | ')}`);

  const serialized = JSON.stringify(evidence);
  const forbiddenValues = [
    localTargets?.browserAuth?.organization?.corpId,
    localTargets?.browserAuth?.organization?.corpName,
    localTargets?.resources?.['platform.formSandbox']?.formUuid,
  ].filter(Boolean);
  for (const value of forbiddenValues) {
    if (serialized.includes(value)) throw new Error('脱敏证据包含本地组织或资源标识');
  }

  const screenshotPath = path.join(outputDirectory, 'api-bridge.png');
  const evidencePath = path.join(outputDirectory, 'api-bridge.evidence.json');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeJsonAtomic(path.relative(root, evidencePath), evidence);
  const result = {
    success: true,
    pageKey: target.page.key,
    loginActions,
    assertions: {
      expectedAppMatched: true,
      safetyLevel: 'L2',
      mutations: false,
      currentUserContext: true,
      methods: expectedMethods,
      passedChecks: 2,
      recordCount: 0,
      pageErrors: 0,
    },
    screenshot: path.relative(root, screenshotPath),
    evidence: path.relative(root, evidencePath),
  };
  await writeJsonAtomic('.cache/playwright/platform-api/result.json', result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
