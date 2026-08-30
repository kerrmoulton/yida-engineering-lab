import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { completeKnownYidaLogin } from './browser/yida-login.mjs';
import { loadTarget, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

if (process.env.YIDA_LAB_CONFIRM_SELF_ONLY_PROCESS !== '1') {
  throw new Error('真实流程发起已阻断：必须显式设置 YIDA_LAB_CONFIRM_SELF_ONLY_PROCESS=1');
}

const target = await loadTarget({ requireRemote: true, pageKey: 'platform.processSandbox' });
const localTargets = await readOptionalJson('config/targets.local.json');
const webOrigin = process.env.YIDA_LAB_REMOTE_ORIGIN || target.manifest.application.webOrigin;
if (!webOrigin) throw new Error('缺少宜搭网页域名');
const pageUrl = new URL(`/${target.appType}/workbench/${target.page.formUuid}`, webOrigin).href;
const runId = new Date()
  .toISOString()
  .replace(/[^0-9]/g, '')
  .slice(0, 17);
const summary = `本人流程桥验证 ${runId}`;
const payload = JSON.stringify({ schemaVersion: 1, purpose: 'self-only-process', runId });
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
  const preflight = JSON.parse(await page.getByTestId('process-evidence').innerText());
  if (preflight.phase !== 'ready') {
    throw new Error(`只读预检未通过：${preflight.error || 'unknown'}`);
  }

  await page.getByLabel('申请摘要').fill(summary);
  await page.getByLabel('实验载荷').fill(payload);
  await page.getByLabel(/流程将发送给当前登录人本人/).check();
  const startButton = page.getByTestId('process-start');
  if (await startButton.isDisabled()) throw new Error('明确确认后发起按钮仍被禁用');
  await startButton.click();
  await page.waitForFunction(
    () => {
      const text = document.querySelector('[data-testid="process-evidence"]')?.textContent;
      if (!text) return false;
      try {
        return ['complete', 'failed'].includes(JSON.parse(text).phase);
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 30_000 },
  );
  const evidence = JSON.parse(await page.getByTestId('process-evidence').innerText());
  if (evidence.phase !== 'complete') {
    throw new Error(`流程发起失败：${evidence.error || 'unknown'}`);
  }
  if (!evidence.instance?.created || evidence.instance?.count !== 1) {
    throw new Error('页面未确认恰好创建 1 条流程实例');
  }
  if (!(await startButton.isDisabled())) throw new Error('成功后发起按钮未永久禁用');
  if (pageErrors.length) throw new Error(`页面错误：${pageErrors.join(' | ')}`);

  const screenshotPath = path.join(outputDirectory, `process-start-${runId}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const result = {
    success: true,
    pageKey: target.page.key,
    loginActions,
    runId,
    summary,
    phase: evidence.phase,
    instanceCount: evidence.instance.count,
    idCaptured: evidence.instance.idCaptured,
    startButtonDisabled: true,
    pageErrors: 0,
    screenshot: path.relative(root, screenshotPath),
  };
  await writeJsonAtomic('.cache/playwright/platform-process/start-result.json', result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
