import { expect, test, type Page } from '@playwright/test';

const source = (page: Page) => page.locator('.cm-content').innerText();
/** Waits for the suggestion list, then accepts the first item (the editor ignores keys for a moment after it opens). */
async function accept(page: Page, contains?: string) {
  const list = page.locator('.cm-tooltip-autocomplete');
  if (contains) await expect(list).toContainText(contains); else await expect(list.locator('li').first()).toBeVisible();
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
}

test('read, edit and save a wiki page', async ({ page }) => {
  await page.goto('/g/1/wiki');
  await page.locator('tr.click', { hasText: 'Engineering handbook' }).first().click();
  await expect(page.locator('h1.pt')).toHaveText('Engineering handbook');
  const box = await page.locator('.wk').boundingBox();
  expect(box?.width).toBe(page.viewportSize()?.width);

  await page.locator('#wk-tree .pl', { hasText: 'On-call rotation' }).click();
  await expect(page.locator('#wk-md table tr')).toHaveCount(4);

  await page.locator('#wk-tree .pl', { hasText: 'Engineering handbook' }).click();
  await page.locator('#wk-md a.wl', { hasText: 'Release process' }).click();
  await expect(page.locator('h1.pt')).toHaveText('Release process');

  await page.getByRole('button', { name: /^Edit/ }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();
  await expect(page.locator('#wk-edit')).toHaveClass(/v-split/);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');

  // Slash menu and table editing
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/tab');
  await accept(page, 'Table');
  for (const cell of ['Owner', 'Due', 'Status', 'Ana']) {
    await page.keyboard.type(cell);
    await page.keyboard.press('Tab');
  }
  await expect.poll(() => source(page)).toContain('| Ana');
  await expect(page.locator('#wk-tctx')).toBeVisible();
  await page.locator('[data-top="colRight"]').click();
  await expect.poll(async () => (await source(page)).split('\n').find((l) => l.includes('| Owner'))?.split('|').length).toBe(6);

  // Page links, mentions and formatting
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Read the [[on-c');
  await accept(page, 'On-call rotation');
  await page.keyboard.type(' and ping @');
  await accept(page);
  await page.keyboard.type('about ');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('freezes');
  await expect.poll(() => source(page)).toContain('[On-call rotation](on-call-rotation) and ping @');
  await expect.poll(() => source(page)).toContain('**freezes**');

  // Task lists continue on Enter
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- [ ] first task');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second task');
  await expect.poll(() => source(page)).toContain('- [ ] second task');

  // Diagram, math and code in the preview
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/flow');
  await accept(page, 'Flowchart');
  await expect(page.locator('#wk-prev-md .mermaid-box svg')).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Energy is $`E=mc^2`$.');
  await expect(page.locator('#wk-prev-md math')).toHaveCount(1);

  // Find and replace
  await page.keyboard.press('ControlOrMeta+f');
  await page.locator('.cm-search input[name=search]').fill('task');
  await page.locator('.cm-search input[name=replace]').fill('item');
  await page.locator('.cm-search button[name=replaceAll]').click();
  await expect.poll(() => source(page)).toContain('- [ ] second item');
  await page.keyboard.press('Escape');

  // Review changes, then save
  await page.locator('.seg button', { hasText: 'Changes' }).click();
  await expect(page.locator('.diff .add').first()).toBeVisible();
  await expect(page.locator('#wk-status')).toContainText('draft kept');
  await page.locator('#wk-save').click();
  await expect(page.locator('#wk-md')).toContainText('freezes');
  await expect(page.locator('#wk-md input.task')).toHaveCount(2);

  // Ticking a task in the reader saves the page
  await page.locator('#wk-md input.task').first().click();
  await expect(page.locator('.toast')).toContainText('saved');
  await expect(page.locator('#wk-md li.task.done')).toHaveCount(1);
});

test('create from a template, then delete', async ({ page }) => {
  await page.goto('/wiki/group-1/new');
  await page.locator('.tpl', { hasText: 'Runbook' }).click();
  await page.locator('#wk-title').fill('runbooks/Database failover');
  await expect(page.locator('#wk-slugline')).toContainText('runbooks/Database-failover');
  await page.locator('#wk-save').click();
  await expect(page.locator('h1.pt')).toHaveText('Database failover');
  await expect(page.locator('#wk-md nav.toc a')).toHaveCount(5);
  await expect(page.locator('#wk-md .alert-important')).toHaveCount(1);
  await expect(page.locator('#wk-tree .pnode.dir')).toHaveCount(1);

  await page.locator('#wk-del').click();
  await page.locator('#wk-del').click();
  await expect(page.locator('.toast')).toContainText('Deleted');
  await expect(page.locator('#wk-tree .pnode.dir')).toHaveCount(0);
});

test('warns before leaving with unsaved changes', async ({ page }) => {
  await page.goto('/wiki/group-1/edit/home');
  await page.locator('.cm-content').click();
  await page.keyboard.type('typed ');
  await page.getByRole('button', { name: 'Close editor' }).click();
  await expect(page.locator('#wk-banner')).toContainText('unsaved changes');
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.locator('h1.pt')).toHaveText('Engineering handbook');
});
