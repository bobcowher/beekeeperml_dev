import { test, expect } from '@playwright/test';

const pages = [
  { name: 'home',                 url: '/' },
  { name: 'download',             url: '/download' },
  { name: 'business-model',       url: '/our-business-model' },
  { name: 'docs-getting-started', url: '/docs/getting-started' },
  { name: 'docs-mcp-server',      url: '/docs/mcp-server' },
  { name: 'docs-training',        url: '/docs/training' },
  { name: 'blog-index',           url: '/blog' },
  { name: 'blog-post',            url: '/blog/parallel-training-mcp' },
];

for (const { name, url } of pages) {
  test(`${name} page visual`, async ({ page }) => {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  });
}
