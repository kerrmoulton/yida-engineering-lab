import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { completeKnownYidaLogin } from './browser/yida-login.mjs';
import { loadTarget, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

const target = await loadTarget({ requireRemote: true, pageKey: 'platform.processSandbox' });
const localTargets = await readOptionalJson('config/targets.local.json');
const webOrigin = process.env.YIDA_LAB_REMOTE_ORIGIN || target.manifest.application.webOrigin;
if (!webOrigin) throw new Error('缺少宜搭网页域名');
const pageUrl = new URL(`/${target.appType}/workbench/${target.page.formUuid}`, webOrigin).href;
const profilePath = path.join(root, '.local/playwright/flowboard-remote-profile');
const outputDirectory = path.join(root, '.cache/playwright/platform-process');
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
  const heading = page.getByRole('heading', { name: '宜搭平台流程沙箱' });
  const loginActions = await completeKnownYidaLogin(
    page,
    heading,
    localTargets?.browserAuth?.organization || null,
  );
  await heading.waitFor({ state: 'visible', timeout: 15_000 });

  const startButton = page.getByTestId('process-start');
  if (!(await startButton.isDisabled())) throw new Error('页面初始状态下发起按钮必须禁用');
  await page.getByTestId('process-preflight').click();
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-testid="process-evidence"]')?.textContent;
    if (!text) return false;
    try {
      return ['ready', 'failed'].includes(JSON.parse(text).phase);
    } catch {
      return false;
    }
  });
  const evidence = JSON.parse(await page.getByTestId('process-evidence').innerText());
  if (evidence.phase !== 'ready') throw new Error(`只读预检未通过：${evidence.error || 'unknown'}`);
  if (!evidence.expectedAppMatched || !evidence.identity?.matched || !evidence.definition?.safe) {
    throw new Error('流程安全门禁证据不完整');
  }
  if (evidence.instance?.created || evidence.instance?.count !== 0) {
    throw new Error('只读冒烟测试意外创建了流程实例');
  }
  if (!(await startButton.isDisabled())) throw new Error('未勾选本人确认时发起按钮必须保持禁用');
  if (pageErrors.length) throw new Error(`页面错误：${pageErrors.join(' | ')}`);

  const serializedEvidence = JSON.stringify(evidence);
  const currentUserId = await page.evaluate(() => window.loginUser?.userId || '');
  if (currentUserId && serializedEvidence.includes(currentUserId)) {
    throw new Error('脱敏证据包含当前用户 ID');
  }
  const screenshotPath = path.join(outputDirectory, 'process-preflight.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const result = {
    success: true,
    pageKey: target.page.key,
    loginActions,
    phase: evidence.phase,
    capabilities: evidence.bridge?.capabilities || [],
    sideEffects: 0,
    startButtonDisabled: true,
    pageErrors: 0,
    screenshot: path.relative(root, screenshotPath),
  };
  await writeJsonAtomic('.cache/playwright/platform-process/result.json', result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
