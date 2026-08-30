import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { completeKnownYidaLogin } from './browser/yida-login.mjs';
import { loadManifest, readOptionalJson, root, writeJsonAtomic } from './lib.mjs';

const allowSyntheticUpload = process.env.YIDA_LAB_ALLOW_SYNTHETIC_UPLOAD === '1';
const manifest = await loadManifest();
const localTargets = await readOptionalJson('config/targets.local.json');
const resource = manifest.resources.find((item) => item.key === 'platform.fileSandbox');
if (!resource?.formUuid) throw new Error('platform.fileSandbox 缺少 formUuid 映射');
const webOrigin = process.env.YIDA_LAB_REMOTE_ORIGIN || manifest.application.webOrigin;
if (!webOrigin) throw new Error('缺少宜搭网页域名');

const pageUrl = new URL(`/${manifest.application.appType}/workbench/${resource.formUuid}`, webOrigin).href;
const profilePath = path.join(root, '.local/playwright/flowboard-remote-profile');
const outputDirectory = path.join(root, '.cache/playwright/platform-file-storage');
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
  const transport = [];
  let activeProbe = null;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (!activeProbe) return;
    const request = response.request();
    if (!['xhr', 'fetch'].includes(request.resourceType())) return;
    transport.push({
      component: activeProbe,
      method: request.method(),
      resourceType: request.resourceType(),
      status: response.status(),
    });
  });
  page.on('requestfailed', (request) => {
    if (!activeProbe || !['xhr', 'fetch'].includes(request.resourceType())) return;
    transport.push({
      component: activeProbe,
      method: request.method(),
      resourceType: request.resourceType(),
      status: 'transport-failed',
    });
  });

  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const ready = page.getByText('全部数据', { exact: true });
  const loginActions = await completeKnownYidaLogin(
    page,
    ready,
    localTargets?.browserAuth?.organization || null,
  );
  await ready.waitFor({ state: 'visible', timeout: 20_000 });
  const createButton = page.getByText('新增', { exact: true });
  await createButton.first().waitFor({ state: 'visible' });
  await createButton.first().click();
  const formIframe = page.locator('iframe:visible').last();
  await formIframe.waitFor({ state: 'visible', timeout: 20_000 });
  const formFrame = await (await formIframe.elementHandle()).contentFrame();
  if (!formFrame) throw new Error('新增表单 iframe 尚未建立内容上下文');

  const experimentTagLabel = formFrame.getByText('实验标记', { exact: true }).last();
  const attachmentLabel = formFrame.getByText('伪造测试附件', { exact: true }).last();
  const imageLabel = formFrame.getByText('伪造测试图片', { exact: true }).last();
  await experimentTagLabel.waitFor({ state: 'visible', timeout: 20_000 });
  await attachmentLabel.waitFor({ state: 'visible' });
  await imageLabel.waitFor({ state: 'visible' });
  await formFrame.waitForFunction(() => document.querySelectorAll('input[type="file"]').length === 2, null, {
    timeout: 20_000,
  });
  const fileInputs = formFrame.locator('input[type="file"]');
  const inputCount = await fileInputs.count();
  const fieldShape = async (label) => {
    const field = label.locator('xpath=ancestor::*[contains(@class,"next-form-item")][1]');
    return {
      matchedFormItem: (await field.count()) === 1,
      classNames: (await field.count()) === 1 ? (await field.getAttribute('class'))?.split(/\s+/).sort() : [],
      buttonCount: (await field.count()) === 1 ? await field.getByRole('button').count() : 0,
      fileInputCount: (await field.count()) === 1 ? await field.locator('input[type="file"]').count() : 0,
    };
  };

  const result = {
    success: true,
    pageKey: 'platform.fileSandbox',
    loginActions,
    realFormContainer: true,
    uploadAuthorized: allowSyntheticUpload,
    fields: {
      experimentTag: await experimentTagLabel.isVisible(),
      syntheticAttachment: await attachmentLabel.isVisible(),
      syntheticImage: await imageLabel.isVisible(),
    },
    inputCount,
    fieldShapes: {
      AttachmentField: await fieldShape(attachmentLabel),
      ImageField: await fieldShape(imageLabel),
    },
    transport,
    pageErrors: pageErrors.length,
  };

  if (allowSyntheticUpload) {
    if (inputCount !== 2) throw new Error(`上传授权后预期 2 个文件输入，实际 ${inputCount} 个`);
    const fixtures = [
      {
        component: 'AttachmentField',
        name: 'openyida-synthetic-storage-probe.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('OpenYida synthetic storage probe\n', 'utf8'),
      },
      {
        component: 'ImageField',
        name: 'openyida-synthetic-storage-probe.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      },
    ];
    result.uploads = {};
    for (const [index, fixture] of fixtures.entries()) {
      activeProbe = fixture.component;
      await fileInputs.nth(index).setInputFiles(fixture);
      const fileEntry = formFrame.getByText(fixture.name, { exact: false }).last();
      await fileEntry.waitFor({ state: 'visible', timeout: 30_000 });
      const listItem = fileEntry.locator(
        'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " next-upload-list-item ")][1]',
      );
      if ((await listItem.count()) !== 1) throw new Error(`${fixture.component} 缺少上传结果条目`);
      const imagePreviewVisible =
        fixture.component === 'ImageField'
          ? await listItem.locator('img, [class*="preview"], [class*="thumbnail"]').first().isVisible()
          : null;
      const removeControl = listItem
        .locator('[class*="close"], [class*="remove"], [aria-label*="删除"], [title*="删除"]')
        .last();
      if (!(await removeControl.isVisible())) throw new Error(`${fixture.component} 缺少可见移除控件`);
      await removeControl.click();
      await fileEntry.waitFor({ state: 'hidden', timeout: 15_000 });
      await page.waitForTimeout(500);
      activeProbe = null;
      const componentTransport = transport.filter((item) => item.component === fixture.component);
      result.uploads[fixture.component] = {
        attempted: true,
        syntheticOnly: true,
        fieldEntryVisible: true,
        imagePreviewVisible,
        removedFromField: true,
        formSubmitted: false,
        hasFileTransferRequest: componentTransport.some(
          (item) =>
            ['POST', 'PUT'].includes(item.method) && Number(item.status) >= 200 && Number(item.status) < 300,
        ),
        transport: componentTransport,
      };
      if (!result.uploads[fixture.component].hasFileTransferRequest) {
        throw new Error(`${fixture.component} 没有观察到成功的文件传输请求`);
      }
      if (fixture.component === 'ImageField' && imagePreviewVisible !== true) {
        throw new Error('ImageField 上传后缺少可见图片预览');
      }
    }
  }

  const zeroRecordCount = page.getByText(/总计[:：]\s*0/, { exact: false }).last();
  result.recordCountZero = await zeroRecordCount.isVisible();
  if (!result.recordCountZero) throw new Error('文件沙箱数据列表不是零记录');
  if (pageErrors.length) throw new Error(`页面错误数量：${pageErrors.length}`);

  const screenshotPath = path.join(outputDirectory, 'file-storage-form.png');
  const evidencePath = path.join(outputDirectory, 'file-storage-form.evidence.json');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeJsonAtomic(path.relative(root, evidencePath), result);
  result.screenshot = path.relative(root, screenshotPath);
  result.evidence = path.relative(root, evidencePath);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
