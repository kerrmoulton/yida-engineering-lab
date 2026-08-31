import { expect, test } from '@playwright/test';

test('dashboard renders live multi-state data', async ({ page }) => {
  await page.goto('/?page=dashboard');
  await expect(page.getByRole('heading', { name: '绩效运营工作台' })).toBeVisible();
  await expect(page.getByText('期间执行分布')).toBeVisible();
  await expect(page.getByText('待处理绩效任务')).toBeVisible();
  await expect(page.locator('.perf-v2-table tbody tr').first()).toBeVisible();
});

test('master data creates a synthetic organization through API', async ({ page }) => {
  await page.goto('/?page=masterData');
  await page.getByRole('button', { name: '新增组织' }).click();
  const modal = page.getByRole('dialog', { name: '维护组织' });
  await modal.getByPlaceholder('组织编码').fill(`AUTO-${Date.now()}`);
  await modal.getByPlaceholder('组织名称').fill('自动化能力验证组');
  await modal.getByPlaceholder('负责人').fill('合成负责人');
  await page.locator('.ant-modal-footer .ant-btn-primary').click();
  await expect(page.getByRole('cell', { name: '自动化能力验证组' }).first()).toBeVisible();
  await expect(page.getByText('操作已保存')).toBeVisible();
});

test('data entry persists a business value', async ({ page }) => {
  await page.goto('/?page=myDataEntry');
  await page
    .locator('.perf-v2-table tbody tr')
    .first()
    .getByRole('button', { name: /录\s*入/ })
    .click();
  const modal = page.getByRole('dialog', { name: '录入实际绩效数据' });
  await modal.locator('input.ant-input-number-input').fill('96');
  await modal.getByPlaceholder('业务证据或说明').fill('端到端自动化生成的合成业务证据');
  await page.locator('.ant-modal-footer .ant-btn-primary').click();
  await expect(page.getByRole('cell', { name: '端到端自动化生成的合成业务证据' })).toBeVisible();
});
