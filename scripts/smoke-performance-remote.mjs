import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { completeKnownYidaLogin } from './browser/yida-login.mjs';
import { loadTarget, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

const pageDefinitions = [
  ['performance.overview', '绩效运行总览'],
  ['performance.people', '人员与组织'],
  ['performance.indicators', '绩效指标与量化'],
  ['performance.configuration', '个人绩效配置'],
  ['performance.dataEntry', '数据填报与自评'],
  ['performance.assessment', '评价、核算与结算'],
];
const targets = await Promise.all(
  pageDefinitions.map(async ([pageKey, heading]) => ({
    ...(await loadTarget({ requireRemote: true, pageKey })),
    heading,
  })),
);
const localTargets = await readOptionalJson('config/targets.local.json');
const browserOrganization = localTargets?.browserAuth?.organization || null;
const webOrigin = process.env.YIDA_LAB_REMOTE_ORIGIN || targets[0].manifest.application.webOrigin;
if (!webOrigin) throw new Error('缺少宜搭网页域名');

const healthUrl = 'http://127.0.0.1:4328/api/performance/health';
let apiProcess = null;
async function apiReady() {
  try {
    return (await fetch(healthUrl)).ok;
  } catch {
    return false;
  }
}
if (!(await apiReady())) {
  apiProcess = spawn(
    path.join(root, 'node_modules/.bin/tsx'),
    ['labs/performance-fullstack/server/src/index.ts'],
    { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (let attempt = 0; attempt < 80 && !(await apiReady()); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!(await apiReady())) throw new Error('Performance API 未能在 20 秒内启动');
}

const profilePath = path.join(root, '.local/playwright/performance-remote-profile');
await fs.mkdir(profilePath, { recursive: true });
const context = await chromium.launchPersistentContext(profilePath, {
  channel: 'chrome',
  headless: process.env.YIDA_LAB_REMOTE_HEADLESS === '1',
  viewport: { width: 1440, height: 1000 },
});

try {
  await context.grantPermissions(['local-network-access'], { origin: new URL(webOrigin).origin });
  const page = context.pages()[0] || (await context.newPage());
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const checkedPages = [];
  let loginActions = [];
  for (const target of targets) {
    const url = new URL(`/${target.appType}/workbench/${target.page.formUuid}`, webOrigin).href;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const heading = page.getByRole('heading', { name: target.heading, exact: true, level: 1 });
    loginActions = [...loginActions, ...(await completeKnownYidaLogin(page, heading, browserOrganization))];
    await heading.waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByText('2026-Q3', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    checkedPages.push(target.page.key);
  }

  const overview = targets[0];
  const people = targets.find((target) => target.page.key === 'performance.people');
  if (!people) throw new Error('缺少人员与组织页面目标');
  await page.goto(new URL(`/${people.appType}/workbench/${people.page.formUuid}`, webOrigin).href);
  await page.getByRole('heading', { name: people.heading, exact: true, level: 1 }).waitFor();
  if ((await page.getByText('SYN-RMT-ORG', { exact: true }).count()) === 0) {
    await page.getByRole('button', { name: '新增组织' }).click();
    const modal = page.getByRole('dialog', { name: '新增组织' });
    await modal.locator('input').nth(0).fill('SYN-RMT-ORG');
    await modal.locator('input').nth(1).fill('远程验收组织');
    await modal.locator('input').nth(2).fill('合成负责人');
    await modal.locator('.ant-modal-footer .ant-btn-primary').click();
    await page.getByText('SYN-RMT-ORG', { exact: true }).waitFor({ state: 'visible' });
  }
  await page.goto(new URL(`/${overview.appType}/workbench/${overview.page.formUuid}`, webOrigin).href);
  await page.getByRole('heading', { name: overview.heading, exact: true, level: 1 }).waitFor();
  await page.getByRole('button', { name: '重置合成数据' }).click();
  await page.getByRole('button', { name: '确认重置' }).click();
  const configuration = targets.find((target) => target.page.key === 'performance.configuration');
  const dataEntry = targets.find((target) => target.page.key === 'performance.dataEntry');
  const assessment = targets.find((target) => target.page.key === 'performance.assessment');
  if (!configuration || !dataEntry || !assessment) throw new Error('缺少绩效业务页面目标');
  await page.getByRole('button', { name: '前往个人绩效配置' }).click();
  await page.getByRole('heading', { name: configuration.heading, exact: true, level: 1 }).waitFor();
  if (!page.url().includes(configuration.page.formUuid))
    throw new Error('应用内跳转没有更新最外层宜搭工作台 URL');
  await page.getByRole('button', { name: '保存并提交配置' }).click();
  await page.goto(new URL(`/${dataEntry.appType}/workbench/${dataEntry.page.formUuid}`, webOrigin).href);
  await page.getByLabel('周期目标达成率实际值').fill('112');
  await page.getByLabel('交付质量实际值').fill('92');
  await page.getByLabel('协作与改进实际值').fill('88');
  await page.getByRole('button', { name: '提交实际数据' }).click();
  await page.getByLabel('周期目标达成率自评分').fill('39');
  await page.getByLabel('交付质量自评分').fill('32');
  await page.getByLabel('协作与改进自评分').fill('23');
  await page.getByRole('button', { name: '提交员工自评' }).click();
  await page.goto(new URL(`/${assessment.appType}/workbench/${assessment.page.formUuid}`, webOrigin).href);
  const reviewValues = [
    ['合成直属评价人-周期目标达成率评分', '38'],
    ['合成直属评价人-交付质量评分', '32'],
    ['合成直属评价人-协作与改进评分', '23'],
    ['合成协作评价人-周期目标达成率评分', '37'],
    ['合成协作评价人-交付质量评分', '31'],
    ['合成协作评价人-协作与改进评分', '22'],
    ['合成矩阵评价人-周期目标达成率评分', '39'],
    ['合成矩阵评价人-交付质量评分', '33'],
    ['合成矩阵评价人-协作与改进评分', '24'],
  ];
  for (const [label, value] of reviewValues) await page.getByLabel(label).fill(value);
  await page.getByRole('button', { name: '提交评价矩阵' }).click();
  await page.getByRole('button', { name: '核算并锁定结果' }).click();
  await page.getByText('本周期已结算，只读锁定生效。').waitFor({ state: 'visible' });
  await page.getByText('94.8 · A', { exact: true }).waitFor({ state: 'visible' });
  if (errors.length) throw new Error(`远程页面出现运行时错误：${errors.join(' | ')}`);

  const screenshotPath = path.join(root, '.cache/playwright/performance/remote-complete.png');
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const evidence = {
    success: true,
    checkedAt: new Date().toISOString(),
    checkedPages,
    loginActions,
    assertions: {
      localhostApi: true,
      syntheticPeriod: true,
      finalScore: 94.8,
      grade: 'A',
      locked: true,
      pageErrors: 0,
      outerShellNavigation: true,
      organizationCrud: true,
    },
    screenshot: path.relative(root, screenshotPath),
  };
  await writeJsonAtomic('.cache/playwright/performance/remote-complete.json', evidence);
  console.log(JSON.stringify(evidence, null, 2));
  await fetch('http://127.0.0.1:4328/api/performance/scenario/reset', { method: 'POST' });
} finally {
  await context.close();
  if (apiProcess) apiProcess.kill('SIGTERM');
}
