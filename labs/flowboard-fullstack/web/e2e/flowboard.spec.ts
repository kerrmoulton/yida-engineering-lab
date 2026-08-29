import { expect, test } from '@playwright/test';

const API_BASE_URL = 'http://127.0.0.1:4318/api';

test('completes the Flowboard browser CRUD and search workflow', async ({ page, request }) => {
  const title = `Playwright 联调任务 ${Date.now()}`;

  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Flowboard' })).toBeVisible();
    await expect(page.getByText('本地 API 在线', { exact: true })).toBeVisible();

    await page.getByPlaceholder('输入任务标题').fill(title);
    await page.getByRole('textbox', { name: '负责人', exact: true }).fill('E2E 测试');
    await page.getByRole('button', { name: '新建任务' }).click();

    const taskCard = page.getByRole('article').filter({ hasText: title });
    await expect(taskCard).toBeVisible();
    await taskCard.getByRole('button', { name: '移到下一状态' }).click();
    await expect(taskCard).toBeVisible();
    await taskCard.getByRole('button', { name: '移到下一状态' }).click();
    await expect(taskCard.getByRole('button', { name: '移到下一状态' })).toBeDisabled();

    await taskCard.getByRole('button', { name: '删除任务' }).click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(taskCard).toHaveCount(0);

    await page.getByPlaceholder('搜索标题、说明或负责人').fill('本地网络');
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article').getByText('验证本地网络授权', { exact: true })).toBeVisible();
  } finally {
    const response = await request.get(`${API_BASE_URL}/tasks`);
    if (response.ok()) {
      const payload = (await response.json()) as { data?: Array<{ id: string; title: string }> };
      const leftover = payload.data?.find((task) => task.title === title);
      if (leftover) await request.delete(`${API_BASE_URL}/tasks/${encodeURIComponent(leftover.id)}`);
    }
  }
});
